import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";

export default function SalesDashboard() {
  const [leads, setLeads] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Lead.list("-created_date", 2000),
      base44.entities.Estimate.list("-created_date", 2000),
      base44.entities.Task.list("-created_date", 2000),
    ]).then(([leadData, estimateData, taskData]) => {
      setLeads(leadData);
      setEstimates(estimateData);
      setTasks(taskData);
      setLoading(false);
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekISO = startOfWeek.toISOString().slice(0, 10);

  const leadsByStatus = useMemo(() => leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {}), [leads]);

  const newLeadsThisWeek = leads.filter((lead) => (lead.created_date || "") >= weekISO).length;
  const estimatesInProgress = estimates.filter((estimate) => ["draft", "internal_review", "revised"].includes(estimate.status)).length;
  const estimatesSent = estimates.filter((estimate) => ["sent", "viewed", "follow_up_needed"].includes(estimate.status)).length;
  const approvedEstimates = estimates.filter((estimate) => ["approved", "accepted"].includes(estimate.status));
  const rejectedEstimates = estimates.filter((estimate) => ["rejected", "declined", "expired"].includes(estimate.status));
  const estimateApprovalRate = approvedEstimates.length + rejectedEstimates.length > 0
    ? `${Math.round((approvedEstimates.length / (approvedEstimates.length + rejectedEstimates.length)) * 100)}%`
    : "0%";
  const wonRevenue = approvedEstimates.reduce((sum, estimate) => sum + (estimate.total || estimate.estimated_revenue || 0), 0);
  const lostLeads = leads.filter((lead) => lead.status === "Lost").length;
  const followUpsDueToday = tasks.filter((task) => task.due_date === today && ["Call", "Follow Up"].includes(task.task_type)).length;

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
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Lead Status Snapshot</h2>
          <div className="mt-4 space-y-2">
            {Object.entries(leadsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-600">{status}</span>
                <span className="font-semibold text-slate-900">{count}</span>
              </div>
            ))}
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