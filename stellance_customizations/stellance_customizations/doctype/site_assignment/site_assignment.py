import frappe
from frappe import _
from frappe.model.document import Document
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
	def validate(self):
		self.validate_dates()

	def validate_dates(self):
		"""To Date (if given) must not be before From Date."""
		if self.to_date and self.date and getdate(self.to_date) < getdate(self.date):
			frappe.throw(_("To Date cannot be before From Date."))

	def after_insert(self):
		self.close_previous_open_assignments()

	def close_previous_open_assignments(self):
		"""One open assignment per project at a time.

		When a new assignment is created for a project, any earlier assignment
		of the same project that is still open (no To Date set) is closed on
		this assignment's From Date — i.e. its To Date is set to this From Date
		and it is marked inactive.
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
			# Never set a To Date earlier than that assignment's own From Date.
			if prev.date and getdate(self.date) < getdate(prev.date):
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
