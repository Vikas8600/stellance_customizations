const LEAD_COUNTRY_CODES = [
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

function leadFlagImg(iso) {
	return `<img src="https://flagcdn.com/w20/${iso}.png" style="width:20px;height:auto;vertical-align:middle;border-radius:2px;">`;
}

function injectLeadPhoneCode(frm, fieldname, storedField) {
	const phoneField = frm.fields_dict[fieldname];
	if (!phoneField || phoneField.$wrapper.find(".phone-code-trigger").length) return;

	const $controlInput = phoneField.$wrapper.find(".control-input");
	const $input = $controlInput.find("input");
	if (!$input.length) return;

	const dropdownItems = LEAD_COUNTRY_CODES.map(
		(c) => `
		<div class="phone-code-item" data-code="${c.code}" data-iso="${c.iso}"
			style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;white-space:nowrap;">
			${leadFlagImg(c.iso)}
			<span style="font-size:12px;font-weight:500;min-width:36px;">${c.code}</span>
			<span style="font-size:12px;color:var(--text-muted);">${c.name}</span>
		</div>`
	).join("");

	const saved = frm.doc[storedField] || "";
	const active = LEAD_COUNTRY_CODES.find((c) => c.code === saved);
	const triggerLabel = active
		? `${leadFlagImg(active.iso)}&nbsp;<span style="font-size:12px;">${active.code}</span>`
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
			const entry = LEAD_COUNTRY_CODES.find((c) => c.code === code);
			$trigger.find(".phone-code-label").html(
				`${leadFlagImg(entry.iso)}&nbsp;<span style="font-size:12px;">${entry.code}</span>`
			);
			$trigger.find(".phone-code-dropdown").hide();
			frm.set_value(storedField, code);
		});

	$(document).on("click.phone_code_" + fieldname + "_" + frm.docname, function () {
		$trigger.find(".phone-code-dropdown").hide();
	});
}

frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		if (frm.is_new() && !frm.doc.lead_owner) {
			frm.set_value("lead_owner", frappe.session.user);
		}
		injectLeadPhoneCode(frm, "custom_client_whatsapp_no", "custom_mobile_country_code");

		// Picker: type first_name → choose from multiple organizations
		frm._showOrgPicker = function (leads) {
			const d = new frappe.ui.Dialog({ title: __("Select Organization") });
			const rows = leads
				.map(
					(l) => `
				<div class="pick-row"
					data-primary="${frappe.utils.escape_html(l.company_name)}"
					data-secondary="${frappe.utils.escape_html(l.first_name || "")}"
					style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-color);
						   display:flex;justify-content:space-between;align-items:center;">
					<span style="font-weight:500;">${frappe.utils.escape_html(l.company_name)}</span>
					<span style="font-size:11px;color:var(--text-muted);">${frappe.utils.escape_html(l.first_name || "")}</span>
				</div>`
				)
				.join("");
			d.$body.html(`<div style="max-height:350px;overflow-y:auto;margin:-15px;">${rows}</div>`);
			d.$body
				.find(".pick-row")
				.on("mouseenter", function () { $(this).css("background", "var(--bg-light-gray)"); })
				.on("mouseleave", function () { $(this).css("background", ""); })
				.on("click", function () {
					frm.set_value("company_name", $(this).data("primary"));
					d.hide();
				});
			d.show();
		};

		// Picker: type company_name → choose from multiple clients
		frm._showClientPicker = function (leads) {
			const d = new frappe.ui.Dialog({ title: __("Select Client") });
			const rows = leads
				.map(
					(l) => `
				<div class="pick-row"
					data-primary="${frappe.utils.escape_html(l.first_name)}"
					data-secondary="${frappe.utils.escape_html(l.company_name || "")}"
					style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-color);
						   display:flex;justify-content:space-between;align-items:center;">
					<span style="font-weight:500;">${frappe.utils.escape_html(l.first_name)}</span>
					<span style="font-size:11px;color:var(--text-muted);">${frappe.utils.escape_html(l.company_name || "")}</span>
				</div>`
				)
				.join("");
			d.$body.html(`<div style="max-height:350px;overflow-y:auto;margin:-15px;">${rows}</div>`);
			d.$body
				.find(".pick-row")
				.on("mouseenter", function () { $(this).css("background", "var(--bg-light-gray)"); })
				.on("mouseleave", function () { $(this).css("background", ""); })
				.on("click", function () {
					frm.set_value("first_name", $(this).data("primary"));
					d.hide();
				});
			d.show();
		};
	},

	first_name: function (frm) {
		const name = (frm.doc.first_name || "").trim();
		if (!name || frm.doc.company_name) return;

		clearTimeout(frm._name_search_timer);
		frm._name_search_timer = setTimeout(() => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Lead",
					filters: [["first_name", "=", name], ["name", "!=", frm.doc.name || ""]],
					fields: ["company_name", "first_name"],
					limit: 20,
				},
				callback: function (r) {
					const leads = (r.message || []).filter((l) => l.company_name);
					if (!leads.length) return;
					const unique = [...new Map(leads.map((l) => [l.company_name, l])).values()];
					if (unique.length === 1) {
						if (!frm.doc.company_name) frm.set_value("company_name", unique[0].company_name);
					} else {
						frm._showOrgPicker && frm._showOrgPicker(unique);
					}
				},
			});
		}, 600);
	},

	company_name: function (frm) {
		const org = (frm.doc.company_name || "").trim();
		if (!org || org.length < 2 || frm.doc.first_name) return;

		clearTimeout(frm._org_search_timer);
		frm._org_search_timer = setTimeout(() => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Lead",
					filters: [["company_name", "like", `%${org}%`], ["name", "!=", frm.doc.name || ""]],
					fields: ["company_name", "first_name"],
					limit: 20,
				},
				callback: function (r) {
					const leads = (r.message || []).filter((l) => l.first_name);
					if (!leads.length) return;
					// Deduplicate by first_name to show unique clients
					const unique = [...new Map(leads.map((l) => [l.first_name, l])).values()];
					if (unique.length === 1) {
						if (!frm.doc.first_name) frm.set_value("first_name", unique[0].first_name);
					} else {
						frm._showClientPicker && frm._showClientPicker(unique);
					}
				},
			});
		}, 600);
	},
});
