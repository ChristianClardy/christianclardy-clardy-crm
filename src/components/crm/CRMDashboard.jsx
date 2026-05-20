import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  TrendingUp, DollarSign, Trophy, Percent, BarChart3,
  Activity, CheckSquare, Clock, Users, Phone, Mail,
  Calendar, StickyNote, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isLast90Days(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diffMs = Date.now() - d;
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ACTIVITY_ICON = {
  call:    { Icon: Phone,         color: "text-blue-500",   bg: "bg-blue-100" },
  email:   { Icon: Mail,          color: "text-violet-500", bg: "bg-violet-100" },
  meeting: { Icon: Calendar,      color: "text-amber-500",  bg: "bg-amber-100" },
  note:    { Icon: StickyNote,    color: "text-yellow-600", bg: "bg-yellow-100" },
  task:    { Icon: CheckSquare,   color: "text-emerald-500",bg: "bg-emerald-100" },
  sms:     { Icon: MessageSquare, color: "text-pink-500",   bg: "bg-pink-100" },
};

const STAGE_ORDER = ["Prospecting", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const STAGE_COLORS = {
  Prospecting: "bg-slate-400",
  Qualified:   "bg-blue-400",
  Proposal:    "bg-indigo-400",
  Negotiation: "bg-amber-400",
  Won:         "bg-emerald-400",
  Lost:        "bg-rose-400",
};

const SOURCE_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-pink-500", "bg-slate-500",
];

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</p>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", accent || "bg-amber-50")}>
          <Icon className={cn("h-4 w-4", accent ? "text-white" : "text-amber-600")} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Pipeline Bar Chart ───────────────────────────────────────────────────────

function PipelineChart({ deals }) {
  const stages = useMemo(() => {
    const grouped = {};
    for (const d of deals) {
      const s = d.stage || "Unknown";
      if (!grouped[s]) grouped[s] = { count: 0, value: 0 };
      grouped[s].count++;
      grouped[s].value += Number(d.value) || 0;
    }
    return Object.entries(grouped)
      .map(([stage, data]) => ({ stage, ...data }))
      .sort((a, b) => {
        const ai = STAGE_ORDER.indexOf(a.stage);
        const bi = STAGE_ORDER.indexOf(b.stage);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [deals]);

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {stages.map(({ stage, count, value }) => (
        <div key={stage}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">{stage}</span>
            <span className="text-slate-400">{count} deal{count !== 1 ? "s" : ""} · {fmt(value)}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className={cn(
                "h-2.5 rounded-full transition-all duration-500",
                STAGE_COLORS[stage] || "bg-slate-400"
              )}
              style={{ width: `${Math.max((value / maxValue) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
      {stages.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">No deals yet.</p>
      )}
    </div>
  );
}

// ─── Lead Source Breakdown ────────────────────────────────────────────────────

function LeadSourceBreakdown({ leads }) {
  const sources = useMemo(() => {
    const grouped = {};
    for (const l of leads) {
      const s = l.lead_source || "Unknown";
      grouped[s] = (grouped[s] || 0) + 1;
    }
    return Object.entries(grouped)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [leads]);

  const total = leads.length || 1;

  return (
    <div className="flex flex-wrap gap-2">
      {sources.map(({ source, count }, i) => (
        <div
          key={source}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
        >
          <div className={cn("h-2 w-2 rounded-full", SOURCE_COLORS[i % SOURCE_COLORS.length])} />
          <span className="text-xs font-medium text-slate-700">{source}</span>
          <span className="text-xs font-bold text-slate-900">{count}</span>
          <span className="text-[10px] text-slate-400">{Math.round((count / total) * 100)}%</span>
        </div>
      ))}
      {sources.length === 0 && (
        <p className="text-sm text-slate-400">No lead source data.</p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CRMDashboard() {
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [dls, acts, lds] = await Promise.all([
          base44.entities.Deal.list("-created_at", 500),
          base44.entities.CRMActivity.list("-created_at", 500),
          base44.entities.Lead.list("-created_date", 500),
        ]);
        setDeals(dls || []);
        setActivities(acts || []);
        setLeads(lds || []);
      } catch (err) {
        console.error("CRMDashboard load error:", err?.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Metrics ────────────────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const openDeals = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
    const pipelineValue = openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const expectedRevenue = openDeals.reduce(
      (s, d) => s + ((Number(d.value) || 0) * (Number(d.probability) || 0)) / 100,
      0
    );

    const wonThisMonth = deals.filter((d) => d.stage === "Won" && isThisMonth(d.close_date));
    const wonThisMonthValue = wonThisMonth.reduce((s, d) => s + (Number(d.value) || 0), 0);

    const last90Won = deals.filter((d) => d.stage === "Won" && isLast90Days(d.close_date)).length;
    const last90Lost = deals.filter((d) => d.stage === "Lost" && isLast90Days(d.close_date)).length;
    const winRate = last90Won + last90Lost > 0
      ? Math.round((last90Won / (last90Won + last90Lost)) * 100)
      : 0;

    const avgDealSize = deals.length > 0
      ? deals.reduce((s, d) => s + (Number(d.value) || 0), 0) / deals.length
      : 0;

    const activitiesThisWeek = activities.filter((a) => isThisWeek(a.created_at)).length;

    return {
      pipelineValue,
      expectedRevenue,
      wonThisMonth: wonThisMonth.length,
      wonThisMonthValue,
      winRate,
      avgDealSize,
      activitiesThisWeek,
    };
  }, [deals, activities]);

  const recentActivities = useMemo(() =>
    [...activities].slice(0, 10),
    [activities]
  );

  const leadMap = useMemo(() =>
    Object.fromEntries(leads.map((l) => [l.id, l])),
    [leads]
  );
  const dealMap = useMemo(() =>
    Object.fromEntries(deals.map((d) => [d.id, d])),
    [deals]
  );

  const tasksDueToday = useMemo(() =>
    activities.filter(
      (a) => a.type === "task" && !a.is_completed && isToday(a.scheduled_at)
    ),
    [activities]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 pb-6 lg:px-8 lg:pb-8">
      {/* Header */}
      <div className="rounded-3xl bg-slate-900 px-6 py-6 shadow-lg">
        <h2 className="text-xl font-bold text-white">CRM Dashboard</h2>
        <p className="mt-1 text-sm text-slate-400">
          {deals.length} deals · {leads.length} leads · {activities.length} activities
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={TrendingUp}
          label="Pipeline Value"
          value={fmt(metrics.pipelineValue)}
          sub={`${deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost").length} open deals`}
        />
        <MetricCard
          icon={DollarSign}
          label="Expected Revenue"
          value={fmt(metrics.expectedRevenue)}
          sub="Probability-weighted"
        />
        <MetricCard
          icon={Trophy}
          label="Won This Month"
          value={metrics.wonThisMonth}
          sub={fmt(metrics.wonThisMonthValue)}
        />
        <MetricCard
          icon={Percent}
          label="Win Rate"
          value={`${metrics.winRate}%`}
          sub="Last 90 days"
        />
        <MetricCard
          icon={BarChart3}
          label="Avg Deal Size"
          value={fmt(metrics.avgDealSize)}
          sub="All deals"
        />
        <MetricCard
          icon={Activity}
          label="Activities"
          value={metrics.activitiesThisWeek}
          sub="This week"
        />
      </div>

      {/* Two-column grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline by Stage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Pipeline by Stage
          </h3>
          <PipelineChart deals={deals} />
        </div>

        {/* Tasks Due Today */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center justify-between text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Tasks Due Today
            {tasksDueToday.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">
                {tasksDueToday.length}
              </span>
            )}
          </h3>
          {tasksDueToday.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <CheckSquare className="mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasksDueToday.map((task) => {
                const leadName = task.lead_id ? leadMap[task.lead_id]?.full_name : null;
                const dealTitle = task.deal_id ? dealMap[task.deal_id]?.title : null;
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5"
                  >
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{task.subject}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {leadName || dealTitle || task.assigned_to || ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activities */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Recent Activities
          </h3>
          <div className="space-y-1">
            {recentActivities.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No activities yet.</p>
            )}
            {recentActivities.map((a) => {
              const { Icon, color, bg } = ACTIVITY_ICON[a.type] || ACTIVITY_ICON.note;
              const leadName = a.lead_id ? leadMap[a.lead_id]?.full_name : null;
              const dealTitle = a.deal_id ? dealMap[a.deal_id]?.title : null;
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors">
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", bg)}>
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{a.subject}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {leadName || dealTitle || a.assigned_to || ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">
                    {relativeTime(a.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leads by Source */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center justify-between text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Leads by Source
            <span className="text-xs font-medium normal-case text-slate-400">{leads.length} total</span>
          </h3>
          <LeadSourceBreakdown leads={leads} />
        </div>
      </div>
    </div>
  );
}
