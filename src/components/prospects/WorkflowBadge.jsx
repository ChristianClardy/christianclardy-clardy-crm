export const WORKFLOW_STAGES = [
  { key: "new_lead",       label: "New Lead",       color: "bg-slate-100 text-slate-600",   dot: "#94a3b8" },
  { key: "contacted",      label: "Contacted",      color: "bg-blue-100 text-blue-700",     dot: "#3b82f6" },
  { key: "proposal_sent",  label: "Proposal Sent",  color: "bg-purple-100 text-purple-700", dot: "#a855f7" },
  { key: "negotiating",    label: "Negotiating",    color: "bg-amber-100 text-amber-700",   dot: "#f59e0b" },
  { key: "approved",       label: "Approved",       color: "bg-emerald-100 text-emerald-700", dot: "#10b981" },
  { key: "completed",      label: "Completed",      color: "bg-violet-100 text-violet-700", dot: "#8b5cf6" },
  { key: "closed",         label: "Closed",         color: "bg-rose-100 text-rose-700",     dot: "#e11d48" },
  { key: "dead_lead",      label: "Dead Lead",      color: "bg-rose-100 text-rose-600",     dot: "#f43f5e" },
];

export default function WorkflowBadge({ stage }) {
  const s = WORKFLOW_STAGES.find(s => s.key === stage) || WORKFLOW_STAGES[0];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${s.color}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  );
}