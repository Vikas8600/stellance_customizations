import frappe
from erpnext.selling.doctype.customer.customer import Customer

class CustomCustomer(Customer):
    def validate_customer_group(self):
        # Your custom logic

        if not self.customer_group:
            return

        # Example: allow group OR change behavior
        is_group = frappe.db.get_value("Customer Group", self.customer_group, "is_group")

        # 🔥 Option 1: Completely skip validation
        return

        # 🔥 Option 2: Modify logic
        # if is_group:
        #     frappe.msgprint("Group selected but allowed")