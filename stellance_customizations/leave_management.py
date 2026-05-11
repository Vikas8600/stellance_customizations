import calendar as _cal
import frappe
from frappe.utils import getdate, add_months, flt
from datetime import date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _month_start(d):
	d = getdate(d)
	return date(d.year, d.month, 1)


def _next_month_start(d):
	return getdate(add_months(date(d.year, d.month, 1), 1))


def _get_leave_period_dates(group_policy_name):
	"""Return (lp_from, lp_to) dates for the policy's Leave Period, or (None, None)."""
	leave_period = frappe.db.get_value("Leave Group Policy", group_policy_name, "leave_period")
	if not leave_period:
		return None, None
	lp_from, lp_to = frappe.db.get_value("Leave Period", leave_period, ["from_date", "to_date"])
	if not lp_from or not lp_to:
		return None, None
	return getdate(lp_from), getdate(lp_to)


def _get_leave_type_flags():
	rows = frappe.get_all("Leave Type", fields=["name", "is_lwp", "is_compensatory", "is_carry_forward"])
	return {r.name: r for r in rows}


def _compute_expected_leaves(policy, effective_start, lp_from, current_month_start, lt_flags):
	"""
	Compute cumulative new_leaves_allocated per leave type from effective_start to current month.
	Joining month is pro-rated; all subsequent months accrue full monthly share.
	"""
	effective_start = getdate(effective_start)
	joining_month_start = _month_start(effective_start)
	totals = {}

	alloc_month = joining_month_start
	while alloc_month <= current_month_start:
		if alloc_month < lp_from:
			alloc_month = _next_month_start(alloc_month)
			continue

		_, days_in_month = _cal.monthrange(alloc_month.year, alloc_month.month)
		if alloc_month == joining_month_start and effective_start.day != 1:
			fraction = (days_in_month - effective_start.day + 1) / days_in_month
		else:
			fraction = 1.0

		for row in policy.leave_allocations:
			flags = lt_flags.get(row.leave_type)
			if not flags or flags.is_lwp or flags.is_compensatory:
				continue
			monthly_rate = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves
			totals[row.leave_type] = totals.get(row.leave_type, 0.0) + monthly_rate * fraction

		alloc_month = _next_month_start(alloc_month)

	return {lt: round(v, 2) for lt, v in totals.items()}


def _sync_leave_allocations(employee_name, employee_display, policy, lt_flags, joining_date, lp_from, lp_to):
	"""
	Maintain one Leave Allocation per leave type spanning lp_from → lp_to.
	Creates on first call; increments new_leaves_allocated in-place each subsequent month.
	Old short-window allocations (different to_date) are cleaned up automatically.
	"""
	today = getdate()
	current_month_start = _month_start(today)

	if current_month_start > lp_to or current_month_start < lp_from:
		return

	effective_start = max(getdate(joining_date), lp_from)
	if _month_start(effective_start) > current_month_start:
		return

	expected = _compute_expected_leaves(policy, effective_start, lp_from, current_month_start, lt_flags)

	for leave_type, expected_leaves in expected.items():
		if expected_leaves <= 0:
			continue

		flags = lt_flags.get(leave_type)

		# Find existing spanning allocation (keyed by to_date = lp_to)
		existing = frappe.db.get_value(
			"Leave Allocation",
			{"employee": employee_name, "leave_type": leave_type, "docstatus": 1, "to_date": str(lp_to)},
			["name", "new_leaves_allocated", "unused_leaves"],
			as_dict=True,
		)

		try:
			if existing:
				current_new = round(flt(existing.new_leaves_allocated), 2)
				if abs(current_new - expected_leaves) < 0.01:
					continue  # Already up to date for this month
				carry_fwd = flt(existing.unused_leaves)
				frappe.db.set_value("Leave Allocation", existing.name, {
					"new_leaves_allocated": expected_leaves,
					"total_leaves_allocated": round(expected_leaves + carry_fwd, 2),
				})
			else:
				# Remove any old short-window allocations that would cause overlap
				old_names = frappe.db.sql("""
					SELECT name, docstatus FROM `tabLeave Allocation`
					WHERE employee=%s AND leave_type=%s AND docstatus != 2
				""", (employee_name, leave_type), as_dict=True)
				for old in old_names:
					try:
						old_doc = frappe.get_doc("Leave Allocation", old.name)
						if old_doc.docstatus == 1:
							old_doc.cancel()
						frappe.delete_doc("Leave Allocation", old.name, ignore_permissions=True, force=True)
					except Exception:
						frappe.log_error(
							frappe.get_traceback(),
							f"Cannot remove old allocation {old.name} for {employee_display} – {leave_type}",
						)

				alloc = frappe.get_doc({
					"doctype": "Leave Allocation",
					"employee": employee_name,
					"leave_type": leave_type,
					"from_date": str(effective_start),
					"to_date": str(lp_to),
					"new_leaves_allocated": expected_leaves,
					"carry_forward": 1 if flags and flags.is_carry_forward else 0,
				})
				alloc.insert(ignore_permissions=True)
				alloc.submit()

		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"Leave Allocation failed: {employee_display} – {leave_type}",
			)


# ---------------------------------------------------------------------------
# Monthly scheduler  (runs on 1st of each month)
# ---------------------------------------------------------------------------

def allocate_monthly_leaves():
	employees = frappe.get_all(
		"Employee",
		filters={"status": "Active", "custom_leave_group_policy": ["is", "set"]},
		fields=["name", "employee_name", "date_of_joining", "custom_leave_group_policy"],
	)
	if not employees:
		return

	lt_flags = _get_leave_type_flags()

	for emp in employees:
		lp_from, lp_to = _get_leave_period_dates(emp.custom_leave_group_policy)
		if not lp_from or not lp_to:
			continue

		policy = frappe.get_doc("Leave Group Policy", emp.custom_leave_group_policy)
		_sync_leave_allocations(
			emp.name, emp.employee_name, policy, lt_flags,
			emp.date_of_joining, lp_from, lp_to,
		)

	frappe.db.commit()


# ---------------------------------------------------------------------------
# Joining-month allocation  (triggered on Employee save)
# ---------------------------------------------------------------------------

def allocate_joining_month_leaves(employee):
	if employee.status != "Active":
		return
	if not getattr(employee, "custom_leave_group_policy", None):
		return
	if not employee.date_of_joining:
		return

	lp_from, lp_to = _get_leave_period_dates(employee.custom_leave_group_policy)
	if not lp_from or not lp_to:
		frappe.msgprint(
			"No Leave Period set on the Leave Group Policy. Leave allocation skipped.",
			indicator="orange", alert=True,
		)
		return

	lt_flags = _get_leave_type_flags()
	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	_sync_leave_allocations(
		employee.name, employee.employee_name, policy, lt_flags,
		employee.date_of_joining, lp_from, lp_to,
	)
	frappe.db.commit()


# ---------------------------------------------------------------------------
# Backfill  (policy assigned late — covers joining month through current month)
# ---------------------------------------------------------------------------

def backfill_leaves_from_joining(employee):
	if not employee.custom_leave_group_policy or not employee.date_of_joining:
		return

	lp_from, lp_to = _get_leave_period_dates(employee.custom_leave_group_policy)
	if not lp_from or not lp_to:
		return

	lt_flags = _get_leave_type_flags()
	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	_sync_leave_allocations(
		employee.name, employee.employee_name, policy, lt_flags,
		employee.date_of_joining, lp_from, lp_to,
	)
