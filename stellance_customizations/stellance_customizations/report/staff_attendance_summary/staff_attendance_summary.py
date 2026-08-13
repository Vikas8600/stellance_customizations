import calendar
from collections import defaultdict

import frappe
from frappe.utils import getdate

SUPERVISOR_DESIGNATIONS = {"site supervisor", "contract site supervisor", "jr site supervisor", "sr. site supervisor"}
WORKER_DESIGNATIONS    = {"workers", "senior site engineer", "site engineer", "unskilled co-worker"}
CONTRACTOR_DESIGNATIONS = {"sub-contractor", "assistant manager-contracts"}


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
		{"label": "Total C (Sub-Contract)", "fieldname": "total_c", "fieldtype": "Int", "width": 130},
		{"label": "Total O (Own)", "fieldname": "total_w", "fieldtype": "Int", "width": 90},
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
			COALESCE(NULLIF(sae.designation, ''), e.designation, '') AS designation,
			e.custom_designation_type AS designation_type
		FROM `tabAttendance` a
		LEFT JOIN `tabEmployee` e ON e.name = a.employee
		LEFT JOIN `tabSite Assignment Employee` sae ON sae.employee = a.employee
		LEFT JOIN `tabSite Assignment` sa
			ON sa.name = sae.parent
			-- Attribute each attendance day to the assignment whose active window
			-- covers it: from From Date (sa.date) onwards, up to To Date when set,
			-- otherwise open-ended (assignment still running until it is closed).
			AND a.attendance_date >= sa.date
			AND (sa.to_date IS NULL OR a.attendance_date <= sa.to_date)
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

	# site → day → {supervisors/workers/contractors: [names], *_ids: set}
	site_days = defaultdict(lambda: {d: {
		"supervisors": [], "supervisor_ids": set(),
		"workers": [], "worker_ids": set(),
		"contractors": [], "contractor_ids": set(),
	} for d in range(1, 32)})

	for r in rows:
		site = r.site
		day = getdate(r.attendance_date).day
		bucket = site_days[site][day]
		desig = (r.designation or "").lower()
		dtype = (r.designation_type or "").strip().upper()
		emp = r.employee
		name = r.employee_name or emp or ""

		# Employee.custom_designation_type wins when set; otherwise fall back to
		# matching the free-text designation against the hardcoded lists below.
		if dtype == "SUPERVISOR" or (not dtype and desig in SUPERVISOR_DESIGNATIONS):
			ids, names = bucket["supervisor_ids"], bucket["supervisors"]
		elif dtype == "WORKER" or (not dtype and desig in WORKER_DESIGNATIONS):
			ids, names = bucket["worker_ids"], bucket["workers"]
		elif dtype == "CONTRACTOR" or (not dtype and desig in CONTRACTOR_DESIGNATIONS):
			ids, names = bucket["contractor_ids"], bucket["contractors"]
		else:
			continue

		if emp not in ids:
			ids.add(emp)
			if name:
				names.append(name)

	# Daily totals: unique employees per day across all sites
	daily_unique = defaultdict(lambda: {"supervisor_ids": set(), "worker_ids": set(), "contractor_ids": set()})

	# Build two rows per site: supervisor row + headcount row
	data = []
	for site in sorted(site_days):
		sup_row   = {"site": site,  "total_c": "",  "total_w": "",  "grand_total": ""}
		count_row = {"site": "",    "total_c": 0,   "total_w": 0,   "grand_total": 0}

		for day in range(1, days_in_month + 1):
			b = site_days[site][day]
			s = len(b["supervisor_ids"])
			c = len(b["contractor_ids"])
			w = len(b["worker_ids"])

			# Priority for the name cell: Supervisor, then Own worker, then Sub-Contractor.
			names = b["supervisors"] or b["workers"] or b["contractors"]

			sup_row[f"d{day:02d}"]   = ", ".join(names)
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
