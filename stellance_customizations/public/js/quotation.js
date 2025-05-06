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
            __("Project"),
            function () {
                frappe.new_doc("Project");
            },
            __("Create")
        );
    },
});

frappe.ui.form.on('Quotation', {
    custom_area: function(frm) {
        frm.doc.items.forEach(row => {
            if (!row.item_code || !row.prevdoc_docname) {
                console.log('Skipping row (missing item_code or prevdoc_docname)');
                return;
            }

            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Opportunity',
                    name: row.prevdoc_docname
                },
                callback: function(opportunity_res) {
                    if (opportunity_res.message && opportunity_res.message.custom_bom) {
                        let bom_name = opportunity_res.message.custom_bom;
                        console.log('Row:', row.name, '→ Found BOM:', bom_name);

                        frappe.call({
                            method: 'frappe.client.get',
                            args: {
                                doctype: 'BOM',
                                name: bom_name
                            },
                            callback: function(bom_res) {
                                if (bom_res.message && bom_res.message.custom_dft) {
                                    let dft = bom_res.message.custom_dft;
                                    console.log('Row:', row.name, '→ Using DFT:', dft);

                                    frappe.call({
                                        method: 'frappe.client.get',
                                        args: {
                                            doctype: 'Item',
                                            name: row.item_code
                                        },
                                        callback: function(item_res) {
                                            if (item_res.message) {
                                                let item = item_res.message;

                                                let bundle_size = item.custom_item_pack_size && item.custom_item_pack_size.length > 0
                                                    ? item.custom_item_pack_size[0].bundle_size : 1;
                                                console.log('Row:', row.name, '→ Bundle size:', bundle_size);

                                                let matched_row = (item.custom_consumption_table || []).find(entry => entry.dft == dft);
                                                let consumption = matched_row ? matched_row.consumption : 0;
                                                console.log('Row:', row.name, '→ Matched consumption:', consumption);

                                                let qty = consumption * frm.doc.custom_area;
                                                let no_of_packs = bundle_size ? qty / bundle_size : 0;

                                                console.log(`Row: ${row.name} → Calculated qty: ${qty}, no_of_packs: ${no_of_packs}`);

                                                frappe.model.set_value(row.doctype, row.name, 'qty', qty);
                                                frappe.model.set_value(row.doctype, row.name, 'custom_no_of_packs', no_of_packs);
                                            } else {
                                                console.log('Row:', row.name, '→ Item fetch failed for:', row.item_code);
                                            }
                                        }
                                    });
                                } else {
                                    console.log('Row:', row.name, '→ No custom_dft found in BOM:', bom_name);
                                }
                            }
                        });
                    } else {
                        console.log('Row:', row.name, '→ No custom_bom linked in Opportunity:', row.prevdoc_docname);
                    }
                }
            });
        });
    }
});
