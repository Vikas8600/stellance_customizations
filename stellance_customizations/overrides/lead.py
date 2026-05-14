import frappe
from erpnext.crm.doctype.lead.lead import make_opportunity as _erpnext_make_opportunity


@frappe.whitelist()
def make_opportunity(source_name, target_doc=None):
    target = _erpnext_make_opportunity(source_name, target_doc)

    source = frappe.db.get_value(
        "Lead",
        source_name,
        ["custom_client_whatsapp_no", "custom_mobile_country_code"],
        as_dict=True,
    ) or {}

    whatsapp = source.get("custom_client_whatsapp_no")
    code = source.get("custom_mobile_country_code")
    if whatsapp:
        target.contact_mobile = whatsapp
    if code:
        target.custom_whatsapp_country_code = code

    return target
