import frappe
from frappe.utils import getdate, add_months
from datetime import date


def get_fy_march_31(from_date):
	"""Return March 31st of the financial year (April–March) containing from_date."""
	d = getdate(from_date)
	if d.month >= 4:
		return date(d.year + 1, 3, 31)
	else:
		return date(d.year, 3, 31)


def get_leave_expiry_date(from_date, carry_forward_months):
	"""
	Return the earlier of:
	  - from_date + carry_forward_months
	  - March 31st of the financial year that contains from_date

	This ensures leaves always lapse by financial year end (March 31st)
	regardless of carry-forward period.
	"""
	from_date = getdate(from_date)
	normal_expiry = getdate(add_months(from_date, carry_forward_months))
	march_31 = get_fy_march_31(from_date)
	return min(normal_expiry, march_31)


def allocate_monthly_leaves():
	"""
	Monthly scheduler task: allocates leaves to all active employees based on
	their assigned Leave Group Policy.

	Rules implemented:
	- Leaves are allocated on the 1st of each month.
	- Allocation quantity (fractional) is taken from the group's per-leave-type ratio.
	- Expiry = min(allocation_date + carry_forward_months, March 31st of current FY).
	- Leaves allocated in March always expire March 31st (same month).
	- No allocation is created if one already exists for the same employee /
	  leave type / month (idempotent).
	"""
	today = getdate()
	from_date = today.replace(day=1)

	employees = frappe.get_all(
		"Employee",
		filters={
			"status": "Active",
			"custom_leave_group_policy": ["is", "set"],
		},
		fields=["name", "employee_name", "custom_leave_group_policy"],
	)

	if not employees:
		frappe.logger().info("Monthly Leave Allocation: no active employees with a Leave Group Policy.")
		return

	for emp in employees:
		policy = frappe.get_doc("Leave Group Policy", emp.custom_leave_group_policy)
		expiry_date = get_leave_expiry_date(from_date, policy.carry_forward_months)

		for row in policy.leave_allocations:
			# Idempotency: skip if allocation already exists for this month
			if frappe.db.exists(
				"Leave Allocation",
				{
					"employee": emp.name,
					"leave_type": row.leave_type,
					"from_date": from_date,
					"docstatus": ["!=", 2],
				},
			):
				continue

			monthly_qty = row.leaves / 12 if row.allocation_type == "Yearly" else row.leaves

			try:
				allocation = frappe.get_doc(
					{
						"doctype": "Leave Allocation",
						"employee": emp.name,
						"leave_type": row.leave_type,
						"from_date": from_date,
						"to_date": expiry_date,
						"new_leaves_allocated": monthly_qty,
						"carry_forward": 0,
					}
				)
				allocation.insert(ignore_permissions=True)
				allocation.submit()
				frappe.logger().info(
					f"Leave Allocation: {monthly_qty} {row.leave_type} → "
					f"{emp.employee_name} (valid {from_date} to {expiry_date})"
				)
			except Exception:
				frappe.log_error(
					frappe.get_traceback(),
					f"Monthly Leave Allocation failed: {emp.employee_name} – {row.leave_type}",
				)

	frappe.db.commit()
