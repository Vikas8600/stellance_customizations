import frappe


LEAD_FIELD_MAP = {
    # prospect field        lead field
    "custom_lead_source":        "source",
    "custom_lead_type":          "type",
    "custom_request_type":       "request_type",
    "custom_designation":        "job_title",
    "custom_client_name":        "first_name",
    "custom_organization_name":  "company_name",
    "custom_client_whatsapp_no": "custom_client_whatsapp_no",
    "customer_group":            "custom_customer_group",
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
