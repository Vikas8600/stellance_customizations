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
                            const selected_item_code = this.get_value();
                            dialog.set_value('bundle_size', '');
                            dialog.fields_dict.pack_sizes_table.df.data = [];
                            dialog.fields_dict.pack_sizes_table.grid.refresh();

                            if (selected_item_code) { 
                                const item_row = frm.doc.items.find(item => item.item_code === selected_item_code);

                                if (item_row) {
                                        const matching_items = frm.doc.items.filter(item => item.item_code === selected_item_code);
                                        const total_qty = matching_items.reduce((sum, item) => sum + (item.qty || 0), 0);
                                        const total_prev_qty = item_row.custom_prev_quality || 0;
                                        const pending_qty = total_prev_qty - total_qty;
                                        dialog.set_value('qty', pending_qty || 0)
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
                        
                                            if (!item.custom_pack_size) {
                                                frappe.msgprint(__('The selected item does not have custom pack sizes enabled.'));
                                                return;
                                            }
                        
                                            dialog.set_value('uom', item.uom); 
                                            if (item.custom_item_pack_size) {
                                                const pack_sizes = item.custom_item_pack_size;
                                                const pack_size_options = [...new Set(pack_sizes.map(pack => pack.bundle_size).filter(Boolean)), "Custom"];
                                                dialog.set_df_property('bundle_size', 'options', pack_size_options);
                        
                                                dialog.pack_sizes = pack_sizes;
                                            }
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
                    
                            if (selected_dimension === "Custom") {
                                dialog.fields_dict.pack_sizes_table.df.data.push(
                                    { item_name: "Part A", pack_split: null, no_of_sets: null, accepted_qty: null, batch_no: null },
                                    { item_name: "Part B", pack_split: null, no_of_sets: null, accepted_qty: null, batch_no: null }
                                );
                                table.refresh();
                            } else {
                                if (dialog.pack_sizes && Array.isArray(dialog.pack_sizes)) {
                                    const filtered_data = dialog.pack_sizes.filter(pack => pack.bundle_size === selected_dimension);
                        
                                    dialog.fields_dict.pack_sizes_table.df.data = filtered_data.map(pack => ({
                                        item_name: pack.item_name, 
                                        pack_split: pack.pack_split,
                                        no_of_sets: pack.no_of_sets,
                                        accepted_qty: 0,
                                        batch_no: null
                                    }));
                                    table.refresh();
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

                            table.data.forEach(row => {
                                row.accepted_qty = row.no_of_sets * row.pack_split * total_packs || 0;
                            });

                            table.refresh();

                            let total_sum = 0;
                            table.data.forEach(row => {
                                total_sum += row.no_of_sets * row.pack_split; 
                            });
                    
                            table.data.forEach(row => {
                                const calculated_pending_qty = po_qty - (total_sum * total_packs);
                                row.pending_qty = calculated_pending_qty < 0 ? 0 : calculated_pending_qty; 

                                // row.pending_qty = po_qty - (total_sum * total_packs) || 0; 
                            });
                            table.refresh();
                            
                        },
                    },
                    {
                        fieldtype: 'Section Break',
                    },
                    {
                        label: 'Pack Sizes',
                        fieldtype: 'Table',
                        fieldname: 'pack_sizes_table',
                        cannot_add_rows: true,
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
                    const batch_rows = values.pack_sizes_table;
                    const total_packs = values.total_packs; 
                    const pack_size = values.bundle_size; 
                    if (!batch_rows || batch_rows.length === 0) {
                                    frappe.msgprint(__('No data available to create batches.'));
                                    return;
                                }
                            
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
                                        dialog.hide();
                                    })
                                    .catch((error) => {
                                        console.error(error);
                                        frappe.msgprint(__('Error occurred while creating batches.'));
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
                
                                if (existing_item_row) {
                                    if (!existing_item_row.batch_no && !existing_item_row.custom_name) {
                                        const first_row = batch_rows[0];
                                        existing_item_row.qty = first_row.accepted_qty;
                                        existing_item_row.custom_name = first_row.item_name;
                                        existing_item_row.batch_no = first_row.batch_id;
                                        existing_item_row.rate = item_rate;
                                        existing_item_row.custom_no_of_packs = total_packs;
                                        existing_item_row.custom_pack_size = pack_size;
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
                                                batch_no: row.batch_id,
                                                rate: item_rate,
                                                custom_no_of_packs: total_packs,
                                                custom_pack_size: pack_size,
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
                                                batch_no: row.batch_id,
                                                rate: item_rate,
                                                custom_no_of_packs: total_packs,
                                                custom_pack_size: pack_size,
                                                purchase_order_item: purchase_order_item.purchase_order_item,
                                                custom_prev_quality: purchase_order_item.custom_prev_quality
                                            });
                                        });
                                    }
                                } 
                
                                frm.refresh_field('items');
                                dialog.hide();
                            } else {
                                frappe.msgprint(__('Item not found.'));
                            }
                        }
                    });
                },
            });
            
            dialog.show();
        });
        frm.fields_dict["items"].grid.add_custom_button(__('Add Multiple Packs'), 
        function() { 
            let dialog = new frappe.ui.Dialog({
                size: "extra-large",
                title: 'Add Packs',
                fields: [
                    {
                        fieldtype: 'Section Break',
                    },
                    {
                        label: 'Pack Sizes',
                        fieldtype: 'Table',
                        fieldname: 'pack_sizes_table',
                        cannot_add_rows: false,
                        in_place_edit: true,
                        fields: [
                            {
                                label: 'Item Code',
                                fieldname: 'item_code',
                                fieldtype: 'Data',
                                read_only: 1,
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Bundle Size',
                                fieldname: 'bundle_size',
                                fieldtype: 'Select',
                                options: [],
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'PO Qty (UOM)',
                                fieldname: 'qty',
                                fieldtype: 'Float',
                                read_only: 1,
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'No of Packs',
                                fieldname: 'total_packs',
                                fieldtype: 'Float',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Item Name',
                                fieldname: 'item_name',
                                fieldtype: 'Data',
                                in_list_view: 1,
                                columns: 1,
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
                    frappe.msgprint(__('Pack Sizes Submitted'));
                    dialog.hide();
                }
            });

            frm.doc.items.forEach(item => {
                const new_row = {
                    item_code: item.item_code,
                    item_name: item.item_name || "",
                    qty: item.qty || 0,
                    bundle_size: "",
                    total_packs: 0,
                    pack_split: null,
                };

                dialog.fields_dict.pack_sizes_table.df.data.push(new_row);
                dialog.fields_dict.pack_sizes_table.grid.refresh();
            });

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
})