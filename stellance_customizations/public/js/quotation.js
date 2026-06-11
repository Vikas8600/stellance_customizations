const QUOTATION_COUNTRY_CODES = [
	{ code: "+91",  iso: "in", name: "India" },
	{ code: "+1",   iso: "us", name: "USA / Canada" },
	{ code: "+44",  iso: "gb", name: "UK" },
	{ code: "+61",  iso: "au", name: "Australia" },
	{ code: "+971", iso: "ae", name: "UAE" },
	{ code: "+966", iso: "sa", name: "Saudi Arabia" },
	{ code: "+65",  iso: "sg", name: "Singapore" },
	{ code: "+60",  iso: "my", name: "Malaysia" },
	{ code: "+62",  iso: "id", name: "Indonesia" },
	{ code: "+92",  iso: "pk", name: "Pakistan" },
	{ code: "+880", iso: "bd", name: "Bangladesh" },
	{ code: "+94",  iso: "lk", name: "Sri Lanka" },
	{ code: "+977", iso: "np", name: "Nepal" },
	{ code: "+49",  iso: "de", name: "Germany" },
	{ code: "+33",  iso: "fr", name: "France" },
	{ code: "+81",  iso: "jp", name: "Japan" },
	{ code: "+86",  iso: "cn", name: "China" },
	{ code: "+7",   iso: "ru", name: "Russia" },
	{ code: "+55",  iso: "br", name: "Brazil" },
	{ code: "+27",  iso: "za", name: "South Africa" },
];

function quotationFlagImg(iso) {
	return `<img src="https://flagcdn.com/w20/${iso}.png" style="width:20px;height:auto;vertical-align:middle;border-radius:2px;">`;
}

// contact_mobile is read-only on Quotation; show the country-code flag carried
// over from the Opportunity (custom_whatsapp_country_code) in front of the number.
function showQuotationPhoneFlag(frm) {
	const field = frm.fields_dict.contact_mobile;
	if (!field) return false;

	const entry = QUOTATION_COUNTRY_CODES.find((c) => c.code === frm.doc.custom_whatsapp_country_code);
	if (!entry) return false;

	// read-only fields render their value in the .control-value display area;
	// only draw once the field actually has its number rendered.
	const $value = field.$wrapper.find(".control-value");
	if (!$value.length || !$value.text().trim()) return false;

	$value.find(".phone-code-prefix").remove();
	$value.prepend(
		`<span class="phone-code-prefix" style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">
			${quotationFlagImg(entry.iso)}<span style="font-size:12px;">${entry.code}</span>
		</span>`
	);
	return true;
}

// The number is read-only inside the lazy "Address & Contact" tab and its display
// area can be re-rendered after load, so retry a few times until the flag sticks.
function scheduleQuotationPhoneFlag(frm) {
	[0, 200, 600, 1200, 2000].forEach((delay) => setTimeout(() => showQuotationPhoneFlag(frm), delay));
}

frappe.ui.form.on("Quotation", {
    refresh: function (frm) {
        scheduleQuotationPhoneFlag(frm);

        // re-draw the flag whenever the Address & Contact tab is opened
        frm.$wrapper.off("click.phoneflag").on("click.phoneflag", ".form-tabs .nav-link, a.nav-link", function () {
            scheduleQuotationPhoneFlag(frm);
        });

        frm.add_custom_button(
            __("Project"),
            function () {
                frappe.new_doc("Project");
            },
            __("Create")
        );
    },
    contact_person: function (frm) {
        scheduleQuotationPhoneFlag(frm);
    },
});

