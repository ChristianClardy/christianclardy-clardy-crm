import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { qbCall, qbStatus } from "@/lib/quickbooks";
import { createPageUrl } from "@/utils";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const BUCKETS = [
  ["current", "Not yet due", "text-slate-900"],
  ["d1_30", "1–30 days late", "text-amber-700"],
  ["d31_60", "31–60 days", "text-orange-700"],
  ["d61_90", "61–90 days", "text-rose-600"],
  ["d90_plus", "90+ days", "text-rose-700"],
];

// Accounts receivable aging straight from QuickBooks' open invoices
// (Finance dashboard). Hidden when QuickBooks isn't connected.
export default function QbArAging() {
  const [state, setState] = useState({ loading: true });

  const load = async () => {
    setState({ loading: true });
    const s = await qbStatus();
    if (!s.connected) { setState({ hidden: true }); return; }
    try {
      setState({ data: await qbCall("ar-aging") });
    } catch (err) {
      setState({ error: err.message });
    }
  };
  useEffect(() => { load(); }, []);

  if (state.hidden) return null;
  const d = state.data;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Accounts receivable (QuickBooks)</h3>
          <p className="text-xs text-slate-500">Every open invoice in QuickBooks, by how late it is.</p>
        </div>
        <button type="button" onClick={load} className="p-1.5 rounded text-slate-400 hover:text-slate-700" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {state.loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
      ) : state.error ? (
        <p className="text-sm text-rose-600">{state.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl bg-slate-900 text-white p-3">
              <p className="text-xs text-slate-300">Total owed</p>
              <p className="text-lg font-bold">{fmt(d.total)}</p>
            </div>
            {BUCKETS.map(([k, label, tone]) => (
              <div key={k} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-lg font-bold ${d.buckets[k] ? tone : "text-slate-300"}`}>{fmt(d.buckets[k])}</p>
              </div>
            ))}
          </div>
          {d.invoices.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3">Customer / job</th><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Due</th><th className="py-2 pr-3 text-right">Days late</th><th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {d.invoices.slice(0, 15).map((inv) => (
                    <tr key={inv.qb_invoice_id} className="border-b border-slate-50">
                      <td className="py-2 pr-3">
                        {inv.project_id
                          ? <Link to={createPageUrl(`ProjectDetail?id=${inv.project_id}&tab=cashflow`)} className="text-slate-900 hover:underline">{inv.customer}</Link>
                          : <span className="text-slate-700">{inv.customer}</span>}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{inv.doc_number || inv.qb_invoice_id}</td>
                      <td className="py-2 pr-3 text-slate-500">{inv.due_date || "—"}</td>
                      <td className={`py-2 pr-3 text-right ${inv.days_late > 30 ? "text-rose-600 font-semibold" : inv.days_late > 0 ? "text-amber-700" : "text-slate-400"}`}>{inv.days_late || "—"}</td>
                      <td className="py-2 text-right font-semibold text-slate-900">{fmt(inv.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.invoices.length > 15 && <p className="text-xs text-slate-400 mt-2">Showing the 15 most overdue of {d.invoices.length}.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
