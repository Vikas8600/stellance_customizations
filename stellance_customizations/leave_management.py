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


def _batch_expiry(alloc_month, carry_forward_months):
	"""Last date on which the alloc_month batch is still valid.

	April with carry_forward_months=6 → Sep 30  (Apr is month 1 of 6)
	May  with carry_forward_months=6 → Oct 31
	"""
	d = getdate(alloc_month)
	end = getdate(add_months(date(d.year, d.month, 1), carry_forward_months - 1))
	_, last_day = _cal.monthrange(end.year, end.month)
	return date(end.year, end.month, last_day)


def _compute_valid_accrual(policy, effective_start, lt_flags, carry_forward_months):
	"""Sum of all non-expired monthly accruals as of today.

	A month's batch expires once today > _batch_expiry(that_month, carry_forward_months).
	"""
	today = getdate()
	effective_start = getdate(effective_start)
	joining_month_start = _month_start(effective_start)
	current_month_start = _month_start(today)
	totals = {}

	alloc_month = joining_month_start
	while alloc_month <= current_month_start:
		if _batch_expiry(alloc_month, carry_forward_months) < today:
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
			rate = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves
			totals[row.leave_type] = totals.get(row.leave_type, 0.0) + rate * fraction

		alloc_month = _next_month_start(alloc_month)

	return {lt: round(v, 2) for lt, v in totals.items()}


def _get_leaves_taken(employee_name, leave_type, lp_from, lp_to):
	"""Total approved leave days taken within the leave period."""
	result = frappe.db.sql("""
		SELECT COALESCE(SUM(total_leave_days), 0)
		FROM `tabLeave Application`
		WHERE employee=%s AND leave_type=%s AND docstatus=1
		  AND from_date >= %s AND to_date <= %s
	""", (employee_name, leave_type, str(lp_from), str(lp_to)))
	return flt(result[0][0]) if result else 0.0


def _sync_allocation(employee_name, employee_display, policy, lt_flags,
                     joining_date, lp_from, lp_to):
	"""Create or update the single Leave Allocation for this employee+policy+period.

	new_leaves_allocated = sum of non-expired monthly batches (>= leaves already taken).
	Running this monthly adds the new month's accrual AND drops any expired batches.
	"""
	today = getdate()
	current_month_start = _month_start(today)
	carry_forward_months = max(int(policy.carry_forward_months or 1), 1)

	effective_start = max(getdate(joining_date), lp_from)
	if _month_start(effective_start) > current_month_start:
		return

	valid_accrual = _compute_valid_accrual(policy, effective_start, lt_flags, carry_forward_months)

	for leave_type, valid_leaves in valid_accrual.items():
		existing = frappe.db.get_value(
			"Leave Allocation",
			{"employee": employee_name, "leave_type": leave_type,
			 "docstatus": 1, "to_date": str(lp_to)},
			["name", "new_leaves_allocated"],
			as_dict=True,
		)

		leaves_taken = _get_leaves_taken(employee_name, leave_type, lp_from, lp_to)
		# Never set new_leaves_allocated below leaves_taken — avoids negative available balance
		new_alloc = round(max(valid_leaves, leaves_taken), 2)

		try:
			if existing:
				if abs(round(flt(existing.new_leaves_allocated), 2) - new_alloc) >= 0.01:
					frappe.db.set_value("Leave Allocation", existing.name, {
						"new_leaves_allocated": new_alloc,
						"total_leaves_allocated": new_alloc,
					})
			else:
				# Clean up any stale allocations with different to_date
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
					"to_date": str(lp_to),
					"new_leaves_allocated": new_alloc,
					"carry_forward": 0,
				})
				alloc.insert(ignore_permissions=True)
				alloc.submit()

		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"Leave Allocation failed: {employee_display} – {leave_type}",
			)


def _run_for_all(lt_flags=None):
	employees = frappe.get_all(
		"Employee",
		filters={"status": "Active", "custom_leave_group_policy": ["is", "set"]},
		fields=["name", "employee_name", "date_of_joining", "custom_leave_group_policy"],
	)
	if not employees:
		return

	lt_flags = lt_flags or _get_leave_type_flags()

	for emp in employees:
		lp_from, lp_to = _get_leave_period_dates(emp.custom_leave_group_policy)
		if not lp_from or not lp_to:
			continue
		policy = frappe.get_doc("Leave Group Policy", emp.custom_leave_group_policy)
		_sync_allocation(
			emp.name, emp.employee_name, policy, lt_flags,
			emp.date_of_joining, lp_from, lp_to,
		)

	frappe.db.commit()


# ---------------------------------------------------------------------------
# Monthly scheduler  (runs on 1st of each month)
# Adds new month's accrual AND removes expired batches in one pass.
# ---------------------------------------------------------------------------

def allocate_monthly_leaves():
	_run_for_all()


# ---------------------------------------------------------------------------
# Custom expiry  (can be run any time, e.g. daily or on demand)
# Same logic as allocate_monthly_leaves — recomputes valid balance.
# ---------------------------------------------------------------------------

def expire_old_leaves():
	_run_for_all()


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
	_sync_allocation(
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
	_sync_allocation(
		employee.name, employee.employee_name, policy, lt_flags,
		employee.date_of_joining, lp_from, lp_to,
	)
