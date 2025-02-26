# Copyright (c) 2025, chinmay@hybrowlabs.com and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt
from frappe.utils.nestedset import get_descendants_of


def execute(filters=None):
	filters = frappe._dict(filters or {})
	if filters.from_date > filters.to_date:
		frappe.throw(_("From Date cannot be greater than To Date"))

	columns = get_columns(filters)
	data = get_data(filters)

	return columns, data, None


def get_columns(filters):
	return [
		{
			"label": _("Item Code"),
			"fieldtype": "Link",
			"fieldname": "item_code",
			"options": "Item",
			"width": 120,
		},
		{
			"label": _("Item Name"),
			"fieldtype": "Data",
			"fieldname": "item_name",
			"width": 140,
		},
		{
			"label": _("Purchase Order"),
			"fieldtype": "Link",
			"fieldname": "purchase_order",
			"options": "Purchase Order",
			"width": 160,
		},
		{
			"label": _("Supplier"),
			"fieldtype": "Link",
			"fieldname": "supplier",
			"options": "Supplier",
			"width": 100,
		},
		{
			"label": _("Supplier Name"),
			"fieldtype": "Data",
			"fieldname": "supplier_name",
			"width": 140,
		},
		{
			"label": _("Amount"),
			"fieldname": "amount",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 120,
		},
		
		{
			"label": _("Quantity"),
			"fieldtype": "Float",
			"fieldname": "quantity",
			"width": 120,
		},

		{
			"label": _("Transaction Date"),
			"fieldtype": "Date",
			"fieldname": "transaction_date",
			"width": 110,
		},
		{
			"label": _("UOM"),
			"fieldtype": "Link",
			"fieldname": "uom",
			"options": "UOM",
			"width": 90,
		},
		{
			"label": _("Rate"),
			"fieldname": "rate",
			"fieldtype": "Currency",
			"options": "currency",
			"width": 120,
		},
		{
			"label": _("Company"),
			"fieldtype": "Link",
			"fieldname": "company",
			"options": "Company",
			"width": 100,
		},
		{
			"label": _("City"),
			"fieldtype": "Data",
			"fieldname": "city",
			"width": 120,
		},
		{
			"label": _("State"),
			"fieldtype": "Data",
			"fieldname": "state",
			"width": 120,
		},
		
		
	]


def get_data(filters):
	data = []

	company_list = get_descendants_of("Company", filters.get("company"))
	company_list.append(filters.get("company"))

	supplier_details = get_supplier_details()
	item_details = get_item_details()
	purchase_order_records = get_purchase_order_details(company_list, filters)

	for record in purchase_order_records:
		supplier_record = supplier_details.get(record.supplier)
		item_record = item_details.get(record.item_code)
		row = {
			"item_code": record.get("item_code"),
			"item_name": item_record.get("item_name"),
			"quantity": record.get("qty"),
			"uom": record.get("uom"),
			"rate": record.get("base_rate"),
			"amount": record.get("base_amount"),
			"purchase_order": record.get("name"),
			"transaction_date": record.get("transaction_date"),
			"supplier": record.get("supplier"),
			"supplier_name": supplier_record.get("supplier_name"),
			"company": record.get("company"),
			"city": record.get("city"),
			"state": record.get("state"),
		}
		data.append(row)

	return data


def get_supplier_details():
	details = frappe.get_all("Supplier", fields=["name", "supplier_name"])
	supplier_details = {}
	for d in details:
		supplier_details.setdefault(
			d.name,
			frappe._dict({"supplier_name": d.supplier_name}),
		)
	return supplier_details


def get_item_details():
	details = frappe.db.get_all("Item", fields=["name", "item_name"])
	item_details = {}
	for d in details:
		item_details.setdefault(d.name, frappe._dict({"item_name": d.item_name}))
	return item_details


def get_purchase_order_details(company_list, filters):
	db_po = frappe.qb.DocType("Purchase Order")
	db_po_item = frappe.qb.DocType("Purchase Order Item")
	db_address = frappe.qb.DocType("Address")

	query = (
		frappe.qb.from_(db_po)
		.inner_join(db_po_item)
		.on(db_po_item.parent == db_po.name)
		.left_join(db_address)
		.on(db_po.supplier_address == db_address.name) 
		.select(
			db_po.name,
			db_po.supplier,
			db_po.transaction_date,
			db_po.company,
			db_address.city, 
			db_address.state,
			db_po_item.item_code,
			db_po_item.qty,
			db_po_item.uom,
			db_po_item.base_rate,
			db_po_item.base_amount,
		)
		.where(db_po.docstatus == 1)
		.where(db_po.company.isin(tuple(company_list)))
	)

	for field in ("item_code"):
		if filters.get(field):
			query = query.where(db_po_item[field] == filters[field])

	if filters.get("from_date"):
		query = query.where(db_po.transaction_date >= filters.from_date)

	if filters.get("to_date"):
		query = query.where(db_po.transaction_date <= filters.to_date)

	if filters.get("supplier"):
		query = query.where(db_po.supplier == filters.supplier)

	if filters.get("state"):
		query = query.where(db_address.state == filters.state) 
	
	if filters.get("city"):
		query = query.where(db_address.city == filters.city)

	return query.run(as_dict=1)


