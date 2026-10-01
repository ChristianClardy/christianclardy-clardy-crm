import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { qbCall, qbStatus } from "@/lib/quickbooks";

const fmt = (n) => `${Number(n) < 0 ? "-" : ""}$${Math.abs(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// QuickBooks' own profit & loss for this project's job (sub-customer), shown
// on the Job Cost tab next to Clardy's estimate-based numbers. Hidden when
// QuickBooks isn't connected.
export default function QbJobActuals({ projectId, contractValue = 0 }) {
  const [state, setState] = useState({ loading: true });

  const load = async () => {
    setState({ loading: true });
    const s = await qbStatus();
    if (!s.connected) { setState({ hidden: true }); return; }
    try {
      setState({ data: await qbCall("job-pnl", { project_id: projectId }) });
    } catch (err) {
      setState({ error: err.message });
    }
  };
  useEffect(() => { load(); }, [projectId]);

  if (state.hidden) return null;
  const d = state.data;
  const margin = d?.income ? (d.net_income / d.income) * 100 : null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">QuickBooks actuals for this job</p>
          <p className="text-xs text-slate-500">Everything booked to this job in QuickBooks: invoices, payments, bills and expenses coded to it.</p>
        </div>
        <button type="button" onClick={load} className="p-1.5 rounded text-slate-400 hover:text-slate-700" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {state.loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      ) : state.error ? (
        <p className="text-sm text-rose-600">{state.error}</p>
      ) : !d.linked ? (
        <p className="text-sm text-slate-600">This job isn't in QuickBooks yet. It's added automatically the first time you send an invoice, payment or sub bill for it.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Income" value={fmt(d.income)} sub={contractValue ? `${Math.round((d.income / contractValue) * 100)}% of contract billed` : null} />
          <Stat label="Job costs" value={fmt(d.total_costs)} sub={d.cost_of_goods_sold ? `${fmt(d.cost_of_goods_sold)} cost of goods` : null} />
          <Stat label="Profit" value={fmt(d.net_income)} tone={d.net_income < 0 ? "text-rose-600" : "text-emerald-700"} />
          <Stat label="Margin" value={margin == null ? "—" : `${margin.toFixed(1)}%`} tone={margin != null && margin < 0 ? "text-rose-600" : "text-slate-900"} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-slate-900" }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}
