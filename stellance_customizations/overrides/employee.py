import frappe
from frappe.utils import nowdate
from stellance_customizations.leave_management import (
    allocate_joining_month_leaves,
    backfill_leaves_from_joining,
)

def before_save(self, method):
    set_min_wages(self)
    # Detect if Leave Group Policy is being newly assigned (was empty before)
    prev_policy = frappe.db.get_value("Employee", self.name, "custom_leave_group_policy")
    if not prev_policy and self.custom_leave_group_policy:
        self.flags.leave_policy_newly_assigned = True

def after_save(self, method):
    _create_leave_policy_assignment(self)
    if getattr(self.flags, "leave_policy_newly_assigned", False):
        # Policy assigned for the first time — backfill all months before current
        backfill_leaves_from_joining(self)
    # Always run joining-month check: handles same-month joining + normal saves
    allocate_joining_month_leaves(self)


def _create_leave_policy_assignment(employee):
    """
    When a Leave Group Policy is assigned to an employee, create a Leave Policy
    Assignment so ERPNext's built-in validations fire:
      - period overlap check (validate_policy_assignment_overlap)
      - carry-forward compatibility warning
      - effective dates auto-set from Leave Period

    The LPA is persisted as submitted + leaves_allocated=1 so:
      - future overlap checks work correctly
      - the standard grant (which would create annual allocations) is skipped
        (our monthly scheduler handles actual allocations)
    """
    if not employee.custom_leave_group_policy:
        return

    policy = frappe.get_doc("Leave Group Policy", employee.custom_leave_group_policy)

    if not policy.leave_period:
        frappe.msgprint(
            "Leave Group Policy has no Leave Period set. Leave Policy Assignment skipped.",
            indicator="orange", alert=True,
        )
        return

    linked_policy = f"LGP - {policy.group_name}"
    if not frappe.db.exists("Leave Policy", linked_policy):
        frappe.msgprint(
            f"Mirror Leave Policy '{linked_policy}' not found. Re-save the Leave Group Policy first.",
            indicator="orange", alert=True,
        )
        return

    # Skip if an LPA already exists for this employee + policy (any status except cancelled)
    if frappe.db.exists("Leave Policy Assignment", {
        "employee": employee.name,
        "leave_policy": linked_policy,
        "docstatus": ["!=", 2],
    }):
        return

    lpa = frappe.get_doc({
        "doctype": "Leave Policy Assignment",
        "employee": employee.name,
        "leave_policy": linked_policy,
        "assignment_based_on": "Leave Period",
        "leave_period": policy.leave_period,
        "carry_forward": 0,
    })

    try:
        # insert() runs validate() → overlap check + carry-forward warning fire here
        lpa.insert(ignore_permissions=True)

        # Mark submitted + leaves_allocated without triggering on_submit,
        # so the standard annual grant is bypassed (monthly scheduler owns allocations)
        frappe.db.set_value(
            "Leave Policy Assignment", lpa.name,
            {"docstatus": 1, "leaves_allocated": 1},
            update_modified=False,
        )
        frappe.msgprint(
            f"Leave Policy Assignment created for {employee.employee_name}.",
            indicator="green", alert=True,
        )
    except frappe.ValidationError as e:
        frappe.msgprint(str(e), indicator="red", title="Leave Policy Assignment Error")
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            f"Leave Policy Assignment creation failed: {employee.employee_name}",
        )



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




