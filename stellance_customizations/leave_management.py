import calendar as _cal
import frappe
from frappe.utils import getdate, add_months
from datetime import date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _month_start(d):
	d = getdate(d)
	return date(d.year, d.month, 1)


def _next_month_start(d):
	return getdate(add_months(date(d.year, d.month, 1), 1))


def get_fy_march_31(from_date):
	d = getdate(from_date)
	return date(d.year + 1, 3, 31) if d.month >= 4 else date(d.year, 3, 31)


def get_leave_expiry_date(from_date, carry_forward_months):
	from_date = getdate(from_date)
	return min(getdate(add_months(from_date, carry_forward_months)), get_fy_march_31(from_date))


def _get_leave_type_flags():
	rows = frappe.get_all("Leave Type", fields=["name", "is_lwp", "is_compensatory", "is_carry_forward"])
	return {r.name: r for r in rows}


def _in_leave_period(group_policy_name, for_date):
	"""Return True if for_date falls within the Leave Period set on the group policy."""
	leave_period = frappe.db.get_value("Leave Group Policy", group_policy_name, "leave_period")
	if not leave_period:
		return False
	from_date, to_date = frappe.db.get_value("Leave Period", leave_period, ["from_date", "to_date"])
	if not from_date or not to_date:
		return False
	return getdate(from_date) <= getdate(for_date) <= getdate(to_date)


def _create_allocations(employee_name, employee_display, policy, from_date, lt_flags, fraction=1.0):
	"""Create Leave Allocations for one month. fraction < 1 for pro-rated months."""
	expiry_date = get_leave_expiry_date(from_date, policy.carry_forward_months)

	for row in policy.leave_allocations:
		flags = lt_flags.get(row.leave_type)
		if not flags or flags.is_lwp or flags.is_compensatory:
			continue

		if frappe.db.exists(
			"Leave Allocation",
			{"employee": employee_name, "leave_type": row.leave_type, "from_date": from_date, "docstatus": ["!=", 2]},
		):
			continue

		monthly_qty = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves
		qty = round(monthly_qty * fraction, 2)
		if qty <= 0:
			continue

		try:
			alloc = frappe.get_doc({
				"doctype": "Leave Allocation",
				"employee": employee_name,
				"leave_type": row.leave_type,
				"from_date": from_date,
				"to_date": expiry_date,
				"new_leaves_allocated": qty,
				"carry_forward": 1 if flags.is_carry_forward else 0,
			})
			alloc.insert(ignore_permissions=True)
			alloc.submit()
			frappe.logger().info(
				f"Leave Allocation: {qty} {row.leave_type} → {employee_display} "
				f"(from {from_date} to {expiry_date})"
			)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"Leave Allocation failed: {employee_display} – {row.leave_type} – {from_date}",
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
		if not _in_leave_period(emp.custom_leave_group_policy, from_date):
			frappe.logger().info(
				f"Monthly Leave Allocation: {emp.employee_name} – {from_date} not in leave period, skipping."
			)
			continue

		policy = frappe.get_doc("Leave Group Policy", emp.custom_leave_group_policy)
		_create_allocations(emp.name, emp.employee_name, policy, from_date, lt_flags)

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

	if not _in_leave_period(employee.custom_leave_group_policy, joining_date):
		frappe.msgprint(
			f"Joining date {joining_date} is outside the Leave Period. Joining-month leave allocation skipped.",
			indicator="orange", alert=True,
		)
		return

	_, days_in_month = _cal.monthrange(joining_date.year, joining_date.month)
	fraction = (days_in_month - joining_date.day + 1) / days_in_month

	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	lt_flags = _get_leave_type_flags()
	_create_allocations(employee.name, employee.employee_name, policy, joining_date, lt_flags, fraction)


# ---------------------------------------------------------------------------
# Backfill  (policy assigned late — covers joining month through current month)
# ---------------------------------------------------------------------------

def backfill_leaves_from_joining(employee):
	if not employee.custom_leave_group_policy or not employee.date_of_joining:
		return

	joining_date = getdate(employee.date_of_joining)
	today = getdate()
	current_month_start = _month_start(today)
	joining_month_start = _month_start(joining_date)

	if joining_month_start >= current_month_start:
		return

	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	lt_flags = _get_leave_type_flags()

	alloc_month = joining_month_start
	while alloc_month <= current_month_start:
		if not _in_leave_period(employee.custom_leave_group_policy, alloc_month):
			alloc_month = _next_month_start(alloc_month)
			continue

		_, days_in_month = _cal.monthrange(alloc_month.year, alloc_month.month)

		if alloc_month == joining_month_start and joining_date.day != 1:
			from_date = joining_date
			fraction = (days_in_month - joining_date.day + 1) / days_in_month
		else:
			from_date = alloc_month
			fraction = 1.0

		_create_allocations(employee.name, employee.employee_name, policy, from_date, lt_flags, fraction)
		alloc_month = _next_month_start(alloc_month)
