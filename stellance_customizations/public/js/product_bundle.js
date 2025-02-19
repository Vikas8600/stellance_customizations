frappe.ui.form.on('Product Bundle Item', {
    custom_pack_split: function (frm, cdt, cdn) {
        calculate_part_wise_qty(cdt, cdn);
    },
    custom_no_of_sets: function (frm, cdt, cdn) {
        calculate_part_wise_qty(cdt, cdn);
    }
});

function calculate_part_wise_qty(cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    if (row.custom_pack_split && row.custom_no_of_sets) {
        let part_wise_qty = row.custom_pack_split * row.custom_no_of_sets;
        frappe.model.set_value(cdt, cdn, 'custom_part_wise_qty', part_wise_qty);
    }
}
