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
            __("Project Template"),
            function () {
                frappe.new_doc("Project Template");
            },
            __("Create")
        );
    },
});
