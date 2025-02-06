frappe.ui.form.on('Quotation', {
    refresh: function(frm) {
        frm.fields_dict.custom_sales_history.$input.on('click', function() {
            frappe.set_route('query-report', 'Item-wise Sales History', {
              
            });
        });
        frm.fields_dict.custom_purchase_history.$input.on('click', function() {
            frappe.set_route('query-report', 'Item-wise Purchase History', {
            });
        });
    }
});
