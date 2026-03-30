import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Send, Trash2 } from "lucide-react";
import InvoicePreviewCard from "@/components/payments/InvoicePreviewCard";
import InvoicePdfDownloadButton from "@/components/payments/InvoicePdfDownloadButton";
import { getInvoiceBranding } from "@/components/payments/invoiceBrandingUtils";

const statusStyles = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-700",
  Partial: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Overdue: "bg-rose-100 text-rose-700",
};

export default function InvoicesTable({ invoices, projectMap, clientMap, companyMap, onEdit, onMarkSent, onDelete }) {
  const getInvoicePdfTargetId = (invoiceId) => `invoice-preview-${invoiceId}`;
  const previewInvoice = invoices[0];
  const previewProject = previewInvoice ? projectMap[previewInvoice.linked_job_id] : null;
  const previewClient = previewProject ? clientMap[previewProject.client_id] : null;
  const previewCompany = previewProject ? companyMap[previewProject.company_id] : null;
  const previewBranding = getInvoiceBranding(previewCompany);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Invoices</h2>
        <p className="mt-1 text-sm text-slate-500">Create invoices now and send them by external email later.</p>
      </div>

      {invoices.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <p className="font-medium">No invoices yet</p>
          <p className="mt-1 text-sm">Create invoices from the Payments page.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 w-28" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const project = projectMap[invoice.linked_job_id];
                  const client = project ? clientMap[project.client_id] : null;

                  const company = project ? companyMap[project.company_id] : null;
                  const branding = getInvoiceBranding(company);

                  return (
                    <tbody key={invoice.id}>
                    <tr className="border-b border-slate-100 hover:bg-amber-50/30">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{invoice.invoice_name}</p>
                        <p className="text-xs text-slate-400">{invoice.invoice_id || "—"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{project?.name || "—"}</td>
                      <td className="px-5 py-4 text-slate-600">{client?.name || "—"}</td>
                      <td className="px-5 py-4 text-slate-600">{invoice.invoice_type || "Other"}</td>
                      <td className="px-5 py-4 text-slate-600">{invoice.due_date || "—"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-900">${Number(invoice.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-5 py-4"><Badge className={statusStyles[invoice.invoice_status] || statusStyles.Draft}>{invoice.invoice_status || "Draft"}</Badge></td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <InvoicePdfDownloadButton
                            targetId={getInvoicePdfTargetId(invoice.id)}
                            fileName={(invoice.invoice_name || "invoice").replace(/\s+/g, "-").toLowerCase()}
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => onEdit(invoice)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={() => onMarkSent(invoice)}>
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => onDelete(invoice)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    <tr className="hidden">
                      <td colSpan={8} className="p-0">
                        <div className="p-6 bg-white">
                          <InvoicePreviewCard
                            id={getInvoicePdfTargetId(invoice.id)}
                            branding={branding}
                            companyName={branding.company_name}
                            invoiceName={invoice.invoice_name}
                            projectName={project?.name}
                            clientName={client?.name}
                            amount={invoice.amount}
                            dueDate={invoice.due_date}
                            scopeText={invoice.notes}
                          />
                        </div>
                      </td>
                    </tr>
                    </tbody>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">Invoice Preview</p>
            <InvoicePreviewCard
              id={getInvoicePdfTargetId(previewInvoice.id)}
              branding={previewBranding}
              companyName={previewBranding.company_name}
              invoiceName={previewInvoice.invoice_name}
              projectName={previewProject?.name}
              clientName={previewClient?.name}
              amount={previewInvoice.amount}
              dueDate={previewInvoice.due_date}
              scopeText={previewInvoice.notes}
            />
          </div>
        </>
      )}
    </div>
  );
}