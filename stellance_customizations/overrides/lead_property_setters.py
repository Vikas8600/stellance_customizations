import frappe

def setup_lead_property_setters():
    property_setters = [
        {
            "doctype": "Property Setter",
            "doctype_or_field": "DocType",
            "doc_type": "Lead",
            "property": "field_order",
            "property_type": "Data",
            "value": "[\"custom_section_break_v5y5h\", \"naming_series\", \"salutation\", \"first_name\", \"middle_name\", \"last_name\", \"custom_client_whatsapp_no\", \"custom_column_break_tbscd\", \"lead_name\", \"job_title\", \"gender\", \"source\", \"custom_preferred_contact_method\", \"custom_assign_3\", \"lead_owner\", \"customer\", \"type\", \"request_type\", \"lead_status\", \"custom_customer_category\", \"custom_customer_subcategory\", \"custom_budget_range\", \"custom_purpose_of_purchase\", \"contact_info_tab\", \"email_id\", \"website\", \"column_break_20\", \"mobile_no\", \"whatsapp_no\", \"column_break_16\", \"phone\", \"phone_ext\", \"organization_section\", \"company_name\", \"no_of_employees\", \"column_break_28\", \"annual_revenue\", \"industry\", \"market_segment\", \"column_break_31\", \"territory\", \"fax\", \"address_section\", \"address_html\", \"column_break_38\", \"city\", \"custom_state_name\", \"state\", \"country\", \"column_break2\", \"contact_html\", \"qualification_tab\", \"qualification_status\", \"column_break_64\", \"qualified_by\", \"qualified_on\", \"other_info_tab\", \"campaign_name\", \"company\", \"column_break_22\", \"language\", \"image\", \"title\", \"column_break_50\", \"disabled\", \"unsubscribed\", \"blog_subscriber\", \"custom_unused_columns\", \"custom_column_break_hdc4v\", \"custom_column_1\", \"custom_column_break_4ivfu\", \"custom_column_2\", \"custom_column_break_3v92u\", \"custom_column_3\", \"custom_column_break_bztmt\", \"custom_column_4\", \"custom_section_break_q9mjq\", \"custom_attednded_by\", \"custom_column_break_jgkl4\", \"custom_sales_manager\", \"custom_sales_partner\", \"custom_column_break_he2r9\", \"custom_expected_time_of_purchase\", \"custom_section_break_cdnvi\", \"custom_supplier\", \"custom_column_break_kqdbs\", \"custom_cp_firm_name\", \"custom_column_break_9ay64\", \"custom_channel_partner_name\", \"custom_channel_partner_mobile\", \"custom_column_break_veaoy\", \"custom_project\", \"custom_project_name_data\", \"locality\", \"column_break_on6en\", \"property_name\", \"custom_financing_dea\", \"section_break_nfu53\", \"team_leader\", \"project_name\", \"custom_column_break_wqwjb\", \"custom_lead_date\", \"column_break_1\", \"custom_assign_2\", \"custom_department\", \"custom_section_break_fdure\", \"custom_visit_status\", \"col_break123\", \"custom_remider_date\", \"custom_reminder_time_hours\", \"custom_column_break_xk0ej\", \"custom_reminder_time_minutes\", \"custom_reminder_time_format\", \"custom_reminder_notes\", \"status\", \"lead_result\", \"custom_column_break_tnehf\", \"custom_visit_status_tab\", \"custom_section_break_kog3i\", \"custom_latest_visit_status\", \"custom_area\", \"custom_visit_plan\", \"activities_tab\", \"open_activities_html\", \"custom_task_list_\", \"all_activities_section\", \"custom_task_list\", \"custom_tab_9\", \"notes_html\", \"notes\", \"custom_all_activities_\", \"all_activities_html\", \"custom_additional_information\", \"custom_mobile_number_1\", \"custom_mobile_number_2\", \"custom_mobile_number_3\", \"custom_birthday\", \"custom_column_break_s2hqb\", \"custom_email_id_1\", \"custom_email_id_2\", \"custom_email_id_3\", \"custom_anniversary_date\", \"custom_permanent_address\", \"custom_address\", \"custom_residence_type\", \"custom_rented\", \"custom_owned\", \"custom_parentalfriend\", \"custom_current_residence_type\", \"custom_state1\", \"custom_repeat_customer\", \"custom_column_break_esoxk\", \"custom_city1\", \"custom_postal_code\", \"custom_address_for_comunication\", \"custom_address_copy\", \"custom_state_copy\", \"custom_column_break_efbqh\", \"custom_city_copy\", \"custom_postal_code_copy\", \"custom_copy\", \"dashboard_tab\", \"notes_tab\", \"custom_section_break_kmdlr\", \"call\", \"whatsapp\", \"custom_budget\", \"custom_occupation\", \"team_leader_name\", \"assigned_to\", \"custom_employee_name\", \"custom_mobile_no\", \"lead_date\", \"custom_whatsapp\", \"custom_whatsapp_chat\", \"custom_whatapp__mail\", \"custom_chat\", \"configuration\", \"custom_whatsapp__mail_chat\", \"custom_tab_11\", \"custom_show_preview\", \"custom_add_properties\"]",
            "name": "Lead-main-field_order"
        },
        {
            "doctype": "Property Setter",
            "doctype_or_field": "DocField",
            "doc_type": "Lead",
            "field_name": "contact_info_tab",
            "property": "hidden",
            "property_type": "Check",
            "value": "0",
            "name": "Lead-contact_info_tab-hidden"
        },
        {
            "doctype": "Property Setter",
            "doctype_or_field": "DocField",
            "doc_type": "Lead",
            "field_name": "phone_ext",
            "property": "hidden",
            "property_type": "Check",
            "value": "0",
            "name": "Lead-phone_ext-hidden"
        },
        {
            "doctype": "Property Setter",
            "doctype_or_field": "DocField",
            "doc_type": "Lead",
            "field_name": "organization_section",
            "property": "hidden",
            "property_type": "Check",
            "value": "0",
            "name": "Lead-organization_section-hidden"
        },
        {
            "doctype": "Property Setter",
            "doctype_or_field": "DocField",
            "doc_type": "Lead",
            "field_name": "qualification_tab",
            "property": "hidden",
            "property_type": "Check",
            "value": "0",
            "name": "Lead-qualification_tab-hidden"
        },
        {
            "doctype": "Property Setter",
            "doctype_or_field": "DocField",
            "doc_type": "Lead",
            "field_name": "other_info_tab",
            "property": "hidden",
            "property_type": "Check",
            "value": "0",
            "name": "Lead-other_info_tab-hidden"
        },
         {
        "name": "Lead-fax-hidden",
        "doctype_or_field": "DocField",
        "doc_type": "Lead",
        "field_name": "fax",
        "property": "hidden",
        "property_type": "Check",
        "value": "0",
        "doctype": "Property Setter"
    }
    ]

    for setter in property_setters:
        existing = frappe.db.get_value("Property Setter", setter["name"], ["doctype_or_field", "doc_type", "field_name", "property", "property_type", "value"], as_dict=True)
        
        needs_update = False
        if not existing:
            needs_update = True
        else:
            for key in ["doctype_or_field", "doc_type", "field_name", "property", "property_type", "value"]:
                if (setter.get(key) or "") != (existing.get(key) or ""):
                    needs_update = True
                    break

        if needs_update:
            if existing:
                frappe.delete_doc("Property Setter", setter["name"], ignore_permissions=True)
            frappe.get_doc(setter).insert(ignore_permissions=True)

    # Delete unwanted property setters for deleted custom fields
    deleted_fields = ["custom_lead_status"]
    for field in deleted_fields:
        ps_name = f"Lead-{field}-hidden"
        if frappe.db.exists("Property Setter", ps_name):
            frappe.delete_doc("Property Setter", ps_name, ignore_permissions=True)

    frappe.db.commit()
