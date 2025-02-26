from frappe import _
import frappe
from frappe import msgprint
from frappe.utils import compare, cast
import json

def custom_validate_value(self, fieldname, condition, val2, doc=None, raise_exception=None):
    """
    Completely bypass all validations for Purchase Receipt.
    """
    if not doc:
        doc = self

    if doc.doctype == "Purchase Receipt":
        return  

@frappe.whitelist()
def create_batches_for_product_bundle(item_code, batch_rows):
    created_batches = set()
    batch_results = []

    if isinstance(batch_rows, str):
        batch_rows = json.loads(batch_rows)

    product_bundle = frappe.get_doc('Product Bundle', {'new_item_code': item_code})

    if not product_bundle or not product_bundle.items:
        frappe.throw(f"No items found for Product Bundle: {item_code}")
    
    for row in batch_rows:
        matching_item = next(
            (item for item in product_bundle.items if item.custom_item_name and item.custom_item_name.strip() == row.get('item_name', '').strip()),
            None
        )

        if matching_item and row.get('batch_id') not in created_batches:
            created_batches.add(row.get('batch_id'))

            batch_doc = frappe.get_doc({
                'doctype': 'Batch',
                'batch_id': row.get('batch_id'),
                'item': matching_item.item_code,
                'manufacturing_date': row.get('manufacturing_date'),
                'expiry_date': row.get('expiry_date'),
                'status': 'Active'
            })
            batch_doc.insert(ignore_permissions=True)

            batch_results.append({
                'item_code': matching_item.item_code,
                'batch_id': row.get('batch_id'),
                'status': 'Created'
            })

    return batch_results



@frappe.whitelist()
def get_remaining_qty(item_code, purchase_order):
    po_item = frappe.db.get_value("Purchase Order Item", 
                                  {"parent": purchase_order, "item_code": item_code}, 
                                  ["qty", "custom_no_of_packs"], as_dict=True) or {}

    po_qty = float(po_item.get("qty", 0))
    no_of_packs = float(po_item.get("custom_no_of_packs", 0))  

    is_product_bundle = frappe.db.exists("Product Bundle", item_code)

    if is_product_bundle:

        bundle_items = frappe.get_all("Product Bundle Item",
                                      filters={"parent": item_code},
                                      fields=["item_code", "custom_part_wise_qty"])


        total_remaining = {}
        for bundle_item in bundle_items:
            child_item_code = bundle_item.get("item_code")
            part_wise_qty = float(bundle_item.get("custom_part_wise_qty", 0))

            ordered_qty = part_wise_qty * no_of_packs

            received_qty = frappe.db.sql("""
                SELECT SUM(qty) FROM `tabPurchase Receipt Item`
                WHERE item_code = %s AND purchase_order = %s AND docstatus = 1
            """, (child_item_code, purchase_order))[0][0] or 0

            received_qty = float(received_qty)

            remaining_qty = max(ordered_qty - received_qty, 0)

            total_remaining[child_item_code] = {
                "ordered": ordered_qty,
                "received": received_qty,
                "remaining": remaining_qty
            }

        return {"remaining_qty": total_remaining}

    else:

        received_qty = frappe.db.sql("""
            SELECT SUM(qty) FROM `tabPurchase Receipt Item`
            WHERE item_code = %s AND purchase_order = %s AND docstatus = 1
        """, (item_code, purchase_order))[0][0] or 0

        received_qty = float(received_qty)

        remaining_qty = max(po_qty - received_qty, 0)
        return {"remaining_qty": remaining_qty}
