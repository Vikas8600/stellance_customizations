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


def _rolling_to_date(current_month_start, carry_forward_months, lp_to):
	"""Last day of the (carry_forward_months)-th month from current_month, capped at lp_to.

	e.g. current_month=May 2026, months=6  →  Oct 31 2026
	     current_month=Oct 2026, months=6  →  Mar 31 2027  (capped at lp_to)
	"""
	d = getdate(current_month_start)
	end_month = getdate(add_months(date(d.year, d.month, 1), carry_forward_months - 1))
	_, last_day = _cal.monthrange(end_month.year, end_month.month)
	computed = date(end_month.year, end_month.month, last_day)
	return min(computed, getdate(lp_to))


def _get_leave_period_dates(group_policy_name):
	"""Return (lp_from, lp_to) for the policy's Leave Period, or (None, None)."""
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


def _compute_cumulative_leaves(policy, effective_start, current_month_start, lt_flags):
	"""Total leaves accrued from effective_start through current_month (inclusive).
	Joining month is pro-rated when effective_start is not the 1st.
	"""
	effective_start = getdate(effective_start)
	joining_month_start = _month_start(effective_start)
	totals = {}

	alloc_month = joining_month_start
	while alloc_month <= current_month_start:
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


def _sync_rolling_allocation(employee_name, employee_display, policy, lt_flags,
                             joining_date, lp_from, lp_to):
	"""Maintain one Leave Allocation per leave type with a rolling to_date.

	Each month, new_leaves_allocated is incremented and to_date is pushed
	forward to (current_month + carry_forward_months - 1), so May's leaves
	expire in October, June's in November, etc.
	"""
	today = getdate()
	current_month_start = _month_start(today)
	carry_forward_months = max(int(policy.carry_forward_months or 1), 1)

	effective_start = max(getdate(joining_date), lp_from)
	if _month_start(effective_start) > current_month_start:
		return

	new_to_date = _rolling_to_date(current_month_start, carry_forward_months, lp_to)
	expected = _compute_cumulative_leaves(policy, effective_start, current_month_start, lt_flags)

	for leave_type, expected_leaves in expected.items():
		if expected_leaves <= 0:
			continue

		flags = lt_flags.get(leave_type)

		# One allocation per (employee, leave_type) within the leave period
		existing = frappe.db.sql("""
			SELECT name, new_leaves_allocated, unused_leaves, to_date
			FROM `tabLeave Allocation`
			WHERE employee=%s AND leave_type=%s AND docstatus=1
			  AND from_date >= %s AND to_date <= %s
			ORDER BY from_date DESC LIMIT 1
		""", (employee_name, leave_type, str(lp_from), str(lp_to)), as_dict=True)
		existing = existing[0] if existing else None

		try:
			if existing:
				current_new = round(flt(existing.new_leaves_allocated), 2)
				leaves_changed = abs(current_new - expected_leaves) >= 0.01
				to_date_changed = getdate(existing.to_date) != new_to_date

				if leaves_changed or to_date_changed:
					unused = flt(existing.unused_leaves)
					frappe.db.set_value("Leave Allocation", existing.name, {
						"new_leaves_allocated": expected_leaves,
						"total_leaves_allocated": round(expected_leaves + unused, 2),
						"to_date": str(new_to_date),
					})
			else:
				# Remove any old/stale allocations for this leave_type that would overlap
				old_rows = frappe.db.sql("""
					SELECT name, docstatus FROM `tabLeave Allocation`
					WHERE employee=%s AND leave_type=%s AND docstatus != 2
				""", (employee_name, leave_type), as_dict=True)
				for old in old_rows:
					try:
						old_doc = frappe.get_doc("Leave Allocation", old.name)
						if old_doc.docstatus == 1:
							old_doc.cancel()
						frappe.delete_doc("Leave Allocation", old.name,
						                  ignore_permissions=True, force=True)
					except Exception:
						frappe.log_error(frappe.get_traceback(),
						                 f"Cannot clean up old allocation {old.name}")

				alloc = frappe.get_doc({
					"doctype": "Leave Allocation",
					"employee": employee_name,
					"leave_type": leave_type,
					"from_date": str(effective_start),
					"to_date": str(new_to_date),
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
		_sync_rolling_allocation(
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
	_sync_rolling_allocation(
		employee.name, employee.employee_name, policy, lt_flags,
		employee.date_of_joining, lp_from, lp_to,
	)
	frappe.db.commit()


# ---------------------------------------------------------------------------
# Backfill  (policy assigned late — covers joining month through today)
# ---------------------------------------------------------------------------

def backfill_leaves_from_joining(employee):
	if not employee.custom_leave_group_policy or not employee.date_of_joining:
		return

	lp_from, lp_to = _get_leave_period_dates(employee.custom_leave_group_policy)
	if not lp_from or not lp_to:
		return

	lt_flags = _get_leave_type_flags()
	policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)
	_sync_rolling_allocation(
		employee.name, employee.employee_name, policy, lt_flags,
		employee.date_of_joining, lp_from, lp_to,
	)
