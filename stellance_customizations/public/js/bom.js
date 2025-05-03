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


frappe.ui.form.on('BOM Item', {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
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
                    frappe.model.set_value(cdt, cdn, 'custom_margin', frm.doc.custom_profit_margin);
                    frappe.model.set_value(cdt, cdn, 'custom_area_sq_m', frm.doc.custom_area);

                    // Get DFT and Consumption from custom_consumption_table
                    let dft = item.custom_consumption_table && item.custom_consumption_table.length > 0 
                        ? item.custom_consumption_table[0].dft : 0;
                    let consumption = item.custom_consumption_table && item.custom_consumption_table.length > 0 
                        ? item.custom_consumption_table[0].consumption : 0;

                    let qty = consumption * frm.doc.custom_area;
                    frappe.model.set_value(cdt, cdn, 'qty', qty);

                    // Get bundle_size from custom_item_pack_size table
                    let bundle_size = item.custom_item_pack_size && item.custom_item_pack_size.length > 0 
                        ? item.custom_item_pack_size[0].bundle_size : 1;

                    let no_of_packs = bundle_size ? qty / bundle_size : 0;
                    frappe.model.set_value(cdt, cdn, 'custom_no_of_packs', no_of_packs);
                }
            }
        });
    }
});
