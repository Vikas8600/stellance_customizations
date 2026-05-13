

function fetchGroupAndSubCategory(frm) {
	const source = frm.doc.opportunity_from;
	const party = frm.doc.party_name;
	if (!party) return;

	if (source === "Lead") {
		frappe.db.get_value(
			"Lead",
			party,
			["custom_customer_group", "custom_sub_category"],
			function (data) {
				if (!data) return;
				if (data.custom_customer_group) frm.set_value("customer_group", data.custom_customer_group);
				if (data.custom_sub_category) frm.set_value("custom_sub_category", data.custom_sub_category);
			}
		);
	} else if (source === "Prospect") {
		frappe.db.get_value(
			"Prospect",
			party,
			["customer_group", "custom_sub_category"],
			function (data) {
				if (!data) return;
				if (data.customer_group) frm.set_value("customer_group", data.customer_group);
				if (data.custom_sub_category) frm.set_value("custom_sub_category", data.custom_sub_category);
			}
		);
	}
}

frappe.ui.form.on('Opportunity', {
    	refresh: function (frm) {
		frm.set_query("custom_customer_category", function () {
			return { filters: { is_group: 1 } };
		});
		if (frm.fields_dict["custom_customer_subcategory"]) {
			frm.set_query("custom_customer_subcategory", function () {
				return {
					filters: {
						is_group: 0,
						parent_customer_group: frm.doc.custom_customer_category || "",
					},
				};
			});
		}
	},
	custom_customer_category: function (frm) {
		frm.set_value("custom_customer_subcategory", "");
	},

    party_name: function (frm) {
        fetchGroupAndSubCategory(frm);
    },

    custom_bom: function(frm) {
        if (frm.doc.custom_bom) {
            frappe.call({
                method:"stellance_customizations.overrides.opportunity.get_bom_items",
                args: {
                    bom_name: frm.doc.custom_bom
                },
                callback: function(r) {
                    if (r.message) {
                        frm.clear_table("items");  
                        r.message.forEach(function(item) {
                            let row = frm.add_child("items");  // Order maintained
                            row.item_code = item.item_code;
                            row.item_name = item.item_name;
                            row.qty = item.qty;
                            row.uom = item.uom;
                            row.rate = item.rate;
                            row.amount = item.amount;
                            row.base_rate = item.base_rate
                            row.base_amount = item.base_amount
                            row.custom_last_purchase_rate = item.last_purchase_rate
                            row.custom_margin = item.margin
                        });
                        frm.refresh_field("items");
                    }
                }
            });
        } else {
            frm.clear_table("items");
            frm.refresh_field("items");
        }
    }
});


frappe.ui.form.on('Opportunity Item', {
    custom_margin: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let lpr = flt(row.custom_last_purchase_rate);
        let percent = flt(row.custom_margin);
        let final_rate = lpr + (lpr * percent / 100);
        frappe.model.set_value(cdt, cdn, 'rate', final_rate);
    }
});
