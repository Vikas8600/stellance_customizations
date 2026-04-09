frappe.ui.form.on("Site Assignment Employee", {
	employee: function (_frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.employee) {
			frappe.model.set_value(cdt, cdn, "employee_name", "");
			frappe.model.set_value(cdt, cdn, "designation", "");
			return;
		}

		frappe.db.get_value("Employee", row.employee, ["employee_name", "designation"], (r) => {
			if (r && r.employee_name) {
				frappe.model.set_value(cdt, cdn, "employee_name", r.employee_name);
				frappe.model.set_value(cdt, cdn, "designation", r.designation || "");
			} else {
				frappe.model.set_value(cdt, cdn, "employee_name", "");
				frappe.model.set_value(cdt, cdn, "designation", "");
				frappe.show_alert({ message: `Employee "${row.employee}" not found`, indicator: "red" });
			}
		});
	},
});
