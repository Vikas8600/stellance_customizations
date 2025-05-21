frappe.ui.form.on('Sales Order', {
	refresh: function(frm){
        update_status_options(frm)
            frappe.model.user_settings.save(frm.doctype, "GridView", null).then((r) => {
                frappe.model.user_settings[frm.doctype] = r.message || r;
                frm.fields_dict.items.grid.reset_grid();
              });
    }
});

frappe.ui.form.on('Sales Order Item', {
    custom_bundle_sizeuom: function (frm, cdt, cdn) {
        calculate_qty(frm, cdt, cdn);
    },
    custom_no_of_packs: function (frm, cdt, cdn) {
        calculate_qty(frm, cdt, cdn);
    },
    item_code: function(frm, cdt, cdn) {
        var child = locals[cdt][cdn];

        if (child.item_code) {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Item',
                    name: child.item_code
                },
                callback: function(response) {
                    var item = response.message;
                    if (item.custom_item_pack_size) {
                        var bundle_sizes = item.custom_item_pack_size.map(function(pack) {
                            return pack.bundle_size;
                        });
                        bundle_sizes = [...new Set(bundle_sizes)];
                        frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[child.name].docfields, { "fieldname": "custom_bundle_sizeuom" })[0].options = bundle_sizes;
                        // frm.fields_dict.items.grid.update_docfield_property("custom_bundle_sizeuom","options",bundle_sizes);
                    }
                },
                
            });
        }
    }
});

function update_status_options(frm, cdt, cdn){
    let child_items = frm.doc.items || [];
        child_items.forEach(row => {
            if(row.item_code){
                frappe.call({
                    method: 'frappe.client.get',
                    args: {
                        doctype: 'Item',
                        name: row.item_code
                    },
                    callback: function(response) {
                        var item = response.message;
                        if (item.custom_item_pack_size) {
                            var bundle_sizes = item.custom_item_pack_size.map(function(pack) {
                                return pack.bundle_size;
                            }); 
                            bundle_sizes = [...new Set(bundle_sizes)];
                            frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[row.name].docfields, { "fieldname": "custom_bundle_sizeuom" })[0].options = bundle_sizes;
                            // cur_frm.refresh();
                            // frm.fields_dict.items.grid.update_docfield_property("custom_bundle_sizeuom","options",bundle_sizes);
                        }
                    },
                    
                });
        }
        });
}

function calculate_qty(frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    if (row.custom_bundle_sizeuom && row.custom_no_of_packs) {
        let bundle_size = parseFloat(row.custom_bundle_sizeuom);
            row.qty = bundle_size * row.custom_no_of_packs;
            console.log(row.qty); 
            frm.refresh_field('items'); 
    }
}

