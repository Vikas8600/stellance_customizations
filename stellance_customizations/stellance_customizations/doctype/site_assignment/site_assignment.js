// Site Assignment Employee — a row can be filled from EITHER column:
//   • "Employee"      — a Link that shows the employee ID and searches by name in
//                        its dropdown. Picking here fills Employee Name + Designation
//                        (via fetch_from).
//   • "Employee Name" — a plain text field showing the name. Type the FULL name and
//                        the script below resolves it to the Employee (ID) + fetches
//                        Designation.
// So: Employee column = ID, Employee Name column = name, Designation = auto.
//
// The Employee dropdown is restricted server-side (roster_employee_query) to employees
// whose designation is Workers / Sub-contractor, OR whose linked User has the
// "Supervisor" role. ("Supervisor" is a Role, not a Designation.)

const ROSTER_QUERY =
	"stellance_customizations.stellance_customizations.doctype.site_assignment.site_assignment.roster_employee_query";

frappe.ui.form.on("Site Assignment", {
	setup(frm) {
		frm.set_query("employee", "employees", () => ({ query: ROSTER_QUERY }));
	},
});

frappe.ui.form.on("Site Assignment Employee", {
	// Typed a name in the "Employee Name" column → resolve it to an Employee (ID).
	// Setting `employee` then auto-fills Designation (and re-normalises the name)
	// via the child doctype's fetch_from.
	employee_name(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const typed = (row.employee_name || "").trim();
		if (!typed) return;

		frappe.db
			.get_list("Employee", {
				filters: { employee_name: typed, status: "Active" },
				fields: ["name", "designation"],
				limit: 2,
			})
			.then((matches) => {
				if (!matches || !matches.length) {
					frappe.show_alert({
						message: __("No active employee named “{0}”. Use the Employee column to search.", [typed]),
						indicator: "orange",
					});
					return;
				}
				if (matches.length > 1) {
					frappe.show_alert({
						message: __("More than one employee named “{0}”; picking the first. Use the Employee column to pick exactly.", [typed]),
						indicator: "orange",
					});
				}
				const emp = matches[0];
				// Set the Employee link (guard against a fetch_from feedback loop),
				// and set Designation explicitly so it fills even if fetch_from lags.
				if (emp.name !== row.employee) {
					frappe.model.set_value(cdt, cdn, "employee", emp.name);
				}
				frappe.model.set_value(cdt, cdn, "designation", emp.designation || "");
			});
	},
});
