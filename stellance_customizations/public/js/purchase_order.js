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
                    if (item.custom_is_single_item) {
                        frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[child.name].docfields, { "fieldname": "custom_bundle_sizeuom" })[0].options = [item.custom_bundle_size];
                    } else if (item.item_group === "Product Bundle") {
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

function update_status_options(frm){
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
                    if (item.custom_is_single_item) {
                        frappe.utils.filter_dict(cur_frm.fields_dict["items"].grid.grid_rows_by_docname[row.name].docfields, { "fieldname": "custom_bundle_sizeuom" })[0].options = [item.custom_bundle_size];
                    } else if (item.custom_item_pack_size) {
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


function update_last_row_purchase_history(frm) {
    const last_row = (frm.doc.items || []).slice(-1)[0];
    if (last_row && last_row.item_code) {
        frappe.call({
            method: 'stellance_customizations.overrides.bom.get_purchase_history',
            args: {
                item_code: last_row.item_code
            },
            callback: function(r) {
                const data = r.message?.data || r.message || [];
                const uniqueManufacturers = [...new Set(data.map(d => d.manufacturer))];

                // Prepare row HTML separately
                const rowHtml = (d) => `
                    <tr data-manufacturer="${d.manufacturer}" data-date="${d.posting_date}">
                        <td>${d.manufacturer}</td>
                        <td>${d.factory_location || '-'}</td>
                        <td>${frappe.datetime.str_to_user(d.posting_date)}</td>
                        <td>${d.material_name}</td>
                        <td>${d.qty}</td>
                        <td>${d.rate}</td>
                    </tr>`;

                let html = `
                    <div class="form-group">
                        <label><strong>Item:</strong> ${last_row.item_name}</label>
                    </div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <div class="row">
                            <div class="col-sm-4">
                                <label>Filter by Manufacturer</label>
                                <select id="manufacturer-filter" class="form-control">
                                    <option value="">All</option>
                                    ${uniqueManufacturers.map(m => `<option value="${m}">${m}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-sm-4">
                                <label>From Date</label>
                                <input type="date" id="from-date-filter" class="form-control" />
                            </div>
                            <div class="col-sm-4">
                                <label>To Date</label>
                                <input type="date" id="to-date-filter" class="form-control" />
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <table id="purchase-history-table" class="table table-bordered table-striped">
                            <thead>
                                <tr>
                                    <th>Manufacturer</th>
                                    <th>Factory Location</th>
                                    <th>Date of Quote / Purchase</th>
                                    <th>Material Name</th>
                                    <th>Total Qty</th>
                                    <th>Rate per UOM</th>
                                </tr>
                            </thead>
                            <tbody id="purchase-history-body">
                                <!-- dynamic rows -->
                            </tbody>
                        </table>
                        <div class="pagination-controls" style="margin-top: 10px; text-align: right;">
                            <button class="btn btn-sm btn-default" id="prev-page">Previous</button>
                            <span id="page-info" style="margin: 0 10px;"></span>
                            <button class="btn btn-sm btn-default" id="next-page">Next</button>
                        </div>
                    </div>
                `;

                frm.set_df_property('custom_purchase_history_html', 'options', html);

                setTimeout(() => {
                    const manufacturerFilter = document.getElementById("manufacturer-filter");
                    const fromDateFilter = document.getElementById("from-date-filter");
                    const toDateFilter = document.getElementById("to-date-filter");
                    const tbody = document.getElementById("purchase-history-body");
                    const prevBtn = document.getElementById("prev-page");
                    const nextBtn = document.getElementById("next-page");
                    const pageInfo = document.getElementById("page-info");

                    let filtered = [...data];
                    let currentPage = 1;
                    const rowsPerPage = 5;

                    const renderTable = () => {
                        tbody.innerHTML = "";
                        const start = (currentPage - 1) * rowsPerPage;
                        const end = start + rowsPerPage;
                        const rows = filtered.slice(start, end);
                        if (rows.length > 0) {
                            rows.forEach(d => {
                                tbody.innerHTML += rowHtml(d);
                            });
                        } else {
                            tbody.innerHTML = `<tr><td colspan="6">No purchase history found.</td></tr>`;
                        }

                        const totalPages = Math.ceil(filtered.length / rowsPerPage);
                        pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
                        prevBtn.disabled = currentPage === 1;
                        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
                    };

                    const applyFilter = () => {
                        const selectedManufacturer = manufacturerFilter.value;
                        const fromDate = fromDateFilter.value;
                        const toDate = toDateFilter.value;

                        filtered = data.filter(d => {
                            let match = true;
                            if (selectedManufacturer && d.manufacturer !== selectedManufacturer) match = false;
                            if (fromDate && d.posting_date < fromDate) match = false;
                            if (toDate && d.posting_date > toDate) match = false;
                            return match;
                        });
                        currentPage = 1;
                        renderTable();
                    };

                    manufacturerFilter.addEventListener("change", applyFilter);
                    fromDateFilter.addEventListener("change", applyFilter);
                    toDateFilter.addEventListener("change", applyFilter);

                    prevBtn.addEventListener("click", () => {
                        if (currentPage > 1) {
                            currentPage--;
                            renderTable();
                        }
                    });

                    nextBtn.addEventListener("click", () => {
                        const totalPages = Math.ceil(filtered.length / rowsPerPage);
                        if (currentPage < totalPages) {
                            currentPage++;
                            renderTable();
                        }
                    });

                    renderTable();
                }, 100);
            }
        });
    } else {
        frm.set_df_property('custom_purchase_history_html', 'options', '<b>No item code in last row.</b>');
    }
}


frappe.ui.form.on('Purchase Order', {
    refresh: function(frm) {
        update_last_row_purchase_history(frm);
    }
});

frappe.ui.form.on('Purchase Order Item', {
    item_code: function(frm, cdt, cdn) {
        update_last_row_purchase_history(frm);
    }
});
