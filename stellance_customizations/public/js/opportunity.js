

frappe.ui.form.on('Opportunity', {
    custom_bom: function(frm) {
        if (frm.doc.custom_bom) {
            frappe.call({
                method:"stellance_customizations.overrides.opportunity.get_bom_items",
                args: {
                    bom_name: frm.doc.custom_bom
                },
                callback: function(r) {
                    if (r.message) {
                        frm.clear_table("items");  
                        r.message.forEach(function(item) {
                            let row = frm.add_child("items");  // Order maintained
                            row.item_code = item.item_code;
                            row.item_name = item.item_name;
                            row.qty = item.qty;
                            row.uom = item.uom;
                            row.rate = item.rate;
                            row.amount = item.amount;
                            row.base_rate = item.base_rate
                            row.base_amount = item.base_amount
                        });
                        frm.refresh_field("items");
                    }
                }
            });
        }
    }
});
