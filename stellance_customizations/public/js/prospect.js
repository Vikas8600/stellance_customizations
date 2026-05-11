const PROSPECT_COUNTRY_CODES = [
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

function prospectFlagImg(iso) {
	return `<img src="https://flagcdn.com/w20/${iso}.png" style="width:20px;height:auto;vertical-align:middle;border-radius:2px;">`;
}

function injectProspectPhoneCode(frm, fieldname, storedField) {
	const phoneField = frm.fields_dict[fieldname];
	if (!phoneField || phoneField.$wrapper.find(".phone-code-trigger").length) return;

	const $controlInput = phoneField.$wrapper.find(".control-input");
	const $input = $controlInput.find("input");
	if (!$input.length) return;

	const dropdownItems = PROSPECT_COUNTRY_CODES.map(
		(c) => `
		<div class="phone-code-item" data-code="${c.code}" data-iso="${c.iso}"
			style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;white-space:nowrap;">
			${prospectFlagImg(c.iso)}
			<span style="font-size:12px;font-weight:500;min-width:36px;">${c.code}</span>
			<span style="font-size:12px;color:var(--text-muted);">${c.name}</span>
		</div>`
	).join("");

	const saved = frm.doc[storedField] || "";
	const active = PROSPECT_COUNTRY_CODES.find((c) => c.code === saved);
	const triggerLabel = active
		? `${prospectFlagImg(active.iso)}&nbsp;<span style="font-size:12px;">${active.code}</span>`
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
			const entry = PROSPECT_COUNTRY_CODES.find((c) => c.code === code);
			$trigger.find(".phone-code-label").html(
				`${prospectFlagImg(entry.iso)}&nbsp;<span style="font-size:12px;">${entry.code}</span>`
			);
			$trigger.find(".phone-code-dropdown").hide();
			frm.set_value(storedField, code);
		});

	$(document).on("click.phone_code_" + fieldname + "_" + frm.docname, function () {
		$trigger.find(".phone-code-dropdown").hide();
	});
}

frappe.ui.form.on("Prospect", {
	refresh: function (frm) {
		injectProspectPhoneCode(frm, "custom_client_whatsapp_no", "custom_whatsapp_country_code");

		frm.set_query("customer_group", function () {
			return { filters: { is_group: 1 } };
		});

		frm.set_query("custom_customer_subcategory", function () {
			return {
				filters: {
					is_group: 0,
					parent_customer_group: frm.doc.customer_group || "",
				},
			};
		});
	},

	customer_group: function (frm) {
		frm.set_value("custom_customer_subcategory", "");
	},
});

const LEAD_TO_PROSPECT = {
	source:                  "custom_lead_source",
	type:                    "custom_lead_type",
	request_type:            "custom_request_type",
	job_title:               "custom_designation",
	first_name:              "custom_client_name",
	company_name:            "custom_organization_name",
	custom_client_whatsapp_no: "custom_client_whatsapp_no",
	custom_customer_group:   "customer_group",
};

frappe.ui.form.on("Prospect Lead", {
	lead: function (frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.lead) return;

		frappe.db.get_value(
			"Lead",
			row.lead,
			Object.keys(LEAD_TO_PROSPECT),
			function (data) {
				if (!data) return;
				Object.entries(LEAD_TO_PROSPECT).forEach(([lead_field, prospect_field]) => {
					if (data[lead_field]) frm.set_value(prospect_field, data[lead_field]);
				});
			}
		);
	},
});
