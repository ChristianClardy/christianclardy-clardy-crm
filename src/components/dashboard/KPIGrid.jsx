import { useState } from "react";
import { FolderKanban, AlertTriangle, TrendingDown, DollarSign, TrendingUp, Users, CheckCircle2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// money: only shown to roles with money access (job costs or billing).
const ALL_KPIS = [
  { key: "active_projects", label: "Active Projects", icon: FolderKanban, color: "#b5965a" },
  { key: "nearing_deadline", label: "Nearing Deadline", icon: AlertTriangle, color: "#f59e0b" },
  { key: "over_budget", label: "Over Budget", icon: TrendingDown, color: "#ef4444", money: true },
  { key: "total_clients", label: "Total Clients", icon: Users, color: "#6366f1" },
  { key: "contract_value", label: "Contract Value", icon: DollarSign, color: "#10b981", money: true },
  { key: "billed_to_date", label: "Collected to Date", icon: TrendingUp, color: "#3b82f6", money: true },
  { key: "completed_projects", label: "Completed Projects", icon: CheckCircle2, color: "#22c55e" },
  { key: "on_hold", label: "On Hold", icon: FolderKanban, color: "#94a3b8" },
];

const DEFAULT_KPIS = ["active_projects", "nearing_deadline", "over_budget", "contract_value"];

// Planning = signed and being set up; still an active job.
const ACTIVE_STATUSES = new Set(["planning", "in_progress"]);

function computeKPIValue(key, projects, clientCount) {
  const today = new Date();
  const in14Days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  switch (key) {
    case "active_projects":
      return { value: projects.filter(p => ACTIVE_STATUSES.has(p.status)).length, sub: `of ${projects.length} total` };
    case "nearing_deadline":
      return {
        value: projects.filter(p => {
          if (!p.end_date || !ACTIVE_STATUSES.has(p.status)) return false;
          const end = new Date(p.end_date);
          return end >= today && end <= in14Days;
        }).length,
        sub: "within 14 days"
      };
    case "over_budget": {
      const ob = projects.filter(p => p.costs_to_date > 0 && p.contract_value > 0 && p.costs_to_date > p.contract_value).length;
      return { value: ob, sub: "costs exceed contract" };
    }
    case "total_clients":
      return { value: clientCount ?? "–", sub: "in this company" };
    case "contract_value": {
      const open = projects.filter(p => ACTIVE_STATUSES.has(p.status));
      const total = open.reduce((s, p) => s + (p.contract_value || 0), 0);
      return { value: `$${total >= 1000000 ? (total / 1000000).toFixed(1) + "M" : (total / 1000).toFixed(0) + "K"}`, sub: "active projects" };
    }
    case "billed_to_date": {
      const billed = projects.reduce((s, p) => s + (p.billed_to_date || 0), 0);
      const cv = projects.reduce((s, p) => s + (p.contract_value || 0), 0);
      return { value: `$${billed >= 1000000 ? (billed / 1000000).toFixed(1) + "M" : (billed / 1000).toFixed(0) + "K"}`, sub: cv ? `${Math.round((billed / cv) * 100)}% of total` : "" };
    }
    case "completed_projects":
      return { value: projects.filter(p => p.status === "completed").length, sub: "finished" };
    case "on_hold":
      return { value: projects.filter(p => p.status === "on_hold").length, sub: "paused" };
    default:
      return { value: 0, sub: "" };
  }
}

export default function KPIGrid({ projects, clientCount, showMoney = true }) {
  const [selected, setSelected] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dashboard_kpis")) || DEFAULT_KPIS; } catch { return DEFAULT_KPIS; }
  });
  const [editing, setEditing] = useState(false);

  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key];
    setSelected(next);
    try { localStorage.setItem("dashboard_kpis", JSON.stringify(next)); } catch { /* private window */ }
  };

  const offered = ALL_KPIS.filter(k => showMoney || !k.money);
  const visibleKPIs = offered.filter(k => selected.includes(k.key));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Key Metrics</h2>
        <button
          onClick={() => setEditing(v => !v)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border transition-colors",
            editing ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
          )}
        >
          <Settings className="w-3.5 h-3.5" />
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      {editing && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50">
          <p className="text-xs text-amber-700 font-medium mb-2">Select KPIs to display:</p>
          <div className="flex flex-wrap gap-2">
            {offered.map(kpi => (
              <button
                key={kpi.key}
                onClick={() => toggle(kpi.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all",
                  selected.includes(kpi.key)
                    ? "border-amber-400 bg-amber-100 text-amber-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                )}
              >
                <kpi.icon className="w-3 h-3" />
                {kpi.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleKPIs.map(kpi => {
          const { value, sub } = computeKPIValue(kpi.key, projects, clientCount);
          const isAlert = (kpi.key === "nearing_deadline" && value > 0) || (kpi.key === "over_budget" && value > 0);
          return (
            <div
              key={kpi.key}
              className={cn(
                "rounded-xl p-4 border flex items-start gap-3 transition-all",
                isAlert ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
              )}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: isAlert ? "#fee2e2" : `${kpi.color}18` }}
              >
                <kpi.icon className="w-4 h-4" style={{ color: isAlert ? "#ef4444" : kpi.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 leading-tight">{kpi.label}</p>
                <p className="text-2xl font-bold leading-tight mt-0.5" style={{ color: isAlert ? "#ef4444" : "#3d3530" }}>{value}</p>
                {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}