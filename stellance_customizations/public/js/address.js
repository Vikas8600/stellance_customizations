function fetchPincodeDetails(frm) {
	const pincode = (frm.doc.pincode || "").trim();
	if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) return;

	frappe.call({
		method: "stellance_customizations.api.get_pincode_details",
		args: { pincode },
		callback: function (r) {
			const data = r.message;
			if (!data || !data[0] || data[0].Status !== "Success") {
				frappe.show_alert({ message: __("No details found for this PIN code"), indicator: "orange" });
				return;
			}
			const offices = data[0].PostOffice;
			const head = offices.find(o => o.BranchType === "Head Post Office") || offices[0];
			frm.set_value("city", head.Name || head.Block || head.District);
			frm.set_value("custom_district", head.District);
			frm.set_value("state", head.State);
			frm.set_value("country", "India");
			frappe.show_alert({ message: __("Address details filled from PIN code"), indicator: "green" });
		},
	});
}

frappe.ui.form.on("Address", {
	pincode: function (frm) {
		fetchPincodeDetails(frm);
	},
});
