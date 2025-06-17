frappe.ui.form.on('Employee', {
    custom_document_template(frm) {
        if (frm.doc.custom_document_template) {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Employee Document Template',
                    name: frm.doc.custom_document_template
                },
                callback(r) {
                    if (r.message && r.message.documents) {
                        frm.clear_table('custom_employee_documents');
                        (r.message.documents || []).forEach(doc => {
                            let row = frm.add_child('custom_employee_documents');
                            row.document = doc.document;
                            row.required = doc.required;
                        });
                        frm.refresh_field('custom_employee_documents');
                    }
                }
            });
        }
    }
});


frappe.ui.form.on('Employee', {
    refresh(frm) {
        if (frm.doc.custom_employee_documents && frm.doc.custom_employee_documents.length > 0) {
            let required = 0;
            let pending = 0;
            let missing_docs = [];

            frm.doc.custom_employee_documents.forEach(row => {
                if (row.required) {
                    required++;
                    if (!row.attachment) {
                        pending++;
                        missing_docs.push(row.document);
                    }
                }
            });

            frm.dashboard.clear_headline();

            if (required === 0) {
                frm.dashboard.set_headline(`
                    <div style="background: #f1f5f9; padding: 10px 15px; border-radius: 6px; font-size: 13px; color: #64748b;">
                        No required documents configured.
                    </div>
                `);
            } else if (pending === 0) {
                frm.dashboard.set_headline(`
                    <div style="background: #ecfdf5; padding: 10px 15px; border-radius: 6px; font-size: 13px; color: #047857; font-weight: 500;">
                        ✅ All ${required} required documents have been uploaded.
                    </div>
                `);
            } else {
                let doc_list_html = missing_docs.map(doc =>
                    `<li style="margin-bottom: 2px;">${doc}</li>`
                ).join("");

                frm.dashboard.set_headline(`
                    <div style="
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        padding: 16px 18px;
                        font-family: system-ui, sans-serif;
                        font-size: 13px;
                        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.03);
                        position: relative;
                    ">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <div style="
                                background: #dc2626;
                                color: white;
                                width: 30px;
                                height: 30px;
                                border-radius: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 14px;
                                margin-right: 12px;
                            ">📋</div>
                            <div>
                                <div style="font-weight: 600; color: #1a202c;">Document Alert</div>
                                <div style="color: #e53e3e; font-weight: 500;">${pending} of ${required} required documents missing</div>
                            </div>
                        </div>
                        <div style="color: #4a5568; margin-bottom: 8px;">
                            Please upload the following documents in the <strong>"Employee Documents"</strong> section:
                        </div>
                        <div style="
                            background: #fee2e2;
                            border: 1px solid #fecaca;
                            border-radius: 8px;
                            padding: 10px 14px;
                        ">
                            <ul style="
                                padding-left: 20px;
                                margin: 0;
                                color: #b91c1c;
                                font-weight: 600;
                                font-size: 13px;
                                line-height: 1.6;
                            ">
                                ${doc_list_html}
                            </ul>
                        </div>
                    </div>
                `);
            }
        }
    }
});
