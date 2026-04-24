frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		if (frm.is_new() && !frm.doc.lead_owner) {
			frm.set_value("lead_owner", frappe.session.user);
		}

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
