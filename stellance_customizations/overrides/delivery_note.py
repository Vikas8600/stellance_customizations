import frappe
from frappe.utils import flt
from erpnext.stock.doctype.packed_item.packed_item import is_product_bundle

def update_packed_item_basic_data(main_item_row, pi_row, packing_item, item_data):
    pi_row.parent_item = main_item_row.item_code
    pi_row.parent_detail_docname = main_item_row.name
    pi_row.item_code = packing_item.item_code
    pi_row.item_name = item_data.item_name
    pi_row.uom = item_data.stock_uom
    pi_row.conversion_factor = main_item_row.conversion_factor

    qty_multiplier = flt(main_item_row.stock_qty)

    if is_product_bundle(main_item_row.item_code):
        custom_no_of_packs = flt(main_item_row.get("custom_no_of_packs", 1))
        part_wise_qty = flt(packing_item.get("custom_part_wise_qty", 1))
        pi_row.qty = custom_no_of_packs * part_wise_qty  
    else:
        pi_row.qty = flt(packing_item.qty) * qty_multiplier

    if not pi_row.description:
        pi_row.description = packing_item.get("description")

def get_product_bundle_items(item_code):
    product_bundle = frappe.qb.DocType("Product Bundle")
    product_bundle_item = frappe.qb.DocType("Product Bundle Item")

    query = (
        frappe.qb.from_(product_bundle_item)
        .join(product_bundle)
        .on(product_bundle_item.parent == product_bundle.name)
        .select(
            product_bundle_item.item_code,
            product_bundle_item.qty,
            product_bundle_item.uom,
            product_bundle_item.description,
            product_bundle_item.custom_part_wise_qty
        )
        .where((product_bundle.new_item_code == item_code) & (product_bundle.disabled == 0))
        .orderby(product_bundle_item.idx)
    )

    return query.run(as_dict=True)
