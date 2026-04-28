const COUNTRY_CODES = [
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

function flagImg(iso, size) {
	return `<img src="https://flagcdn.com/w${size || 20}/${iso}.png" style="width:${size || 20}px;height:auto;vertical-align:middle;border-radius:2px;">`;
}

function injectPhoneCodeSelect(frm) {
	const phoneField = frm.fields_dict["phone"];
	if (!phoneField || phoneField.$wrapper.find(".phone-code-trigger").length) return;

	const $controlInput = phoneField.$wrapper.find(".control-input");
	const $input = $controlInput.find("input");
	if (!$input.length) return;

	// Build custom dropdown HTML
	const dropdownItems = COUNTRY_CODES.map(
		(c) => `
		<div class="phone-code-item" data-code="${c.code}" data-iso="${c.iso}"
			style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;white-space:nowrap;">
			${flagImg(c.iso, 20)}
			<span style="font-size:12px;font-weight:500;min-width:36px;">${c.code}</span>
			<span style="font-size:12px;color:var(--text-muted);">${c.name}</span>
		</div>`
	).join("");

	const saved = frm.doc.custom_phone_code || "";
	const active = COUNTRY_CODES.find((c) => c.code === saved);
	const triggerLabel = active
		? `${flagImg(active.iso, 20)}&nbsp;<span style="font-size:12px;">${active.code}</span>`
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

	// Toggle dropdown
	$trigger.on("click", function (e) {
		e.stopPropagation();
		const $dd = $trigger.find(".phone-code-dropdown");
		$dd.toggle();
	});

	// Hover highlight on items
	$trigger.find(".phone-code-item")
		.on("mouseenter", function () { $(this).css("background", "var(--bg-light-gray)"); })
		.on("mouseleave", function () { $(this).css("background", ""); })
		.on("click", function (e) {
			e.stopPropagation();
			const code = $(this).data("code");
			const entry = COUNTRY_CODES.find((c) => c.code === code);
			$trigger.find(".phone-code-label").html(
				`${flagImg(entry.iso, 20)}&nbsp;<span style="font-size:12px;">${entry.code}</span>`
			);
			$trigger.find(".phone-code-dropdown").hide();
			frm.set_value("custom_phone_code", code);
		});

	// Close dropdown on outside click
	$(document).on("click.phone_code_" + frm.docname, function () {
		$trigger.find(".phone-code-dropdown").hide();
	});
}

function fetchPincodeDetails(frm) {
	const pincode = (frm.doc.pincode || "").trim();
	if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) return;

	frappe.call({
		method: "stellance_customizations.api.get_pincode_details",
		args: { pincode },
		callback: function (r) {
			const data = r.message;
			if (!data || !data[0] || data[0].Status !== "Success") {
				frappe.show_alert({ message: __("No details found for this PIN code"), indicator: "orange" });
				return;
			}
			const offices = data[0].PostOffice;
			const head = offices.find((o) => o.BranchType === "Head Post Office") || offices[0];
			frm.set_value("city", head.Name || head.Block || head.District);
			frm.set_value("custom_district", head.District);
			frm.set_value("state", head.State);
			frm.set_value("country", "India");
			frappe.show_alert({ message: __("Address details filled from PIN code"), indicator: "green" });
		},
	});
}

frappe.ui.form.on("Address", {
	refresh: function (frm) {
		injectPhoneCodeSelect(frm);
	},

	pincode: function (frm) {
		fetchPincodeDetails(frm);
	},
});
