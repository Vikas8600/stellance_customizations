frappe.ui.form.on('Sales Order', {
	refresh: function(frm){
        update_status_options(frm)
            frappe.model.user_settings.save(frm.doctype, "GridView", null).then((r) => {
                frappe.model.user_settings[frm.doctype] = r.message || r;
                frm.fields_dict.items.grid.reset_grid();
              });
    }
});

frappe.ui.form.on('Sales Order Item', {
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
                    if (item.custom_item_pack_size) {
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

function update_last_row_history(frm) {
    const last_row = (frm.doc.items || []).slice(-1)[0];
    if (!last_row || !last_row.item_code) {
        frm.set_df_property('custom_history', 'options', '<b>No item code in last row.</b>');
        return;
    }

    frappe.call({
        method: 'stellance_customizations.overrides.sales_order.get_item_history',
        args: { item_code: last_row.item_code },
        callback: function (r) {
            const purchase = r.message.purchase || [];
            const sales = r.message.sales || [];

            const uniqueClients = [...new Set(sales.map(d => d.customer_name))];
            const uniqueSalesMaterials = [...new Set(sales.map(d => d.material_name))];
            const uniqueManufacturers = [...new Set(purchase.map(d => d.manufacturer))];
            const uniquePurchaseMaterials = [...new Set(purchase.map(d => d.material_name))];

            let html = `
                <div style='margin-bottom: 15px; font-weight: bold; font-size: 14px;'>Item: ${last_row.item_name}</div>`;

            const generateFilterHTML = (prefix, options1, options2, label1, label2) => `
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label><b>${label1}</b></label><br/>
                        <select id="${prefix}-filter1" style="padding: 4px;">
                            <option value="">All</option>
                            ${options1.map(o => `<option value="${o}">${o}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label><b>${label2}</b></label><br/>
                        <select id="${prefix}-filter2" style="padding: 4px;">
                            <option value="">All</option>
                            ${options2.map(o => `<option value="${o}">${o}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label><b>From Date:</b></label><br/>
                        <input type="date" id="${prefix}-from" style="padding: 4px;" />
                    </div>
                    <div>
                        <label><b>To Date:</b></label><br/>
                        <input type="date" id="${prefix}-to" style="padding: 4px;" />
                    </div>
                    <div>
                        <label><b>Rows per page:</b></label><br/>
                        <select id="${prefix}-per-page" style="padding: 4px; width: 80px;">
                            <option value="2" selected>2</option>
                            <option value="5">5</option>
                            <option value="10">10</option>
                        </select>
                    </div>
                </div>`;

            // Purchase History
            html += `<div style='margin-bottom: 10px; font-weight: 600;'>Purchase History</div>`;
            html += generateFilterHTML("purchase", uniqueManufacturers, uniquePurchaseMaterials, "Manufacturer", "Material");

            html += `<table id="purchase-table" class="table table-bordered table-striped">
                <thead><tr>
                    <th>Manufacturer</th><th>Factory Location</th><th>Date</th>
                    <th>Material</th><th>Qty</th><th>Rate</th><th>PO</th>
                </tr></thead><tbody></tbody></table>
                <div class="pagination-controls" style="text-align:right;margin-bottom:20px;">
                    <button class="btn btn-sm btn-default" id="purchase-prev">Previous</button>
                    <span id="purchase-page-info" style="margin:0 10px;"></span>
                    <button class="btn btn-sm btn-default" id="purchase-next">Next</button>
                </div>`;

            // Sales History
            html += `<div style='margin-bottom: 10px; font-weight: 600;'>Sales History</div>`;
            html += generateFilterHTML("sales", uniqueClients, uniqueSalesMaterials, "Client", "Material");

            html += `<table id="sales-table" class="table table-bordered table-striped">
                <thead><tr>
                    <th>Client</th><th>Consignee</th><th>Date</th><th>Days</th>
                    <th>Material</th><th>Qty</th><th>Rate</th><th>SO</th>
                </tr></thead><tbody></tbody></table>
                <div class="pagination-controls" style="text-align:right;">
                    <button class="btn btn-sm btn-default" id="sales-prev">Previous</button>
                    <span id="sales-page-info" style="margin:0 10px;"></span>
                    <button class="btn btn-sm btn-default" id="sales-next">Next</button>
                </div>`;

            html += `<script>
                setTimeout(() => {
                    const configs = {
                        purchase: {
                            raw: ${JSON.stringify(purchase)},
                            tbody: document.querySelector("#purchase-table tbody"),
                            filter1: document.getElementById("purchase-filter1"),
                            filter2: document.getElementById("purchase-filter2"),
                            from: document.getElementById("purchase-from"),
                            to: document.getElementById("purchase-to"),
                            perPageSelect: document.getElementById("purchase-per-page"),
                            prev: document.getElementById("purchase-prev"),
                            next: document.getElementById("purchase-next"),
                            pageInfo: document.getElementById("purchase-page-info"),
                            attr1: "manufacturer",
                            attr2: "material_name",
                            date: "posting_date",
                            row: d => \`<tr><td><a href="/app/supplier/\${encodeURIComponent(d.manufacturer)}" target="_blank">\${d.manufacturer}</a></td>
                                        <td>\${d.factory_location || '-'}</td><td>\${frappe.datetime.str_to_user(d.posting_date)}</td>
                                        <td>\${d.material_name}</td><td>\${d.qty}</td><td>\${d.rate}</td>
                                        <td><a href="/app/purchase-order/\${d.po}" target="_blank">\${d.po}</a></td></tr>\`
                        },
                        sales: {
                            raw: ${JSON.stringify(sales)},
                            tbody: document.querySelector("#sales-table tbody"),
                            filter1: document.getElementById("sales-filter1"),
                            filter2: document.getElementById("sales-filter2"),
                            from: document.getElementById("sales-from"),
                            to: document.getElementById("sales-to"),
                            perPageSelect: document.getElementById("sales-per-page"),
                            prev: document.getElementById("sales-prev"),
                            next: document.getElementById("sales-next"),
                            pageInfo: document.getElementById("sales-page-info"),
                            attr1: "customer_name",
                            attr2: "material_name",
                            date: "transaction_date",
                            row: d => \`<tr><td><a href="/app/customer/\${encodeURIComponent(d.customer)}" target="_blank">\${d.customer_name}</a></td>
                                        <td>\${d.consignee_address || '-'}</td><td>\${frappe.datetime.str_to_user(d.transaction_date)}</td>
                                        <td>\${d.days_passed} days</td><td>\${d.material_name}</td><td>\${d.qty}</td><td>\${d.rate}</td>
                                        <td><a href="/app/sales-order/\${d.so}" target="_blank">\${d.so}</a></td></tr>\`
                        }
                    };

                    Object.values(configs).forEach(cfg => {
                        cfg.page = 1;
                        cfg.perPage = parseInt(cfg.perPageSelect.value || "2");

                        const filterData = () => cfg.raw.filter(d => {
                            const v1 = d[cfg.attr1], v2 = d[cfg.attr2], date = d[cfg.date];
                            return (!cfg.filter1.value || v1 === cfg.filter1.value)
                                && (!cfg.filter2.value || v2 === cfg.filter2.value)
                                && (!cfg.from.value || date >= cfg.from.value)
                                && (!cfg.to.value || date <= cfg.to.value);
                        });

                        const render = () => {
                            cfg.perPage = parseInt(cfg.perPageSelect.value || "2");
                            const data = filterData();
                            const totalPages = Math.ceil(data.length / cfg.perPage);
                            cfg.page = Math.min(cfg.page, totalPages) || 1;
                            const start = (cfg.page - 1) * cfg.perPage;
                            cfg.tbody.innerHTML = data.slice(start, start + cfg.perPage).map(cfg.row).join('') || "<tr><td colspan='8'>No data</td></tr>";
                            cfg.pageInfo.innerText = \`Page \${cfg.page} of \${totalPages || 1}\`;
                            cfg.prev.disabled = cfg.page === 1;
                            cfg.next.disabled = cfg.page >= totalPages;
                        };

                        cfg.perPageSelect.addEventListener("change", () => {
                            cfg.page = 1;
                            render();
                        });

                        [cfg.filter1, cfg.filter2, cfg.from, cfg.to].forEach(el => {
                            el.addEventListener("change", () => { cfg.page = 1; render(); });
                        });

                        cfg.prev.addEventListener("click", () => { if (cfg.page > 1) { cfg.page--; render(); } });
                        cfg.next.addEventListener("click", () => {
                            const totalPages = Math.ceil(filterData().length / cfg.perPage);
                            if (cfg.page < totalPages) { cfg.page++; render(); }
                        });

                        render();
                    });
                }, 100);
            </script>`;

            frm.set_df_property('custom_history', 'options', html);
        }
    });
}


frappe.ui.form.on('Sales Order', {
    refresh: function(frm) {
        update_last_row_history(frm);
    }
});

frappe.ui.form.on('Sales Order Item', {
    item_code: function(frm, cdt, cdn) {
        update_last_row_history(frm);
    }
});