frappe.ui.form.on('Quotation', {
    custom_area: function(frm) {
        frm.doc.items.forEach(row => {
            if (!row.item_code || !row.prevdoc_docname) {
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

                        frappe.call({
                            method: 'frappe.client.get',
                            args: {
                                doctype: 'BOM',
                                name: bom_name
                            },
                            callback: function(bom_res) {
                                if (bom_res.message && bom_res.message.custom_dft) {
                                    let dft = bom_res.message.custom_dft;

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

                                                let matched_row = (item.custom_consumption_table || []).find(entry => entry.dft == dft);
                                                let consumption = matched_row ? matched_row.consumption : 0;

                                                let qty = consumption * frm.doc.custom_area;
                                                let no_of_packs = bundle_size ? qty / bundle_size : 0;

                                                frappe.model.set_value(row.doctype, row.name, 'qty', qty);
                                                frappe.model.set_value(row.doctype, row.name, 'custom_no_of_packs', no_of_packs);
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        });
    }
});

frappe.ui.form.on("Quotation Item", {
    item_code: function (frm, cdt, cdn) {
        frappe.after_ajax(() => calculate_suggested_price(frm, cdt, cdn));
    },
    qty: function (frm, cdt, cdn) {
        frappe.after_ajax(() => calculate_suggested_price(frm, cdt, cdn));
    },
});
frappe.ui.form.on("Quotation", {
    before_save: function (frm) {
        frappe.after_ajax(() => {
            (frm.doc.items || []).forEach(row => {
                calculate_suggested_price(frm, row.doctype, row.name);
            });
        });
    }
});
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

            html += `<div style='margin-bottom: 10px; font-weight: 600; display: flex; align-items: center; gap: 10px;'>
                <span>Purchase History</span>
                <a href="/app/query-report/Purchase History" target="_blank" class="btn btn-xs btn-default"> Purchase History Report</a>
            </div>`;
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

            html += `<div style='margin-bottom: 10px; font-weight: 600; display: flex; align-items: center; gap: 10px;'>
                <span>Sales History</span>
                <a href="/app/query-report/Sales History" target="_blank" class="btn btn-xs btn-default"> Sales History Report</a>
            </div>`;
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
                            defaultFilter1: ${JSON.stringify(frm.doc.customer_name || frm.doc.party_name || "")},
                            row: d => \`<tr><td><a href="/app/customer/\${encodeURIComponent(d.customer)}" target="_blank">\${d.customer_name}</a></td>
                                        <td>\${d.consignee_address || '-'}</td><td>\${frappe.datetime.str_to_user(d.transaction_date)}</td>
                                        <td>\${d.days_passed} days</td><td>\${d.material_name}</td><td>\${d.qty}</td><td>\${d.rate}</td>
                                        <td><a href="/app/sales-order/\${d.so}" target="_blank">\${d.so}</a></td></tr>\`
                        }
                    };

                    Object.values(configs).forEach(cfg => {
                        cfg.page = 1;
                        cfg.perPage = parseInt(cfg.perPageSelect.value || "2");

                        if (cfg.defaultFilter1) {
                            const hasOption = Array.from(cfg.filter1.options).some(o => o.value === cfg.defaultFilter1);
                            if (hasOption) cfg.filter1.value = cfg.defaultFilter1;
                        }

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


frappe.ui.form.on('Quotation', {
    refresh: function(frm) {
        update_last_row_history(frm);
    },
    custom_term: function(frm) {
        if (!frm.doc.custom_term) {
            frm.set_value('custom_terms_details', '');
            return;
        }

        frappe.db.get_value('Terms and Conditions', frm.doc.custom_term, 'terms')
            .then(r => {
                if (r.message) {
                    frm.set_value('custom_terms_details', r.message.terms || '');
                }
            });
    }
});

frappe.ui.form.on('Quotation Item', {
    item_code: function(frm, cdt, cdn) {
        update_last_row_history(frm);
    }
});

function calculate_suggested_price(frm, cdt, cdn) {
    const item = locals[cdt][cdn];
    const supply_type = frm.doc.custom_supply_type;
    const customer = frm.doc.party_name;


    if (!supply_type || !item.item_code || !item.qty || !customer) {
        return;
    }

    frappe.call({
        method: "stellance_customizations.overrides.price.get_suggested_sale_price",
        args: {
            item_code: item.item_code,
            qty: item.qty,
            supply_type: supply_type,
            customer: customer,
            amount: item.amount
        },
        callback: function (r) {
            if (r.message) {
                if (typeof r.message === "object") {
                    frappe.model.set_value(cdt, cdn, "custom_suggested_sales_price", r.message.rate);
                } else {
                    frappe.model.set_value(cdt, cdn, "custom_suggested_sales_price", r.message);
                }
            if (r.message.html) {
                let d = new frappe.ui.Dialog({
                    title: "Suggested Price Details",
                    primary_action_label: "Close",
                    primary_action() {
                        d.hide();
                    }
                });
                d.body.innerHTML = r.message.html;
d.show();
            }
           // Generate table HTML
        let html = `<table class="table table-bordered" style="margin-top: 10px;">
            <thead>
                <tr>
                    <th style="width:70%">Item Name</th>
                    <th style="width:30%">Suggested Price (₹)</th>
                </tr>
            </thead>
            <tbody>`;

        frm.doc.items.forEach(row => {
            html += `<tr>
                        <td>${row.item_name || row.item_code || "-"}</td>
                        <td>₹${row.custom_suggested_sales_price || "0.00"}</td>
                     </tr>`;
        });

        html += `</tbody></table>`;

        frm.set_df_property("custom_suggested_price", "options", html);
        frm.refresh_field("custom_suggested_price");
    } 
        }
    });
}
