import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Loader2, Search, X, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set(["planning", "in_progress", "on_hold"]);
const ALL = "all";

// Which subcontractors can see which jobs in the Builder Portal app. A sub
// only ever sees jobs checked here; the database enforces it
// (project_subcontractors + 034_subcontractor_portal.sql). Pick one or many
// subs and one or many jobs, filter jobs by company, then Assign / Unassign.
export default function JobAssignmentsTab() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subs, setSubs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [portalUsers, setPortalUsers] = useState([]);

  const [company, setCompany] = useState(ALL);
  const [activeOnly, setActiveOnly] = useState(true);
  const [jobSearch, setJobSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");
  // "Assign jobs" on a subcontractor links here with ?sub=<id> preselected.
  const [selectedSubs, setSelectedSubs] = useState(() => {
    const id = new URLSearchParams(window.location.search).get("sub");
    return new Set(id ? [id] : []);
  });
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [busy, setBusy] = useState(null); // "assign" | "unassign" | assignment id
  const [message, setMessage] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.CompanyProfile.list("name").catch(() => []),
      base44.entities.Project.list("name", 2000).catch(() => []),
      base44.entities.Subcontractor.list("name", 1000).catch(() => []),
      base44.entities.ProjectSubcontractor.list().catch(() => []),
      base44.entities.SubcontractorPortalUser.list("email").catch(() => []),
    ]).then(([c, p, s, a, u]) => {
      setCompanies(c);
      setProjects(p);
      setSubs(s.filter((x) => x.status !== "inactive"));
      setAssignments(a);
      setPortalUsers(u);
      setLoading(false);
    });
  }, []);

  const companyName = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name?.trim()])), [companies]);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const subById = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s])), [subs]);

  const inCompany = (p) => company === ALL || p.company_id === company;

  const visibleJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return projects.filter((p) =>
      inCompany(p) &&
      (!activeOnly || ACTIVE_STATUSES.has(p.status)) &&
      (!q || `${p.name} ${p.address || ""}`.toLowerCase().includes(q))
    );
  }, [projects, company, activeOnly, jobSearch]);

  const visibleSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return subs.filter((s) => !q || `${s.name} ${s.trade || ""}`.toLowerCase().includes(q));
  }, [subs, subSearch]);

  const subsByJob = useMemo(() => {
    const m = {};
    for (const a of assignments) (m[a.project_id] ||= []).push(a.subcontractor_id);
    return m;
  }, [assignments]);

  // Current assignments, limited to the selected company's jobs.
  const assignmentsBySub = useMemo(() => {
    const m = {};
    for (const a of assignments) {
      const p = projectById[a.project_id];
      if (!p || !inCompany(p)) continue;
      (m[a.subcontractor_id] ||= []).push(a);
    }
    return m;
  }, [assignments, projectById, company]);

  const toggle = (set, setter, id) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };
  const selectAll = (items, setter) => setter(new Set(items.map((x) => x.id)));

  const pairs = () => [...selectedSubs].flatMap((subcontractor_id) => [...selectedJobs].map((project_id) => ({ subcontractor_id, project_id })));

  const assign = async () => {
    const rows = pairs().filter((r) => !assignments.some((a) => a.subcontractor_id === r.subcontractor_id && a.project_id === r.project_id));
    if (!rows.length) { setMessage({ ok: true, text: "Those subcontractors already have those jobs." }); return; }
    setBusy("assign");
    setMessage(null);
    const { data, error } = await supabase
      .from("project_subcontractors")
      .upsert(rows, { onConflict: "project_id,subcontractor_id", ignoreDuplicates: true })
      .select();
    setBusy(null);
    if (error) { setMessage({ ok: false, text: `Couldn't assign: ${error.message}` }); return; }
    setAssignments((prev) => [...prev, ...(data || [])]);
    setMessage({ ok: true, text: `Assigned ${rows.length} job${rows.length !== 1 ? "s" : ""}.` });
  };

  const unassign = async () => {
    const ids = assignments
      .filter((a) => selectedSubs.has(a.subcontractor_id) && selectedJobs.has(a.project_id))
      .map((a) => a.id);
    if (!ids.length) { setMessage({ ok: true, text: "None of the selected jobs are assigned to the selected subcontractors." }); return; }
    if (!confirm(`Remove ${ids.length} assignment${ids.length !== 1 ? "s" : ""}? Those subs will stop seeing those jobs in the app.`)) return;
    setBusy("unassign");
    setMessage(null);
    const { error } = await supabase.from("project_subcontractors").delete().in("id", ids);
    setBusy(null);
    if (error) { setMessage({ ok: false, text: `Couldn't unassign: ${error.message}` }); return; }
    setAssignments((prev) => prev.filter((a) => !ids.includes(a.id)));
    setMessage({ ok: true, text: `Removed ${ids.length} assignment${ids.length !== 1 ? "s" : ""}.` });
  };

  const removeOne = async (a) => {
    setBusy(a.id);
    const { error } = await supabase.from("project_subcontractors").delete().eq("id", a.id);
    setBusy(null);
    if (error) { alert(`Couldn't remove: ${error.message}`); return; }
    setAssignments((prev) => prev.filter((x) => x.id !== a.id));
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  const pairCount = selectedSubs.size * selectedJobs.size;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Job Assignments</h2>
        <p className="text-sm text-slate-500">
          Choose which jobs each subcontractor sees in the Builder Portal app. Subs only ever see the jobs assigned here.
          They never see other jobs, clients, pricing, or another company's work. Invite a sub's crew to the app from
          Builder Portal → Subcontractor Compliance → Jobs &amp; app.
        </p>
      </div>

      {/* Company (entity) + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Company</span>
        {[{ id: ALL, name: "All companies" }, ...companies].map((c) => (
          <button key={c.id} onClick={() => { setCompany(c.id); setSelectedJobs(new Set()); }}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              company === c.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {c.name?.trim()}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={activeOnly} onCheckedChange={(v) => setActiveOnly(!!v)} /> Active jobs only
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subcontractors */}
        <Column
          title="Subcontractors"
          count={`${selectedSubs.size} of ${visibleSubs.length} selected`}
          search={subSearch}
          onSearch={setSubSearch}
          onAll={() => selectAll(visibleSubs, setSelectedSubs)}
          onNone={() => setSelectedSubs(new Set())}
          empty={subs.length === 0 ? "No subcontractors yet. Add them in Team & Subcontractors." : "No matches."}
        >
          {visibleSubs.map((s) => {
            const jobs = (assignmentsBySub[s.id] || []).length;
            const logins = portalUsers.filter((u) => u.subcontractor_id === s.id && u.active).length;
            return (
              <Row key={s.id} checked={selectedSubs.has(s.id)} onToggle={() => toggle(selectedSubs, setSelectedSubs, s.id)}
                title={s.name}
                subtitle={`${s.trade ? `${s.trade} · ` : ""}${jobs} job${jobs !== 1 ? "s" : ""} · ${logins} app login${logins !== 1 ? "s" : ""}`} />
            );
          })}
        </Column>

        {/* Jobs */}
        <Column
          title="Jobs"
          count={`${selectedJobs.size} of ${visibleJobs.length} selected`}
          search={jobSearch}
          onSearch={setJobSearch}
          onAll={() => selectAll(visibleJobs, setSelectedJobs)}
          onNone={() => setSelectedJobs(new Set())}
          empty="No jobs match these filters."
        >
          {visibleJobs.map((p) => {
            const assigned = (subsByJob[p.id] || []).map((id) => subById[id]?.name).filter(Boolean);
            return (
              <Row key={p.id} checked={selectedJobs.has(p.id)} onToggle={() => toggle(selectedJobs, setSelectedJobs, p.id)}
                title={p.name}
                badge={company === ALL ? companyName[p.company_id] || "No company" : null}
                subtitle={[p.address, assigned.length ? `Subs: ${assigned.join(", ")}` : "No subs assigned"].filter(Boolean).join(" · ")} />
            );
          })}
        </Column>
      </div>

      {/* Actions */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <p className="text-sm text-slate-600 flex-1 min-w-[12rem]">
          {selectedSubs.size} subcontractor{selectedSubs.size !== 1 ? "s" : ""} × {selectedJobs.size} job{selectedJobs.size !== 1 ? "s" : ""}
          {message && <span className={cn("ml-2", message.ok ? "text-emerald-700" : "text-red-600")}>· {message.text}</span>}
        </p>
        <Button variant="outline" disabled={!pairCount || !!busy} onClick={unassign}>
          {busy === "unassign" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unlink className="w-4 h-4 mr-1" />} Unassign
        </Button>
        <Button disabled={!pairCount || !!busy} onClick={assign} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
          {busy === "assign" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />} Assign
        </Button>
      </div>

      {/* Current assignments */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Current assignments{company !== ALL ? ` · ${companyName[company]}` : ""}</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {Object.keys(assignmentsBySub).length === 0 && <p className="px-5 py-6 text-sm text-slate-400">No jobs assigned yet.</p>}
          {subs.filter((s) => assignmentsBySub[s.id]).map((s) => (
            <div key={s.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
              <p className="text-sm font-medium text-slate-800 sm:w-56 shrink-0">{s.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {assignmentsBySub[s.id].map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 pl-2.5 pr-1 py-0.5 text-xs text-slate-700">
                    {projectById[a.project_id]?.name || "Job"}
                    <button onClick={() => removeOne(a)} disabled={busy === a.id} title="Remove" className="p-0.5 rounded-full hover:bg-slate-300">
                      {busy === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Column({ title, count, search, onSearch, onAll, onNone, empty, children }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white flex flex-col">
      <div className="px-4 pt-3 pb-2 space-y-2 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <span className="text-xs text-slate-500">{count}</span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}`} className="pl-8 h-9" />
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={onAll} className="text-amber-700 hover:underline">Select all shown</button>
          <button onClick={onNone} className="text-slate-500 hover:underline">Clear</button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
        {items.filter(Boolean).length === 0 ? <p className="px-4 py-6 text-sm text-slate-400">{empty}</p> : children}
      </div>
    </div>
  );
}

function Row({ checked, onToggle, title, subtitle, badge }) {
  return (
    <label className={cn("flex items-start gap-3 px-4 py-2.5 cursor-pointer", checked ? "bg-amber-50" : "hover:bg-slate-50")}>
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm text-slate-800 truncate">{title}</span>
          {badge && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{badge}</span>}
        </span>
        {subtitle && <span className="block text-xs text-slate-500 truncate">{subtitle}</span>}
      </span>
    </label>
  );
}
