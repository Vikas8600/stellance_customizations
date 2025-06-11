import frappe
from frappe.utils import flt

@frappe.whitelist()
def get_suggested_sale_price(item_code, qty, supply_type, customer):
    settings = frappe.get_single("Pricing Calculation Settings")

    base_cost = get_item_base_cost(item_code)
    item = frappe.get_doc("Item", item_code)
    material_type = item.custom_material_type
    weight_per_unit = flt(item.weight_per_unit or 1)
    total_weight = flt(qty) * weight_per_unit

    msg = f"<b>🔍 Suggested Price Calculation</b><br>"
    msg += f"• Base Cost: ₹{base_cost}<br>"
    msg += f"• Material Type: {material_type}<br>"
    msg += f"• Weight per Unit: {weight_per_unit} Kg<br>"
    msg += f"• Total Weight: {total_weight} Kg<br>"
    msg += f" Suppy Type : {supply_type}<br>"

    # Client Category Margin
    customer_group = frappe.db.get_value("Customer", customer, "customer_group")
    category_margin = 0
    category_found = False
    matched_category = "-"
    for row in settings.client_category_rates:
        if row.client_category == customer_group:
            category_margin = row.margin_
            matched_category = row.client_category
            category_found = True
            break
    msg += f"• Client Group: {customer_group}<br>"
    msg += f"• Client Category Margin (%): {category_margin} {'✅ Matched with ' + matched_category if category_found else '❌ Not Found'}<br>"

        # Payment Term Margin (handle string ranges like "0–2", "3–4")
    payment_margin = 0
    payment_found = False
    matched_term = "-"
    total_credit_days = 0
    payment_terms_template = frappe.db.get_value("Customer", customer, "payment_terms")

    if payment_terms_template:
        terms = frappe.get_doc("Payment Terms Template", payment_terms_template)
        total_credit_days = sum([flt(row.credit_days) for row in terms.terms])
        total_credit_months = round(total_credit_days / 30, 2)

        for row in settings.payment_terms_rates:
            if row.term_range.strip().lower() == "advance" and total_credit_months == 0:
                payment_margin = row.margin
                matched_term = "Advance"
                payment_found = True
                break
            elif "-" in row.term_range:
                try:
                    min_month, max_month = [flt(x.strip()) for x in row.term_range.split("-")]
                    if min_month <= total_credit_months <= max_month:
                        payment_margin = row.margin
                        matched_term = row.term_range
                        payment_found = True
                        break
                except:
                    continue

    msg += f"• Payment Terms Template: {payment_terms_template}<br>"
    msg += f"• Total Credit Days: {total_credit_days} days (~{total_credit_days/30:.2f} months)<br>"
    msg += f"• Payment Term Margin (%): {payment_margin} {'✅ Matched with ' + matched_term if payment_found else '❌ Not Found'}<br>"


    # Quantity Discount
    qty_discount = 0
    discount_found = False
    matched_qty = "-"
    for row in sorted(settings.quantity_discount_rates, key=lambda x: flt(x.min_amount), reverse=True):
        if flt(qty) >= flt(row.min_amount):
            qty_discount = row.discount
            matched_qty = f">= {row.min_amount}"
            discount_found = True
            break
    msg += f"• Quantity Given: {qty}<br>"
    msg += f"• Quantity Discount (%): {qty_discount} {'✅ Slab ' + matched_qty if discount_found else '❌ Not Applicable'}<br>"

    # Loading & Holding Cost from material_type
    loading_cost = 0
    holding_cost = 0

    # frappe.msgprint(f"🔎 Checking Loading Cost for Material Type: {material_type}")
    for row in settings.loading_unloading_cost:
        # frappe.msgprint(f"👀 Comparing with: {row.material_type}")
        if row.material_type == material_type:
            loading_cost = flt(row.rate_per_kg) * total_weight
            # frappe.msgprint(f"✅ Matched: {material_type}, Rate/kg: {row.rate_per_kg}, Total Weight: {total_weight}, Total Loading: {loading_cost}")
            break

    # frappe.msgprint(f"🔎 Checking Holding Cost for Material Type: {material_type}")
    for row in settings.holding_cost:
        # frappe.msgprint(f"👀 Comparing with: {row.material_type}")
        if row.material_type == material_type:
            holding_cost = base_cost * flt(row.holding_cost_) / 100
            # frappe.msgprint(f"✅ Matched: {material_type}, Holding %: {row.holding_cost_}, Holding Cost: {holding_cost}")
            break

    msg += f"• Loading Cost (per qty): ₹{loading_cost}<br>"
    msg += f"• Holding Cost: ₹{holding_cost}<br>"

    # Final Price Calculation
    rate = flt(base_cost)
    rate += loading_cost
    rate += holding_cost

    if supply_type == "Supplier to Customer":
        rate += rate * flt(category_margin) / 100
        rate += rate * flt(payment_margin) / 100
        rate -= rate * flt(qty_discount) / 100

    elif supply_type == "Stellence to Customer":
        company_wh_cost = base_cost * 0.05
        msg += f"• Company WH Cost (5%): ₹{company_wh_cost}<br>"
        rate += company_wh_cost
        rate += rate * flt(category_margin) / 100
        rate += rate * flt(payment_margin) / 100
        rate -= rate * flt(qty_discount) / 100

    msg += f"<b>🎯 Final Suggested Rate: ₹{round(rate, 2)}</b>"
    # frappe.msgprint(msg)

    return round(rate, 2)

def get_item_base_cost(item_code):
    rate = frappe.db.get_value("Item Price", {
        "item_code": item_code,
        "selling": 1
    }, "price_list_rate")

    return rate or 100

