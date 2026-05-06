import calendar as _cal
import frappe
from frappe.utils import getdate, add_months
from datetime import date


def _month_start(d):
	"""Return date object for the 1st of the month containing d."""
	d = getdate(d)
	return date(d.year, d.month, 1)


def _next_month_start(d):
	"""Return date object for the 1st of the month after d."""
	return getdate(add_months(date(d.year, d.month, 1), 1))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_fy_march_31(from_date):
	d = getdate(from_date)
	if d.month >= 4:
		return date(d.year + 1, 3, 31)
	else:
		return date(d.year, 3, 31)


def get_leave_expiry_date(from_date, carry_forward_months):
	from_date = getdate(from_date)
	normal_expiry = getdate(add_months(from_date, carry_forward_months))
	march_31 = get_fy_march_31(from_date)
	return min(normal_expiry, march_31)


def _get_leave_type_flags():
	"""Return {leave_type_name: row} with is_lwp, is_compensatory, is_carry_forward."""
	rows = frappe.get_all(
		"Leave Type",
		fields=["name", "is_lwp", "is_compensatory", "is_carry_forward"],
	)
	return {r.name: r for r in rows}


def _get_active_lpa(employee_name, for_date):
	"""Return name of active submitted Leave Policy Assignment covering for_date, or None."""
	return frappe.db.get_value(
		"Leave Policy Assignment",
		{
			"employee": employee_name,
			"docstatus": 1,
			"effective_from": ["<=", for_date],
			"effective_to": [">=", for_date],
		},
		"name",
	)


# ---------------------------------------------------------------------------
# Monthly scheduler  (runs on 1st of each month)
# ---------------------------------------------------------------------------

def allocate_monthly_leaves():
	today = getdate()
	from_date = today.replace(day=1)

	employees = frappe.get_all(
		"Employee",
		filters={"status": "Active", "custom_leave_group_policy": ["is", "set"]},
		fields=["name", "employee_name", "custom_leave_group_policy"],
	)
	if not employees:
		return

	lt_flags = _get_leave_type_flags()

	for emp in employees:
		# Require a valid Leave Policy Assignment for this period
		lpa = _get_active_lpa(emp.name, from_date)
		if not lpa:
			frappe.logger().info(
				f"Monthly Leave Allocation: no active LPA for {emp.employee_name} on {from_date}, skipping."
			)
			continue

		policy = frappe.get_doc("Leave Group Policy", emp.custom_leave_group_policy)
		expiry_date = get_leave_expiry_date(from_date, policy.carry_forward_months)

		for row in policy.leave_allocations:
			flags = lt_flags.get(row.leave_type)
			if not flags:
				continue

			# ERPNext validation: skip LWP and Compensatory leave types
			if flags.is_lwp or flags.is_compensatory:
				continue

			if frappe.db.exists(
				"Leave Allocation",
				{"employee": emp.name, "leave_type": row.leave_type, "from_date": from_date, "docstatus": ["!=", 2]},
			):
				continue

			monthly_qty = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves

			try:
				alloc = frappe.get_doc({
					"doctype": "Leave Allocation",
					"employee": emp.name,
					"leave_type": row.leave_type,
					"from_date": from_date,
					"to_date": expiry_date,
					"new_leaves_allocated": monthly_qty,
					"carry_forward": 1 if flags.is_carry_forward else 0,
					"leave_policy_assignment": lpa,
				})
				alloc.insert(ignore_permissions=True)
				alloc.submit()
				frappe.logger().info(
					f"Leave Allocation: {monthly_qty} {row.leave_type} → {emp.employee_name} "
					f"(valid {from_date} to {expiry_date})"
				)
			except Exception:
				frappe.log_error(
					frappe.get_traceback(),
					f"Monthly Leave Allocation failed: {emp.employee_name} – {row.leave_type}",
				)

	frappe.db.commit()


# ---------------------------------------------------------------------------
# Joining-month pro-rated allocation  (triggered on Employee save)
# ---------------------------------------------------------------------------

