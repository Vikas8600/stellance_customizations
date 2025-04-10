import frappe
@frappe.whitelist()
def get_bom_items(bom_name):
    bom = frappe.get_doc("BOM", bom_name)
    items = []
    for d in bom.items:
        items.append({
            "item_code": d.item_code,
            "item_name": d.item_name,
            "qty": d.qty,
            "uom": d.uom,
            "rate": d.rate,
            "amount": d.amount,
            "base_rate":d.base_rate,
            "base_amount":d.base_amount
        })
    return items
