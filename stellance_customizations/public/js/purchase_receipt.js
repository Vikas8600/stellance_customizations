frappe.ui.form.on('Purchase Receipt', {
    refresh: function (frm) {
        frm.fields_dict["items"].grid.add_custom_button(__('Add Packs'), 
			function() {
            
            const existing_item_codes = frm.doc.items.map(item => item.item_code);
            let dialog = new frappe.ui.Dialog({
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
                            dialog.set_value('pack_size', '');
                            dialog.fields_dict.pack_sizes_table.df.data = [];
                            dialog.fields_dict.pack_sizes_table.grid.refresh();

                            if (selected_item_code) { 
                                const item_row = frm.doc.items.find(item => item.item_code === selected_item_code);

                                if (item_row) {
                                    dialog.set_value('qty', item_row.qty || 0);
                                    // if (!item_row.used_once) {
                                    //     dialog.set_value('qty', item_row.qty || 0);
                                    //     item_row.used_once = true; 
                                    // } else {
                                    //     const updated_total_quantity = frm.doc.items.reduce((sum, pack) => {
                                    //         return sum + (pack.qty || 0);
                                    //     }, 0);
                        
                                    //     const total_qty = frm.doc.total_qty;
                                    //     const remaining_qty = total_qty - updated_total_quantity;
                                    //     dialog.set_value('qty', remaining_qty);
                                    // }
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
                                                const pack_size_options = [...new Set(pack_sizes.map(pack => pack.pack_size).filter(Boolean)), "Custom"];
                                                dialog.set_df_property('pack_size', 'options', pack_size_options);
                        
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
                        label: 'PO Qty (Kg)',
                        fieldname: 'qty',
                        fieldtype: 'Float',
                        read_only: 1,
                    },
                    {
                        fieldtype: 'Column Break',
                    },
                    {
                        label: 'Pack Size',
                        fieldname: 'pack_size',
                        fieldtype: 'Select',
                        options: [],
                        onchange: function () {
                            const selected_dimension = this.get_value();
                            const table = dialog.fields_dict.pack_sizes_table.grid;
                    
                            dialog.fields_dict.pack_sizes_table.df.data = [];
                            table.refresh();
                    
                            if (selected_dimension === "Custom") {
                                dialog.fields_dict.pack_sizes_table.df.data.push(
                                    { name1: "Part A", value: null, no_of_sets: null, accepted_qty: null, batch_no: null },
                                    { name1: "Part B", value: null, no_of_sets: null, accepted_qty: null, batch_no: null }
                                );
                                table.refresh();
                            } else {
                                if (dialog.pack_sizes && Array.isArray(dialog.pack_sizes)) {
                                    const filtered_data = dialog.pack_sizes.filter(pack => pack.pack_size === selected_dimension);
                        
                                    dialog.fields_dict.pack_sizes_table.df.data = filtered_data.map(pack => ({
                                        name1: pack.name1, 
                                        value: pack.value,
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
                        label: 'Total Packs (Nos)',
                        fieldname: 'total_packs',
                        fieldtype: 'Float',
                        onchange: function () {
                            const total_packs = this.get_value();
                            const table = dialog.fields_dict.pack_sizes_table.grid;

                            table.data.forEach(row => {
                                row.accepted_qty = row.no_of_sets * row.value * total_packs || 0;
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
                                label: 'Name',
                                fieldname: 'name1',
                                fieldtype: 'Data',
                                in_list_view: 1,
                                columns: 1,
                            },
                            {
                                label: 'Value',
                                fieldname: 'value',
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
                                columns: 2,
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
                                columns: 2,
                            },
                            {
                                label: 'Expiry Date',
                                fieldname: 'expiry_date',
                                fieldtype: 'Date',
                                in_list_view: 1,
                                columns: 2,
                            },
                        ],
                        data: [],
                    },
                ],
                primary_action_label: 'Submit',
                primary_action(values) {
                    const batch_rows = values.pack_sizes_table;
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
                                        existing_item_row.custom_name = first_row.name1;
                                        existing_item_row.batch_no = first_row.batch_id;
                                        existing_item_row.rate = item_rate;
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
                                                custom_name: row.name1,
                                                batch_no: row.batch_id,
                                                rate: item_rate,
                                                purchase_order_item: purchase_order_item.purchase_order_item
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
                                                custom_name: row.name1,
                                                batch_no: row.batch_id,
                                                rate: item_rate,
                                                purchase_order_item: purchase_order_item.purchase_order_item
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

