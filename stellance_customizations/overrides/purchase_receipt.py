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

