import frappe
from erpnext.crm.doctype.prospect.prospect import make_opportunity as _erpnext_make_opportunity


PROSPECT_TO_OPPORTUNITY = {
    # prospect field                  opportunity field
    "customer_group":                 "custom_customer_category",
    "custom_customer_subcategory":    "custom_customer_subcategory",
    "custom_whatsapp_country_code":   "custom_whatsapp_country_code",
    "custom_client_name":             "contact_person",
    "custom_designation":             "job_title",
}


@frappe.whitelist()
def make_opportunity(source_name, target_doc=None):
    target = _erpnext_make_opportunity(source_name, target_doc)

    fields = list(PROSPECT_TO_OPPORTUNITY.keys()) + ["custom_client_whatsapp_no"]
    source = frappe.db.get_value(
        "Prospect",
        source_name,
        fields,
        as_dict=True,
    ) or {}

    for prospect_field, opportunity_field in PROSPECT_TO_OPPORTUNITY.items():
        value = source.get(prospect_field)
        if value:
            target.set(opportunity_field, value)

    whatsapp = source.get("custom_client_whatsapp_no")
    if whatsapp:
        target.contact_mobile = whatsapp

    return target


LEAD_FIELD_MAP = {
    # prospect field        lead field
    "custom_lead_source":        "source",
    "custom_lead_type":          "type",
    "custom_request_type":       "request_type",
    "custom_designation":        "job_title",
    "custom_client_name":        "first_name",
    "custom_organization_name":  "company_name",
    "custom_client_whatsapp_no":  "custom_client_whatsapp_no",
    "custom_whatsapp_country_code": "custom_mobile_country_code",
    "customer_group":             "custom_customer_group",
}


def before_save(doc, method=None):
    if not doc.leads:
        return

    lead_name = doc.leads[0].lead
    if not lead_name:
        return

    lead = frappe.db.get_value(
        "Lead",
        lead_name,
        list(LEAD_FIELD_MAP.values()),
        as_dict=True,
    )
    if not lead:
        return

    for prospect_field, lead_field in LEAD_FIELD_MAP.items():
        value = lead.get(lead_field)
        if value:
            doc.set(prospect_field, value)
