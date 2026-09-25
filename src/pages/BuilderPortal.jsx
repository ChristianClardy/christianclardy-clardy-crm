import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { HardHat, Plus, Camera, AlertTriangle, CheckCircle2, FileSignature, ImageIcon, X, Smartphone, Fence } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { logStatus, STATUS_STYLES, SUB_REQUIREMENTS, FENCE_CHECKPOINTS, photoKind, progressPhotos, fencePhotos } from "@/lib/barrierChecklist";
import DailyLogDialog from "@/components/builder/DailyLogDialog";
import SubAcknowledgmentDialog from "@/components/builder/SubAcknowledgmentDialog";
import SubAccessDialog from "@/components/builder/SubAccessDialog";

const STAFF_TABS = [
  { key: "today", label: "Today" },
  { key: "logs", label: "Daily Logs" },
  { key: "photos", label: "Photos" },
  { key: "subs", label: "Subcontractor Compliance" },
];

const PORTAL_TABS = [
  { key: "today", label: "Today" },
  { key: "logs", label: "Daily Logs" },
  { key: "photos", label: "Photos" },
  { key: "policy", label: "Barrier Policy" },
];

const ALL = "__all__";

const PHOTO_FILTERS = [
  { key: "all", label: "All photos" },
  { key: "progress", label: "Progress" },
  { key: "fence", label: "Fence compliance" },
];

function photoLabel(ph) {
  if (photoKind(ph) !== "fence") return "Progress";
  const cp = FENCE_CHECKPOINTS.find((c) => c.value === ph.checkpoint);
  return `Fence${cp ? ` · ${cp.label}` : ""}`;
}
const ACTIVE_STATUSES = new Set(["planning", "in_progress", "on_hold"]);
const todayStr = () => new Date().toLocaleDateString("en-CA");
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");

function StatusBadge({ log }) {
  const { status, answered, total } = logStatus(log);
  const s = STATUS_STYLES[status];
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", s.className)}>
      {s.label}{status === "incomplete" ? ` · ${answered}/${total}` : ""}
    </span>
  );
}

