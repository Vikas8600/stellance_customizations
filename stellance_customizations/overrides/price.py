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
    # item_amount = flt(item.amount)  # use direct amount from Quotation Item
    item_amount = flt(frappe.form_dict.get("amount"))

    for row in sorted(settings.quantity_discount_rates, key=lambda x: flt(x.min_amount), reverse=True):
        if item_amount >= flt(row.min_amount) * 1_00_000:  # convert lakhs to ₹
            qty_discount = row.discount
            matched_qty = f"₹ >= {flt(row.min_amount)} L"
            discount_found = True
            break

    msg += f"• Quantity Given: {qty}<br>"
    msg += f"• Quantity Discount (%): {qty_discount} {'✅ Slab ' + matched_qty if discount_found else '❌ Not Applicable'}<br>"

    # Loading & Holding Cost from material_type
    loading_cost = 0
    holding_cost = 0

    for row in settings.loading_unloading_cost:
        if row.material_type == material_type:
            loading_cost = flt(row.rate_per_kg) * total_weight
            break

    for row in settings.holding_cost:
        if row.material_type == material_type:
            holding_cost = base_cost * flt(row.holding_cost_) / 100
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
    msg = f"""
    <div style="
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        font-size: 13px; 
        line-height: 1.4; 
        max-width: 650px; 
        margin: 0 auto; 
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border-radius: 12px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.08);
        overflow: hidden;
    ">
        <!-- Header -->
        <div style="
            background: linear-gradient(135deg, #495057 0%, #6c757d 100%);
            color: white;
            padding: 15px;
            text-align: center;
        ">
            <div style="font-size: 16px; font-weight: bold;">🔍 Suggested Price Calculation</div>
        </div>

        <!-- Content -->
        <div style="padding: 18px; background: white;">
            
            <!-- Basic Information -->
            <div style="margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #3498db;">📊 Basic Info</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px;">
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Base Cost:</b> ₹{base_cost}
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Material:</b> {material_type}
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Weight/Unit:</b> {weight_per_unit} Kg
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Total Weight:</b> {total_weight} Kg
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Supply Type:</b> {supply_type}
                    </div>
                </div>
            </div>

            <!-- Client & Payment -->
            <div style="margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e74c3c;">👥 Client & Payment</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px;">
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Client Group:</b> {customer_group}
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Category Margin:</b> {category_margin}% 
                        <span style="color: {'green' if category_found else 'red'}; font-size: 11px;">
                            {'✅' if category_found else '❌'}
                        </span>
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Payment Terms:</b> {payment_terms_template}
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Credit Days:</b> {total_credit_days} (~{total_credit_days/30:.1f}m)
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Payment Margin:</b> {payment_margin}% 
                        <span style="color: {'green' if payment_found else 'red'}; font-size: 11px;">
                            {'✅' if payment_found else '❌'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Quantity & Costs -->
            <div style="margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #9b59b6;">📦 Costs & Discounts</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px;">
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Quantity:</b> {qty}
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Qty Discount:</b> {qty_discount}% 
                        <span style="color: {'green' if discount_found else 'red'}; font-size: 11px;">
                            {'✅' if discount_found else '❌'}
                        </span>
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Loading Cost:</b> ₹{loading_cost}
                    </div>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;">
                        <b>Holding Cost:</b> ₹{holding_cost}
                    </div>
                    {"<div style='background: #f8f9fa; padding: 8px; border-radius: 6px; font-size: 12px;'><b>WH Cost (5%):</b> ₹" + str(company_wh_cost) + "</div>" if supply_type == "Stellence to Customer" else ""}
                </div>
            </div>

            <!-- Final Result -->
            <div style="
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                color: white;
                padding: 15px;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 4px 15px rgba(40, 167, 69, 0.2);
            ">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">🎯 Final Rate</div>
                <div style="font-size: 22px; font-weight: bold;">₹{round(rate, 2)}</div>
            </div>
        </div>
    </div>
    """

    # frappe.msgprint(msg)


    return {
    "rate": round(rate, 2),
    "html": msg
}


def get_item_base_cost(item_code):
    rate = frappe.db.get_value("Item Price", {
        "item_code": item_code,
        "selling": 1
    }, "price_list_rate")

    return rate or 100







