frappe.ui.form.on("Site Assignment Employee", {
	employee: function (frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.employee) {
			frappe.model.set_value(cdt, cdn, "employee_name", "");
			return;
		}

		frappe.db.get_value("Employee", row.employee, "employee_name", (r) => {
			if (r && r.employee_name) {
				frappe.model.set_value(cdt, cdn, "employee_name", r.employee_name);
			} else {
				frappe.model.set_value(cdt, cdn, "employee_name", "");
				frappe.show_alert({ message: `Employee "${row.employee}" not found`, indicator: "red" });
			}
		});
	},
});
