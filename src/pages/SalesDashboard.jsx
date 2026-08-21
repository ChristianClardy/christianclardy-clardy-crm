import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";

const FUNNEL_BUCKETS = [
  { key: "leads",     label: "Leads",     color: "bg-slate-400",   bar: "bg-slate-400" },
  { key: "prospects", label: "Prospects", color: "bg-blue-400",    bar: "bg-blue-400" },
  { key: "approved",  label: "Approved",  color: "bg-emerald-400", bar: "bg-emerald-400" },
  { key: "completed", label: "Completed", color: "bg-violet-400",  bar: "bg-violet-400" },
  { key: "closed",    label: "Closed",    color: "bg-rose-400",    bar: "bg-rose-400" },
  { key: "archived",  label: "Archived",  color: "bg-slate-300",   bar: "bg-slate-300" },
];

function getBucket(stage) {
  if (stage === "dead_lead") return "archived";
  if (stage === "closed") return "closed";
  if (stage === "completed") return "completed";
  if (stage === "approved") return "approved";
  if (["proposal_sent", "negotiating"].includes(stage)) return "prospects";
  return "leads";
}

export default function SalesDashboard() {
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());

  useEffect(() => {
    const unsubScope = subscribeToCompanyScope(setSelectedCompanyScope);
    return unsubScope;
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      base44.entities.Lead.list("-created_date", 2000),
      base44.entities.Client.list("-created_date", 5000),
      base44.entities.Estimate.list("-created_date", 2000),
      base44.entities.Task.list("-created_date", 2000),
    ]).then(([leadData, clientData, estimateData, taskData]) => {
      setLeads(leadData || []);
      setClients(clientData || []);
      setEstimates(estimateData || []);
      setTasks(taskData || []);
    }).catch(err => {
      console.error("Failed to load sales dashboard:", err?.message);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekISO = startOfWeek.toISOString().slice(0, 10);

  const scopedLeads = useMemo(
    () => selectedCompanyScope === "all" ? leads : leads.filter((l) => l.company_id === selectedCompanyScope),
    [leads, selectedCompanyScope]
  );
  const scopedClients = useMemo(
    () => selectedCompanyScope === "all" ? clients : clients.filter((c) => c.company_id === selectedCompanyScope),
    [clients, selectedCompanyScope]
  );
  const scopedEstimates = useMemo(
    () => selectedCompanyScope === "all" ? estimates : estimates.filter((e) => e.company_id === selectedCompanyScope),
    [estimates, selectedCompanyScope]
  );
  const scopedTasks = useMemo(
    () => selectedCompanyScope === "all" ? tasks : tasks.filter((t) => t.company_id === selectedCompanyScope),
    [tasks, selectedCompanyScope]
  );

  const leadsByStatus = useMemo(() => scopedLeads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {}), [scopedLeads]);

  const funnelCounts = useMemo(() => {
    const counts = Object.fromEntries(FUNNEL_BUCKETS.map((b) => [b.key, 0]));
    scopedClients.forEach((c) => {
      const bucket = getBucket(c.workflow_stage || "new_lead");
      if (bucket in counts) counts[bucket]++;
    });
    return counts;
  }, [scopedClients]);

  const funnelMax = useMemo(
    () => Math.max(...Object.values(funnelCounts), 1),
    [funnelCounts]
  );

  const newLeadsThisWeek = scopedLeads.filter((lead) => (lead.created_date || "") >= weekISO).length;
  const estimatesInProgress = scopedEstimates.filter((estimate) => ["draft", "internal_review", "revised"].includes(estimate.status)).length;
  const estimatesSent = scopedEstimates.filter((estimate) => ["sent", "viewed", "follow_up_needed"].includes(estimate.status)).length;
  const approvedEstimates = scopedEstimates.filter((estimate) => ["approved", "accepted"].includes(estimate.status));
  const rejectedEstimates = scopedEstimates.filter((estimate) => ["rejected", "declined", "expired"].includes(estimate.status));
  const estimateApprovalRate = approvedEstimates.length + rejectedEstimates.length > 0
    ? `${Math.round((approvedEstimates.length / (approvedEstimates.length + rejectedEstimates.length)) * 100)}%`
    : "0%";
  const wonRevenue = approvedEstimates.reduce((sum, estimate) => sum + (estimate.total || estimate.estimated_revenue || 0), 0);
  const lostLeads = scopedLeads.filter((lead) => lead.status === "Lost/No Decision").length;
  const followUpsDueToday = scopedTasks.filter((task) => task.due_date === today && ["Call", "Follow Up"].includes(task.task_type)).length;

  const openLeads = useMemo(
    () => scopedLeads.filter((lead) => !["Contract Signed/Deposit Collected (Won)", "Lost/No Decision"].includes(lead.status)),
    [scopedLeads]
  );
  const pipelineValue = useMemo(
    () => openLeads.reduce((sum, lead) => sum + (Number(lead.estimated_budget) || 0), 0),
    [openLeads]
  );
  const pipelineBySource = useMemo(() => {
    const grouped = {};
    for (const lead of openLeads) {
      const source = lead.lead_source || "Unknown";
      grouped[source] = (grouped[source] || 0) + (Number(lead.estimated_budget) || 0);
    }
    return Object.entries(grouped)
      .map(([source, value]) => ({ source, value }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [openLeads]);
  const pipelineBySourceMax = Math.max(...pipelineBySource.map((row) => row.value), 1);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Sales Dashboard</h1>
        <p className="mt-1 text-slate-500">Lead flow, estimate activity, and sales follow-ups.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="New Leads This Week" value={newLeadsThisWeek} />
        <MetricCard label="Estimates In Progress" value={estimatesInProgress} />
        <MetricCard label="Estimates Sent" value={estimatesSent} />
        <MetricCard label="Estimate Approval Rate" value={estimateApprovalRate} />
        <MetricCard label="Won Revenue" value={`$${wonRevenue.toLocaleString()}`} accent="text-emerald-700" />
        <MetricCard label="Lost Leads" value={lostLeads} accent="text-rose-700" />
        <MetricCard label="Follow Ups Due Today" value={followUpsDueToday} accent="text-amber-700" />
        <MetricCard label="Leads by Status" value={Object.keys(leadsByStatus).length} subtext="active statuses" />
        <MetricCard
          label="Lead Pipeline Value"
          value={`$${pipelineValue.toLocaleString()}`}
          subtext={`${openLeads.length} open leads`}
          accent="text-indigo-700"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sales Funnel</h2>
          <p className="mt-0.5 text-xs text-slate-400">{scopedClients.length} total contacts</p>
          <div className="mt-4 space-y-2">
            {FUNNEL_BUCKETS.map((bucket) => {
              const count = funnelCounts[bucket.key] || 0;
              const pct = Math.round((count / funnelMax) * 100);
              return (
                <div key={bucket.key} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-slate-600 font-medium">{bucket.label}</span>
                  <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${bucket.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right font-semibold text-slate-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Pipeline Value by Source</h2>
          <p className="mt-0.5 text-xs text-slate-400">Estimated budget across {openLeads.length} open leads</p>
          <div className="mt-4 space-y-2">
            {pipelineBySource.length === 0 && (
              <p className="text-sm text-slate-400">No estimated budgets entered yet.</p>
            )}
            {pipelineBySource.map(({ source, value }) => {
              const pct = Math.round((value / pipelineBySourceMax) * 100);
              return (
                <div key={source} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate-600 font-medium">{source}</span>
                  <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-semibold text-slate-900">${value.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Follow Ups Due Today</h2>
          <div className="mt-4 space-y-2">
            {tasks.filter((task) => task.due_date === today).slice(0, 8).map((task) => (
              <div key={task.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{task.name}</p>
                <p className="text-slate-500">{task.assigned_to || "Unassigned"}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}