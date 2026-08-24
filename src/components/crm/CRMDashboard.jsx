import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  TrendingUp, DollarSign, Trophy, Percent, BarChart3,
  CalendarClock, CheckSquare, Users, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { LEAD_STAGES, DEAD_LEAD_STATUSES } from "@/lib/leadStages";

const WON_STATUS = "Contract Signed/Deposit Collected (Won)";
const LOST_STATUS = "Lost/No Decision";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

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

// Same palette as the kanban board's column colors in LeadList.jsx, kept in
// sync by eye rather than shared code since it's purely presentational.
const STAGE_COLORS = {
  "New Lead":                                 "bg-slate-400",
  "Contact Attempted":                        "bg-amber-400",
  Contacted:                                  "bg-blue-400",
  "Appointment Scheduled":                    "bg-purple-400",
  "Site Visit Complete":                      "bg-violet-400",
  "Design Appointment Scheduled":             "bg-fuchsia-300",
  "In Design":                                "bg-fuchsia-400",
  "Estimate In Progress":                     "bg-indigo-400",
  "Quote Delivered/Price Locked":              "bg-cyan-400",
  "Negotiating/Revising Scope":                "bg-yellow-400",
  [WON_STATUS]:                                "bg-emerald-400",
  [LOST_STATUS]:                               "bg-rose-400",
};

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

// ─── Pipeline by stage ─────────────────────────────────────────────────────────

