import { useEffect, useMemo, useState } from "react";
import { Printer, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { rebuildFromEstimates, sectionTotals, isExtra } from "@/lib/jobCostFromEstimate";
import { mergeApInvoices, breakdownTotals } from "@/lib/apJobCost";
import { projectedProfit, PROFIT_BASIS_LABEL, approvedChangeOrderTotals } from "@/lib/projectProfit";

// Printable one-project overview (opened from a project's "Print overview"
// button, /ProjectReport?id=…): job details, contract and profit, the
// estimate's budget vs actual cost line by line (same numbers as the Job
// Cost tab), draws and payments, and change orders. Read-only: it never
// saves anything, so it works for Viewers. Money sections follow the role's
// permissions like the project page does.

const money = (n) => `${Number(n) < 0 ? "-" : ""}$${Math.abs(Math.round(Number(n) || 0)).toLocaleString("en-US")}`;
const date = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const pct = (n) => `${Math.round(Number(n) || 0)}%`;
const STATUS = { planning: "Planning", in_progress: "In Progress", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled" };
const label = (s) => (s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");

function linkedIds(project) {
  const raw = project?.linked_estimate_ids;
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw || "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function ProjectReport() {
  const id = new URLSearchParams(window.location.search).get("id");
  const { can } = useRolePermissions();
  const showCosts = can("job_costs");
  const showBilling = can("project_billing");
  const showMoney = showCosts || showBilling;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lines, setLines] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const project = await base44.entities.Project.get(id);
        const [client, company, changeOrders, draws, payments, breakdowns, invoices, estimates] = await Promise.all([
          project.client_id ? base44.entities.Client.get(project.client_id).catch(() => null) : null,
          project.company_id ? base44.entities.CompanyProfile.get(project.company_id).catch(() => null) : null,
          base44.entities.ChangeOrder.filter({ project_id: id }).catch(() => []),
          base44.entities.Draw.filter({ project_id: id }).catch(() => []),
          base44.entities.Payment.filter({ linked_job_id: id }).catch(() => []),
          base44.entities.JobCostBreakdown.filter({ project_id: id }).catch(() => []),
          base44.entities.SubInvoice.filter({ project_id: id }).catch(() => []),
          Promise.all(linkedIds(project).map((eid) => base44.entities.Estimate.get(eid).catch(() => null))),
        ]);
        const ests = estimates.filter(Boolean);
        const saved = breakdowns.find((b) => b.sections?.length);
        // Same breakdown the Job Cost tab shows: the saved one, or (before
        // that tab has been opened) built from the estimate. Never saved here.
        const base = saved?.sections?.length ? saved.sections : ests.length ? rebuildFromEstimates(ests, []) : [];
        const sections = mergeApInvoices(base, invoices).filter((s) => (s.items || []).length);
        setData({ project, client, company, changeOrders, draws, payments, sections, estimates: ests });
      } catch (err) {
        setError(err.message || "Could not load this project.");
      }
    })();
  }, [id]);

  const view = useMemo(() => {
    if (!data) return null;
    const { project, changeOrders, draws, payments, sections, estimates } = data;
    const approvedCOs = approvedChangeOrderTotals(changeOrders)[project.id] || 0;
    const contract = Number(project.contract_value) || 0;
    const revised = contract + approvedCOs;
    const profit = projectedProfit({ ...project, approved_change_orders_total: approvedCOs });
    const hasEstimate = estimates.length > 0;
    const totals = breakdownTotals(sections);
    const extras = sections.reduce((s, sec) => s + sectionTotals(sec, hasEstimate).extra, 0);
    const collected = payments.reduce((s, p) => s + (Number(p.amount_received) || 0), 0);
    return {
      approvedCOs, contract, revised, profit, hasEstimate, extras, collected,
      budget: totals.budgeted,
      actual: totals.actual,
      remainingBudget: totals.budgeted - totals.actual,
      spentPct: totals.budgeted ? (totals.actual / totals.budgeted) * 100 : 0,
      remaining: Math.max(revised - collected, 0),
      sortedDraws: [...draws].sort((a, b) => (a.draw_number || 0) - (b.draw_number || 0)),
      sortedPayments: [...payments].sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date))),
      sortedCOs: [...changeOrders].sort((a, b) => (a.number || 0) - (b.number || 0)),
    };
  }, [data]);

  if (error) return <div className="p-10 text-center text-rose-600">{error}</div>;
  if (!data || !view) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const { project, client, company, sections, estimates } = data;
  const title = client?.name || project.name;

  return (
    <div className="report min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          .report, .sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
          .report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .keep { break-inside: avoid; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
        .report table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .report th { text-align: left; font-weight: 600; color: #5a4f48; border-bottom: 1.5px solid #3d3530; padding: 5px 6px; }
        .report td { border-bottom: 1px solid #e7e1d9; padding: 4px 6px; vertical-align: top; }
        .report .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-800 mr-auto">Project overview · {title}</p>
        {showCosts && sections.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} /> Show line items
          </label>
        )}
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
        <button onClick={() => window.close()} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          <X className="w-4 h-4" /> Close
        </button>
      </div>

      <div className="sheet mx-auto my-6 max-w-[8.5in] bg-white p-8 shadow-sm text-[13px] text-slate-800 space-y-6" style={{ fontFamily: "Georgia, serif" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: "#3d3530" }}>
          <div className="flex items-center gap-3">
            {company?.logo_url && <img src={company.logo_url} alt="" className="h-12 w-auto object-contain" />}
            <div>
              <p className="text-base font-bold" style={{ color: "#3d3530" }}>{company?.name || "Principle Outdoor Living"}</p>
              <p className="text-xs text-slate-500">{[company?.address, company?.phone, company?.email].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest" style={{ color: "#b5965a" }}>Project Overview</p>
            <p className="text-xs text-slate-500">Printed {date(new Date().toISOString())}</p>
          </div>
        </div>

        {/* Job details */}
        <div className="keep">
          <h1 className="text-2xl font-bold" style={{ color: "#3d3530" }}>{title}</h1>
          {project.name && project.name !== title && <p className="text-slate-500">{project.name}</p>}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
            <Field k="Address" v={project.address || client?.address} />
            <Field k="Client contact" v={[client?.phone, client?.email].filter(Boolean).join(" · ")} />
            <Field k="Status" v={STATUS[project.status] || label(project.status)} />
            <Field k="Project manager" v={project.project_manager} />
            <Field k="Start" v={date(project.start_date)} />
            <Field k="Target completion" v={date(project.end_date)} />
            <Field k="Percent complete" v={pct(project.percent_complete)} />
            <Field k="Permit" v={project.permit_status} />
          </div>
        </div>

        {/* Contract & profit */}
        {showMoney && (
          <Section title="Contract summary">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat k="Original contract" v={money(view.contract)} />
              <Stat k="Approved change orders" v={money(view.approvedCOs)} />
              <Stat k="Revised contract" v={money(view.revised)} strong />
              <Stat k="Projected profit" v={`${money(view.profit.amount)} (${view.profit.margin.toFixed(1)}%)`} sub={PROFIT_BASIS_LABEL[view.profit.basis]} />
              {Number(project.builder_fee) > 0 && <Stat k="Builder fee" v={money(project.builder_fee)} />}
              {estimates.map((e) => <Stat key={e.id} k={`Estimate ${e.estimate_number || ""}`} v={money(e.total)} sub={e.title} />)}
            </div>
          </Section>
        )}

        {/* Budget vs actual */}
        {showCosts && (
          <Section title="Budget vs actual cost">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Stat k="Estimated cost (budget)" v={money(view.budget)} />
              <Stat k="Actual cost to date" v={money(view.actual)} strong />
              <Stat k={view.remainingBudget >= 0 ? "Budget remaining" : "Over budget"} v={money(Math.abs(view.remainingBudget))} tone={view.remainingBudget >= 0 ? "good" : "bad"} />
              <Stat k="Budget spent vs complete" v={`${pct(view.spentPct)} spent · ${pct(project.percent_complete)} done`} />
              {view.hasEstimate && view.extras > 0 && <Stat k="Extra costs (not in estimate)" v={money(view.extras)} tone="bad" />}
            </div>
            {sections.length === 0 ? (
              <p className="text-xs text-slate-500">No job cost breakdown yet. Link an estimate on the project's Job Cost tab.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>{lines ? "Section / line" : "Section"}</th><th className="num">Estimated</th><th className="num">Actual</th><th className="num">Remaining</th></tr>
                </thead>
                <tbody>
                  {sections.map((sec) => {
                    const t = sectionTotals(sec, view.hasEstimate);
                    return [
                      <tr key={sec.id} style={{ backgroundColor: "#f5f0eb" }}>
                        <td className="font-semibold">{sec.name}{t.extra > 0 && <span className="ml-1 text-[10px] font-normal text-rose-600">incl. {money(t.extra)} extra</span>}</td>
                        <td className="num font-semibold">{money(t.budgeted)}</td>
                        <td className="num font-semibold">{money(t.actual)}</td>
                        <td className="num font-semibold"><Var n={t.variance} /></td>
                      </tr>,
                      ...(lines ? (sec.items || []).map((it) => (
                        <tr key={`${sec.id}-${it.id}`}>
                          <td className="pl-5 text-slate-600">
                            {it.description || "Line"}
                            {isExtra(it, view.hasEstimate) && <span className="ml-1 text-[10px] text-rose-600">extra</span>}
                            {Number(it.quantity) > 1 && Number(it.est_cost_per_unit) > 0 && <span className="ml-1 text-[10px] text-slate-400">{it.quantity} × {money(it.est_cost_per_unit)}</span>}
                          </td>
                          <td className="num text-slate-600">{money(it.budgeted)}</td>
                          <td className="num text-slate-600">{Number(it.actual) ? money(it.actual) : "—"}</td>
                          <td className="num text-slate-600"><Var n={(Number(it.budgeted) || 0) - (Number(it.actual) || 0)} /></td>
                        </tr>
                      )) : []),
                    ];
                  })}
                  <tr>
                    <td className="font-bold pt-2" style={{ borderTop: "1.5px solid #3d3530" }}>Total</td>
                    <td className="num font-bold pt-2" style={{ borderTop: "1.5px solid #3d3530" }}>{money(view.budget)}</td>
                    <td className="num font-bold pt-2" style={{ borderTop: "1.5px solid #3d3530" }}>{money(view.actual)}</td>
                    <td className="num font-bold pt-2" style={{ borderTop: "1.5px solid #3d3530" }}><Var n={view.remainingBudget} /></td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="mt-1 text-[10px] text-slate-400">Remaining = estimated − actual so far; it isn't savings until the work is done. Red means a line or section has already cost more than estimated.</p>
          </Section>
        )}

        {/* Billing */}
        {showBilling && (
          <Section title="Billing & payments">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat k="Revised contract" v={money(view.revised)} />
              <Stat k="Collected" v={money(view.collected)} strong tone="good" />
              <Stat k="Left to collect" v={money(view.remaining)} />
            </div>
            {view.sortedDraws.length > 0 && (
              <table className="keep">
                <thead><tr><th>#</th><th>Draw</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th><th>Paid on</th></tr></thead>
                <tbody>
                  {view.sortedDraws.map((d) => (
                    <tr key={d.id}>
                      <td>{d.draw_number}</td>
                      <td>{d.title}{Number(d.builder_fee_amount) > 0 && <span className="ml-1 text-[10px] text-slate-400">incl. {money(d.builder_fee_amount)} builder fee</span>}</td>
                      <td className="num">{money(d.amount)}</td>
                      <td className="num">{Number(d.amount_paid) ? money(d.amount_paid) : "—"}</td>
                      <td>{label(d.status)}</td>
                      <td>{d.paid_date ? date(d.paid_date) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view.sortedPayments.length > 0 && (
              <table className="keep mt-3">
                <thead><tr><th>Payment date</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {view.sortedPayments.map((p) => (
                    <tr key={p.id}><td>{date(p.payment_date)}</td><td>{p.payment_method || "—"}</td><td>{p.reference_number || "—"}</td><td className="num">{money(p.amount_received)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        )}

        {/* Change orders */}
        {view.sortedCOs.length > 0 && (
          <Section title="Change orders">
            <table className="keep">
              <thead><tr><th>#</th><th>Change order</th><th>Status</th><th>Approved</th>{showMoney && <th className="num">Amount</th>}</tr></thead>
              <tbody>
                {view.sortedCOs.map((co) => (
                  <tr key={co.id}>
                    <td>{co.number || "—"}</td>
                    <td>{co.title || co.description || "Change order"}</td>
                    <td>{label(co.status)}</td>
                    <td>{co.approved_date ? date(co.approved_date) : "—"}</td>
                    {showMoney && <td className="num">{money(co.amount)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <p className="pt-2 text-center text-[10px] text-slate-400">{company?.name || "Principle Outdoor Living"} · Project overview for {title} · {date(new Date().toISOString())}</p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: "#b5965a" }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ k, v }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{k}</p>
      <p className="text-slate-800">{v || "—"}</p>
    </div>
  );
}

function Stat({ k, v, sub, strong, tone }) {
  const color = tone === "good" ? "#047857" : tone === "bad" ? "#be123c" : "#3d3530";
  return (
    <div className="keep rounded-md border px-3 py-2" style={{ borderColor: "#e7e1d9" }}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{k}</p>
      <p className={strong ? "text-base font-bold" : "text-sm font-semibold"} style={{ color }}>{v}</p>
      {sub && <p className="text-[10px] text-slate-500 truncate">{sub}</p>}
    </div>
  );
}

// Budget left (estimated − actual). Only an overrun is flagged, in red.
function Var({ n }) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.5) return <span className="text-slate-500">$0</span>;
  return v > 0 ? <span>{money(v)}</span> : <span style={{ color: "#be123c" }}>{money(-v)} over</span>;
}
