frappe.ui.form.on('Quotation', {
    refresh: function(frm) {
        frm.fields_dict.custom_sales_history.$input.on('click', function() {
            window.open('/app/query-report/Sales History', '_blank');
        });
        frm.fields_dict.custom_purchase_history.$input.on('click', function() {
            window.open('/app/query-report/Purchase History', '_blank');
        });
    }
});


frappe.ui.form.on("Quotation", {
    refresh: function (frm) {
        frm.add_custom_button(
            __("Project"),
            function () {
                frappe.new_doc("Project");
            },
            __("Create")
        );
    },
});

frappe.ui.form.on('Quotation', {
    custom_area: function(frm) {
        frm.doc.items.forEach(row => {
            if (!row.item_code || !row.prevdoc_docname) {
                return;
            }

            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Opportunity',
                    name: row.prevdoc_docname
                },
                callback: function(opportunity_res) {
                    if (opportunity_res.message && opportunity_res.message.custom_bom) {
                        let bom_name = opportunity_res.message.custom_bom;

                        frappe.call({
                            method: 'frappe.client.get',
                            args: {
                                doctype: 'BOM',
                                name: bom_name
                            },
                            callback: function(bom_res) {
                                if (bom_res.message && bom_res.message.custom_dft) {
                                    let dft = bom_res.message.custom_dft;

                                    frappe.call({
                                        method: 'frappe.client.get',
                                        args: {
                                            doctype: 'Item',
                                            name: row.item_code
                                        },
                                        callback: function(item_res) {
                                            if (item_res.message) {
                                                let item = item_res.message;

                                                let bundle_size = item.custom_item_pack_size && item.custom_item_pack_size.length > 0
                                                    ? item.custom_item_pack_size[0].bundle_size : 1;

                                                let matched_row = (item.custom_consumption_table || []).find(entry => entry.dft == dft);
                                                let consumption = matched_row ? matched_row.consumption : 0;

                                                let qty = consumption * frm.doc.custom_area;
                                                let no_of_packs = bundle_size ? qty / bundle_size : 0;

                                                frappe.model.set_value(row.doctype, row.name, 'qty', qty);
                                                frappe.model.set_value(row.doctype, row.name, 'custom_no_of_packs', no_of_packs);
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        });
    }
});

frappe.ui.form.on("Quotation Item", {
    item_code: function (frm, cdt, cdn) {
        frappe.after_ajax(() => calculate_suggested_price(frm, cdt, cdn));
    },
    qty: function (frm, cdt, cdn) {
        frappe.after_ajax(() => calculate_suggested_price(frm, cdt, cdn));
    }
});

function calculate_suggested_price(frm, cdt, cdn) {
    const item = locals[cdt][cdn];
    const supply_type = frm.doc.custom_supply_type;
    const customer = frm.doc.party_name;


    if (!supply_type || !item.item_code || !item.qty || !customer) {
        return;
    }

    frappe.call({
        method: "stellance_customizations.overrides.price.get_suggested_sale_price",
        args: {
            item_code: item.item_code,
            qty: item.qty,
            supply_type: supply_type,
            customer: customer
        },
        callback: function (r) {
            if (r.message) {
                if (typeof r.message === "object") {
                    frappe.model.set_value(cdt, cdn, "custom_suggested_sales_price", r.message.rate);
                } else {
                    frappe.model.set_value(cdt, cdn, "custom_suggested_sales_price", r.message);
                }
           // Generate table HTML
        let html = `<table class="table table-bordered" style="margin-top: 10px;">
            <thead>
                <tr>
                    <th style="width:70%">Item Name</th>
                    <th style="width:30%">Suggested Price (₹)</th>
                </tr>
            </thead>
            <tbody>`;

        frm.doc.items.forEach(row => {
            html += `<tr>
                        <td>${row.item_name || row.item_code || "-"}</td>
                        <td>₹${row.custom_suggested_sales_price || "0.00"}</td>
                     </tr>`;
        });

        html += `</tbody></table>`;

        frm.set_df_property("custom_suggested_price", "options", html);
        frm.refresh_field("custom_suggested_price");
    } 
        }
    });
}