function update_last_row_history(frm) {
    const last_row = (frm.doc.items || []).slice(-1)[0];
    if (last_row && last_row.item_code) {
        frappe.call({
            method: 'stellance_customizations.overrides.sales_order.get_item_history',
            args: {
                item_code: last_row.item_code
            },
            callback: function(r) {
                const purchase = r.message.purchase || [];
                const sales = r.message.sales || [];

                let html = `<div style='margin-bottom: 15px; font-weight: bold; font-size: 14px;'>
                    Item: ${last_row.item_name}
                </div>`;

                // Purchase History
                html += `<div style='margin-bottom: 10px; font-weight: 600;'>Purchase History</div>`;
                html += `<div style='overflow: auto; max-height: 250px; border: 1px solid #ccc; margin-bottom: 20px;'>
                    <table class='table table-bordered' style='min-width: 1200px; border-collapse: collapse; text-align: left;'>
                        <thead>
                            <tr style='background-color: #f2f2f2; position: sticky; top: 0; z-index: 1;'>
                                <th style='padding: 8px; white-space: nowrap;'>Manufacturer</th>
                                <th style='padding: 8px;'>Factory Location</th>
                                <th style='padding: 8px; white-space: nowrap;'>Date</th>
                                <th style='padding: 8px; white-space: nowrap;'>Material Name</th>
                                <th style='padding: 8px; white-space: nowrap;'>Qty</th>
                                <th style='padding: 8px; white-space: nowrap;'>Rate</th>
                                <th style='padding: 8px; white-space: nowrap;'>PO</th>
                            </tr>
                        </thead>
                        <tbody>`;
                if (purchase.length > 0) {
                    purchase.forEach(d => {
                        html += `<tr>
                            <td style='padding: 8px; white-space: nowrap;'><a href="/app/supplier/${encodeURIComponent(d.manufacturer)}" target="_blank">${d.manufacturer}</a></td>
                            <td style='padding: 8px;'>${d.factory_location || '-'}</td>
                            <td style='padding: 8px; white-space: nowrap;'>${frappe.datetime.str_to_user(d.posting_date)}</td>
                            <td style='padding: 8px; white-space: nowrap;'><a href="/app/item/${encodeURIComponent(d.item_code)}" target="_blank">${d.material_name}</a></td>
                            <td style='padding: 8px; white-space: nowrap;'>${d.qty}</td>
                            <td style='padding: 8px; white-space: nowrap;'>${d.rate}</td>
                            <td style='padding: 8px; white-space: nowrap;'><a href="/app/purchase-order/${d.po}" target="_blank">${d.po}</a></td>
                        </tr>`;
                    });
                } else {
                    html += `<tr><td colspan='7' style='padding: 8px;'>No purchase history found.</td></tr>`;
                }
                html += `</tbody></table></div>`;

                // Sales History (with required 8 columns)
                html += `<div style='margin-bottom: 10px; font-weight: 600;'>Sales History</div>`;
                html += `<div style='overflow: auto; max-height: 250px; border: 1px solid #ccc;'>
                    <table class='table table-bordered' style='min-width: 1200px; border-collapse: collapse; text-align: left;'>
                        <thead>
                            <tr style='background-color: #f2f2f2; position: sticky; top: 0; z-index: 1;'>
                                <th style='padding: 8px; white-space: nowrap;'>Client Name</th>
                                <th style='padding: 8px;'>Consignee Address</th>
                                <th style='padding: 8px; white-space: nowrap;'>Date</th>
                                <th style='padding: 8px; white-space: nowrap;'>Days Passed</th>
                                <th style='padding: 8px; white-space: nowrap;'>Material Name</th>
                                <th style='padding: 8px; white-space: nowrap;'>Qty</th>
                                <th style='padding: 8px; white-space: nowrap;'>Rate</th>
                                <th style='padding: 8px; white-space: nowrap;'>SO</th>
                            </tr>
                        </thead>
                        <tbody>`;
                if (sales.length > 0) {
                    sales.forEach(d => {
                        html += `<tr>
                            <td style='padding: 8px; white-space: nowrap;'><a href="/app/customer/${encodeURIComponent(d.customer)}" target="_blank">${d.customer_name}</a></td>
                            <td style='padding: 8px;'>${d.consignee_address || '-'}</td>
                            <td style='padding: 8px; white-space: nowrap;'>${frappe.datetime.str_to_user(d.transaction_date)}</td>
                            <td style='padding: 8px; white-space: nowrap;'>${d.days_passed} days</td>
                            <td style='padding: 8px; white-space: nowrap;'>${d.material_name}</td>
                            <td style='padding: 8px; white-space: nowrap;'>${d.qty}</td>
                            <td style='padding: 8px; white-space: nowrap;'>${d.rate}</td>
                            <td style='padding: 8px; white-space: nowrap;'><a href="/app/sales-order/${d.so}" target="_blank">${d.so}</a></td>
                        </tr>`;
                    });
                } else {
                    html += `<tr><td colspan='9' style='padding: 8px;'>No sales history found.</td></tr>`;
                }

                html += `</tbody></table></div>`;

                frm.set_df_property('custom_history', 'options', html);
            }
        });
    } else {
        frm.set_df_property('custom_history', 'options', '<b>No item code in last row.</b>');
    }
}

frappe.ui.form.on('Sales Order', {
    refresh: function(frm) {
        update_last_row_history(frm);
    }
});

frappe.ui.form.on('Sales Order Item', {
    item_code: function(frm, cdt, cdn) {
        update_last_row_history(frm);
    }
});
