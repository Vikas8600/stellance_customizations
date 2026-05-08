import frappe
import requests


def set_address_from_coordinates(doc, method=None):
    if not doc.latitude or not doc.longitude:
        return
    if doc.custom_address:
        return

    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"format": "json", "lat": doc.latitude, "lon": doc.longitude},
            headers={"User-Agent": "StellaNCE/1.0 (prathamjadhav052@gmail.com)"},
            timeout=5,
        )
        data = resp.json()
        doc.custom_address = data.get("display_name", "")
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Employee Checkin – reverse geocode failed")
