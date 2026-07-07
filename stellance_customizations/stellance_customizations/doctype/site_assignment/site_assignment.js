// Site Assignment Employee — the Employee field is a Link whose dropdown is
// restricted to site-roster designations. Name + designation auto-fill via the
// child doctype's fetch_from (schema level), so no JS is needed for that.

// Only these designations may be assigned to a site. Variants (hyphen/space,
// "Supervisor" vs "Site Supervisor") are all included. Matched case-insensitively
// by the DB collation.
const DESIGNATION_FILTER = [
	"supervisor",
	"site supervisor",
	"workers",
	"sub-contractor",
	"sub contractor",
];

frappe.ui.form.on("Site Assignment", {
	setup(frm) {
		// Restrict the child-table Employee dropdown to the allowed designations.
		frm.set_query("employee", "employees", function () {
			return {
				filters: {
					status: "Active",
					designation: ["in", DESIGNATION_FILTER],
				},
			};
		});
	},
});