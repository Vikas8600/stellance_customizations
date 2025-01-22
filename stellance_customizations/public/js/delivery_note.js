frappe.ui.form.on('Delivery Note', {
    refresh(frm) {
        // your code here
    }
})

frappe.ui.form.on('Delivery Note Item', {
    item_code: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Fetch the custom_pack_size checkbox value from the Item doctype
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Item',
                name: row.item_code
            },
            callback: function (r) {
                if (r.message) {
                    let custom_pack_size = r.message.custom_pack_size;

                    // Find the "Add Packs" button in the grid and enable/disable based on checkbox value
                    let addPacksButton = frm.fields_dict['items'].grid_buttons.find(btn => btn.getLabel() === 'Select Packs');
                    if (addPacksButton) {
                        if (custom_pack_size) {
                            // Enable button if checkbox is checked
                            addPacksButton.$btn.removeAttr('disabled');
                        } else {
                            addPacksButton.$btn.attr('disabled', 'disabled');
                        }
                    }
                }
            }
        });
    },



    custom_add_packs: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Fetch the custom_pack_size checkbox value from the Item doctype
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Item',
                name: row.item_code
            },
            callback: function (r) {
                if (r.message) {
                    let custom_pack_size = r.message.custom_pack_size;

                    // Show dialog only if custom_pack_size checkbox is checked
                    if (custom_pack_size) {
                        let item_data = r.message;
                        let pack_sizes = item_data.custom_item_pack_size || [];


                        // Create the dialog
                        let dialog = new frappe.ui.Dialog({
                            title: 'Select Packs',
                            size: 'large',
                            fields: [
                                {
                                    label: 'Item Code',
                                    fieldname: 'item_code',
                                    fieldtype: 'Data',
                                    default: row.item_code,
                                    read_only: 1
                                },
                                {
                                    fieldtype: 'Column Break'
                                },
                                {
                                    label: 'Warehouse',
                                    fieldname: 'warehouse',
                                    fieldtype: 'Link',
                                    options: 'Warehouse',
                                    default: row.warehouse
                                },

                                {
                                    fieldtype: 'Section Break'
                                },

                                {
                                    label: 'SO Qty(Kg)',
                                    fieldname: 'qty',
                                    fieldtype: 'Float',
                                    default: row.qty,
                                    read_only: 1
                                },



                                {
                                    fieldtype: 'Column Break'
                                },

                                {
                                    label: 'Pack Size',
                                    fieldname: 'pack_size',
                                    fieldtype: 'Select',
                                    options: [...new Set(pack_sizes.map(pack => pack.pack_size).filter(Boolean))],
                                    onchange: function () {
                                        const selected_dimension = this.get_value();
                                        const filtered_data = pack_sizes.filter(pack => pack.pack_size === selected_dimension);

                                        // Update the table data with the filtered rows
                                        dialog.fields_dict.pack_sizes_table.df.data = filtered_data.map(pack => ({
                                            name1: pack.name1,
                                            value: pack.value,
                                            no_of_sets: pack.no_of_sets,
                                            accepted_qty: 0,
                                            batch_no: null
                                        }));
                                        dialog.fields_dict.pack_sizes_table.grid.refresh();
                                    }
                                },

                                {
                                    fieldtype: 'Column Break'
                                },

                                {
                                    label: 'Total Packs(Nos)',
                                    fieldname: 'total_packs',
                                    fieldtype: 'Float',
                                    reqd: 1,
                                    onchange: function () {
                                        const total_packs = this.get_value() || 0;
                                        const table = dialog.fields_dict.pack_sizes_table.grid;

                                        // Update accepted_qty for each row dynamically
                                        table.data.forEach(row => {
                                            row.accepted_qty = row.no_of_sets * row.value * total_packs;
                                        });

                                        frappe.call({
                                            method: 'erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.get_auto_data',
                                            args: {
                                                item_code: row.item_code,
                                                warehouse: dialog.fields_dict.warehouse.value,
                                                has_serial_no: 0,
                                                has_batch_no: 1,
                                                qty: dialog.fields_dict.qty.value,
                                                based_on: "FIFO",
                                            },
                                            callback: function (r) {
                                                if (r.message) {
                                                    const stock_data = r.message;
                                                    table.data.forEach(row => {
                                                        const match = stock_data.find(item => item.packs === row.name1);
                                                        if (match) {
                                                            row.batch_no = match.batch_no;
                                                        }
                                                    });
                                                    table.refresh();
                                                }
                                            }
                                        })


                                        table.refresh();
                                    }
                                },


                                {
                                    fieldtype: 'Section Break'
                                },



                                {
                                    label: 'Pack Sizes',
                                    fieldtype: 'Table',
                                    fieldname: 'pack_sizes_table',
                                    cannot_add_rows: true, // Disallow adding rows manually
                                    in_place_edit: true,  // Allow editing values in place
                                    fields: [
                                        {
                                            label: 'Name',
                                            fieldname: 'name1',
                                            fieldtype: 'Data',
                                            in_list_view: 1
                                        },
                                        {
                                            label: 'Value',
                                            fieldname: 'value',
                                            fieldtype: 'Float',
                                            in_list_view: 1
                                        },
                                        {
                                            label: 'No of Sets',
                                            fieldname: 'no_of_sets',
                                            fieldtype: 'Int',
                                            in_list_view: 1
                                        },
                                        {
                                            label: 'Accepted Quantity',
                                            fieldname: 'accepted_qty',
                                            fieldtype: 'Float',
                                            in_list_view: 1,
                                            read_only: 1
                                        },



                                        {
                                            label: 'Batch No',
                                            fieldname: 'batch_no',
                                            fieldtype: 'Link',
                                            options: 'Batch',
                                            in_list_view: 1
                                        }
                                    ],
                                    data: pack_sizes.map(pack => ({
                                        name1: pack.name1,
                                        value: pack.value,
                                        no_of_sets: pack.no_of_sets,
                                        accepted_qty: 0,
                                        batch_no: null  // Initially null, user will select
                                    }))
                                }
                            ],
                            primary_action_label: 'Submit',
                            primary_action(values) {


                                let selected_row = locals[cdt][cdn];

                                // Update the selected row with the first filtered row's data
                                if (values.pack_sizes_table && values.pack_sizes_table.length > 0) {
                                    const first_row = values.pack_sizes_table[0];
                                    selected_row.item_code = values.item_code;
                                    selected_row.warehouse = values.warehouse;
                                    selected_row.qty = first_row.value * values.total_packs * first_row.no_of_sets;
                                    selected_row.custom_name = first_row.name1;
                                    selected_row.pack = first_row.name1;
                                    selected_row.value = first_row.value;
                                    selected_row.no_of_sets = first_row.no_of_sets;
                                    selected_row.batch_no = first_row.batch_no;
                                    selected_row.against_sales_order = selected_row.against_sales_order;
                                    selected_row.so_detail = selected_row.so_detail;
                                    selected_row.item_name = r.message.item_name;
                                    selected_row.uom = selected_row.uom;
                                    selected_row.stock_uom = selected_row.stock_uom;
                                    selected_row.rate = selected_row.rate;
                                    selected_row.amount = selected_row.amount;
                                    selected_row.use_serial_batch_fields = selected_row.use_serial_batch_fields || false;
                                    frm.refresh_field('items');
                                }

                                // Now add all the filtered rows (from pack_sizes_table) to the child table, starting from the second row
                                if (values.pack_sizes_table && values.pack_sizes_table.length > 1) {
                                    values.pack_sizes_table.slice(1).forEach(pack => {
                                        // Add each subsequent row to the child table
                                        let new_row = frm.add_child('items', {
                                            item_code: values.item_code,
                                            warehouse: values.warehouse,
                                            qty: pack.value * values.total_packs * pack.no_of_sets,
                                            custom_name: pack.name1,
                                            pack: pack.name1,
                                            value: pack.value,
                                            no_of_sets: pack.no_of_sets,
                                            batch_no: pack.batch_no,
                                            against_sales_order: selected_row.against_sales_order,
                                            so_detail: selected_row.so_detail,
                                            item_name: r.message.item_name,
                                            uom: selected_row.uom,
                                            stock_uom: selected_row.stock_uom,
                                            rate: selected_row.rate,
                                            amount: selected_row.amount,
                                            use_serial_batch_fields: selected_row.use_serial_batch_fields || false
                                        });
                                        frm.refresh_field('items');
                                    });
                                }
                                const updated_total_quantity = frm.doc.items.reduce((sum, pack) => {
                                    return sum + (pack.qty || 0);
                                }, 0);
                                const total_qty = frm.doc.total_qty;

                                // Check if updated total quantity is less than total qty
                                if (updated_total_quantity < total_qty) {
                                    // Add a new blank row to 'items' child table
                                    frm.add_child('items', {
                                        item_code: values.item_code,
                                        warehouse: values.warehouse,
                                        qty: 0,  
                                        qty: total_qty-updated_total_quantity,
                                        uom: selected_row.uom,
                                        stock_uom: selected_row.stock_uom,
                                        rate: selected_row.rate,
                                        against_sales_order: selected_row.against_sales_order,
                                        so_detail: selected_row.so_detail,
                                    });
                                    frm.refresh_field('items');
                                }

                                // Hide the dialog after submission
                                dialog.hide();
                            }
                        });

                        // Add scrolling to table
                        dialog.$wrapper.find('.frappe-control[data-fieldname="pack_sizes_table"] .table').css({
                            'overflow-x': 'auto',
                            'max-width': '100%'
                        });
                        dialog.fields_dict.pack_size.df.onchange.call(dialog.fields_dict.pack_size);


                        dialog.show();
                    } else {
                        frappe.msgprint(__('Pack Sizes are not available'));
                    }
                }
            }
        });
    }
});
