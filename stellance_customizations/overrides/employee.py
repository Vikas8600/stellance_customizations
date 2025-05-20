import frappe


def before_save(self,method):
    set_min_wages(self)



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