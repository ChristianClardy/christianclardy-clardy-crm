import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import {
  Building, ArrowLeft, Loader2, MapPin, User, CalendarDays, AlertTriangle, ClipboardCheck, ListChecks,
  NotebookPen, Wrench, Search, Phone, MessageSquare, Smartphone, ExternalLink, CloudSun, Users, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createPageUrl } from "@/utils";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import {
  scheduleHealth, HEALTH_STYLE, percentComplete, forecastEnd, currentRows, nextRow, overdueRows, taskRows,
  todayIso, fmtShort, fmtLong, isDone, daysBetween,
} from "@/lib/schedule";
import { logStatus, STATUS_STYLES, progressPhotos } from "@/lib/barrierChecklist";
import ScheduleEditor from "@/components/pm/ScheduleEditor";
import PunchList from "@/components/pm/PunchList";
import Inspections from "@/components/pm/Inspections";
import DailyLogDialog from "@/components/builder/DailyLogDialog";
import SubAccessDialog from "@/components/builder/SubAccessDialog";

// Builder Portal: where project managers run their jobs. The board lists every
// job with its schedule health; ?project=<id> opens one job's schedule, daily
// logs, punch list, inspections and subs.
//
// Staff open it inside the CRM. A PM with a Builder Portal-only login gets it
// as their whole app (`pm` = their pm_portal_users row, see App.jsx): jobs and
// subs then come from pm_portal_projects() / pm_subcontractors(), which leave
// out money columns, and job changes go through pm_update_project()
// (040_pm_portal_logins.sql). The database limits them to their own jobs.

const rpcList = (fn) => supabase.rpc(fn).then(({ data, error }) => { if (error) throw error; return data || []; });
const clientLabel = (p, clientById) => {
  const c = clientById?.[p.client_id];
  return c?.name || p.client_name || "";
};

const PROJECT_STATUS = {
  planning: { label: "Planning", cls: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-800" },
  on_hold: { label: "On hold", cls: "bg-orange-100 text-orange-700" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};
const ACTIVE = new Set(["planning", "in_progress", "on_hold"]);

export default function Builder({ pm = null }) {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project");
  const companyScope = useCompanyScope();
  const scope = pm ? "all" : companyScope;

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [subs, setSubs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [punch, setPunch] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [logs, setLogs] = useState([]);

  const load = async () => {
    const safe = (p) => p.catch(() => []);
    const [u, p, c, sh, s, e, pu, ins, l] = await Promise.all([
      base44.auth.me().catch(() => null),
      safe(pm ? rpcList("pm_portal_projects") : base44.entities.Project.list("-updated_date", 2000)),
      pm ? [] : safe(base44.entities.Client.list("-created_date", 5000)),
      safe(base44.entities.ProjectSheet.list("-updated_date", 2000)),
      safe(pm ? rpcList("pm_subcontractors") : base44.entities.Subcontractor.list("name", 1000)),
      pm ? [] : safe(base44.entities.Employee.list("full_name", 500)),
      safe(base44.entities.PunchListItem.list("-created_date", 5000)),
      safe(base44.entities.PermitInspectionTask.list("due_date", 5000)),
      safe(base44.entities.BarrierDailyLog.list("-log_date", 3000)),
    ]);
    setMe(u); setProjects(p); setClients(c); setSheets(sh); setSubs(s.filter((x) => x.status !== "inactive"));
    setEmployees(e.filter((x) => x.status !== "inactive")); setPunch(pu); setInspections(ins); setLogs(l);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rowsByProject = useMemo(() => {
    const m = {};
    for (const s of sheets) if (!m[s.project_id]) m[s.project_id] = Array.isArray(s.rows) ? s.rows : [];
    return m;
  }, [sheets]);

  const openJob = (id, tab) => setParams(id ? { project: id, ...(tab ? { tab } : {}) } : {});

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-amber-500" /></div>;

  const project = projectId && projects.find((p) => p.id === projectId);
  if (projectId && !project) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        That job wasn't found. <button className="text-amber-700 underline" onClick={() => openJob(null)}>Back to all jobs</button>
      </div>
    );
  }

  const ctx = { pm, me, clients, subs, employees, rowsByProject, punch, inspections, logs };

  return project ? (
    <JobView
      key={project.id}
      project={project}
      ctx={ctx}
      tab={params.get("tab") || "schedule"}
      focusRowId={params.get("task")}
      setTab={(t) => setParams({ project: project.id, tab: t })}
      onBack={() => openJob(null)}
      onProjectChange={(saved) => setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)))}
      onRowsChange={(rows) => setSheets((prev) => {
        const has = prev.some((s) => s.project_id === project.id);
        return has ? prev.map((s) => (s.project_id === project.id ? { ...s, rows } : s)) : [...prev, { project_id: project.id, rows }];
      })}
      onLogSaved={(saved) => setLogs((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)])}
      onPunchChange={(items) => setPunch((prev) => [...prev.filter((i) => i.project_id !== project.id), ...items])}
      onInspectionsChange={(items) => setInspections((prev) => [...prev.filter((i) => i.project_id !== project.id), ...items])}
    />
  ) : (
    <JobsBoard projects={scopeFilter(projects, scope)} ctx={ctx} onOpen={openJob} />
  );
}

