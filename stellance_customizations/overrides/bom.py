import frappe
from frappe.utils import flt

import frappe
from frappe.utils import flt

def custom_set_bom_item_rates(doc, method):
    for item in doc.items:
        last_purchase_rate = flt(item.custom_last_purchase_rate)
        percent = flt(item.custom_margin)
        calculated_rate = last_purchase_rate + (last_purchase_rate * percent / 100)
        

        item.rate = calculated_rate
        item.base_rate = calculated_rate * flt(doc.conversion_rate or 1)
        item.amount = calculated_rate * flt(item.qty)
        item.base_amount = item.amount * flt(doc.conversion_rate or 1)


@frappe.whitelist()
def get_purchase_history(item_code):
    data = frappe.db.sql("""
        SELECT 
            poi.parent AS po,
            po.transaction_date AS posting_date,
            poi.qty,
            poi.rate,
            poi.item_name AS material_name,
            po.supplier AS manufacturer,
            CONCAT_WS(', ', addr.address_line1, addr.city, addr.state) AS factory_location
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        LEFT JOIN `tabAddress` addr ON addr.name = po.supplier_address
        WHERE poi.item_code = %s AND po.docstatus = 1
        ORDER BY po.transaction_date DESC
    """, (item_code,), as_dict=True)
    return {"data": data}


def delete_lead_employee_field():
    custom_field_name = "Lead-employee"

    if frappe.db.exists("Custom Field", custom_field_name):
        frappe.delete_doc("Custom Field", custom_field_name, force=True)
        frappe.db.commit()
        frappe.logger().info(f"Deleted Custom Field: {custom_field_name}")
