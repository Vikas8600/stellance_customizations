frappe.query_reports["Daily Manpower Deployment"] = {
	filters: [
		{
			fieldname: "designation",
			label: __("Designation"),
			fieldtype: "MultiSelectList",
			get_data: function (txt) {
				return frappe.db.get_link_options("Designation", txt);
			},
		},
		{
			fieldname: "month",
			label: __("Month"),
			fieldtype: "Select",
			options: [
				{ value: 1,  label: __("January") },
				{ value: 2,  label: __("February") },
				{ value: 3,  label: __("March") },
				{ value: 4,  label: __("April") },
				{ value: 5,  label: __("May") },
				{ value: 6,  label: __("June") },
				{ value: 7,  label: __("July") },
				{ value: 8,  label: __("August") },
				{ value: 9,  label: __("September") },
				{ value: 10, label: __("October") },
				{ value: 11, label: __("November") },
				{ value: 12, label: __("December") },
			],
			default: String(frappe.datetime.get_today().split("-")[1]),
			reqd: 1,
		},
		{
			fieldname: "year",
			label: __("Year"),
			fieldtype: "Int",
			default: frappe.datetime.get_today().split("-")[0],
			reqd: 1,
		},
		{
			fieldname: "on_site",
			label: __("On Site"),
			fieldtype: "Check",
		},
	],
};