def allocate_joining_month_leaves(employee):
	today = getdate()

	if employee.status != "Active":
		return
	if not getattr(employee, "custom_leave_group_policy", None):
		return
	if not employee.date_of_joining:
		return

	joining_date = getdate(employee.date_of_joining)

	if joining_date.month != today.month or joining_date.year != today.year:
		return
	if joining_date.day == 1:
		return

	# Require a valid Leave Policy Assignment covering the joining date
	lpa = _get_active_lpa(employee.name, joining_date)
	if not lpa:
		frappe.msgprint(
			f"No active Leave Policy Assignment found for {employee.employee_name} "
			f"covering {joining_date}. Joining-month leave allocation skipped.",
			indicator="orange", alert=True,
		)
		return

	_, days_in_month = _cal.monthrange(joining_date.year, joining_date.month)
	days_remaining = days_in_month - joining_date.day + 1

	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	expiry_date = get_leave_expiry_date(joining_date, policy.carry_forward_months)
	lt_flags = _get_leave_type_flags()

	for row in policy.leave_allocations:
		flags = lt_flags.get(row.leave_type)
		if not flags:
			continue

		# ERPNext validation: skip LWP and Compensatory leave types
		if flags.is_lwp or flags.is_compensatory:
			continue

		if frappe.db.exists(
			"Leave Allocation",
			{"employee": employee.name, "leave_type": row.leave_type, "from_date": joining_date, "docstatus": ["!=", 2]},
		):
			continue

		monthly_qty = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves
		pro_rated_qty = round(monthly_qty * days_remaining / days_in_month, 2)

		if pro_rated_qty <= 0:
			continue

		try:
			alloc = frappe.get_doc({
				"doctype": "Leave Allocation",
				"employee": employee.name,
				"leave_type": row.leave_type,
				"from_date": joining_date,
				"to_date": expiry_date,
				"new_leaves_allocated": pro_rated_qty,
				"carry_forward": 1 if flags.is_carry_forward else 0,
				"leave_policy_assignment": lpa,
			})
			alloc.insert(ignore_permissions=True)
			alloc.submit()
			frappe.logger().info(
				f"Joining Month Leave Allocation: {pro_rated_qty} {row.leave_type} → "
				f"{employee.employee_name} (joining {joining_date}, valid to {expiry_date})"
			)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"Joining Month Leave Allocation failed: {employee.employee_name} – {row.leave_type}",
			)


# ---------------------------------------------------------------------------
# Backfill  (policy assigned late — covers joining month through current month)
# ---------------------------------------------------------------------------

def backfill_leaves_from_joining(employee):
	"""
	Called when a Leave Group Policy is assigned for the first time to an employee
	whose joining month has already passed.

	Allocates:
	  - Joining month : pro-rated from joining day
	  - In-between months : full monthly qty
	  - Current month : full monthly qty

	Each month requires an active LPA covering that date. Months without a valid
	LPA are silently skipped (period boundary respected).
	Idempotent — skips months that already have an allocation.
	"""
	if not employee.custom_leave_group_policy or not employee.date_of_joining:
		return

	joining_date = getdate(employee.date_of_joining)
	today = getdate()
	current_month_start = _month_start(today)
	joining_month_start = _month_start(joining_date)

	# If policy was assigned in the same month as joining, the normal
	# allocate_joining_month_leaves path handles it — nothing to backfill.
	if joining_month_start >= current_month_start:
		return

	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	lt_flags = _get_leave_type_flags()

	alloc_month = joining_month_start
	while alloc_month <= current_month_start:
		lpa = _get_active_lpa(employee.name, alloc_month)
		if not lpa:
			alloc_month = _next_month_start(alloc_month)
			continue

		_, days_in_month = _cal.monthrange(alloc_month.year, alloc_month.month)

		if alloc_month == joining_month_start and joining_date.day != 1:
			# Pro-rate the joining month
			from_date = joining_date
			fraction = (days_in_month - joining_date.day + 1) / days_in_month
		else:
			from_date = alloc_month
			fraction = 1.0

		expiry_date = get_leave_expiry_date(from_date, policy.carry_forward_months)

		for row in policy.leave_allocations:
			flags = lt_flags.get(row.leave_type)
			if not flags or flags.is_lwp or flags.is_compensatory:
				continue

			if frappe.db.exists(
				"Leave Allocation",
				{"employee": employee.name, "leave_type": row.leave_type, "from_date": from_date, "docstatus": ["!=", 2]},
			):
				continue

			monthly_qty = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves
			qty = round(monthly_qty * fraction, 2)
			if qty <= 0:
				continue

			try:
				alloc = frappe.get_doc({
					"doctype": "Leave Allocation",
					"employee": employee.name,
					"leave_type": row.leave_type,
					"from_date": from_date,
					"to_date": expiry_date,
					"new_leaves_allocated": qty,
					"carry_forward": 1 if flags.is_carry_forward else 0,
					"leave_policy_assignment": lpa,
				})
				alloc.insert(ignore_permissions=True)
				alloc.submit()
				frappe.logger().info(
					f"Backfill Leave Allocation: {qty} {row.leave_type} -> "
					f"{employee.employee_name} (month {alloc_month}, valid to {expiry_date})"
				)
			except Exception:
				frappe.log_error(
					frappe.get_traceback(),
					f"Backfill Leave Allocation failed: {employee.employee_name} - {row.leave_type} - {alloc_month}",
				)

		alloc_month = _next_month_start(alloc_month)
