import { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, TrendingUp, FileBarChart2, Shield, DollarSign,
  ArrowDownRight, ArrowUpRight, AlertTriangle, ShieldAlert, ShieldCheck,
  CheckCircle2, Clock, ChevronRight, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n) {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return num < 0
    ? `-$${Math.abs(num).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function today() { return new Date().toISOString().split("T")[0]; }

function daysPastDue(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((new Date(today()) - new Date(dateStr)) / 86400000);
  return diff > 0 ? diff : null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const TABS = [
  { key: "overview",   label: "Overview",         icon: LayoutDashboard },
  { key: "wip",        label: "WIP",               icon: FileBarChart2 },
  { key: "ap_aging",   label: "AP Aging",          icon: Clock },
  { key: "lien",       label: "Lien Exposure",     icon: Shield },
  { key: "retainage",  label: "Retainage",         icon: DollarSign },
  { key: "cashflow",   label: "Cash Flow",         icon: TrendingUp },
  { key: "draws",      label: "Draws Outstanding", icon: ArrowDownRight },
];

// ── KPI card ───────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = "text-slate-800", alert = false }) {
  return (
    <div className={cn("bg-white border rounded-2xl p-4 shadow-sm", alert ? "border-rose-200 bg-rose-50" : "border-slate-200")}>
      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Project link chip ──────────────────────────────────────────────────────────
function ProjectLink({ project, navigate }) {
  return (
    <button
      className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-0.5 font-medium"
      onClick={() => navigate(createPageUrl("ProjectDetail") + `?id=${project.id}`)}
    >
      {project.name} <ExternalLink className="w-3 h-3" />
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FinanceDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [projects, setProjects]       = useState([]);
  const [draws, setDraws]             = useState([]);
  const [subInvoices, setSubInvoices] = useState([]);
  const [payments, setPayments]       = useState([]);
  const [invoices, setInvoices]       = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [p, d, si, pay, inv] = await Promise.all([
        base44.entities.Project.list("-updated_at", 2000),
        base44.entities.Draw.list("-created_at", 2000),
        base44.entities.SubInvoice.list("-created_at", 2000).catch(() => []),
        base44.entities.Payment.list("-payment_date", 2000),
        base44.entities.Invoice.list("-due_date", 2000),
      ]);
      setProjects(p);
      setDraws(d);
      setSubInvoices(si);
      setPayments(pay);
      setInvoices(inv);
    } catch (e) {
      console.error("Finance load error", e);
    }
    setLoading(false);
  };

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );

  // ── Overview metrics ─────────────────────────────────────────────────────────
  const activeProjects = projects.filter((p) => !["completed","cancelled"].includes(p.status));
  const totalContract  = activeProjects.reduce((s, p) => s + (p.contract_value || 0), 0);
  const totalBilled    = activeProjects.reduce((s, p) => s + (p.billed_to_date || 0), 0);
  const totalCosts     = activeProjects.reduce((s, p) => s + (p.costs_to_date || 0), 0);
  const totalRemaining = totalContract - totalBilled;
  const projectedProfit = activeProjects.reduce((s, p) => {
    const contract = p.contract_value || 0;
    const costs    = p.costs_to_date  || 0;
    const budget   = (p.original_costs || 0) + (p.amendment_costs || 0);
    const pct      = (p.percent_complete || 0) / 100;
    const ctc      = pct > 0 ? Math.max(0, budget - costs) : budget;
    return s + (contract - costs - ctc);
  }, 0);

  const totalRetainage = draws.reduce(
    (s, d) => s + (d.retainage_released ? 0 : (d.retainage_held || 0)), 0
  );
  const totalAPOutstanding = subInvoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + (i.amount || 0), 0);
  const lienExposureCount = subInvoices.filter(
    (i) => i.status !== "paid" && i.lien_waiver_status === "none"
  ).length;

  // ── WIP ─────────────────────────────────────────────────────────────────────
  const wipRows = useMemo(() => activeProjects.map((p) => {
    const budget   = (p.original_costs || 0) + (p.amendment_costs || 0);
    const actual   = p.costs_to_date || 0;
    const contract = p.contract_value || 0;
    const pct      = p.percent_complete || 0;
    const ctc      = pct > 0 ? Math.max(0, budget - actual) : budget;
    const projProfit = contract - actual - ctc;
    const margin   = contract > 0 ? (projProfit / contract) * 100 : 0;
    return { ...p, budget, actual, ctc, projProfit, margin, pct };
  }).sort((a, b) => Math.abs(b.projProfit) - Math.abs(a.projProfit)), [activeProjects]);

  // ── AP Aging ─────────────────────────────────────────────────────────────────
  const apAging = useMemo(() => {
    const buckets = { current: [], d30: [], d60: [], d90: [], over90: [] };
    for (const inv of subInvoices) {
      if (inv.status === "paid") continue;
      const days = daysPastDue(inv.due_date);
      if (!days || days <= 0)   buckets.current.push(inv);
      else if (days <= 30)      buckets.d30.push(inv);
      else if (days <= 60)      buckets.d60.push(inv);
      else if (days <= 90)      buckets.d90.push(inv);
      else                      buckets.over90.push(inv);
    }
    return buckets;
  }, [subInvoices]);

  const apAgingTotal = (arr) => arr.reduce((s, i) => s + (i.amount || 0), 0);

  // ── Lien Exposure ────────────────────────────────────────────────────────────
  const lienRows = useMemo(() => {
    const byJob = {};
    for (const inv of subInvoices) {
      if (inv.status === "paid" || inv.lien_waiver_status !== "none") continue;
      if (!byJob[inv.project_id]) byJob[inv.project_id] = { invoices: [], total: 0 };
      byJob[inv.project_id].invoices.push(inv);
      byJob[inv.project_id].total += inv.amount || 0;
    }
    return Object.entries(byJob)
      .map(([pid, data]) => ({ project: projectMap[pid], ...data }))
      .filter((r) => r.project)
      .sort((a, b) => b.total - a.total);
  }, [subInvoices, projectMap]);

  // ── Retainage ────────────────────────────────────────────────────────────────
  const retainageRows = useMemo(() => {
    const byJob = {};
    for (const d of draws) {
      if (!d.retainage_held || d.retainage_released) continue;
      if (!byJob[d.project_id]) byJob[d.project_id] = { held: 0, draws: [] };
      byJob[d.project_id].held  += d.retainage_held;
      byJob[d.project_id].draws.push(d);
    }
    return Object.entries(byJob)
      .map(([pid, data]) => ({ project: projectMap[pid], ...data }))
      .filter((r) => r.project)
      .sort((a, b) => b.held - a.held);
  }, [draws, projectMap]);

  // ── Cash Flow Forecast (90 days, all jobs) ───────────────────────────────────
  const cashEvents = useMemo(() => {
    const t = today();
    const horizon = addDays(t, 90);
    const events = [];
    for (const d of draws) {
      if (d.status === "paid") continue;
      const date = d.due_date;
      if (!date || date < t || date > horizon) continue;
      const net = (d.amount || 0) - (d.retainage_released ? 0 : (d.retainage_held || 0));
      const proj = projectMap[d.project_id];
      events.push({ date, label: `${proj?.name || "Job"} — ${d.title || `Draw #${d.draw_number}`}`, amount: net, type: "inflow" });
    }
    for (const inv of subInvoices) {
      if (inv.status === "paid") continue;
      const date = inv.due_date;
      if (!date || date < t || date > horizon) continue;
      const proj = projectMap[inv.project_id];
      events.push({ date, label: `${proj?.name || "Job"} — ${inv.vendor_name || "Vendor"} (${inv.cost_code || "AP"})`, amount: inv.amount || 0, type: "outflow" });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return events.map((ev) => {
      running += ev.type === "inflow" ? ev.amount : -ev.amount;
      return { ...ev, running };
    });
  }, [draws, subInvoices, projectMap]);

  const cashInflows  = cashEvents.filter((e) => e.type === "inflow").reduce((s, e)  => s + e.amount, 0);
  const cashOutflows = cashEvents.filter((e) => e.type === "outflow").reduce((s, e) => s + e.amount, 0);

  // ── Draws Outstanding ────────────────────────────────────────────────────────
  const outstandingDraws = useMemo(() =>
    draws
      .filter((d) => ["pending","submitted","approved"].includes(d.status))
      .map((d) => ({ ...d, project: projectMap[d.project_id] }))
      .filter((d) => d.project)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
    [draws, projectMap]
  );

  const drawStatusColor = { pending: "bg-slate-100 text-slate-600", submitted: "bg-blue-100 text-blue-700", approved: "bg-amber-100 text-amber-700" };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-8 h-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Finance</h1>
        <p className="mt-1 text-slate-500">Company-wide financial position across all active jobs.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              tab === key
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KPI label="Active Jobs"            value={activeProjects.length}             color="text-slate-800" />
            <KPI label="Total Contract Value"   value={fmt(totalContract)}                color="text-slate-800" />
            <KPI label="Billed to Date"         value={fmt(totalBilled)}                  color="text-emerald-600" />
            <KPI label="Remaining to Bill"      value={fmt(totalRemaining)}               color="text-amber-600" />
            <KPI label="Costs to Date"          value={fmt(totalCosts)}                   color="text-blue-600" />
            <KPI label="Projected Profit"       value={fmt(projectedProfit)}              color={projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600"} />
            <KPI label="Retainage Withheld"     value={fmt(totalRetainage)}               color="text-orange-600" sub="Earned but not collected" />
            <KPI label="AP Outstanding"         value={fmt(totalAPOutstanding)}           color="text-rose-600"
              alert={lienExposureCount > 0} sub={lienExposureCount > 0 ? `${lienExposureCount} invoices with lien exposure` : undefined} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Top jobs by remaining balance */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Remaining Balance by Job</h3>
              <div className="space-y-2">
                {projects.filter((p) => (p.remaining_balance || (p.contract_value - p.billed_to_date)) > 0)
                  .sort((a, b) => ((b.contract_value - b.billed_to_date) - (a.contract_value - a.billed_to_date)))
                  .slice(0, 8).map((p) => {
                    const rem = (p.contract_value || 0) - (p.billed_to_date || 0);
                    return (
                      <div key={p.id} className="flex items-center justify-between py-1.5">
                        <ProjectLink project={p} navigate={navigate} />
                        <span className="font-semibold text-slate-800 text-sm">{fmt(rem)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Projected margin by job */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Projected Margin by Job</h3>
              <div className="space-y-2">
                {wipRows.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <ProjectLink project={p} navigate={navigate} />
                    </div>
                    <span className={cn("text-sm font-semibold w-16 text-right", p.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {p.margin.toFixed(1)}%
                    </span>
                    <span className={cn("text-sm font-semibold w-20 text-right", p.projProfit >= 0 ? "text-slate-800" : "text-rose-600")}>
                      {fmt(p.projProfit)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── WIP ───────────────────────────────────────────────────────────────── */}
      {tab === "wip" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Work in Progress — All Active Jobs</h3>
            <p className="text-xs text-slate-400 mt-0.5">Budget vs. actual costs and projected margin per job.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-3">Job</th>
                  <th className="text-right px-4 py-3">Contract</th>
                  <th className="text-right px-4 py-3">Budget</th>
                  <th className="text-right px-4 py-3">Actual Cost</th>
                  <th className="text-right px-4 py-3">Cost to Complete</th>
                  <th className="text-right px-4 py-3">Proj. Profit</th>
                  <th className="text-right px-4 py-3">Margin</th>
                  <th className="text-center px-4 py-3">% Done</th>
                </tr>
              </thead>
              <tbody>
                {wipRows.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-amber-50 cursor-pointer"
                    onClick={() => navigate(createPageUrl("ProjectDetail") + `?id=${p.id}&tab=financials`)}>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(p.contract_value)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmt(p.budget)}</td>
                    <td className="px-4 py-3 text-right text-blue-700 font-medium">{fmt(p.actual)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmt(p.ctc)}</td>
                    <td className={cn("px-4 py-3 text-right font-semibold", p.projProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmt(p.projProfit)}</td>
                    <td className={cn("px-4 py-3 text-right font-semibold", p.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>{p.margin.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, p.pct)}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-8 text-right">{p.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                  <td className="px-4 py-3 text-slate-700">Totals</td>
                  <td className="px-4 py-3 text-right text-slate-800">{fmt(wipRows.reduce((s, p) => s + p.contract_value, 0))}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(wipRows.reduce((s, p) => s + p.budget, 0))}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{fmt(wipRows.reduce((s, p) => s + p.actual, 0))}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmt(wipRows.reduce((s, p) => s + p.ctc, 0))}</td>
                  <td className={cn("px-4 py-3 text-right", projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmt(projectedProfit)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── AP AGING ──────────────────────────────────────────────────────────── */}
      {tab === "ap_aging" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Current",   arr: apAging.current, color: "text-slate-700" },
              { label: "1–30 days", arr: apAging.d30,     color: "text-amber-600" },
              { label: "31–60 days",arr: apAging.d60,     color: "text-orange-600" },
              { label: "61–90 days",arr: apAging.d90,     color: "text-rose-600" },
              { label: "90+ days",  arr: apAging.over90,  color: "text-rose-700" },
            ].map(({ label, arr, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                <p className={cn("text-xl font-bold", color)}>{fmt(apAgingTotal(arr))}</p>
                <p className="text-xs text-slate-400">{arr.length} invoice{arr.length !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>

          {[
            { label: "90+ Days Past Due", arr: apAging.over90, headerColor: "bg-rose-700" },
            { label: "61–90 Days Past Due", arr: apAging.d90, headerColor: "bg-rose-600" },
            { label: "31–60 Days Past Due", arr: apAging.d60, headerColor: "bg-orange-500" },
            { label: "1–30 Days Past Due",  arr: apAging.d30, headerColor: "bg-amber-500" },
            { label: "Current",             arr: apAging.current, headerColor: "bg-slate-600" },
          ].filter((b) => b.arr.length > 0).map((bucket) => (
            <div key={bucket.label} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className={cn("px-5 py-2.5 text-white text-sm font-semibold", bucket.headerColor)}>
                {bucket.label} — {fmt(apAgingTotal(bucket.arr))}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-2">Job</th>
                    <th className="text-left px-4 py-2">Vendor</th>
                    <th className="text-left px-4 py-2">Trade</th>
                    <th className="text-right px-4 py-2">Amount</th>
                    <th className="text-left px-4 py-2">Due</th>
                    <th className="text-center px-4 py-2">Lien Waiver</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.arr.map((inv) => {
                    const proj = projectMap[inv.project_id];
                    const lienOk = inv.lien_waiver_status === "partial" || inv.lien_waiver_status === "final";
                    return (
                      <tr key={inv.id} className="border-b border-slate-50 hover:bg-amber-50">
                        <td className="px-4 py-2">{proj ? <ProjectLink project={proj} navigate={navigate} /> : "—"}</td>
                        <td className="px-4 py-2 text-slate-700 font-medium">{inv.vendor_name || "—"}</td>
                        <td className="px-4 py-2">
                          {inv.cost_code ? <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{inv.cost_code}</span> : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(inv.amount)}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{inv.due_date || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          {lienOk
                            ? <span className="text-emerald-600 text-xs flex items-center justify-center gap-1"><ShieldCheck className="w-3 h-3" />{inv.lien_waiver_status}</span>
                            : <span className="text-rose-600 text-xs flex items-center justify-center gap-1"><ShieldAlert className="w-3 h-3" />None</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {subInvoices.filter((i) => i.status !== "paid").length === 0 && (
            <div className="text-center text-slate-400 py-16">No outstanding AP invoices.</div>
          )}
        </div>
      )}

      {/* ── LIEN EXPOSURE ─────────────────────────────────────────────────────── */}
      {tab === "lien" && (
        <div className="space-y-4">
          {lienRows.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-12 text-center">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
              <p className="font-semibold text-emerald-700">No lien exposure</p>
              <p className="text-sm text-emerald-600 mt-1">All unpaid invoices have a waiver on file.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                <p className="text-sm text-rose-700 font-medium">
                  {lienRows.reduce((s, r) => s + r.invoices.length, 0)} unpaid invoices across {lienRows.length} jobs have no lien waiver — total exposure {fmt(lienRows.reduce((s, r) => s + r.total, 0))}.
                </p>
              </div>
              {lienRows.map((row) => (
                <div key={row.project.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <ProjectLink project={row.project} navigate={navigate} />
                    <span className="font-bold text-rose-600 text-sm">{fmt(row.total)} at risk</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <th className="text-left px-4 py-2">Vendor</th>
                        <th className="text-left px-4 py-2">Trade</th>
                        <th className="text-right px-4 py-2">Amount</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-left px-4 py-2">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-slate-50 hover:bg-rose-50">
                          <td className="px-4 py-2 font-medium text-slate-800">{inv.vendor_name || "—"}</td>
                          <td className="px-4 py-2">
                            {inv.cost_code ? <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{inv.cost_code}</span> : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(inv.amount)}</td>
                          <td className="px-4 py-2 text-xs capitalize text-slate-500">{inv.status}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{inv.due_date || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── RETAINAGE ─────────────────────────────────────────────────────────── */}
      {tab === "retainage" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KPI label="Total Withheld" value={fmt(retainageRows.reduce((s, r) => s + r.held, 0))} color="text-orange-600" sub="Earned but not yet collectible" />
            <KPI label="Jobs with Retainage" value={retainageRows.length} color="text-slate-800" />
            <KPI label="Released This Portfolio" value={fmt(draws.filter((d) => d.retainage_released).reduce((s, d) => s + (d.retainage_held || 0), 0))} color="text-emerald-600" />
          </div>

          {retainageRows.length === 0 ? (
            <div className="text-center text-slate-400 py-16">No retainage withheld across active jobs.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-3">Job</th>
                    <th className="text-right px-4 py-3">Retainage Held</th>
                    <th className="text-right px-4 py-3">Contract Value</th>
                    <th className="text-right px-4 py-3">% of Contract</th>
                    <th className="text-right px-4 py-3">Draws w/ Retainage</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {retainageRows.map((row) => {
                    const contract = row.project.contract_value || 0;
                    const pct = contract > 0 ? (row.held / contract) * 100 : 0;
                    return (
                      <tr key={row.project.id} className="border-b border-slate-50 hover:bg-amber-50 cursor-pointer"
                        onClick={() => navigate(createPageUrl("ProjectDetail") + `?id=${row.project.id}&tab=cashflow`)}>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.project.name}</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">{fmt(row.held)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{fmt(contract)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right text-slate-500">{row.draws.length}</td>
                        <td className="px-4 py-3 text-slate-400"><ChevronRight className="w-4 h-4" /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td className="px-4 py-3 text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-orange-600">{fmt(retainageRows.reduce((s, r) => s + r.held, 0))}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CASH FLOW ─────────────────────────────────────────────────────────── */}
      {tab === "cashflow" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-emerald-600 mb-1">Expected Inflows (90 days)</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(cashInflows)}</p>
              <p className="text-xs text-slate-400 mt-1">Scheduled draws across all jobs</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <p className="text-xs text-rose-600 mb-1">Expected Outflows (90 days)</p>
              <p className="text-xl font-bold text-rose-700">{fmt(cashOutflows)}</p>
              <p className="text-xs text-slate-400 mt-1">AP invoices due across all jobs</p>
            </div>
            <div className={cn("border rounded-xl p-4", (cashInflows - cashOutflows) >= 0 ? "bg-slate-50 border-slate-200" : "bg-rose-50 border-rose-200")}>
              <p className="text-xs text-slate-500 mb-1">Net Cash Position</p>
              <p className={cn("text-xl font-bold", (cashInflows - cashOutflows) >= 0 ? "text-slate-800" : "text-rose-700")}>{fmt(cashInflows - cashOutflows)}</p>
              <p className="text-xs text-slate-400 mt-1">Inflows minus outflows</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">90-Day Cash Flow Timeline — All Jobs</h3>
            </div>
            {cashEvents.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No upcoming cash events in the next 90 days.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Description</th>
                      <th className="text-center px-4 py-3">Type</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-right px-4 py-3">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashEvents.map((ev, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{ev.date}</td>
                        <td className="px-4 py-2.5 text-slate-700">{ev.label}</td>
                        <td className="px-4 py-2.5 text-center">
                          {ev.type === "inflow"
                            ? <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs font-medium"><ArrowDownRight className="w-3.5 h-3.5" />Inflow</span>
                            : <span className="flex items-center justify-center gap-1 text-rose-600 text-xs font-medium"><ArrowUpRight className="w-3.5 h-3.5" />Outflow</span>}
                        </td>
                        <td className={cn("px-4 py-2.5 text-right font-semibold", ev.type === "inflow" ? "text-emerald-700" : "text-rose-700")}>
                          {ev.type === "inflow" ? "+" : "−"}{fmt(ev.amount)}
                        </td>
                        <td className={cn("px-4 py-2.5 text-right font-bold", ev.running >= 0 ? "text-slate-800" : "text-rose-600")}>
                          {fmt(ev.running)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DRAWS OUTSTANDING ─────────────────────────────────────────────────── */}
      {tab === "draws" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {["pending","submitted","approved"].map((s) => {
              const filtered = outstandingDraws.filter((d) => d.status === s);
              const total = filtered.reduce((sum, d) => sum + (d.amount || 0), 0);
              return (
                <div key={s} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 capitalize">{s}</p>
                  <p className="text-xl font-bold text-slate-800">{fmt(total)}</p>
                  <p className="text-xs text-slate-400">{filtered.length} draw{filtered.length !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">All Outstanding Draws</h3>
              <p className="text-xs text-slate-400 mt-0.5">Pending, submitted, and approved draws waiting on collection.</p>
            </div>
            {outstandingDraws.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p>No outstanding draws.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="text-left px-4 py-3">Job</th>
                      <th className="text-left px-4 py-3">Draw</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-right px-4 py-3">Net (after retainage)</th>
                      <th className="text-center px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingDraws.map((d) => {
                      const net = (d.amount || 0) - (d.retainage_released ? 0 : (d.retainage_held || 0));
                      return (
                        <tr key={d.id} className="border-b border-slate-50 hover:bg-amber-50 cursor-pointer"
                          onClick={() => navigate(createPageUrl("ProjectDetail") + `?id=${d.project.id}&tab=cashflow`)}>
                          <td className="px-4 py-3 font-medium text-slate-800">{d.project.name}</td>
                          <td className="px-4 py-3 text-slate-600">{d.title || `Draw #${d.draw_number}`}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(d.amount)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmt(net)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={cn("text-xs", drawStatusColor[d.status])}>{d.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{d.due_date || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-slate-700">Total Outstanding</td>
                      <td className="px-4 py-3 text-right text-slate-900">{fmt(outstandingDraws.reduce((s, d) => s + (d.amount || 0), 0))}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(outstandingDraws.reduce((s, d) => s + ((d.amount || 0) - (d.retainage_released ? 0 : (d.retainage_held || 0))), 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
