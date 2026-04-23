import frappe
import requests


@frappe.whitelist()
def get_pincode_details(pincode):
	try:
		response = requests.get(
			f"https://api.postalpincode.in/pincode/{pincode}",
			timeout=5,
			headers={"User-Agent": "Mozilla/5.0"},
		)
		return response.json()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Pincode API Error")
		return None
