import frappe
@frappe.whitelist()
def get_item_history(item_code):
    # Purchase History
    purchase_history = frappe.db.sql("""
        SELECT 
            poi.parent AS po,
            po.transaction_date AS posting_date,
            poi.qty,
            poi.rate,
            poi.item_code,
            poi.item_name AS material_name,
            po.supplier AS manufacturer,
            CONCAT_WS(', ', addr.address_line1, addr.city, addr.state) AS factory_location
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        LEFT JOIN `tabAddress` addr ON addr.name = po.supplier_address
        WHERE poi.item_code = %s AND po.docstatus = 1
        ORDER BY po.transaction_date DESC
    """, (item_code,), as_dict=True)

    # Sales History (without delivery_type)
    sales_history = frappe.db.sql("""
        SELECT 
            soi.parent AS so,
            so.transaction_date,
            soi.qty,
            soi.rate,
            soi.item_code,
            soi.item_name AS material_name,
            so.customer,
            so.customer_name,
            so.shipping_address_name,
            addr.address_line1 AS consignee_address,
            DATEDIFF(CURDATE(), so.transaction_date) AS days_passed
        FROM `tabSales Order Item` soi
        JOIN `tabSales Order` so ON so.name = soi.parent
        LEFT JOIN `tabAddress` addr ON addr.name = so.shipping_address_name
        WHERE soi.item_code = %s AND so.docstatus = 1
        ORDER BY so.transaction_date DESC
    """, (item_code,), as_dict=True)

    return {"purchase": purchase_history, "sales": sales_history}
