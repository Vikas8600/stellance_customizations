const OPPORTUNITY_COUNTRY_CODES = [
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

function opportunityFlagImg(iso) {
	return `<img src="https://flagcdn.com/w20/${iso}.png" style="width:20px;height:auto;vertical-align:middle;border-radius:2px;">`;
}

function injectOpportunityPhoneCode(frm, fieldname, storedField) {
	const phoneField = frm.fields_dict[fieldname];
	if (!phoneField || phoneField.$wrapper.find(".phone-code-trigger").length) return;

	const $controlInput = phoneField.$wrapper.find(".control-input");
	const $input = $controlInput.find("input");
	if (!$input.length) return;

	const dropdownItems = OPPORTUNITY_COUNTRY_CODES.map(
		(c) => `
		<div class="phone-code-item" data-code="${c.code}" data-iso="${c.iso}"
			style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;white-space:nowrap;">
			${opportunityFlagImg(c.iso)}
			<span style="font-size:12px;font-weight:500;min-width:36px;">${c.code}</span>
			<span style="font-size:12px;color:var(--text-muted);">${c.name}</span>
		</div>`
	).join("");

	const saved = frm.doc[storedField] || "";
	const active = OPPORTUNITY_COUNTRY_CODES.find((c) => c.code === saved);
	const triggerLabel = active
		? `${opportunityFlagImg(active.iso)}&nbsp;<span style="font-size:12px;">${active.code}</span>`
		: `<span style="font-size:12px;color:var(--text-muted);">Code ▾</span>`;

	const $trigger = $(`
		<div class="phone-code-trigger" style="
			display:flex;align-items:center;gap:4px;
			height:30px;padding:0 8px;
			border:1px solid var(--border-color);border-right:none;
			border-radius:var(--border-radius) 0 0 var(--border-radius);
			background:var(--control-bg);cursor:pointer;flex-shrink:0;
			position:relative;user-select:none;">
			<span class="phone-code-label" style="display:flex;align-items:center;gap:4px;">${triggerLabel}</span>
			<span style="font-size:10px;color:var(--text-muted);margin-left:2px;">▾</span>
			<div class="phone-code-dropdown" style="
				display:none;position:absolute;top:100%;left:0;z-index:1050;
				background:var(--popover-bg, #fff);
				border:1px solid var(--border-color);
				border-radius:var(--border-radius);
				box-shadow:var(--shadow-md);
				max-height:260px;overflow-y:auto;min-width:200px;">
				${dropdownItems}
			</div>
		</div>
	`);

	$input.css({ "border-top-left-radius": "0", "border-bottom-left-radius": "0" });
	$controlInput.css("display", "flex");
	$input.before($trigger);

	$trigger.on("click", function (e) {
		e.stopPropagation();
		$trigger.find(".phone-code-dropdown").toggle();
	});

	$trigger.find(".phone-code-item")
		.on("mouseenter", function () { $(this).css("background", "var(--bg-light-gray)"); })
		.on("mouseleave", function () { $(this).css("background", ""); })
		.on("click", function (e) {
			e.stopPropagation();
			const code = $(this).data("code");
			const entry = OPPORTUNITY_COUNTRY_CODES.find((c) => c.code === code);
			$trigger.find(".phone-code-label").html(
				`${opportunityFlagImg(entry.iso)}&nbsp;<span style="font-size:12px;">${entry.code}</span>`
			);
			$trigger.find(".phone-code-dropdown").hide();
			frm.set_value(storedField, code);
		});

	$(document).on("click.phone_code_" + fieldname + "_" + frm.docname, function () {
		$trigger.find(".phone-code-dropdown").hide();
	});
}

function fetchGroupAndSubCategory(frm) {
	const source = frm.doc.opportunity_from;
	const party = frm.doc.party_name;
	if (!party) return;

	if (source === "Lead") {
		frappe.db.get_value(
			"Lead",
			party,
			["custom_customer_group", "custom_sub_category"],
			function (data) {
				if (!data) return;
				if (data.custom_customer_group) frm.set_value("customer_group", data.custom_customer_group);
				if (data.custom_sub_category) frm.set_value("custom_sub_category", data.custom_sub_category);
			}
		);
	} else if (source === "Prospect") {
		frappe.db.get_value(
			"Prospect",
			party,
			["customer_group", "custom_sub_category"],
			function (data) {
				if (!data) return;
				if (data.customer_group) frm.set_value("customer_group", data.customer_group);
				if (data.custom_sub_category) frm.set_value("custom_sub_category", data.custom_sub_category);
			}
		);
	}
}

frappe.ui.form.on('Opportunity', {
    	refresh: function (frm) {
		injectOpportunityPhoneCode(frm, "contact_mobile", "custom_whatsapp_country_code");

		frm.set_query("custom_customer_category", function () {
			return { filters: { is_group: 1 } };
		});
		if (frm.fields_dict["custom_customer_subcategory"]) {
			frm.set_query("custom_customer_subcategory", function () {
				return {
					filters: {
						is_group: 0,
						parent_customer_group: frm.doc.custom_customer_category || "",
					},
				};
			});
		}
	},
	custom_customer_category: function (frm) {
		frm.set_value("custom_customer_subcategory", "");
	},

    party_name: function (frm) {
        fetchGroupAndSubCategory(frm);
    },

    custom_bom: function(frm) {
        if (frm.doc.custom_bom) {
            frappe.call({
                method:"stellance_customizations.overrides.opportunity.get_bom_items",
                args: {
                    bom_name: frm.doc.custom_bom
                },
                callback: function(r) {
                    if (r.message) {
                        frm.clear_table("items");  
                        r.message.forEach(function(item) {
                            let row = frm.add_child("items");  // Order maintained
                            row.item_code = item.item_code;
                            row.item_name = item.item_name;
                            row.qty = item.qty;
                            row.uom = item.uom;
                            row.rate = item.rate;
                            row.amount = item.amount;
                            row.base_rate = item.base_rate
                            row.base_amount = item.base_amount
                            row.custom_last_purchase_rate = item.last_purchase_rate
                            row.custom_margin = item.margin
                        });
                        frm.refresh_field("items");
                    }
                }
            });
        } else {
            frm.clear_table("items");
            frm.refresh_field("items");
        }
    }
});


frappe.ui.form.on('Opportunity Item', {
    custom_margin: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let lpr = flt(row.custom_last_purchase_rate);
        let percent = flt(row.custom_margin);
        let final_rate = lpr + (lpr * percent / 100);
        frappe.model.set_value(cdt, cdn, 'rate', final_rate);
    }
});
