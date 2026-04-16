import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { Receipt } from "lucide-react";
import PaymentReceiptModal from "@/components/payments/PaymentReceiptModal";

export default function ReceivedPaymentsTable({ payments, projectMap, clientMap, companyMap = {} }) {
  const [receiptPayment, setReceiptPayment] = useState(null);

  const sortedPayments = [...payments].sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")));

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Recorded Payments</h2>
          <p className="mt-1 text-sm text-slate-500">Recorded payments will appear here.</p>
        </div>

        {sortedPayments.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="font-medium">No payment records found</p>
            <p className="mt-1 text-sm">No payments have been recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Notes</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedPayments.map((payment) => {
                  const project = projectMap[payment.linked_job_id];
                  const client = project ? clientMap[project.client_id] : null;

                  return (
                    <tr key={payment.acculynx_payment_id || payment.payment_id || payment.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                      <td className="px-5 py-4 text-slate-600">{payment.payment_date || "—"}</td>
                      <td className="px-5 py-4">
                        {project ? (
                          <Link to={createPageUrl(`ProjectDetail?id=${project.id}&tab=cashflow`)} className="font-medium text-amber-700 hover:text-amber-800">
                            {project.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{client?.name || "—"}</td>
                      <td className="px-5 py-4">
                        <Badge className="bg-slate-100 text-slate-700">{payment.payment_method || "Other"}</Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{payment.reference_number || "—"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-900">${Number(payment.amount_received || 0).toLocaleString()}</td>
                      <td className="px-5 py-4 text-slate-500">{payment.notes || "—"}</td>
                      <td className="px-5 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-amber-700"
                          title="View / Download Receipt"
                          onClick={() => setReceiptPayment(payment)}
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {receiptPayment && (
        <PaymentReceiptModal
          open={Boolean(receiptPayment)}
          onClose={() => setReceiptPayment(null)}
          payment={receiptPayment}
        />
      )}
    </>
  );
}
