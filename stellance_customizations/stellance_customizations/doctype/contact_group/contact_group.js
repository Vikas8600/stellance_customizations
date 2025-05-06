// Copyright (c) 2025, chinmay@hybrowlabs.com and contributors
// For license information, please see license.txt

frappe.ui.form.on('Contact Group', {
    customer: function(frm) {
        fetch_and_set_contacts(frm, 'Customer', frm.doc.customer);
    },
    supplier: function(frm) {
        fetch_and_set_contacts(frm, 'Supplier', frm.doc.supplier);
    }
});

function fetch_and_set_contacts(frm, party_type, party_name) {
    if (!party_name) {
        frappe.msgprint(`Please select a ${party_type}`);
        return;
    }

    frappe.call({
        method: 'stellance_customizations.stellance_customizations.doctype.contact_group.contact_group.get_contacts_by_party',
        args: {
            party_type: party_type,
            party_name: party_name
        },
        callback: function(r) {
            if (r.message) {
                frm.clear_table('contacts');
                r.message.forEach(contact => {
                    let row = frm.add_child('contacts');
                    row.contact = contact.name;
                    row.contact_name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
                    row.number = contact.phone;
                    row.email_id = contact.email_id;
                });
                frm.refresh_field('contacts');
            } else {
                frappe.msgprint(`No contacts found for ${party_type}: ${party_name}`);
            }
        }
    });
}
