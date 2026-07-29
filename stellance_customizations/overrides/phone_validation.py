import re

import frappe
from frappe import _

# Phone-like fields that must hold a valid 10-digit Indian mobile number.
# Only fields that actually exist on the DocType are validated; anything else
# is skipped, so this list is safe across ERPNext/HRMS version differences.
#
# Customer, Supplier and Sales Person are intentionally absent: they carry no
# direct phone field and are reached through the linked Contact instead.
PHONE_FIELDS = {
    "Employee": ["cell_number"],
    "Lead": ["mobile_no", "phone", "whatsapp_no", "custom_client_whatsapp_no"],
    "User": ["mobile_no", "phone"],
    "Contact": ["mobile_no", "phone"],
    "Address": ["phone"],
    "Opportunity": ["contact_mobile", "whatsapp", "phone"],
}


def normalize_phone(value):
    """Return the bare 10-digit core of an Indian mobile number, or None.

    Strips spaces/dashes/parentheses/dots, then peels off a country-code
    prefix ONLY when it is unambiguously a prefix — never when doing so would
    mangle a legitimate 10-digit number that happens to start with "91".

        "9123456789"      -> "9123456789"   (kept as-is, already 10 digits)
        "+91 91234-56789" -> "9123456789"
        "919123456789"    -> "9123456789"   (12 digits, 91 prefix)
        "09123456789"     -> "9123456789"   (11 digits, trunk 0)
        "12345"           -> None           (too short)
    """
    if value is None:
        return None

    s = re.sub(r"[\s\-().]", "", str(value).strip())

    if s.startswith("+"):
        s = s[1:]
        if s.startswith("91"):
            s = s[2:]
    elif len(s) == 12 and s.startswith("91"):
        s = s[2:]
    elif len(s) == 11 and s.startswith("0"):
        s = s[1:]

    if s.isdigit() and len(s) == 10:
        return s
    return None


def validate_phone_fields(doc, method=None):
    """Enforce the 10-digit rule on this DocType's configured phone fields.

    Blank values are left untouched (this does not make any field mandatory)
    and valid values are stored exactly as entered — any +91 prefix the user
    typed is preserved, only the format is checked.
    """
    fieldnames = PHONE_FIELDS.get(doc.doctype)
    if not fieldnames:
        return

    meta = frappe.get_meta(doc.doctype)

    for fieldname in fieldnames:
        # Skip fields that don't exist on this site's version of the DocType.
        if not meta.has_field(fieldname):
            continue

        value = doc.get(fieldname)
        if not value:
            continue

        if normalize_phone(value) is None:
            label = meta.get_label(fieldname) or fieldname
            frappe.throw(
                _(
                    "{0} must be a valid 10-digit mobile number "
                    "(an optional +91 country code is allowed). You entered: {1}"
                ).format(_(label), frappe.bold(value)),
                title=_("Invalid Phone Number"),
            )
