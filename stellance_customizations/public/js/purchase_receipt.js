frappe.ui.form.on('Purchase Receipt', {
	refresh: function (frm) {
	    if(frm.is_new()){
	        frm.doc.items.forEach(item => {
                item.custom_prev_quality = item.qty;  // Direct assignment without index
                item.qty = 0;
            });
            frm.refresh_field('items');
	    }
        frm.fields_dict["items"].grid.add_custom_button(__('Add Packs'), 
			function() {
            
            const existing_item_codes = frm.doc.items.map(item => item.item_code);
            let dialog = new frappe.ui.Dialog({
                size: "extra-large",
                title: 'Add Packs',
                fields: [
                    {
                        label: 'Item Code',
                        fieldname: 'item_code',
                        fieldtype: 'Link',
                        options: 'Item',
                        filters: {
                            'name': ['in', existing_item_codes]  
                        },
                        onchange: function () {
                            dialog.is_readonly_mode = false;
                            const selected_item_code = this.get_value();
                            dialog.set_value('bundle_size', '');
                            dialog.set_value('total_packs', '');
                            dialog.set_value('qty', '');
                            dialog.fields_dict.pack_sizes_table.df.data = [];
                            dialog.fields_dict.pack_sizes_table.grid.refresh();
                    
                            if (selected_item_code) { 
                                const item_row = frm.doc.items.find(item => item.item_code === selected_item_code);
                                const purchase_order = item_row ? item_row.purchase_order : null;
                    
                                if (item_row) {
                                    const matching_items = frm.doc.items.filter(item => item.item_code === selected_item_code);
                                    const total_qty = matching_items.reduce((sum, item) => sum + (item.qty || 0), 0);
                                    const total_prev_qty = item_row.custom_prev_quality || 0;
                                    const pending_qty = total_prev_qty - total_qty;
                                    dialog.set_value('qty', pending_qty || 0);
                                }
                    
                                frappe.call({
                                    method: 'frappe.client.get',
                                    args: {
                                        doctype: 'Item',
                                        name: selected_item_code,
                                    },
                                    callback: function (res) {
                                        if (res.message) {
                                            const item = res.message;
                    
                                            if (item.custom_is_single_item) {
                                                dialog.set_df_property('bundle_size', 'options', [item.custom_bundle_size]);
                                            } 
                                            else {
                                                if (item.item_group === "Product Bundle") {
                                                    console.log("Item is a Product Bundle. Fetching from Product Bundle Doctype...");
                                                    fetch_bundle_sizes_from_product_bundle_in_dialog(dialog, selected_item_code);
                                                    
                                                    if (purchase_order) {
                                                        frappe.call({
                                                            method: "stellance_customizations.overrides.purchase_receipt.get_remaining_qty",
                                                            args: {
                                                                item_code: selected_item_code,
                                                                purchase_order: purchase_order
                                                            },
                                                            callback: function (response) {
                                                                console.log(response);
                                                                if (response.message) {
                                                                    if (typeof response.message.remaining_qty === 'object') {
                                                                        let pack_sizes_data = [];
                    
                                                                        Object.entries(response.message.remaining_qty).forEach(([child_item, data]) => {
                                                                            if (data.remaining > 0) {
                                                                                pack_sizes_data.push({
                                                                                    item_name: child_item,
                                                                                    pack_split: data.pack_split || '',
                                                                                    no_of_sets: data.no_of_sets || '',
                                                                                    accepted_qty: data.remaining || 0,  
                                                                                    batch_id: null
                                                                                });
                                                                            }
                                                                        });
                    
                                                                        dialog.fields_dict.pack_sizes_table.df.data = pack_sizes_data;
                                                                        dialog.fields_dict.pack_sizes_table.grid.refresh();
                                                                    } else {
                                                                        dialog.set_value('qty', response.message.remaining_qty || 0);
                                                                    }
                                                                }
                                                            }
                                                        });
                                                    }
                                                }
                    
                                                if (item.custom_pack_size || item.custom_product_bundle) {
                                                    dialog.fields_dict.bundle_size.df.read_only = 0;
                                                    dialog.fields_dict.total_packs.df.read_only = 0;
                                                    dialog.is_readonly_mode = false;
                                                    dialog.refresh();
                    
                                                    if (item.custom_item_pack_size && item.custom_item_pack_size.length) {
                                                        const pack_sizes = item.custom_item_pack_size;
                                                        const pack_size_options = [...new Set(pack_sizes.map(pack => pack.bundle_size).filter(Boolean)), "Add Pack"];
                                                        dialog.set_df_property('bundle_size', 'options', pack_size_options);
                                                        dialog.pack_sizes = pack_sizes;
                                                    }
                                                }else {
                                                    dialog.set_df_property('bundle_size', 'read_only', 1);
                                                    dialog.set_df_property('total_packs', 'read_only', 1);
                                                    dialog.is_readonly_mode = true;
                                                    dialog.refresh();
                    
                                                    let po_qty = dialog.fields_dict.qty.get_value() || 0; 
                                                    dialog.fields_dict.pack_sizes_table.df.data = [{
                                                        accepted_qty: po_qty 
                                                    }];
                    
                                                    dialog.fields_dict.pack_sizes_table.grid.refresh();
                                                    let table_fields = dialog.fields_dict.pack_sizes_table.df.fields;
                                                    table_fields.forEach(function(field) {
                                                        if (['item_name', 'pack_split', 'no_of_sets'].includes(field.fieldname)) {
                                                            field.read_only = 1;
                                                        }
                                                    });
                                                }  
                    
                                                if (item.item_group === "Product Bundle") {
                                                    frappe.call({
                                                        method: 'frappe.client.get_value',
                                                        args: {
                                                            doctype: 'Product Bundle',
                                                            filters: { 'new_item_code': selected_item_code },
                                                            fieldname: ['name']
                                                        },
                                                        callback: function(response) {
                                                            if (response.message && response.message.name) {
                                                                const bundle_name = response.message.name;
                    
                                                                frappe.call({
                                                                    method: 'frappe.client.get',
                                                                    args: {
                                                                        doctype: 'Product Bundle',
                                                                        name: bundle_name
                                                                    },
                                                                    callback: function(res) {
                                                                        if (res.message) {
                                                                            var bundle = res.message;
                                                                            let pack_sizes_data = [];
                    
                                                                            bundle.items.forEach(pack => {
                                                                                let allocated_qty = (pack.custom_no_of_sets || 0) * (pack.custom_pack_split || 0);
                    
                                                                                pack_sizes_data.push({
                                                                                    item_name: pack.custom_item_name || selected_item_code,
                                                                                    pack_split: pack.custom_pack_split || '',
                                                                                    no_of_sets: pack.custom_no_of_sets || '',
                                                                                    accepted_qty: allocated_qty,
                                                                                    batch_id: null
                                                                                });
                                                                            });
                    
                                                                            dialog.fields_dict.pack_sizes_table.df.data = pack_sizes_data;
                                                                            dialog.fields_dict.pack_sizes_table.grid.refresh();
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                    
                                            dialog.set_value('uom', item.uom); 
                                            
                                            // if (item.custom_item_pack_size) {
                                            //     const pack_sizes = item.custom_item_pack_size;
                                            //     const pack_size_options = [...new Set(pack_sizes.map(pack => pack.bundle_size).filter(Boolean)), "Add Pack"];
                                            //     dialog.set_df_property('bundle_size', 'options', pack_size_options);
                        
                                            //     dialog.pack_sizes = pack_sizes;
                                            // }
                                        }
                                    },
                                });
                            }
                        },
                    },                                       
                    {
                        fieldtype: 'Column Break',
                    },
                    {
                        label: 'Warehouse',
                        fieldname: 'warehouse',
                        fieldtype: 'Link',
                        options: 'Warehouse',
                        default: frm.doc.set_warehouse,
                    },
                    {
                        fieldtype: 'Section Break',
                    },
                    {
                        label: 'PO Qty (UOM)',
                        fieldname: 'qty',
                        fieldtype: 'Float',
                        read_only: 1,
                    },
                    {
                        fieldtype: 'Column Break',
                    },
                    {
                        label: 'Bundle Size',
                        fieldname: 'bundle_size',
                        fieldtype: 'Select',
                        options: [],
                        onchange: function () {
                            const selected_dimension = this.get_value();
                            const table = dialog.fields_dict.pack_sizes_table.grid;
                    
                            dialog.fields_dict.pack_sizes_table.df.data = [];
                            table.refresh();
                    
                            if (selected_dimension === "Add Pack") {
                                const selected_item_code = dialog.fields_dict.item_code.get_value();
                                if (selected_item_code) {
                                    // frappe.set_route('Form', 'Item', selected_item_code);
                                    const item_url = `/app/item/${selected_item_code}`;
                                    window.open(item_url, '_blank');  
                                }
                            } else {
                                if (dialog.pack_sizes && Array.isArray(dialog.pack_sizes)) {
                                    const filtered_data = dialog.pack_sizes.filter(pack => pack.bundle_size === selected_dimension);
                                    const selected_item_code = dialog.fields_dict.item_code.get_value();
                                    const purchase_order = frm.doc.items.find(item => item.item_code === selected_item_code)?.purchase_order;
                    
                                    if (purchase_order) {
                                        frappe.call({
                                            method: "stellance_customizations.overrides.purchase_receipt.get_remaining_qty",
                                            args: {
                                                item_code: selected_item_code,
                                                purchase_order: purchase_order
                                            },
                                            callback: function(response) {
                                                if (response.message) {
                                                    const remaining_data = response.message.remaining_qty || {};
                    
                                                    frappe.call({
                                                        method: 'frappe.client.get_value',
                                                        args: {
                                                            doctype: 'Product Bundle',
                                                            filters: { 'new_item_code': selected_item_code },
                                                            fieldname: ['name']
                                                        },
                                                        callback: function(response) {
                                                            if (response.message && response.message.name) {
                                                                const bundle_name = response.message.name;
                    
                                                                frappe.call({
                                                                    method: 'frappe.client.get',
                                                                    args: {
                                                                        doctype: 'Product Bundle',
                                                                        name: bundle_name
                                                                    },
                                                                    callback: function(res) {
                                                                        var bundle = res.message;
                                                                        if (bundle) {
                    
                                                                            const customItemName = bundle.items?.length > 0 
                                                                                ? bundle.items[0].custom_item_name 
                                                                                : dialog.fields_dict.item_code.get_value();
                    
                                                                            dialog.set_value('item_name', customItemName);
                                                                            dialog.set_value('custom_pack_split', bundle.custom_pack_split || '');
                                                                            dialog.set_value('custom_no_of_sets', bundle.custom_no_of_sets || '');
                                                                            dialog.set_value('custom_bundle_size', selected_dimension);
                                                                            dialog.set_value('custom_part_wise_qty', bundle.custom_part_wise_qty || '');
                    
                                                                            if (bundle.items && Array.isArray(bundle.items)) {
                                                                                let pack_sizes_data = [];
                    
                                                                                bundle.items.forEach(pack => {
                                                                                    let allocated_qty = Math.min(
                                                                                        remaining_data[pack.item_code]?.remaining || 0, 
                                                                                        (pack.custom_no_of_sets || 0) * (pack.custom_pack_split || 0)
                                                                                    );
                    
                                                                                    if (remaining_data[pack.item_code]?.remaining > 0) {
                                                                                        pack_sizes_data.push({
                                                                                            item_name: pack.custom_item_name || pack.item_code,
                                                                                            pack_split: pack.custom_pack_split || '',
                                                                                            no_of_sets: pack.custom_no_of_sets || '',
                                                                                            accepted_qty: allocated_qty,
                                                                                            batch_id: null
                                                                                        });
                                                                                    }
                                                                                });
                    
                                                                                dialog.fields_dict.pack_sizes_table.df.data = pack_sizes_data;
                                                                                table.refresh();
                                                                            }
                                                                        }
                                                                    }
                                                                });
                                                            } else {
                                                                dialog.fields_dict.pack_sizes_table.df.data = filtered_data.map(pack => ({
                                                                    item_name: pack.custom_item_name || pack.item_name, 
                                                                    pack_split: pack.pack_split,
                                                                    no_of_sets: pack.no_of_sets,
                                                                    accepted_qty: 0,
                                                                    batch_id: null
                                                                }));
                                                                table.refresh();
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                                        });
                                    } else {
                                        dialog.fields_dict.pack_sizes_table.df.data = filtered_data.map(pack => ({
                                            item_name: pack.custom_item_name || pack.item_name, 
                                            pack_split: pack.pack_split,
                                            no_of_sets: pack.no_of_sets,
                                            accepted_qty: 0,
                                            batch_id: null
                                        }));
                                        table.refresh();
                                    }
                                }
                            }
                        }
                    },                    
                    {
                        fieldtype: 'Column Break',
                    },
                    {
                        label: 'No of Packs',
                        fieldname: 'total_packs',
                        fieldtype: 'Float',
                        onchange: function () {
                            const total_packs = this.get_value();
                            const table = dialog.fields_dict.pack_sizes_table.grid;
                            const po_qty = dialog.fields_dict.qty.get_value();
                            const bundle_size = parseFloat(dialog.fields_dict.bundle_size.get_value() || 0);
                            const selected_item_code = dialog.fields_dict.item_code.get_value();
                            const purchase_order = frm.doc.items.find(item => item.item_code === selected_item_code)?.purchase_order;
                    
                            if (selected_item_code) {
                                frappe.call({
                                    method: 'frappe.client.get',
                                    args: {
                                        doctype: 'Item',
                                        name: selected_item_code
                                    },
                                    callback: function (res) {
                                        if (res.message) {
                                            const item = res.message;
                    
                                            if (item.custom_is_single_item) {
                                                let accepted_qty = bundle_size * total_packs;
                                                let pending_qty = po_qty - accepted_qty;
                    
                                                if (pending_qty < 0) {
                                                    frappe.msgprint({
                                                        title: __('Warning'),
                                                        message: __('No of Packs is too high.'),
                                                        indicator: 'red',
                                                    });
                                                }
                    
                                                dialog.fields_dict.pack_sizes_table.df.data = [{
                                                    accepted_qty: accepted_qty,
                                                    pending_qty: Math.max(pending_qty, 0),
                                                    pack_split: '',
                                                    no_of_sets: '',
                                                    batch_id: null
                                                }];
                                                table.refresh();
                                            } 
                                            else if (item.item_group === "Product Bundle") {

                                                if (purchase_order) {
                                                    frappe.call({
                                                        method: "stellance_customizations.overrides.purchase_receipt.get_remaining_qty",
                                                        args: {
                                                            item_code: selected_item_code,
                                                            purchase_order: purchase_order
                                                        },
                                                        callback: function (response) {
                                                            if (response.message) {
                                                                const remaining_data = response.message.remaining_qty || {};
                    
                                                                frappe.call({
                                                                    method: 'frappe.client.get_value',
                                                                    args: {
                                                                        doctype: 'Product Bundle',
                                                                        filters: { 'new_item_code': selected_item_code },
                                                                        fieldname: ['name']
                                                                    },
                                                                    callback: function(response) {
                                                                        if (response.message && response.message.name) {
                                                                            const bundle_name = response.message.name;
                    
                                                                            frappe.call({
                                                                                method: 'frappe.client.get',
                                                                                args: {
                                                                                    doctype: 'Product Bundle',
                                                                                    name: bundle_name
                                                                                },
                                                                                callback: function(res) {
                                                                                    if (res.message) {
                                                                                        var bundle = res.message;
                                                                                        let pack_sizes_data = [];
                    
                                                                                        bundle.items.forEach(pack => {
                                                                                            let allocated_qty = Math.min(
                                                                                                remaining_data[pack.item_code]?.remaining || 0, 
                                                                                                (pack.custom_no_of_sets || 0) * (pack.custom_pack_split || 0) * total_packs
                                                                                            );
                    
                                                                                            if (remaining_data[pack.item_code]?.remaining > 0) {
                                                                                                pack_sizes_data.push({
                                                                                                    item_name: pack.custom_item_name || selected_item_code,
                                                                                                    pack_split: pack.custom_pack_split || '',
                                                                                                    no_of_sets: pack.custom_no_of_sets || '',
                                                                                                    accepted_qty: allocated_qty,
                                                                                                    pending_qty: Math.max(remaining_data[pack.item_code]?.remaining - allocated_qty, 0),
                                                                                                    batch_id: null
                                                                                                });
                                                                                            }
                                                                                        });
                    
                                                                                        dialog.fields_dict.pack_sizes_table.df.data = pack_sizes_data;
                                                                                        table.refresh();
                                                                                    }
                                                                                }
                                                                            });
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                }
                                            } 
                                            else {
                                                table.data.forEach(row => {
                                                    row.accepted_qty = row.no_of_sets * row.pack_split * total_packs || 0;
                                                });
                    
                                                table.refresh();
                    
                                                let total_sum = 0;
                                                table.data.forEach(row => {
                                                    total_sum += (row.no_of_sets * row.pack_split) || 0;
                                                });
                    
                                                let has_negative_pending_qty = false;
                    
                                                table.data.forEach(row => {
                                                    const row_sum = (row.no_of_sets * row.pack_split) || 0;
                                                    const accepted_qty = row.accepted_qty || 0;
                                                    const proportional_qty = (po_qty * row_sum) / total_sum;
                                                    const calculated_pending_qty = proportional_qty - accepted_qty;
                    
                                                    if (calculated_pending_qty < 0) {
                                                        has_negative_pending_qty = true;
                                                    }
                                                    row.pending_qty = calculated_pending_qty;
                                                });
                    
                                                table.refresh();
                                                if (has_negative_pending_qty) {
                                                    frappe.msgprint({
                                                        title: __('Warning'),
                                                        message: __('No of Packs is too high.'),
                                                        indicator: 'red',
                                                    });
                                                }
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    },                                                          
                    {
                        fieldtype: 'Section Break',
                    },
                    {
                        label: 'Pack Sizes',
                        fieldtype: 'Table',
                        fieldname: 'pack_sizes_table',
                        cannot_add_rows: true,
                        cannot_delete_rows: false,
                        in_place_edit: true,
                        fields: [
                            {
                                label: 'Item Name',
                                fieldname: 'item_name',
                                fieldtype: 'Data',
                                in_list_view: 1,
                                columns: 2,
                            },
                            {
                                label: 'Pack Split',
                                fieldname: 'pack_split',
                                fieldtype: 'Float',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'No of Sets',
                                fieldname: 'no_of_sets',
                                fieldtype: 'Int',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Accepted Quantity',
                                fieldname: 'accepted_qty',
                                fieldtype: 'Float',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Total pending qty(UOM)',
                                fieldname: 'pending_qty',
                                fieldtype: 'Float',
                                in_list_view: 1,
                                columns: 1,
                                read_only: 1,
                            },
                            
                            {
                                label: 'Total Rejected qty(UOM)',
                                fieldname: 'qty',
                                fieldtype: 'Float',
                                in_list_view: 1,
                                columns: 1,
                            },
                           
                            {
                                label: 'Batch No',
                                fieldname: 'batch_id',
                                fieldtype: 'Data',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Manufacturing Date',
                                fieldname: 'manufacturing_date',
                                fieldtype: 'Date',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Expiry Date',
                                fieldname: 'expiry_date',
                                fieldtype: 'Date',
                                in_list_view: 1,
                                columns: 1,
                            },
                        ],
                        data: [],
                        
                    },
                ],
                primary_action_label: 'Submit',
                primary_action(values) {
                    // const batch_rows = values.pack_sizes_table.filter(row => row.pending_qty >= 0);
                    // const batch_rows = values.pack_sizes_table;
                    const total_packs = values.total_packs;
                    const pack_size = values.bundle_size;
                    // if (!batch_rows || batch_rows.length === 0) {
                    //     frappe.msgprint(__('The required quantity for item {0} is complete. No further batches are needed.', [values.item_code]));
                    //         return;
                    // }
                    let batch_rows;
                    if (dialog.is_readonly_mode) {
                        // For read-only mode, use all rows (even if it is a single blank row)
                        batch_rows = values.pack_sizes_table;
                    } else {
                        batch_rows = values.pack_sizes_table.filter(row => row.pending_qty >= 0);
                        if (!batch_rows || batch_rows.length === 0) {
                            frappe.msgprint(__('The required quantity for item {0} is complete. No further batches are needed.', [values.item_code]));
                            return;
                        }
                    }

                    frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { 'item_code': values.item_code },
                            fieldname: ['item_group']
                        },
                        callback: function (response) {
                            if (response.message && response.message.item_group === "Product Bundle") {
                                // Call server script for Product Bundle
                                frappe.call({
                                    method: 'stellance_customizations.overrides.purchase_receipt.create_batches_for_product_bundle',
                                    args: {
                                        item_code: values.item_code,
                                        batch_rows: JSON.stringify(batch_rows)
                                    },
                                });
                            } else {
                                let promises = batch_rows.map((row) => {
                                    return frappe.call({
                                        method: 'frappe.client.insert',
                                        args: {
                                            doc: {
                                                doctype: 'Batch',
                                                batch_id: row.batch_id,
                                                item: values.item_code,
                                                manufacturing_date: row.manufacturing_date,
                                                expiry_date: row.expiry_date,
                                                status: 'Active'
                                            }
                                        }
                                    });
                                });
                                Promise.all(promises)
                                    .then(() => {
                                        frappe.msgprint(__('Batches created successfully.'));
                                        // dialog.hide();
                                    })
                                    .catch((error) => {
                                        console.error('Batch creation error:', error);
                                    });
                            }
                        }
                    });


                    frappe.call({
                        method: 'frappe.client.get',
                        args: {
                            doctype: 'Item',
                            name: values.item_code,
                        },
                        callback: function(res) {
                            if (res.message) {
                                const item = res.message;
                                const selected_item_code = values.item_code;
                                const item_in_child_table = frm.doc.items.find(item => item.item_code === selected_item_code);

                                const item_rate = item_in_child_table ? item_in_child_table.rate : item.standard_rate;
                                const item_uom = item_in_child_table ? item_in_child_table.uom : item.uom;
                                const item_conversion_factor = item_in_child_table ? item_in_child_table.uom : item.conversion_factor;

                                const purchase_order_item = frm.doc.items.find(item => item.item_code === values.item_code);
                                let existing_item_row = frm.doc.items.find(item => item.item_code === selected_item_code);
                                if (item.item_group === "Product Bundle") {
                                    frappe.call({
                                        method: 'frappe.client.get',
                                        args: {
                                            doctype: 'Product Bundle',
                                            filters: { 'new_item_code': values.item_code },
                                        },
                                        callback: function (response) {                               
                                            if (response.message && response.message.items) {
                                                const bundle_items = response.message.items;
                                                let original_po = purchase_order_item ? purchase_order_item.purchase_order : "";
                               
                                                batch_rows.forEach(row => {                              
                                                    const matching_part = bundle_items.find(part =>
                                                        part.custom_item_name && part.custom_item_name.trim() === row.item_name.trim()
                                                    );
                                
                                                    if (matching_part) {                          
                                                        frm.add_child('items', {
                                                            item_code: matching_part.item_code,
                                                            item_name: matching_part.custom_item_name || matching_part.item_name,
                                                            description: matching_part.description || item.description,
                                                            uom: item_uom,
                                                            conversion_factor: item_conversion_factor,
                                                            warehouse: values.warehouse,
                                                            qty: row.accepted_qty,
                                                            custom_name: row.item_name,
                                                            pack: row.item_name,
                                                            batch_no: row.batch_id,
                                                            rate: item_rate,
                                                            custom_no_of_packs: total_packs,
                                                            custom_pack_size: pack_size,
                                                            custom_bundle_sizeuom: pack_size,
                                                            purchase_order: original_po, // Assign only `purchase_order`
                                                            custom_prev_quality: purchase_order_item ? purchase_order_item.custom_prev_quality : ""
                                                        });
                                                    } 
                                                });
                                                let bundle_item_index = frm.doc.items.findIndex(item => item.item_code === values.item_code);
                                                if (bundle_item_index !== -1) {
                                                    frm.doc.items.splice(bundle_item_index, 1);
                                                } 
                                
                                                frm.refresh_field('items');
                                            } else {
                                                frappe.msgprint(__('No items found in the Product Bundle.'));
                                            }
                                        }
                                    });
                                
                                    return;
                                }
                                
                                if (dialog.is_readonly_mode) {
                                    if (existing_item_row) {
                                        existing_item_row.batch_no = batch_rows[0].batch_id;
                                        existing_item_row.qty = first_row.accepted_qty;
                                    }
                                    // else {
                                    // 	frm.add_child('items', {
                                    // 		item_code: values.item_code,
                                    // 		item_name: item.item_name,
                                    // 		description: item.description,
                                    // 		uom: item_uom,
                                    // 		conversion_factor: item_conversion_factor,
                                    // 		warehouse: values.warehouse,
                                    // 		qty: batch_rows[0].accepted_qty,
                                    // 		batch_no: batch_rows[0].batch_id,
                                    // 		rate: item_rate,
                                    // 		purchase_order_item: purchase_order_item ? purchase_order_item.purchase_order_item : ""
                                    // 	});
                                    // }
                                } else {

                                    if (existing_item_row) {
                                        if (!existing_item_row.batch_no && !existing_item_row.custom_name) {
                                            const first_row = batch_rows[0];
                                            existing_item_row.qty = first_row.accepted_qty;
                                            existing_item_row.custom_name = first_row.item_name;
                                            existing_item_row.pack = first_row.item_name;
                                            existing_item_row.batch_no = first_row.batch_id;
                                            existing_item_row.rate = item_rate;
                                            existing_item_row.custom_no_of_packs = total_packs;
                                            existing_item_row.custom_pack_size = pack_size;
                                            existing_item_row.custom_bundle_sizeuom = pack_size;
                                            existing_item_row.purchase_order_item = purchase_order_item.purchase_order_item

                                            batch_rows.slice(1).forEach(row => {
                                                frm.add_child('items', {
                                                    item_code: values.item_code,
                                                    item_name: item.item_name,
                                                    description: item.description,
                                                    uom: item_uom,
                                                    conversion_factor: item_conversion_factor,
                                                    warehouse: values.warehouse,
                                                    qty: row.accepted_qty,
                                                    custom_name: row.item_name,
                                                    pack: row.item_name,
                                                    batch_no: row.batch_id,
                                                    rate: item_rate,
                                                    custom_no_of_packs: total_packs,
                                                    custom_pack_size: pack_size,
                                                    custom_bundle_sizeuom: pack_size,
                                                    purchase_order_item: purchase_order_item.purchase_order_item,
                                                    custom_prev_quality: purchase_order_item.custom_prev_quality
                                                });
                                            });
                                        } else {
                                            batch_rows.forEach(row => {
                                                frm.add_child('items', {
                                                    item_code: values.item_code,
                                                    item_name: item.item_name,
                                                    description: item.description,
                                                    uom: item_uom,
                                                    conversion_factor: item_conversion_factor,
                                                    warehouse: values.warehouse,
                                                    qty: row.accepted_qty,
                                                    custom_name: row.item_name,
                                                    pack: row.item_name,
                                                    batch_no: row.batch_id,
                                                    rate: item_rate,
                                                    custom_no_of_packs: total_packs,
                                                    custom_pack_size: pack_size,
                                                    custom_bundle_sizeuom: pack_size,
                                                    purchase_order_item: purchase_order_item.purchase_order_item,
                                                    custom_prev_quality: purchase_order_item.custom_prev_quality
                                                });
                                            });
                                        }
                                    }
                                }

                                frm.refresh_field('items');
                                // dialog.hide();
                            } else {
                                frappe.msgprint(__('Item not found.'));
                            }
                        }
                    });
                    dialog.set_values({
                        item_code: '',
                        bundle_size: '',
                        total_packs: '',
                        qty: '',
                        warehouse: frm.doc.set_warehouse,
                        pack_sizes_table: []
                    });
                    dialog.is_readonly_mode = false;
                    dialog.fields_dict.pack_sizes_table.grid.refresh();
                },
            });
                dialog.set_secondary_action(function () {
                    // frappe.msgprint(__('Save button clicked.'));
                    dialog.hide();
                });

                dialog.set_secondary_action_label('Save');
                dialog.show();
            });
    },
    validate: function(frm) {
        // Grouping and sorting items dynamically based on 'item_code'
        if (frm.doc.items && frm.doc.items.length > 0) {
            frm.doc.items.sort((a, b) => {
                if (a.item_code < b.item_code) return -1;
                if (a.item_code > b.item_code) return 1;
                return 0;
            });

            frm.doc.items.forEach((item, index) => {
                item.idx = index + 1;
            });

            // Refresh the field to reflect changes
            frm.refresh_field('items');
        }
    }
});

function fetch_bundle_sizes_from_product_bundle_in_dialog(dialog, item_name) {
    frappe.call({
        method: 'frappe.client.get',
        args: {
            doctype: 'Product Bundle',
            name: item_name
        },
        callback: function (response) {
            var bundle = response.message;
            console.log("Product Bundle response received:", bundle);

            if (bundle.items && bundle.items.length > 0) {
                var bundle_sizes = bundle.items.map(function (pack) {
                    return pack.custom_bundle_size;
                }).filter(Boolean);
                bundle_sizes = [...new Set(bundle_sizes)];
                console.log("Bundle Sizes from Product Bundle Items:", bundle_sizes);


                dialog.set_df_property('bundle_size', 'options', bundle_sizes);
                dialog.pack_sizes = bundle.items.map(pack => ({
                    item_name: pack.item_name,
                    pack_split: pack.pack_split,
                    no_of_sets: pack.no_of_sets,
                    accepted_qty: 0,
                    batch_id: null
                }));
                dialog.fields_dict.pack_sizes_table.grid.refresh();
            } else {
                console.warn("No items found in Product Bundle:", bundle);
            }
        }
    });
}
