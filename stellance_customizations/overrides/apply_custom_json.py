import frappe
import json
import os

def apply_json_customizations():
	file_path = frappe.get_app_path("stellance_customizations", "json_files", "lead.json")

	if not os.path.exists(file_path):
		frappe.logger().error("lead.json not found at path: " + file_path)
		return

	with open(file_path) as f:
		try:
			records = json.load(f)
		except Exception as e:
			frappe.logger().error("Invalid JSON in lead.json: " + str(e))
			return

		for doc in records:
			# Skip if not a valid dict
			if not isinstance(doc, dict):
				continue

			doctype = doc.get("doctype")
			if not doctype:
				continue

			# Build key to check existence
			if doctype == "Custom Field":
				key = {"fieldname": doc.get("fieldname"), "dt": doc.get("dt")}
			elif doctype == "Property Setter":
				key = {
					"doc_type": doc.get("doc_type"),
					"field_name": doc.get("field_name"),
					"property": doc.get("property")
				}
			else:
				continue

			exists = frappe.db.exists(doctype, key)

			if not exists:
				frappe.get_doc(doc).insert()
			else:
				existing_doc = frappe.get_doc(doctype, exists)
				for k, v in doc.items():
					existing_doc.set(k, v)
				existing_doc.save(ignore_permissions=True)
