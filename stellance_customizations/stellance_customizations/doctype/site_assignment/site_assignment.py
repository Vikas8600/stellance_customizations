import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import append_number_if_name_exists
from frappe.utils import getdate, today

# Employees eligible for a site roster are matched two ways:
#   • by designation — Workers / Sub-contractor (real Designations on Employee)
#   • by role        — their linked User carries the "Supervisor" role
# "Supervisor" is a Role, not a Designation, so it is matched via Has Role rather
# than Employee.designation. Designations are compared case-insensitively; spelling
# variants (hyphen/space) are all listed so either form matches.
ROSTER_DESIGNATIONS = ("workers", "sub-contractor", "sub contractor")
SUPERVISOR_ROLE = "Supervisor"


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def roster_employee_query(doctype, txt, searchfield, start, page_len, filters):
	"""Link-field query for the Site Assignment employee dropdown.

	Restricts to Active employees who either hold a site-roster designation
	(Workers / Sub-contractor) or whose linked User has the "Supervisor" role.
	"""
	searchfield = searchfield or "name"
	return frappe.db.sql(
		"""
		SELECT name, employee_name, designation
		FROM `tabEmployee`
		WHERE status = 'Active'
		  AND (
		        LOWER(COALESCE(designation, '')) IN %(desigs)s
		        OR user_id IN (
		            SELECT parent FROM `tabHas Role`
		            WHERE role = %(sup_role)s AND parenttype = 'User'
		        )
		  )
		  AND ({key} LIKE %(txt)s OR employee_name LIKE %(txt)s)
		ORDER BY
		  IF(LOCATE(%(_txt)s, name) > 0, LOCATE(%(_txt)s, name), 99999),
		  employee_name ASC
		LIMIT %(start)s, %(page_len)s
		""".format(key=searchfield),
		{
			"desigs": ROSTER_DESIGNATIONS,
			"sup_role": SUPERVISOR_ROLE,
			"txt": f"%{txt}%",
			"_txt": txt.replace("%", ""),
			"start": start,
			"page_len": page_len,
		},
	)


class SiteAssignment(Document):
	def autoname(self):
		"""Name as SA-{project}-{date}, adding a numeric suffix if that name is taken.

		More than one assignment is allowed for the same project on the same date
		(separate shifts / crews / supervisors), so the name can no longer be just
		project + date — that is what used to raise a duplicate-name error on the
		second assignment.

		The first assignment for a project+date still gets the plain
		SA-{project}-{date} name, so every document created before this keeps its
		name and nothing has to be renamed; the next ones become ...-1, ...-2, etc.

		This method takes precedence over the DocType's `autoname` property
		(frappe.model.naming.set_new_name runs the controller method first), which
		is why that property has been removed from site_assignment.json.
		"""
		self.name = append_number_if_name_exists(
			"Site Assignment", f"SA-{self.project}-{getdate(self.date)}"
		)

	def validate(self):
		self.validate_dates()
		self.dedupe_employees()

	def validate_dates(self):
		"""To Date (if given) must not be before From Date."""
		if self.to_date and self.date and getdate(self.to_date) < getdate(self.date):
			frappe.throw(_("To Date cannot be before From Date."))

	def dedupe_employees(self):
		"""Keep only the first row per employee.

		One assignment = one roster, so the same employee must never appear
		twice on it. The hr_mobile create/update API already skips employees it
		knows are present, but this guards every entry path (manual form edits,
		imports, re-saves) so a duplicate employee row can't slip in.
		"""
		seen, kept = set(), []
		for row in self.employees or []:
			if not row.employee or row.employee in seen:
				continue
			seen.add(row.employee)
			kept.append(row)
		if len(kept) != len(self.employees or []):
			self.set("employees", kept)

	def after_insert(self):
		self.close_previous_open_assignments()

	def close_previous_open_assignments(self):
		"""One open assignment per project per date.

		When a new assignment is created for a project, any assignment of the
		same project with an EARLIER From Date that is still open (no To Date
		set) is closed on this assignment's From Date — i.e. its To Date is set
		to this From Date and it is marked inactive.

		Assignments sharing this assignment's From Date are deliberately left
		open: several crews/shifts can be rostered on the same site on the same
		day, and closing them here would set is_active = 0 and silently drop
		their employees from every report that filters on is_active.
		"""
		open_prev = frappe.get_all(
			"Site Assignment",
			filters=[
				["project", "=", self.project],
				["name", "!=", self.name],
				["to_date", "is", "not set"],
				["is_active", "=", 1],
			],
			fields=["name", "date"],
		)
		for prev in open_prev:
			# Never set a To Date earlier than that assignment's own From Date,
			# and never close a same-day assignment (see docstring).
			if prev.date and getdate(self.date) <= getdate(prev.date):
				continue
			frappe.db.set_value(
				"Site Assignment",
				prev.name,
				{"to_date": self.date, "is_active": 0},
			)


def close_expired_assignments():
	"""Daily job: close any active assignment whose To Date has arrived/passed.

	Handles the case where a To Date was set upfront — the assignment stays
	active until that date, then this job marks it inactive on/after To Date.
	"""
	expired = frappe.get_all(
		"Site Assignment",
		filters=[
			["is_active", "=", 1],
			["to_date", "is", "set"],
			["to_date", "<=", today()],
		],
		pluck="name",
	)
	for name in expired:
		frappe.db.set_value("Site Assignment", name, "is_active", 0)
