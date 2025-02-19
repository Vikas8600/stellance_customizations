import frappe
from frappe.query_builder.functions import CombineDatetime, Sum
from frappe.utils import (
	nowtime,
	today,
	flt,
)
def custom_get_available_batches(kwargs):
	stock_ledger_entry = frappe.qb.DocType("Stock Ledger Entry")
	batch_ledger = frappe.qb.DocType("Serial and Batch Entry")
	batch_table = frappe.qb.DocType("Batch")

	query = (
		frappe.qb.from_(stock_ledger_entry)
		.inner_join(batch_ledger)
		.on(stock_ledger_entry.serial_and_batch_bundle == batch_ledger.parent)
		.inner_join(batch_table)
		.on(batch_ledger.batch_no == batch_table.name)
		.select(
			batch_ledger.batch_no,
			batch_ledger.warehouse,
			Sum(batch_ledger.qty).as_("qty"),
			stock_ledger_entry.packs,
			stock_ledger_entry.name,
		)
		.where(
			(batch_table.disabled == 0)
			& ((batch_table.expiry_date >= today()) | (batch_table.expiry_date.isnull()))
		)
		.where(stock_ledger_entry.is_cancelled == 0)
		.groupby(batch_ledger.batch_no, batch_ledger.warehouse)
	)

	if kwargs.get("posting_date"):
		if kwargs.get("posting_time") is None:
			kwargs.posting_time = nowtime()

		timestamp_condition = CombineDatetime(
			stock_ledger_entry.posting_date, stock_ledger_entry.posting_time
		) <= CombineDatetime(kwargs.posting_date, kwargs.posting_time)

		query = query.where(timestamp_condition)

	for field in ["warehouse", "item_code"]:
		if not kwargs.get(field):
			continue

		if isinstance(kwargs.get(field), list):
			query = query.where(stock_ledger_entry[field].isin(kwargs.get(field)))
		else:
			query = query.where(stock_ledger_entry[field] == kwargs.get(field))

	if kwargs.get("batch_no"):
		if isinstance(kwargs.batch_no, list):
			query = query.where(batch_ledger.batch_no.isin(kwargs.batch_no))
		else:
			query = query.where(batch_ledger.batch_no == kwargs.batch_no)

	if kwargs.based_on == "LIFO":
		query = query.orderby(batch_table.creation, order=frappe.qb.desc)
	elif kwargs.based_on == "Expiry":
		query = query.orderby(batch_table.expiry_date)
	else:
		query = query.orderby(batch_table.creation)

	if kwargs.get("ignore_voucher_nos"):
		query = query.where(stock_ledger_entry.voucher_no.notin(kwargs.get("ignore_voucher_nos")))

	data = query.run(as_dict=True)

	return data

def custom_get_qty_based_available_batches(available_batches, qty):
	return available_batches
	batches = []
	for batch in available_batches:
		if qty <= 0:
			break

		batch_qty = flt(batch.qty)
		if qty > batch_qty:
			batches.append(
				frappe._dict(
					{
						"batch_no": batch.batch_no,
						"qty": batch_qty,
						"warehouse": batch.warehouse,
						"packs": batch.packs,
						"name": batch.name
					}
				)
			)
			qty -= batch_qty
		else:
			batches.append(
				frappe._dict(
					{
						"batch_no": batch.batch_no,
						"qty": qty,
						"warehouse": batch.warehouse,
                        "packs": batch.packs,
                        "name": batch.name
					}
				)
			)
			qty = 0

	return batches


def validate_actual_qty(self, doc):
    pass
