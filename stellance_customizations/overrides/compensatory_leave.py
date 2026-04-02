import frappe
from frappe.utils import add_days, getdate

from stellance_customizations.leave_management import get_leave_expiry_date


def set_compoff_leave_validity(doc, method=None):
	"""
	After Compensatory Leave Request is submitted, update the created/updated
	Leave Allocation's to_date based on the employee's Leave Group Policy.

	If the employee has no Leave Group Policy, the default ERPNext behaviour
	(leave period end date) is kept as-is.
	"""
	if not doc.leave_allocation:
		return

	policy_name = frappe.db.get_value(
		"Employee", doc.employee, "custom_leave_group_policy"
	)
	if not policy_name:
		return

	carry_forward_months = frappe.db.get_value(
		"Leave Group Policy", policy_name, "compoff_validity_months"
	)
	if not carry_forward_months:
		return

	# Validity starts the day after the work period ends (same as ERPNext)
	comp_leave_valid_from = getdate(add_days(doc.work_end_date, 1))
	correct_expiry = get_leave_expiry_date(comp_leave_valid_from, carry_forward_months)

	allocation = frappe.get_doc("Leave Allocation", doc.leave_allocation)

	# Only tighten the expiry — never extend beyond what the policy allows
	if getdate(allocation.to_date) > correct_expiry:
		allocation.db_set("to_date", correct_expiry, update_modified=False)
		frappe.logger().info(
			f"Comp-off validity updated: {doc.employee} allocation {allocation.name} "
			f"to_date set to {correct_expiry} (policy: {policy_name})"
		)
