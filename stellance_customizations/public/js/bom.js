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
