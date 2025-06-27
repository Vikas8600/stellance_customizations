import frappe
import json
import os

def apply_json_customizations():
	file_path = frappe.get_app_path("stellance_customizations", "json_files", "lead.json")
	if not os.path.exists(file_path):
		frappe.logger().error("lead.json not found at path: " + file_path)
		return

	with open(file_path) as f:
		records = json.load(f)
		for doc in records:
			doctype = doc.get("doctype")
			if not doctype:
				continue

			if doctype == "Custom Field":
				key = {"fieldname": doc["fieldname"], "dt": doc["dt"]}
			elif doctype == "Property Setter":
				key = {
					"doc_type": doc["doc_type"],
					"field_name": doc["field_name"],
					"property": doc["property"]
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