// ─── Board ───────────────────────────────────────────────────────────────────

function JobsBoard({ projects, ctx, onOpen }) {
  const { pm, me, clients, rowsByProject, punch, inspections, logs, subs } = ctx;
  const myName = (me?.full_name || "").trim().toLowerCase();
  const mineExists = projects.some((p) => (p.project_manager || "").trim().toLowerCase() === myName && myName);
  // A PM-only login already sees just its own jobs.
  const [who, setWho] = useState(mineExists && !pm ? "mine" : "all");
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const subById = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s])), [subs]);
  const today = todayIso();
  const weekOut = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA");

  const jobs = projects
    .filter((p) => (who === "mine" ? (p.project_manager || "").trim().toLowerCase() === myName : true))
    .filter((p) => (status === "active" ? ACTIVE.has(p.status) : status === "completed" ? p.status === "completed" : true))
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [p.name, p.address, p.project_manager, clientLabel(p, clientById)].some((v) => v?.toLowerCase().includes(q));
    })
    .map((p) => {
      const rows = rowsByProject[p.id] || [];
      return {
        p, rows,
        health: scheduleHealth(p, rows, today),
        openPunch: punch.filter((i) => i.project_id === p.id && i.status !== "closed").length,
        nextInspection: inspections.filter((i) => i.project_id === p.id && (i.result === "scheduled" || (!i.result && !i.completed)) && i.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0],
        lastLog: logs.find((l) => l.project_id === p.id),
      };
    })
    .sort((a, b) => {
      const rank = { behind: 0, risk: 1, ok: 2, none: 3, done: 4 };
      return rank[a.health.level] - rank[b.health.level] || (a.p.end_date || "9").localeCompare(b.p.end_date || "9");
    });

  const active = jobs.filter((j) => ACTIVE.has(j.p.status));
  const stats = [
    { label: "Active jobs", value: active.length, icon: Building },
    { label: "Behind schedule", value: active.filter((j) => j.health.level === "behind").length, icon: AlertTriangle, bad: true },
    { label: "Overdue tasks", value: active.reduce((n, j) => n + overdueRows(j.rows, today).length, 0), icon: CalendarDays, bad: true },
    { label: "Inspections this week", value: inspections.filter((i) => active.some((j) => j.p.id === i.project_id) && i.result === "scheduled" && i.due_date >= today && i.due_date <= weekOut).length, icon: ClipboardCheck },
    { label: "Open punch items", value: active.reduce((n, j) => n + j.openPunch, 0), icon: ListChecks },
    { label: "No log today", value: active.filter((j) => j.p.status === "in_progress" && j.lastLog?.log_date !== today).length, icon: NotebookPen, bad: true },
  ];

  // Next 7 days across these jobs: tasks starting and inspections.
  const upcoming = [
    ...active.flatMap((j) => taskRows(j.rows)
      .filter((r) => !isDone(r) && r.start_date >= today && r.start_date <= weekOut)
      .map((r) => ({ date: r.start_date, job: j.p, text: r.task, sub: subById[r.subcontractor_id]?.name, kind: "task", rowId: r.id }))),
    ...inspections
      .filter((i) => i.result === "scheduled" && i.due_date >= today && i.due_date <= weekOut)
      .map((i) => ({ date: i.due_date, job: active.find((j) => j.p.id === i.project_id)?.p, text: `Inspection: ${i.title}`, kind: "inspection" }))
      .filter((x) => x.job),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Builder Portal</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">Jobs</h1>
        <p className="text-sm text-slate-500 mt-1">Schedules, daily logs, punch lists and inspections for every job.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, icon: Icon, bad }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3">
            <Icon className={cn("w-4 h-4", bad && value ? "text-rose-600" : "text-slate-400")} />
            <p className={cn("mt-1 text-2xl font-bold", bad && value ? "text-rose-700" : "text-slate-900")}>{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        {!pm && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {[["mine", "My jobs"], ["all", "All jobs"]].map(([k, l]) => (
              <button key={k} onClick={() => setWho(k)} className={cn("rounded-md px-3 py-1.5 text-sm", who === k ? "bg-slate-900 text-white" : "text-slate-600")}>{l}</button>
            ))}
          </div>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="all">All statuses</option>
        </select>
        <div className="relative sm:ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job, client, address" className="pl-9 h-9 text-sm" />
        </div>
      </div>
      {who === "mine" && !jobs.length && (
        <p className="text-sm text-slate-500">
          No jobs list you as project manager ({me?.full_name || me?.email}). Open a job and set its project manager, or view <button className="underline" onClick={() => setWho("all")}>all jobs</button>.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
          {jobs.map((j) => <JobCard key={j.p.id} job={j} clientName={clientLabel(j.p, clientById)} onOpen={onOpen} />)}
          {!jobs.length && who !== "mine" && (
            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {pm ? "No jobs yet. Jobs show up here once the office sets you as their project manager." : <>No jobs match. Jobs come from <Link to={createPageUrl("Projects")} className="underline">Projects</Link>.</>}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 h-fit">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Next 7 days</h2>
          {!upcoming.length && <p className="text-sm text-slate-400">Nothing scheduled to start.</p>}
          <div className="space-y-3">
            {upcoming.slice(0, 25).map((u, i) => (
              <button key={i} onClick={() => onOpen(u.job.id, u.kind === "inspection" ? "inspections" : "schedule")} className="w-full text-left flex gap-3 group">
                <div className="w-12 shrink-0 text-center">
                  <p className="text-[10px] uppercase text-slate-400">{new Date(`${u.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</p>
                  <p className="text-sm font-semibold text-slate-800">{fmtShort(u.date)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 group-hover:underline truncate">{u.text}</p>
                  <p className="text-xs text-slate-500 truncate">{u.job.name}{u.sub ? ` · ${u.sub}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, clientName, onOpen }) {
  const { p, rows, health, openPunch, nextInspection, lastLog } = job;
  const pct = taskRows(rows).length ? percentComplete(rows) : p.percent_complete || 0;
  const forecast = forecastEnd(rows);
  const current = currentRows(rows)[0];
  const upNext = !current && nextRow(rows);
  const st = PROJECT_STATUS[p.status] || PROJECT_STATUS.planning;
  return (
    <button onClick={() => onOpen(p.id)} className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-md hover:border-slate-300 transition-all space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{p.name}</p>
          <p className="text-xs text-slate-500 truncate">{[clientName, p.address].filter(Boolean).join(" · ") || "No client or address"}</p>
        </div>
        <span className={cn("shrink-0 text-xs font-medium px-2 py-0.5 rounded-full", HEALTH_STYLE[health.level])}>{health.label}</span>
      </div>
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span className={cn("font-medium px-1.5 rounded", st.cls)}>{st.label}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><p className="text-slate-400">Target finish</p><p className="text-slate-800 font-medium">{p.end_date ? fmtShort(p.end_date) : "Not set"}</p></div>
        <div><p className="text-slate-400">Forecast</p><p className={cn("font-medium", p.end_date && forecast > p.end_date ? "text-rose-700" : "text-slate-800")}>{forecast ? fmtShort(forecast) : "—"}</p></div>
      </div>
      {(current || upNext) && (
        <p className="text-xs text-slate-600 truncate">
          <span className="text-slate-400">{current ? "Now: " : `Next (${fmtShort(upNext.start_date)}): `}</span>{(current || upNext).task}
        </p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 border-t border-slate-100 pt-2">
        <span><User className="w-3 h-3 inline -mt-0.5" /> {p.project_manager || "No PM"}</span>
        {openPunch > 0 && <span><ListChecks className="w-3 h-3 inline -mt-0.5" /> {openPunch} punch</span>}
        {nextInspection && <span><ClipboardCheck className="w-3 h-3 inline -mt-0.5" /> {fmtShort(nextInspection.due_date)}</span>}
        <span><NotebookPen className="w-3 h-3 inline -mt-0.5" /> {lastLog ? `Log ${fmtShort(lastLog.log_date)}` : "No logs"}</span>
      </div>
    </button>
  );
}

// ─── One job ─────────────────────────────────────────────────────────────────

const JOB_TABS = [
  { key: "schedule", label: "Schedule", icon: CalendarDays },
  { key: "logs", label: "Daily logs", icon: NotebookPen },
  { key: "punch", label: "Punch list", icon: ListChecks },
  { key: "inspections", label: "Inspections", icon: ClipboardCheck },
  { key: "subs", label: "Subs", icon: Wrench },
];

function JobView({ project, ctx, tab, setTab, focusRowId, onBack, onProjectChange, onRowsChange, onLogSaved, onPunchChange, onInspectionsChange }) {
  const { pm, me, clients, subs, employees, rowsByProject, logs, punch, inspections } = ctx;
  const [rows, setRows] = useState(rowsByProject[project.id] || []);
  const clientName = clientLabel(project, Object.fromEntries(clients.map((c) => [c.id, c])));
  const health = scheduleHealth(project, rows);
  const pct = taskRows(rows).length ? percentComplete(rows) : project.percent_complete || 0;
  const forecast = forecastEnd(rows);

  const update = async (patch) => {
    onProjectChange({ id: project.id, ...patch });
    if (pm) {
      const { error } = await supabase.rpc("pm_update_project", { p_id: project.id, p_patch: patch });
      if (error) alert(`Could not save: ${error.message}`);
      return;
    }
    const saved = await base44.entities.Project.update(project.id, patch);
    if (saved) onProjectChange(saved);
  };

  const setStatus = (status) => {
    if (status === "completed" && !project.actual_completion_date) {
      const d = prompt("Actual completion date (YYYY-MM-DD)", todayIso());
      if (d === null) return;
      update({ status, actual_completion_date: d || todayIso() });
    } else {
      update({ status });
    }
  };

  const setTarget = (end_date) => update({ end_date: end_date || null, ...(!project.baseline_end_date && end_date ? { baseline_end_date: end_date } : {}) });

  const pmOptions = [...employees].sort((a, b) => (a.role === "project_manager" ? -1 : 0) - (b.role === "project_manager" ? -1 : 0));
  const pmInList = !project.project_manager || pmOptions.some((e) => e.full_name === project.project_manager);
  const slip = project.baseline_end_date && project.end_date && project.end_date > project.baseline_end_date ? daysBetween(project.baseline_end_date, project.end_date) : 0;
  const counts = {
    punch: punch.filter((i) => i.project_id === project.id && i.status !== "closed").length,
    inspections: inspections.filter((i) => i.project_id === project.id && i.result === "scheduled").length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="w-4 h-4" /> All jobs</button>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{project.name}</h1>
            <p className="text-sm text-slate-500 flex flex-wrap gap-x-3">
              {clientName && <span><User className="w-3.5 h-3.5 inline -mt-0.5" /> {clientName}</span>}
              {project.address && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(project.address)}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  <MapPin className="w-3.5 h-3.5 inline -mt-0.5" /> {project.address}
                </a>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium px-2 py-1 rounded-full", HEALTH_STYLE[health.level])}>{health.label}</span>
            {!pm && (
              <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
                Full project page <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Field label="Status">
            <select value={project.status || "planning"} onChange={(e) => setStatus(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
              {Object.entries(PROJECT_STATUS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
          <Field label="Project manager">
            {pm ? (
              <p className="h-9 flex items-center text-sm text-slate-800 truncate">{project.project_manager || "Unassigned"}</p>
            ) : (
              <select value={project.project_manager || ""} onChange={(e) => update({ project_manager: e.target.value || null })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">Unassigned</option>
                {!pmInList && <option value={project.project_manager}>{project.project_manager}</option>}
                {pmOptions.map((e) => <option key={e.id} value={e.full_name}>{e.full_name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Start">
            <Input type="date" value={project.start_date || ""} onChange={(e) => update({ start_date: e.target.value || null })} className="h-9 text-sm px-2" />
          </Field>
          <Field label={slip ? `Target finish (+${slip}d vs original)` : "Target finish"}>
            <Input type="date" value={project.end_date || ""} onChange={(e) => setTarget(e.target.value)} className={cn("h-9 text-sm px-2", slip && "border-amber-300")} />
          </Field>
          <Field label="Forecast finish">
            <p className={cn("h-9 flex items-center text-sm font-medium", project.end_date && forecast > project.end_date ? "text-rose-700" : "text-slate-800")}>
              {forecast ? fmtLong(forecast) : "Build a schedule"}
            </p>
          </Field>
          <Field label={project.status === "completed" ? "Completed on" : `Progress ${pct}%`}>
            {project.status === "completed" ? (
              <Input type="date" value={project.actual_completion_date || ""} onChange={(e) => update({ actual_completion_date: e.target.value || null })} className="h-9 text-sm px-2" />
            ) : (
              <div className="h-9 flex items-center"><div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${pct}%` }} /></div></div>
            )}
          </Field>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {JOB_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium", tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
            <Icon className="w-4 h-4" /> {label}
            {counts[key] > 0 && <span className="rounded-full bg-slate-900 text-white text-[10px] px-1.5">{counts[key]}</span>}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <ScheduleEditor
          project={project}
          subcontractors={subs}
          focusRowId={focusRowId}
          onRowsChange={(r) => { setRows(r); onRowsChange(r); }}
          saveProgress={(percent_complete) => update({ percent_complete })}
        />
      )}
      {tab === "logs" && <JobLogs project={project} logs={logs.filter((l) => l.project_id === project.id)} subs={subs} me={me} onSaved={onLogSaved} />}
      {tab === "punch" && <PunchList project={project} subcontractors={subs} user={me} onChange={onPunchChange} />}
      {tab === "inspections" && <Inspections project={project} rows={rows} user={me} onChange={onInspectionsChange} />}
      {tab === "subs" && <JobSubs project={project} rows={rows} subs={subs} canInvite={!pm} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1 truncate">{label}</p>
      {children}
    </div>
  );
}

function JobLogs({ project, logs, subs, me, onSaved }) {
  const [dialog, setDialog] = useState(null); // { log }
  const today = todayIso();
  const todays = logs.find((l) => l.log_date === today);
  const subById = Object.fromEntries(subs.map((s) => [s.id, s]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-500">One log per day: weather, crew, work done, delays, photos, and the pool barrier check.</p>
        <Button size="sm" className="ml-auto shrink-0 bg-slate-900 text-white" onClick={() => setDialog({ log: todays || null })}>
          <NotebookPen className="w-4 h-4 mr-1" /> {todays ? "Open today's log" : "Start today's log"}
        </Button>
      </div>
      {!logs.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No daily logs yet.</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {logs.map((l) => {
            const s = STATUS_STYLES[logStatus(l).status];
            const photos = progressPhotos(l);
            return (
              <button key={l.id} onClick={() => setDialog({ log: l })} className="w-full text-left px-3 py-3 hover:bg-slate-50 flex gap-3">
                {photos[0] && <img src={photos[0].url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 flex flex-wrap items-center gap-2">
                    {fmtLong(l.log_date)}
                    <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", s.className)}>Barrier: {s.label}</span>
                  </p>
                  <p className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                    {l.site_supervisor && <span><User className="w-3 h-3 inline -mt-0.5" /> {l.site_supervisor}</span>}
                    {l.weather && <span><CloudSun className="w-3 h-3 inline -mt-0.5" /> {l.weather}{l.temperature_f != null ? ` ${l.temperature_f}°` : ""}</span>}
                    {l.crew_count != null && <span><Users className="w-3 h-3 inline -mt-0.5" /> {l.crew_count} crew</span>}
                    {(l.subcontractor_ids || []).length > 0 && <span><Wrench className="w-3 h-3 inline -mt-0.5" /> {(l.subcontractor_ids || []).map((id) => subById[id]?.name).filter(Boolean).join(", ")}</span>}
                    {photos.length > 0 && <span>{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>}
                  </p>
                  {l.progress_notes && <p className="text-sm text-slate-700 mt-1 line-clamp-2">{l.progress_notes}</p>}
                  {l.delays && <p className="text-xs text-rose-700 mt-0.5"><AlertTriangle className="w-3 h-3 inline -mt-0.5" /> {l.delays}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <DailyLogDialog
        open={!!dialog}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        log={dialog?.log || null}
        projects={[project]}
        subcontractors={subs}
        user={me}
        defaultProjectId={project.id}
        pmFields
        onSaved={onSaved}
      />
    </div>
  );
}

function JobSubs({ project, rows, subs, canInvite }) {
  const [assignments, setAssignments] = useState(null);
  const [portalUsers, setPortalUsers] = useState([]);
  const [accessSub, setAccessSub] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.ProjectSubcontractor.list().catch(() => []),
      canInvite ? base44.entities.SubcontractorPortalUser.list("email").catch(() => []) : [],
    ]).then(([a, u]) => { setAssignments(a); setPortalUsers(u); });
  }, [project.id]);

  if (!assignments) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  const onJob = new Set(assignments.filter((a) => a.project_id === project.id).map((a) => a.subcontractor_id));
  const tasks = taskRows(rows).filter((r) => r.subcontractor_id);
  tasks.forEach((r) => onJob.add(r.subcontractor_id));
  const list = subs.filter((s) => onJob.has(s.id));
  const today = todayIso();

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Subs booked on this job. Book a sub by picking them on a schedule task; they then see those dates in their Subcontractor Portal app.
      </p>
      {!list.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No subs booked on this job yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((s) => {
            const theirs = tasks.filter((r) => r.subcontractor_id === s.id).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
            const logins = portalUsers.filter((u) => u.subcontractor_id === s.id && u.active).length;
            const insExpired = s.insurance_exp && s.insurance_exp < today;
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.contact_person || "No contact"}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {s.phone && <a href={`tel:${s.phone}`} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Call"><Phone className="w-4 h-4" /></a>}
                    {s.phone && <a href={`sms:${s.phone.replace(/[^\d+]/g, "")}`} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Text"><MessageSquare className="w-4 h-4" /></a>}
                    {canInvite && <button onClick={() => setAccessSub(s)} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="App access"><Smartphone className="w-4 h-4" /></button>}
                  </div>
                </div>
                {insExpired && <p className="text-xs text-rose-700"><AlertTriangle className="w-3 h-3 inline -mt-0.5" /> Liability insurance expired {fmtShort(s.insurance_exp)}</p>}
                {canInvite && !logins && <p className="text-xs text-amber-700">No app login yet, so they can't see their dates. Tap <Smartphone className="w-3 h-3 inline" /> to invite.</p>}
                {theirs.length ? (
                  <ul className="space-y-1">
                    {theirs.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className={cn("truncate", isDone(r) && "line-through text-slate-400")}>{r.is_milestone && <Flag className="w-3 h-3 inline text-violet-600 mr-1" />}{r.task}</span>
                        <span className="text-xs text-slate-500 shrink-0">{fmtShort(r.start_date)} – {fmtShort(r.end_date)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-slate-400">On the job, but not on any schedule task.</p>}
              </div>
            );
          })}
        </div>
      )}
      {accessSub && (
        <SubAccessDialog
          sub={accessSub}
          onOpenChange={(o) => { if (!o) setAccessSub(null); }}
          assignments={assignments}
          portalUsers={portalUsers}
          onPortalUsersChange={setPortalUsers}
        />
      )}
    </div>
  );
}