// `portal` is the subcontractor_portal_users row when a subcontractor is signed
// in (see App.jsx); staff get the full view with no prop. In portal mode the
// database policies already limit every query to the sub's assigned jobs.
export default function BuilderPortal({ portal = null }) {
  const isPortal = !!portal;
  const TABS = isPortal ? PORTAL_TABS : STAFF_TABS;
  const companyScope = useCompanyScope();
  const scope = isPortal ? "all" : companyScope;
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [logs, setLogs] = useState([]);
  const [acks, setAcks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [portalUsers, setPortalUsers] = useState([]);
  const [accessDialogSub, setAccessDialogSub] = useState(null);
  const [projectFilter, setProjectFilter] = useState(ALL);
  const [logDialog, setLogDialog] = useState({ open: false, log: null, projectId: null });
  const [ackDialog, setAckDialog] = useState({ open: false, ack: null, subId: null });
  const [lightbox, setLightbox] = useState(null);
  const [photoFilter, setPhotoFilter] = useState("all");

  const load = async () => {
    const [me, p, s, l, a, asg, pu] = await Promise.all([
      base44.auth.me().catch(() => null),
      isPortal
        ? supabase.rpc("sub_portal_projects").then(({ data }) => data || [])
        : base44.entities.Project.list("-created_date", 1000).catch(() => []),
      isPortal
        ? base44.entities.Subcontractor.filter({ id: portal.subcontractor_id }).catch(() => [])
        : base44.entities.Subcontractor.list("name", 1000).catch(() => []),
      base44.entities.BarrierDailyLog.list("-log_date", 2000).catch(() => []),
      base44.entities.SubBarrierAck.list("-signed_date", 1000).catch(() => []),
      isPortal ? [] : base44.entities.ProjectSubcontractor.list().catch(() => []),
      isPortal ? [] : base44.entities.SubcontractorPortalUser.list("email").catch(() => []),
    ]);
    setUser(me);
    setProjects(p);
    setSubcontractors(isPortal ? s : s.filter((x) => x.status !== "inactive"));
    setLogs(l);
    setAcks(a);
    setAssignments(asg);
    setPortalUsers(pu);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const scopedProjects = useMemo(() => scopeFilter(projects, scope), [projects, scope]);
  const activeProjects = useMemo(() => scopedProjects.filter((p) => ACTIVE_STATUSES.has(p.status)), [scopedProjects]);
  const scopedLogs = useMemo(() => scopeFilter(logs, scope), [logs, scope]);
  const scopedAcks = useMemo(() => scopeFilter(acks, scope), [acks, scope]);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const subById = useMemo(() => Object.fromEntries(subcontractors.map((s) => [s.id, s])), [subcontractors]);

  const filteredLogs = projectFilter === ALL ? scopedLogs : scopedLogs.filter((l) => l.project_id === projectFilter);
  const openDeficiencies = scopedLogs.filter((l) => logStatus(l).status === "deficiency");
  const today = todayStr();
  const todaysLogs = scopedLogs.filter((l) => l.log_date === today);

  const photos = useMemo(
    () => filteredLogs
      .flatMap((l) => (l.photos || []).map((ph) => ({ ...ph, log: l })))
      .filter((ph) => photoFilter === "all" || photoKind(ph) === photoFilter),
    [filteredLogs, photoFilter]
  );
  const compliantToday = new Set(todaysLogs.filter((l) => logStatus(l).status === "compliant").map((l) => l.project_id));

  // Latest acknowledgment per subcontractor. Project-less acks cover all projects.
  const latestAckBySub = useMemo(() => {
    const m = {};
    for (const a of scopedAcks) {
      const cur = m[a.subcontractor_id];
      if (!cur || (a.signed_date || "") > (cur.signed_date || "")) m[a.subcontractor_id] = a;
    }
    return m;
  }, [scopedAcks]);

  const unsignedOnSiteToday = [...new Set(todaysLogs.flatMap((l) => l.subcontractor_ids || []))].filter((id) => !latestAckBySub[id]);

  const openLog = (log = null, projectId = null) => setLogDialog({ open: true, log, projectId });
  const onLogSaved = (saved) => setLogs((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)].sort((a, b) => (b.log_date || "").localeCompare(a.log_date || "")));
  const onAckSaved = (saved) => setAcks((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);

  const deleteLog = async (log) => {
    if (!confirm(`Delete the ${fmtDate(log.log_date)} log for ${projectById[log.project_id]?.name || "this project"}?`)) return;
    await base44.entities.BarrierDailyLog.delete(log.id);
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2" style={{ color: "#3d3530" }}>
            <HardHat className="w-7 h-7" style={{ color: "#b5965a" }} /> Builder Portal
          </h1>
          <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>
            {isPortal ? `${subcontractors[0]?.name || "Subcontractor"} · daily progress, fence compliance & barrier policy` : "Daily progress photos & daily fence (pool barrier) compliance"}
          </p>
        </div>
        <Button onClick={() => openLog(null, projectFilter !== ALL ? projectFilter : null)} className="gap-2" style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
          <Plus className="w-4 h-4" /> New daily log
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Fence} label="Fence compliant today" value={`${activeProjects.filter((p) => compliantToday.has(p.id)).length} / ${activeProjects.length}`} onClick={() => setTab("today")} />
        <Tile icon={AlertTriangle} label="Open deficiencies" value={openDeficiencies.length} alert={openDeficiencies.length > 0} onClick={() => setTab("logs")} />
        <Tile icon={Camera} label="Progress photos today" value={todaysLogs.reduce((n, l) => n + progressPhotos(l).length, 0)} onClick={() => { setPhotoFilter("progress"); setTab("photos"); }} />
        {isPortal ? (
          <Tile icon={FileSignature} label="Barrier policy" value={latestAckBySub[portal.subcontractor_id] ? "Signed" : "Not signed"} alert={!latestAckBySub[portal.subcontractor_id]} onClick={() => setTab("policy")} />
        ) : (
          <Tile icon={FileSignature} label="Subs without signed policy" value={subcontractors.filter((s) => !latestAckBySub[s.id]).length} alert={unsignedOnSiteToday.length > 0} onClick={() => setTab("subs")} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ backgroundColor: "#ede6dd" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-all", tab === t.key ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <div className="space-y-3">
          {!isPortal && unsignedOnSiteToday.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>On site today without a signed barrier policy acknowledgment: <strong>{unsignedOnSiteToday.map((id) => subById[id]?.name || "Unknown").join(", ")}</strong></span>
            </div>
          )}
          {isPortal && !latestAckBySub[portal.subcontractor_id] && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
              <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Sign the Pool Barrier Safety policy before working on a Principle pool or spa job.</span>
              <Button size="sm" onClick={() => setAckDialog({ open: true, ack: null, subId: portal.subcontractor_id })} className="shrink-0" style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>Sign now</Button>
            </div>
          )}
          {activeProjects.length === 0 && (
            <Empty text={isPortal ? "You haven't been assigned to any active jobs yet. Your Principle project manager assigns jobs." : "No active projects (planning / in progress / on hold) in this company scope."} />
          )}
          {activeProjects.map((p) => {
            const log = todaysLogs.find((l) => l.project_id === p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3" style={{ borderColor: "#ddd5c8" }}>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">{p.address || "No address"}{p.project_manager ? ` · PM ${p.project_manager}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {log ? (
                    <>
                      <span className="text-xs text-slate-500 flex items-center gap-1" title="Progress photos today">
                        <Camera className="w-3.5 h-3.5" />{progressPhotos(log).length}
                      </span>
                      <span className={cn("text-xs flex items-center gap-1", fencePhotos(log).length ? "text-emerald-700" : "text-amber-700")} title="Fence compliance photos today">
                        <Fence className="w-3.5 h-3.5" />{fencePhotos(log).length}
                      </span>
                      <StatusBadge log={log} />
                      <Button size="sm" variant="outline" onClick={() => openLog(log)}>Open</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Not logged</span>
                      <Button size="sm" onClick={() => openLog(null, p.id)} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>Start log</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(tab === "logs" || tab === "photos") && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Project</span>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-72 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {scopedProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {tab === "logs" && (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#ddd5c8" }}>
          {filteredLogs.length === 0 && <Empty text="No daily logs yet." />}
          <ul className="divide-y divide-slate-100">
            {filteredLogs.map((l) => (
              <li key={l.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => openLog(l)}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{projectById[l.project_id]?.name || "Unknown project"}</p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(l.log_date)}{l.site_supervisor ? ` · ${l.site_supervisor}` : ""}
                    {(l.subcontractor_ids || []).length > 0 && ` · Subs: ${l.subcontractor_ids.map((id) => subById[id]?.name).filter(Boolean).join(", ")}`}
                  </p>
                  {logStatus(l).status === "deficiency" && l.deficiency_description && (
                    <p className="text-xs text-red-600 mt-0.5 truncate">⚠ {l.deficiency_description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(l.photos || []).slice(0, 3).map((ph) => <img key={ph.url} src={ph.url} alt="" className="w-9 h-9 rounded object-cover" />)}
                  {(l.photos?.length || 0) > 3 && <span className="text-xs text-slate-500">+{l.photos.length - 3}</span>}
                  <StatusBadge log={l} />
                  {!isPortal && <button onClick={(e) => { e.stopPropagation(); deleteLog(l); }} className="text-xs text-slate-400 hover:text-red-600 px-1">Delete</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "photos" && (
        <div className="flex gap-2 flex-wrap">
          {PHOTO_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setPhotoFilter(f.key)}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                photoFilter === f.key ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50")}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {tab === "photos" && (
        photos.length === 0 ? <Empty text="No photos here yet. Add them from a daily log." icon={ImageIcon} /> : (
          <div className="space-y-6">
            {groupBy(photos, (ph) => ph.log.log_date).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">{fmtDate(date)}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {items.map((ph) => (
                    <button key={ph.url} onClick={() => setLightbox(ph)} className="text-left">
                      <div className="relative">
                        <img src={ph.url} alt={ph.caption || ""} className="w-full h-32 object-cover rounded-lg" />
                        <span className={cn("absolute top-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          photoKind(ph) === "fence" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white")}>
                          {photoLabel(ph)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 truncate">{ph.caption || projectById[ph.log.project_id]?.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "subs" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-600">Every subcontractor must sign the Mandatory Subcontractor Requirements for Pool Construction Barrier Safety before working on a Principle pool/spa project.</p>
            <Button size="sm" variant="outline" onClick={() => setAckDialog({ open: true, ack: null, subId: null })} className="shrink-0 ml-3">
              <FileSignature className="w-4 h-4 mr-1" /> Record signature
            </Button>
          </div>
          <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#ddd5c8" }}>
            {subcontractors.length === 0 && <Empty text="No subcontractors yet. Add them in Settings → Team & Subcontractors → Subcontractors." />}
            <ul className="divide-y divide-slate-100">
              {subcontractors.map((s) => {
                const ack = latestAckBySub[s.id];
                const jobCount = assignments.filter((a) => a.subcontractor_id === s.id).length;
                const loginCount = portalUsers.filter((u) => u.subcontractor_id === s.id && u.active).length;
                const lastOnSite = scopedLogs.find((l) => (l.subcontractor_ids || []).includes(s.id));
                return (
                  <li key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{s.name}{s.trade ? <span className="text-slate-500 font-normal"> · {s.trade}</span> : null}</p>
                      <p className="text-xs text-slate-500">
                        {ack ? `Signed ${fmtDate(ack.signed_date)}${ack.authorized_representative ? ` by ${ack.authorized_representative}` : ""}${ack.project_id ? ` · ${projectById[ack.project_id]?.name || "project"}` : " · all projects"}` : "No signed acknowledgment on file"}
                        {lastOnSite && ` · Last on site ${fmtDate(lastOnSite.log_date)}`}
                      </p>
                      <p className="text-xs text-slate-500">{jobCount} job{jobCount !== 1 ? "s" : ""} assigned · {loginCount} app login{loginCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ack ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signed</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Not signed</span>
                      )}
                      {ack?.document_url && <a href={ack.document_url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-700 hover:underline">Document</a>}
                      <Button size="sm" variant="outline" onClick={() => setAckDialog({ open: true, ack: ack || null, subId: s.id })}>
                        {ack ? "View" : "Record"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAccessDialogSub(s)}>
                        <Smartphone className="w-4 h-4 mr-1" /> Jobs & app
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {tab === "policy" && isPortal && (() => {
        const ack = latestAckBySub[portal.subcontractor_id];
        return (
          <div className="space-y-4">
            <div className={cn("rounded-xl border px-4 py-3 flex items-center justify-between gap-3", ack ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
              <p className={cn("text-sm", ack ? "text-emerald-700" : "text-red-700")}>
                {ack ? `Signed ${fmtDate(ack.signed_date)}${ack.authorized_representative ? ` by ${ack.authorized_representative}` : ""}.` : "Not signed yet."}
              </p>
              {!ack && (
                <Button size="sm" onClick={() => setAckDialog({ open: true, ack: null, subId: portal.subcontractor_id })} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>Sign policy</Button>
              )}
            </div>
            <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: "#ddd5c8" }}>
              <h3 className="font-semibold text-slate-900">Mandatory Subcontractor Requirements: Pool Construction Barrier Safety</h3>
              <ol className="space-y-2 list-decimal list-inside">
                {SUB_REQUIREMENTS.map(([title, body]) => (
                  <li key={title} className="text-sm text-slate-600"><span className="font-medium text-slate-800">{title}.</span> {body}</li>
                ))}
              </ol>
            </div>
          </div>
        );
      })()}

      <DailyLogDialog
        open={logDialog.open}
        onOpenChange={(open) => setLogDialog((d) => ({ ...d, open }))}
        log={logDialog.log}
        defaultProjectId={logDialog.projectId}
        projects={scopedProjects}
        subcontractors={subcontractors}
        defaultSubIds={isPortal ? [portal.subcontractor_id] : []}
        user={user}
        onSaved={onLogSaved}
      />
      <SubAcknowledgmentDialog
        open={ackDialog.open}
        onOpenChange={(open) => setAckDialog((d) => ({ ...d, open }))}
        ack={ackDialog.ack}
        defaultSubId={ackDialog.subId}
        subcontractors={subcontractors}
        projects={scopedProjects}
        user={user}
        portalMode={isPortal}
        onSaved={onAckSaved}
      />
      {!isPortal && (
        <SubAccessDialog
          sub={accessDialogSub}
          onOpenChange={(open) => { if (!open) setAccessDialogSub(null); }}
          assignments={assignments}
          portalUsers={portalUsers}
          onPortalUsersChange={setPortalUsers}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white"><X className="w-6 h-6" /></button>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.caption || ""} className="max-h-[80vh] mx-auto rounded-lg" />
            <p className="text-white text-sm mt-2 text-center">
              {projectById[lightbox.log.project_id]?.name} · {fmtDate(lightbox.log.log_date)} · {photoLabel(lightbox)}{lightbox.caption ? ` — ${lightbox.caption}` : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, alert, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={cn("text-left rounded-xl border bg-white px-4 py-3", onClick && "hover:shadow-sm", alert && "border-red-200 bg-red-50")}
      style={alert ? undefined : { borderColor: "#ddd5c8" }}>
      <div className="flex items-center gap-2 text-xs text-slate-500"><Icon className={cn("w-4 h-4", alert && "text-red-500")} />{label}</div>
      <p className={cn("text-2xl font-bold mt-1", alert ? "text-red-700" : "text-slate-900")}>{value}</p>
    </button>
  );
}

function Empty({ text, icon: Icon = HardHat }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <Icon className="w-8 h-8 mb-2" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function groupBy(list, keyFn) {
  const m = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return [...m.entries()];
}
