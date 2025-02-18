# Copyright (c) 2025, chinmay@hybrowlabs.com and contributors
# For license information, please see license.txt

import frappe

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {
            "label": "Company Name",  
            "fieldname": "custom_organization_name",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "Contact name",  
            "fieldname": "opportunity_owner",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "Sales Rep.",  
            "fieldname": "sales_stage",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "Territory",  
            "fieldname": "territory",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "State",  
            "fieldname": "state",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "City",  
            "fieldname": "city",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "Pincode",  
            "fieldname": "pincode",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "Size of deal",  
            "fieldname": "opportunity_amount",
            "fieldtype": "Data",
            "width": 200
        },
		{
            "label": "Propability of deal",  
            "fieldname": "probability",
            "fieldtype": "Percent",
            "width": 200
        },
		{
            "label": "Weighted Forecast",  
            "fieldname": "",
            "fieldtype": "",
            "width": 200
        },
		{
            "label": "Deal status",  
            "fieldname": "status",
            "fieldtype": "Select",
			"options": "Opportunity",
            "width": 200
        },
		{
            "label": "Deal Closing Date",  
            "fieldname": "expected_closing",
            "fieldtype": "Date",
            "width": 200
        },
		# {
        #     "label": "Next action",  
        #     "fieldname": "expected_closing",
        #     "fieldtype": "Date",
        #     "width": 200
        # },
		
		
		
    ]

def get_data(filters):
    query = """
        SELECT
            custom_organization_name,
			opportunity_owner,
			sales_stage,
			territory,
			state,
			city,
			opportunity_amount,
			probability,
			status,
			expected_closing
        FROM
            `tabOpportunity`
    """
    data = frappe.db.sql(query, as_dict=True)
    return data
