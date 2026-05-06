frappe.ui.form.on("Prospect Lead", {
	lead: function (frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.lead) return;

		frappe.db.get_value(
			"Lead",
			row.lead,
			["custom_customer_group", "custom_sub_category"],
			function (data) {
				if (!data) return;
				if (data.custom_customer_group) {
					frm.set_value("customer_group", data.custom_customer_group);
				}
				if (data.custom_sub_category) {
					frm.set_value("custom_sub_category", data.custom_sub_category);
				}
			}
		);
	},
});
