frappe.ui.form.on('Item', {
    refresh: function (frm) {
        frm.trigger('toggle_child_table_visibility');
    },
    custom_pack_size: function (frm) {
        frm.trigger('toggle_child_table_visibility');
    },
    toggle_child_table_visibility: function (frm) {
        if (frm.doc.custom_pack_size || (frm.doc.custom_pack_size && frm.doc.custom_product_bundle)) {
            frm.set_df_property('custom_item_pack_size', 'hidden', 0);
            frm.fields_dict['custom_item_pack_size'].grid.get_field('fieldname').set_reqd(true);
        } else {
            frm.set_df_property('custom_item_pack_size', 'hidden', 1);
            frm.fields_dict['custom_item_pack_size'].grid.get_field('fieldname').set_reqd(false);
        }
    },
    validate: function (frm) {
        if (frm.doc.custom_pack_size && frm.doc.custom_item_pack_size.length === 0) {
            frappe.msgprint(__('Please add rows to the Bundle Pack Details table.'));
            frappe.validated = false;
        }
    }
})
frappe.ui.form.on('Bundle Pack Details', {
    pack_split: function (frm, cdt, cdn) {
        calculate_part_wise_qty(cdt, cdn);
    },
    no_of_sets: function (frm, cdt, cdn) {
        calculate_part_wise_qty(cdt, cdn);
    }
});

function calculate_part_wise_qty(cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    if (row.pack_split && row.no_of_sets) {
        let part_wise_qty = row.pack_split * row.no_of_sets;
        frappe.model.set_value(cdt, cdn, 'part_wise_qty', part_wise_qty); 
    }
}
