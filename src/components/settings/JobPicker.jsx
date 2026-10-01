import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Pick the jobs a subcontractor or builder is on, right in their create/edit
// form. Shows open jobs (planning, in progress, on hold) plus any job already
// picked. Save with saveSubJobs / savePmJobs (src/lib/jobAssignments.js).
//   mode "pm": shows each job's current project manager, since picking a job
//   makes this person its PM instead.
const OPEN = new Set(["planning", "in_progress", "on_hold"]);
const STATUS_LABEL = { planning: "Planning", in_progress: "In progress", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };

export default function JobPicker({ value, onChange, mode = "sub", personName = "", initialIds = [] }) {
  const [projects, setProjects] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    base44.entities.Project.list("-created_date", 1000).then(setProjects).catch(() => setProjects([]));
  }, []);

  const selected = useMemo(() => new Set(value || []), [value]);
  const shown = useMemo(() => {
    const keep = new Set([...(initialIds || []), ...(value || [])]);
    const term = q.trim().toLowerCase();
    return (projects || [])
      .filter((p) => OPEN.has(p.status) || keep.has(p.id))
      .filter((p) => !term || `${p.name} ${p.address || ""} ${p.project_manager || ""}`.toLowerCase().includes(term))
      .sort((a, b) => (selected.has(b.id) - selected.has(a.id)) || (a.name || "").localeCompare(b.name || ""));
  }, [projects, q, initialIds, value, selected]);

  const toggle = (id) => onChange(selected.has(id) ? [...selected].filter((x) => x !== id) : [...selected, id]);
  const me = personName.trim().toLowerCase();

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs…"
          className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
        {!projects ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-amber-500" /></div>
        ) : shown.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-400">{q ? "No jobs match." : "No open jobs."}</p>
        ) : shown.map((p) => {
          const otherPm = mode === "pm" && p.project_manager && p.project_manager.trim().toLowerCase() !== me ? p.project_manager : null;
          return (
            <label key={p.id} className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-slate-800">{p.name}</span>
                <span className="block truncate text-xs text-slate-400">
                  {STATUS_LABEL[p.status] || p.status}{p.address ? ` · ${p.address}` : ""}
                </span>
                {otherPm && (
                  <span className={cn("block text-xs", selected.has(p.id) ? "text-amber-700" : "text-slate-400")}>
                    PM now: {otherPm}{selected.has(p.id) ? " (will be replaced)" : ""}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">{selected.size} job{selected.size === 1 ? "" : "s"} picked</p>
    </div>
  );
}
