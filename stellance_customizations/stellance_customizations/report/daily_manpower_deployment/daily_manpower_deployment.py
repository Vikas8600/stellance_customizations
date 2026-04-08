import calendar

import frappe
from frappe.utils import getdate

# Status label → (short text, background color, text color)
STATUS_STYLE = {
	"Present":        ("P",   "#2ecc71", "#fff"),
	"Absent":         ("A",   "#e74c3c", "#fff"),
	"Half Day":       ("HD",  "#f39c12", "#fff"),
	"Work From Home": ("WFH", "#3498db", "#fff"),
	"On Leave":       ("L",   "#9b59b6", "#fff"),
	"Holiday":        ("H",   "#1abc9c", "#fff"),
	"Weekly Off":     ("WO",  "#95a5a6", "#fff"),
}


def _badge(status):
	if not status or status not in STATUS_STYLE:
		return ""
	label, bg, color = STATUS_STYLE[status]
	return (
		f'<span style="background:{bg};color:{color};padding:2px 5px;'
		f'border-radius:4px;font-size:11px;font-weight:600;">{label}</span>'
	)


def execute(filters=None):
	filters = frappe._dict(filters or {})
	month = int(filters.month or getdate().month)
	year  = int(filters.year  or getdate().year)
	_, days_in_month = calendar.monthrange(year, month)

	columns = _get_columns(days_in_month, month, year)
	data    = _get_data(filters, month, year, days_in_month)
	return columns, data


# ---------------------------------------------------------------------------
# Columns
# ---------------------------------------------------------------------------

def _get_columns(days_in_month, month, year):
	columns = [
		{"label": "Employee",    "fieldname": "employee",      "fieldtype": "Link",   "options": "Employee", "width": 110},
		{"label": "Name",        "fieldname": "employee_name", "fieldtype": "Data",   "width": 160},
		{"label": "Designation", "fieldname": "designation",   "fieldtype": "Data",   "width": 140},
	]

	import datetime
	for day in range(1, days_in_month + 1):
		d = datetime.date(year, month, day)
		weekday = d.strftime("%a")  # Mon, Tue …
		columns.append({
			"label":     f"{day}\n{weekday}",
			"fieldname": f"d{day:02d}",
			"fieldtype": "Data",
			"width":     55,
		})

	columns += [
		{"label": "Present",  "fieldname": "total_present",  "fieldtype": "Int", "width": 70},
		{"label": "Absent",   "fieldname": "total_absent",   "fieldtype": "Int", "width": 70},
		{"label": "Half Day", "fieldname": "total_half_day", "fieldtype": "Int", "width": 75},
		{"label": "Leave",    "fieldname": "total_leave",    "fieldtype": "Int", "width": 60},
	]
	return columns


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def _get_data(filters, month, year, days_in_month):
	designations = filters.get("designation") or []
	if isinstance(designations, str):
		designations = [d.strip() for d in designations.split(",") if d.strip()]

	on_site = filters.get("on_site")

	emp_conditions = "e.status = 'Active'"
	emp_params = {}

	if designations:
		emp_conditions += " AND e.designation IN %(designations)s"
		emp_params["designations"] = designations

	if on_site:
		emp_conditions += (
			" AND e.name IN ("
			"  SELECT DISTINCT sae.employee"
			"  FROM `tabSite Assignment Employee` sae"
			"  JOIN `tabSite Assignment` sa ON sa.name = sae.parent AND sa.is_active = 1"
			"  WHERE MONTH(sa.date) = %(month)s AND YEAR(sa.date) = %(year)s"
			")"
		)
		emp_params["month"] = month
		emp_params["year"]  = year

	employees = frappe.db.sql(
		f"""
		SELECT e.name AS employee, e.employee_name, e.designation
		FROM `tabEmployee` e
		WHERE {emp_conditions}
		ORDER BY e.designation, e.employee_name
		""",
		emp_params,
		as_dict=True,
	)

	if not employees:
		return []

	emp_ids = [e.employee for e in employees]

	attendance = frappe.db.sql(
		"""
		SELECT employee, attendance_date, status
		FROM `tabAttendance`
		WHERE
			employee      IN %(emp_ids)s
			AND MONTH(attendance_date) = %(month)s
			AND YEAR(attendance_date)  = %(year)s
			AND docstatus = 1
		""",
		{"emp_ids": emp_ids, "month": month, "year": year},
		as_dict=True,
	)

	# Map: employee → day → status
	att_map = {}
	for a in attendance:
		att_map.setdefault(a.employee, {})[getdate(a.attendance_date).day] = a.status

	# Map: employee → day → site name (from Site Assignment)
	site_assignments = frappe.db.sql(
		"""
		SELECT sae.employee, sa.date, p.project_name
		FROM `tabSite Assignment Employee` sae
		JOIN `tabSite Assignment` sa ON sa.name = sae.parent AND sa.is_active = 1
		JOIN `tabProject` p ON p.name = sa.project
		WHERE
			sae.employee IN %(emp_ids)s
			AND MONTH(sa.date) = %(month)s
			AND YEAR(sa.date)  = %(year)s
		""",
		{"emp_ids": emp_ids, "month": month, "year": year},
		as_dict=True,
	)

	site_map = {}
	for s in site_assignments:
		site_map.setdefault(s.employee, {})[getdate(s.date).day] = s.project_name

	data = []
	for emp in employees:
		row = {
			"employee":      emp.employee,
			"employee_name": emp.employee_name,
			"designation":   emp.designation or "",
			"total_present":  0,
			"total_absent":   0,
			"total_half_day": 0,
			"total_leave":    0,
		}

		emp_att  = att_map.get(emp.employee, {})
		emp_site = site_map.get(emp.employee, {})
		for day in range(1, days_in_month + 1):
			status = emp_att.get(day)
			cell = _badge(status)
			site = emp_site.get(day)
			if site:
				cell += f'<span style="font-size:10px;color:#555;margin-left:3px;">({site})</span>'
			row[f"d{day:02d}"] = cell

			if status == "Present":        row["total_present"]  += 1
			elif status == "Absent":       row["total_absent"]   += 1
			elif status == "Half Day":     row["total_half_day"] += 1
			elif status == "On Leave":     row["total_leave"]    += 1

		data.append(row)

	return data
