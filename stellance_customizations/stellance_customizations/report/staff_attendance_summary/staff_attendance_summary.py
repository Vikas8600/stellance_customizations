import calendar
from collections import defaultdict

import frappe
from frappe.utils import getdate

OWN_EMPLOYMENT_TYPES = {"Permanent", "Full-time"}
SUPERVISOR_DESIGNATION = "site supervisor"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	month = int(filters.month or getdate().month)
	year = int(filters.year or getdate().year)
	_, days_in_month = calendar.monthrange(year, month)

	columns = _get_columns(days_in_month)
	data = _get_data(month, year, days_in_month)
	return columns, data


# ---------------------------------------------------------------------------
# Columns
# ---------------------------------------------------------------------------

def _get_columns(days_in_month):
	columns = [
		{"label": "Site", "fieldname": "site", "fieldtype": "Data", "width": 170},
	]
	for day in range(1, days_in_month + 1):
		columns.append({
			"label": str(day),
			"fieldname": f"d{day:02d}",
			"fieldtype": "Data",
			"width": 100,
		})
	columns += [
		{"label": "Total O (Own)", "fieldname": "total_c", "fieldtype": "Int", "width": 90},
		{"label": "Total C (Sub-Contract)", "fieldname": "total_w", "fieldtype": "Int", "width": 130},
		{"label": "Grand Total", "fieldname": "grand_total", "fieldtype": "Int", "width": 90},
	]
	return columns


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def _get_data(month, year, days_in_month):
	conditions = "MONTH(a.attendance_date) = %(month)s AND YEAR(a.attendance_date) = %(year)s"
	params = {"month": month, "year": year}


	rows = frappe.db.sql(
		f"""
		SELECT
			a.attendance_date,
			a.employee,
			a.employee_name,
			p.project_name AS site,
			COALESCE(e.employment_type, '')                     AS employment_type,
			COALESCE(e.designation, '')                         AS designation
		FROM `tabAttendance` a
		LEFT JOIN `tabEmployee` e ON a.employee = e.name
		LEFT JOIN `tabSite Assignment Employee` sae ON sae.employee = a.employee
		LEFT JOIN `tabSite Assignment` sa
			ON sa.name = sae.parent
			AND sa.is_active = 1
			AND sa.date = a.attendance_date
		LEFT JOIN `tabProject` p ON p.name = sa.project
		WHERE
			{conditions}
			AND a.docstatus = 1
			AND a.status IN ('Present', 'Work From Home', 'Half Day')
			AND p.name IS NOT NULL
		ORDER BY a.attendance_date, site
		""",
		params,
		as_dict=True,
	)

	# site → day → {supervisors: [names], supervisor_ids: set, worker_ids: set, contractor_ids: set}
	site_days = defaultdict(lambda: {d: {
		"supervisors": [], "supervisor_ids": set(),
		"worker_ids": set(), "contractor_ids": set(),
	} for d in range(1, 32)})

	for r in rows:
		site = r.site
		day = getdate(r.attendance_date).day
		bucket = site_days[site][day]
		desig = (r.designation or "").lower()
		emp = r.employee

		if desig == SUPERVISOR_DESIGNATION:
			name = r.employee_name or emp or ""
			if emp not in bucket["supervisor_ids"]:
				bucket["supervisor_ids"].add(emp)
				if name:
					bucket["supervisors"].append(name)
		elif r.employment_type in OWN_EMPLOYMENT_TYPES:
			bucket["worker_ids"].add(emp)
		else:
			bucket["contractor_ids"].add(emp)

	# Daily totals: unique employees per day across all sites
	daily_unique = defaultdict(lambda: {"supervisor_ids": set(), "worker_ids": set(), "contractor_ids": set()})

	# Build two rows per site: supervisor row + headcount row
	data = []
	for site in sorted(site_days):
		sup_row   = {"site": site,  "total_c": "",  "total_w": "",  "grand_total": ""}
		count_row = {"site": "",    "total_c": 0,   "total_w": 0,   "grand_total": 0}

		for day in range(1, days_in_month + 1):
			b = site_days[site][day]
			sup = ", ".join(b["supervisors"])
			s   = len(b["supervisor_ids"])
			c   = len(b["contractor_ids"])
			w   = len(b["worker_ids"])

			sup_row[f"d{day:02d}"]   = sup or ("—" if (c or w) else "")
			count_row[f"d{day:02d}"] = f"S:{s} O:{w} C:{c}" if (s or c or w) else ""

			count_row["total_c"] += c
			count_row["total_w"] += w
			daily_unique[day]["supervisor_ids"] |= b["supervisor_ids"]
			daily_unique[day]["worker_ids"]     |= b["worker_ids"]
			daily_unique[day]["contractor_ids"] |= b["contractor_ids"]

		count_row["grand_total"] = count_row["total_c"] + count_row["total_w"]
		data.append(sup_row)
		data.append(count_row)

	# Daily totals footer row
	if data:
		total_row = {"site": "Daily Total", "total_c": 0, "total_w": 0, "grand_total": 0, "bold": 1}
		for day in range(1, days_in_month + 1):
			s = len(daily_unique[day]["supervisor_ids"])
			c = len(daily_unique[day]["contractor_ids"])
			w = len(daily_unique[day]["worker_ids"])
			total_row[f"d{day:02d}"] = f"S:{s} O:{w} C:{c}" if (s or c or w) else ""
			total_row["total_c"] += c
			total_row["total_w"] += w
		total_row["grand_total"] = total_row["total_c"] + total_row["total_w"]
		data.append(total_row)

	return data
