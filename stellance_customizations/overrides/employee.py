import frappe
from frappe.utils import nowdate

def before_save(self,method):
    set_min_wages(self)
    # set_defaults(self)
    # populate_from_default_template(self)
    # populate_employee_documents_from_template(self)



def set_min_wages(self):
    if self.branch and self.custom_skill_category:
        get_branch = frappe.get_doc("Branch", self.branch)
        self.custom_min_wages_details = 0  
        matched = False

        if get_branch.custom_min_wages_details:
            for skill in get_branch.custom_min_wages_details:
                if skill.skill_category == self.custom_skill_category:
                    # First, look for exact zone_area match if zone_area is provided
                    if self.custom_zone and skill.zone_area == self.custom_zone:
                        self.custom_basic_amount = skill.basic_wages
                        self.custom_hra_amount = skill.hra_wages
                        self.custom_vda_amount = skill.da_wages
                        matched = True
                        break
                    else:
                        self.custom_basic_amount = 0
                        self.custom_hra_amount = 0
                        self.custom_vda_amount = 0

                        

            # If no zone_area-specific match was found, fallback to no-zone_area entry
            if not matched:
                for skill in get_branch.custom_min_wages_details:
                    if skill.skill_category == self.custom_skill_category and not skill.zone_area:
                        self.custom_basic_amount = skill.basic_wages
                        self.custom_hra_amount = skill.hra_wages
                        self.custom_vda_amount = skill.da_wages
                        break
    else:
        self.custom_basic_amount = 0
        self.custom_hra_amount = 0
        self.custom_vda_amount = 0

def set_defaults(self):
    if self.employment_type:
        config = frappe.get_value(
            "Employee Category Configuration",
            {"category": self.employment_type},
            ["default_salary_structure", "default_shift"],
            as_dict=True
        )

        if config:
            self.default_shift = config.default_shift

            exists = frappe.db.exists("Salary Structure Assignment", {
                "employee": self.name,
                "salary_structure": config.default_salary_structure
            })

            if not exists:
                assignment = frappe.get_doc({
                    "doctype": "Salary Structure Assignment",
                    "employee": self.name,
                    "salary_structure": config.default_salary_structure,
                    "from_date": nowdate(),
                    "company": self.company
                })
                assignment.flags.ignore_permissions = True
                assignment.flags.ignore_validate = True
                assignment.flags.ignore_mandatory = True
                assignment.insert()

def populate_from_default_template(self):
    if not self.custom_document_template:
        default = frappe.get_all("Employee Document Template", filters={"is_default": 1}, limit=1)
        if default:
            self.custom_document_template = default[0].name

def populate_employee_documents_from_template(self):
    if self.custom_document_template and not self.custom_employee_documents:
        template = frappe.get_doc("Employee Document Template", self.custom_document_template)
        for row in template.documents:
            self.append("custom_employee_documents", {
                "document": row.document,
                "required": row.required
            })




