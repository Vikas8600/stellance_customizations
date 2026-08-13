import frappe
import requests


def set_address_from_coordinates(doc, method=None):
    if not doc.latitude or not doc.longitude:
        return
    if doc.custom_address:
        return

    frappe.enqueue(
        _fetch_and_set_address,
        queue="short",
        enqueue_after_commit=True,
        doc_name=doc.name,
        lat=doc.latitude,
        lon=doc.longitude,
    )


def _fetch_and_set_address(doc_name, lat, lon):
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"format": "json", "lat": lat, "lon": lon},
            headers={"User-Agent": "StellaNCE/1.0 (prathamjadhav052@gmail.com)"},
            timeout=5,
        )
        resp.raise_for_status()
        address = resp.json().get("display_name", "")
        if address:
            frappe.db.set_value("Employee Checkin", doc_name, "custom_address", address)
    except Exception as e:
        frappe.logger().warning(f"Employee Checkin {doc_name}: reverse geocode failed: {e}")
