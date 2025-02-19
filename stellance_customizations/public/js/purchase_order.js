frappe.ui.form.on('Purchase Order', {
	refresh: function(frm){
        update_status_options(frm)
            frappe.model.user_settings.save(frm.doctype, "GridView", null).then((r) => {
                frappe.model.user_settings[frm.doctype] = r.message || r;
                frm.fields_dict.items.grid.reset_grid();
              });
            frm.fields_dict.custom_purchase_history.$input.on('click', function() {
                window.open('/app/query-report/Purchase History', '_blank');
            });
    }
});

frappe.ui.form.on('Purchase Order Item', {
    custom_bundle_sizeuom: function (frm, cdt, cdn) {
        calculate_qty(frm, cdt, cdn);
    },
    custom_no_of_packs: function (frm, cdt, cdn) {
        calculate_qty(frm, cdt, cdn);
    },
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
                    if (item.item_group === "Product Bundle") {
                        console.log("Item is a Product Bundle. Fetching from Product Bundle Doctype...");
                        fetch_bundle_sizes_from_product_bundle(frm, child.item_code, child);
                    } 
                    else if (item.custom_item_pack_size) {
                        var bundle_sizes = item.custom_item_pack_size.map(function(pack) {
                            return pack.bundle_size;
                        });
                        bundle_sizes = [...new Set(bundle_sizes)];
                        frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[child.name].docfields, { "fieldname": "custom_bundle_sizeuom" })[0].options = bundle_sizes;
                        // frm.fields_dict.items.grid.update_docfield_property("custom_bundle_sizeuom","options",bundle_sizes);
                    }
                },
                
            });
        }
    }
});
function fetch_bundle_sizes_from_product_bundle(frm, item_name, child) {
    frappe.call({
        method: 'frappe.client.get',
        args: {
            doctype: 'Product Bundle',
            name: item_name
        },
        callback: function(response) {
            var bundle = response.message;
            console.log("Product Bundle response received:", bundle);

            if (bundle.items && bundle.items.length > 0) {
                var bundle_sizes = bundle.items.map(function(pack) {
                    return pack.custom_bundle_size; 
                }).filter(Boolean);
                bundle_sizes = [...new Set(bundle_sizes)];
                console.log("Bundle Sizes from Product Bundle Items:", bundle_sizes);

                // Set options for custom_bundle_sizeuom field
                frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[child.name].docfields, 
                    { "fieldname": "custom_bundle_sizeuom" })[0].options = bundle_sizes;
            } else {
                console.warn("No items found in Product Bundle:", bundle);
            }
        }
    });
}

function update_status_options(frm, cdt, cdn){
    let child_items = frm.doc.items || [];
        child_items.forEach(row => {
            if(row.item_code){
                frappe.call({
                    method: 'frappe.client.get',
                    args: {
                        doctype: 'Item',
                        name: row.item_code
                    },
                    callback: function(response) {
                        var item = response.message;
                        if (item.custom_item_pack_size) {
                            var bundle_sizes = item.custom_item_pack_size.map(function(pack) {
                                return pack.bundle_size;
                            }); 
                            bundle_sizes = [...new Set(bundle_sizes)];
                            frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[row.name].docfields, { "fieldname": "custom_bundle_sizeuom" })[0].options = bundle_sizes;
                            // cur_frm.refresh();
                            // frm.fields_dict.items.grid.update_docfield_property("custom_bundle_sizeuom","options",bundle_sizes);
                        }
                    },
                    
                });
        }
        });
}

function calculate_qty(frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    if (row.custom_bundle_sizeuom && row.custom_no_of_packs) {
        let bundle_size = parseFloat(row.custom_bundle_sizeuom);
            row.qty = bundle_size * row.custom_no_of_packs;
            console.log(row.qty); 
            frm.refresh_field('items'); 
    }
}
