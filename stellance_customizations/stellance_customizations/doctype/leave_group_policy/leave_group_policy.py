import frappe
from frappe.model.document import Document


class LeaveGroupPolicy(Document):
	def after_insert(self):
		self._sync_leave_policy()

	def on_update(self):
		self._sync_leave_policy()

	def _sync_leave_policy(self):
		"""Create or update a mirror Leave Policy so Leave Policy Assignment can reference it."""
		policy_name = f"LGP - {self.group_name}"

		if frappe.db.exists("Leave Policy", policy_name):
			policy = frappe.get_doc("Leave Policy", policy_name)
			policy.leave_policy_details = []
		else:
			policy = frappe.new_doc("Leave Policy")
			policy.title = policy_name

		for row in self.leave_allocations:
			annual = row.leaves if row.allocation_type == "Yearly" else row.leaves * 12
			policy.append("leave_policy_details", {
				"leave_type": row.leave_type,
				"annual_allocation": annual,
			})

		policy.flags.ignore_permissions = True
		if policy.is_new():
			policy.insert()
		else:
			policy.save()

