# Copyright (c) 2025, chinmay@hybrowlabs.com and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class ContactGroup(Document):
	pass


import frappe

@frappe.whitelist()
def get_contacts_by_party(party_type, party_name):
    contacts = frappe.db.sql("""
        SELECT c.name, c.first_name, c.last_name, c.email_id, c.phone
        FROM `tabContact` c
        JOIN `tabDynamic Link` dl ON dl.parent = c.name
        WHERE dl.link_doctype = %s AND dl.link_name = %s
    """, (party_type, party_name), as_dict=True)
    return contacts
