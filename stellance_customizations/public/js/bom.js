frappe.ui.form.on('BOM Item', {
    custom_margin: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let lpr = flt(row.custom_last_purchase_rate);  // already fetched field
        let percent = flt(row.custom_margin);          // manual input field
        let final_rate = lpr + (lpr * percent / 100);

        // Set base_rate
        frappe.model.set_value(cdt, cdn, 'base_rate', final_rate);
        frappe.model.set_value(cdt, cdn, 'rate', final_rate);  // also set main rate

        // Recalculate amounts and totals
        erpnext.bom.calculate_rm_cost(frm.doc);
        erpnext.bom.calculate_total(frm.doc);

        frm.refresh_fields();  // refresh form fields to reflect changes
    }
});


function calculate_bom_item_values(frm) {
    (frm.doc.items || []).forEach(row => {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Item',
                name: row.item_code
            },
            callback: function(r) {
                if (r.message) {
                    let item = r.message;

                    // Set area and margin from BOM header
                    frappe.model.set_value(row.doctype, row.name, 'custom_margin', frm.doc.custom_profit_margin);
                    frappe.model.set_value(row.doctype, row.name, 'custom_area_sq_m', frm.doc.custom_area);

                    // DFT from BOM form
                    let dft = frm.doc.custom_dft || 0;

                    // Find matching consumption from item.custom_consumption_table
                    let matched_row = (item.custom_consumption_table || []).find(entry => entry.dft == dft);
                    let consumption = matched_row ? matched_row.consumption : 0;

                    let qty = consumption * frm.doc.custom_area;
                    frappe.model.set_value(row.doctype, row.name, 'qty', qty);

                    // Get bundle_size from custom_item_pack_size table
                    let bundle_size = item.custom_item_pack_size && item.custom_item_pack_size.length > 0 
                        ? item.custom_item_pack_size[0].bundle_size : 1;

                    let no_of_packs = bundle_size ? qty / bundle_size : 0;
                    frappe.model.set_value(row.doctype, row.name, 'custom_no_of_packs', no_of_packs);
                }
            }
        });
    });
}

frappe.ui.form.on('BOM Item', {
    before_save: function(frm) {
        calculate_bom_item_values(frm);
    }
});

frappe.ui.form.on('BOM Item', {
    item_code: function(frm, cdt, cdn) {
        calculate_bom_item_values(frm);
    }
});



function update_dft_options(frm) {
    if (frm.doc.item) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Item',
                name: frm.doc.item
            },
            callback: function(r) {
                if (r.message) {
                    let consumption_table = r.message.custom_consumption_table || [];
                    let dft_options = [];
                    consumption_table.forEach(entry => {
                        if (entry.dft) {
                            dft_options.push(entry.dft);
                        }
                    });

                    frm.set_df_property('custom_dft', 'options', dft_options.join('\n'));
                    frm.refresh_field('custom_dft');
                }
            }
        });
    }
}

frappe.ui.form.on('BOM', {
    refresh: function(frm) {
        update_dft_options(frm);
    },
    item: function(frm) {
        update_dft_options(frm);
    }
});

function update_last_row_purchase_history(frm) {
    const last_row = (frm.doc.items || []).slice(-1)[0];
    if (last_row && last_row.item_code) {
        frappe.call({
            method: 'stellance_customizations.overrides.bom.get_purchase_history',
            args: {
                item_code: last_row.item_code
            },
            callback: function(r) {
                let html = `<div style='margin-bottom: 10px; font-weight: bold; font-size: 14px;'>
                    Item: ${last_row.item_name}
                </div>
                <div style='overflow-x: auto; max-width: 100%;'>
                    <table class='table table-bordered' style='width:100%; border-collapse: collapse; text-align: left;'>
                        <thead>
                            <tr style='background-color: #f2f2f2;'>
                                <th style='padding: 8px;'>PO</th>
                                <th style='padding: 8px;'>Date</th>
                                <th style='padding: 8px;'>Rate</th>
                            </tr>
                        </thead>
                        <tbody>`;

                const data = r.message?.data || r.message;
                if (data && Array.isArray(data) && data.length > 0) {
                    data.forEach(d => {
                        html += `<tr>
                            <td style='padding: 8px;'>${d.po}</td>
                            <td style='padding: 8px;'>${frappe.datetime.str_to_user(d.posting_date)}</td>
                            <td style='padding: 8px;'>${d.rate}</td>
                        </tr>`;
                    });
                } else {
                    html += `<tr><td colspan='3' style='padding: 8px;'>No purchase history found.</td></tr>`;
                }

                html += `</tbody></table></div>`;

                frm.set_df_property('custom_po_history', 'options', html);
            }
        });
    } else {
        frm.set_df_property('custom_po_history', 'options', '<b>No item code in last row.</b>');
    }
}

frappe.ui.form.on('BOM', {
    refresh: function(frm) {
        update_last_row_purchase_history(frm);
    }
});

frappe.ui.form.on('BOM Item', {
    item_code: function(frm, cdt, cdn) {
        update_last_row_purchase_history(frm);
    }
});

// 'stellance_customizations.overrides.bom.get_purchase_history',