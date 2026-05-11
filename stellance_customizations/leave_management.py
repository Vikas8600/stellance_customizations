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


def _month_end(d):
	d = getdate(d)
	_, last_day = _cal.monthrange(d.year, d.month)
	return date(d.year, d.month, last_day)


def _next_month_start(d):
	return getdate(add_months(date(d.year, d.month, 1), 1))


def _get_leave_period_dates(group_policy_name):
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


def _alloc_exists(employee_name, leave_type, from_date):
	"""True if a non-cancelled allocation already exists for this employee+leave_type+from_date."""
	return bool(frappe.db.exists(
		"Leave Allocation",
		{"employee": employee_name, "leave_type": leave_type,
		 "from_date": str(from_date), "docstatus": ["!=", 2]},
	))


def _create_month_allocation(employee_name, employee_display, policy, lt_flags,
                             from_date, to_date, fraction=1.0):
	"""Create Leave Allocations for a single month. fraction < 1 for pro-rated joining month."""
	for row in policy.leave_allocations:
		flags = lt_flags.get(row.leave_type)
		if not flags or flags.is_lwp or flags.is_compensatory:
			continue

		if _alloc_exists(employee_name, row.leave_type, from_date):
			continue

		monthly_rate = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves
		qty = round(monthly_rate * fraction, 2)
		if qty <= 0:
			continue

		try:
			alloc = frappe.get_doc({
				"doctype": "Leave Allocation",
				"employee": employee_name,
				"leave_type": row.leave_type,
				"from_date": str(from_date),
				"to_date": str(to_date),
				"new_leaves_allocated": qty,
				"carry_forward": 1 if flags.is_carry_forward else 0,
			})
			alloc.insert(ignore_permissions=True)
			alloc.submit()
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
	current_month_start = _month_start(today)
	current_month_end = _month_end(today)

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
		if not (lp_from <= current_month_start <= lp_to):
			continue

		policy = frappe.get_doc("Leave Group Policy", emp.custom_leave_group_policy)
		_create_month_allocation(
			emp.name, emp.employee_name, policy, lt_flags,
			current_month_start, current_month_end,
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

	joining_date = getdate(employee.date_of_joining)
	today = getdate()

	# Only allocate if joining month is the current month
	if joining_date.month != today.month or joining_date.year != today.year:
		return
	if not (lp_from <= joining_date <= lp_to):
		return

	_, days_in_month = _cal.monthrange(joining_date.year, joining_date.month)
	fraction = (days_in_month - joining_date.day + 1) / days_in_month if joining_date.day != 1 else 1.0

	lt_flags = _get_leave_type_flags()
	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	_create_month_allocation(
		employee.name, employee.employee_name, policy, lt_flags,
		joining_date, _month_end(joining_date), fraction,
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

	joining_date = getdate(employee.date_of_joining)
	today = getdate()
	current_month_start = _month_start(today)
	joining_month_start = _month_start(joining_date)

	lt_flags = _get_leave_type_flags()
	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)

	alloc_month = joining_month_start
	while alloc_month <= current_month_start:
		if not (lp_from <= alloc_month <= lp_to):
			alloc_month = _next_month_start(alloc_month)
			continue

		_, days_in_month = _cal.monthrange(alloc_month.year, alloc_month.month)

		if alloc_month == joining_month_start and joining_date.day != 1:
			from_date = joining_date
			fraction = (days_in_month - joining_date.day + 1) / days_in_month
		else:
			from_date = alloc_month
			fraction = 1.0

		_create_month_allocation(
			employee.name, employee.employee_name, policy, lt_flags,
			from_date, _month_end(alloc_month), fraction,
		)
		alloc_month = _next_month_start(alloc_month)