function PipelineChart({ leads }) {
  const stages = useMemo(() => {
    const grouped = Object.fromEntries(LEAD_STAGES.map((stage) => [stage, { count: 0, value: 0 }]));
    for (const lead of leads) {
      const stage = grouped[lead.status] ? lead.status : "New Lead";
      grouped[stage].count++;
      grouped[stage].value += Number(lead.estimated_budget) || 0;
    }
    return LEAD_STAGES.map((stage) => ({ stage, ...grouped[stage] }));
  }, [leads]);

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {stages.map(({ stage, count, value }) => (
        <div key={stage}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">{stage}</span>
            <span className="text-slate-400">{count} lead{count !== 1 ? "s" : ""} · {fmt(value)}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className={cn("h-2.5 rounded-full transition-all duration-500", STAGE_COLORS[stage] || "bg-slate-400")}
              style={{ width: `${count > 0 ? Math.max((count / maxCount) * 100, 4) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Upcoming appointments (ties into the reschedule flow on LeadDetail) ──────

function UpcomingAppointments({ events, leadMap }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <CalendarClock className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-sm">Nothing booked in the next 7 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const lead = leadMap[event.lead_id];
        return (
          <Link
            key={event.id}
            to={lead ? `/LeadDetail?id=${lead.id}` : "/Calendar"}
            className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 transition-colors hover:bg-purple-100"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{lead?.full_name || event.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{event.title}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-purple-700">
              {new Date(event.start_datetime).toLocaleString(undefined, {
                weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Needs follow-up today / overdue ───────────────────────────────────────────

function FollowUpPanel({ leads }) {
  const today = new Date().toISOString().slice(0, 10);
  const due = useMemo(() =>
    leads
      .filter((lead) =>
        lead.follow_up_date &&
        lead.follow_up_date <= today &&
        lead.status !== WON_STATUS &&
        !DEAD_LEAD_STATUSES.includes(lead.status)
      )
      .sort((a, b) => (a.follow_up_date < b.follow_up_date ? -1 : 1))
      .slice(0, 10),
    [leads, today]
  );

  if (due.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <CheckSquare className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-sm">All caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {due.map((lead) => {
        const overdue = lead.follow_up_date < today;
        return (
          <Link
            key={lead.id}
            to={`/LeadDetail?id=${lead.id}`}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              overdue ? "border-rose-100 bg-rose-50 hover:bg-rose-100" : "border-amber-100 bg-amber-50 hover:bg-amber-100"
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{lead.full_name}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{lead.status}</p>
            </div>
            <span className={cn("shrink-0 text-xs font-semibold", overdue ? "text-rose-600" : "text-amber-600")}>
              {overdue ? "Overdue" : "Today"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Lost/No Decision reason breakdown ─────────────────────────────────────────

function LostReasonBreakdown({ leads }) {
  const reasons = useMemo(() => {
    const grouped = {};
    for (const lead of leads) {
      if (lead.status !== LOST_STATUS) continue;
      const key = lead.lost_reason || "No reason set";
      grouped[key] = (grouped[key] || 0) + 1;
    }
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const total = reasons.reduce((sum, [, count]) => sum + count, 0);

  if (total === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">No lost leads yet.</p>;
  }

  return (
    <div className="space-y-2.5">
      {reasons.map(([reason, count]) => (
        <div key={reason} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-xs font-medium text-slate-700">{reason}</span>
          <div className="h-2 flex-1 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-rose-400" style={{ width: `${Math.max((count / total) * 100, 4)}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right text-xs font-bold text-slate-900">{count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Lead Source Breakdown ────────────────────────────────────────────────────

const SOURCE_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-pink-500", "bg-slate-500",
];

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
  const companyScope = useCompanyScope();
  const [leads, setLeads] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLeads = async () => {
    try {
      const data = await base44.entities.Lead.list("-created_date", 1000);
      setLeads(data || []);
    } catch (err) {
      console.error("CRMDashboard lead load error:", err?.message);
    }
  };

  const loadEvents = async () => {
    try {
      const data = await base44.entities.CalendarEvent.list("start_datetime", 2000);
      setEvents(data || []);
    } catch (err) {
      console.error("CRMDashboard calendar load error:", err?.message);
    }
  };

  useEffect(() => {
    Promise.all([loadLeads(), loadEvents()]).finally(() => setLoading(false));
    const unsubLeads = base44.entities.Lead.subscribe(() => loadLeads());
    const unsubEvents = base44.entities.CalendarEvent.subscribe(() => loadEvents());
    return () => {
      unsubLeads();
      unsubEvents();
    };
  }, []);

  const scopedLeads = useMemo(() => scopeFilter(leads, companyScope), [leads, companyScope]);
  const scopedEvents = useMemo(() => scopeFilter(events, companyScope), [events, companyScope]);

  const leadMap = useMemo(() => Object.fromEntries(scopedLeads.map((l) => [l.id, l])), [scopedLeads]);

  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    const weekOut = now + 7 * 24 * 60 * 60 * 1000;
    return scopedEvents
      .filter((event) => event.lead_id && event.start_datetime)
      .filter((event) => {
        const t = new Date(event.start_datetime).getTime();
        return t >= now && t <= weekOut;
      })
      .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
      .slice(0, 8);
  }, [scopedEvents]);

  // ── Metrics ────────────────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const activeLeads = scopedLeads.filter((l) => l.status !== LOST_STATUS);
    const activePipelineValue = activeLeads.reduce((sum, l) => sum + (Number(l.estimated_budget) || 0), 0);

    const wonThisMonth = scopedLeads.filter((l) => l.status === WON_STATUS && isThisMonth(l.updated_date));
    const wonThisMonthValue = wonThisMonth.reduce((sum, l) => sum + (Number(l.estimated_budget) || 0), 0);

    const last90Won = scopedLeads.filter((l) => l.status === WON_STATUS && isLast90Days(l.updated_date)).length;
    const last90Lost = scopedLeads.filter((l) => l.status === LOST_STATUS && isLast90Days(l.updated_date)).length;
    const winRate = last90Won + last90Lost > 0
      ? Math.round((last90Won / (last90Won + last90Lost)) * 100)
      : 0;

    const avgDealSize = activeLeads.length > 0 ? activePipelineValue / activeLeads.length : 0;

    return {
      activeLeadsCount: activeLeads.length,
      activePipelineValue,
      wonThisMonth: wonThisMonth.length,
      wonThisMonthValue,
      winRate,
      avgDealSize,
    };
  }, [scopedLeads]);

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
          {scopedLeads.length} leads · {upcomingAppointments.length} appointments this week · {metrics.activeLeadsCount} active in pipeline
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={TrendingUp}
          label="Active Pipeline"
          value={fmt(metrics.activePipelineValue)}
          sub={`${metrics.activeLeadsCount} active leads`}
        />
        <MetricCard
          icon={Users}
          label="Active Leads"
          value={metrics.activeLeadsCount}
          sub={`${scopedLeads.length} total`}
        />
        <MetricCard
          icon={CalendarClock}
          label="Appointments"
          value={upcomingAppointments.length}
          sub="Next 7 days"
        />
        <MetricCard
          icon={Percent}
          label="Win Rate"
          value={`${metrics.winRate}%`}
          sub="Last 90 days"
        />
        <MetricCard
          icon={Trophy}
          label="Won This Month"
          value={metrics.wonThisMonth}
          sub={fmt(metrics.wonThisMonthValue)}
        />
        <MetricCard
          icon={DollarSign}
          label="Avg Deal Size"
          value={fmt(metrics.avgDealSize)}
          sub="Active pipeline"
        />
      </div>

      {/* Two-column grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline by Stage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            <BarChart3 className="h-4 w-4" /> Pipeline by Stage
          </h3>
          <PipelineChart leads={scopedLeads} />
        </div>

        {/* Upcoming Appointments */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center justify-between text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Upcoming Appointments
            {upcomingAppointments.length > 0 && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                {upcomingAppointments.length}
              </span>
            )}
          </h3>
          <UpcomingAppointments events={upcomingAppointments} leadMap={leadMap} />
        </div>

        {/* Needs Follow-Up */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Needs Follow-Up
          </h3>
          <FollowUpPanel leads={scopedLeads} />
        </div>

        {/* Lost Reasons */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center justify-between text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Lost / No Decision
            <Link to="/CRM?tab=archived" className="inline-flex items-center gap-1 text-[11px] font-medium normal-case text-slate-400 hover:text-slate-700">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </h3>
          <LostReasonBreakdown leads={scopedLeads} />
        </div>

        {/* Leads by Source */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="mb-4 flex items-center justify-between text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
            Leads by Source
            <span className="text-xs font-medium normal-case text-slate-400">{scopedLeads.length} total</span>
          </h3>
          <LeadSourceBreakdown leads={scopedLeads} />
        </div>
      </div>
    </div>
  );
}
