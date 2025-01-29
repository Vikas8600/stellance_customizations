frappe.ui.form.on('Purchase Order', {
	refresh: {
    }
});

frappe.ui.form.on('Purchase Order Item', {
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
                        console.log("Bundle Sizes:", bundle_sizes);
                    }
                },
                
            });
        }
    }
});
