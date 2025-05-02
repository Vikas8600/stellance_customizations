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

