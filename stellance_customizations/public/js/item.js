frappe.ui.form.on('Item', {
    refresh: function (frm) {
        frm.trigger('toggle_child_table_visibility');
    },
    custom_pack_size: function (frm) {
        frm.trigger('toggle_child_table_visibility');
    },
    toggle_child_table_visibility: function (frm) {
        if (frm.doc.custom_pack_size) {
            frm.set_df_property('custom_item_pack_size', 'hidden', 0);
            frm.fields_dict['custom_item_pack_size'].grid.get_field('fieldname').set_reqd(true);
        } else {
            frm.set_df_property('custom_item_pack_size', 'hidden', 1);
            frm.fields_dict['custom_item_pack_size'].grid.get_field('fieldname').set_reqd(false);
        }
    },
    validate: function (frm) {
        if (frm.doc.custom_pack_size && frm.doc.custom_item_pack_size.length === 0) {
            frappe.msgprint(__('Please add rows to the Item Pack Size table.'));
            frappe.validated = false;
        }
    }
})