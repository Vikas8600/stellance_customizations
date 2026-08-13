import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	if frappe.db.exists("Custom Field", {"dt": "HR Settings", "fieldname": "daily_attendance_reprocess"}):
		return

	create_custom_fields(
		{
			"HR Settings": [
				{
					"fieldname": "daily_attendance_reprocess",
					"fieldtype": "Check",
					"label": "Daily Attendance Reprocess",
					"insert_after": "weekly_off_based_on",
				},
			]
		},
		ignore_validate=True,
	)
