import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Loader2, Play, Check, Flag, ClipboardCheck, ListTree, GanttChartSquare, ChevronUp, ChevronDown,
  Trash2, AlertTriangle, CalendarRange, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import GanttView from "@/components/sheet/GanttView";
import {
  STATUSES, STATUS_STYLE, TEMPLATES, buildFromTemplate, recalc, dependentsOf, newPhaseRow, newTaskRow,
  endFromDuration, workdaysBetween, onWorkday, percentComplete, isDone, todayIso, fmtShort, taskRows,
  normalizeRows, chainFrom, fromTemplateRows, parseDuration,
} from "@/lib/schedule";
import { STOCK_SCHEDULE_TEMPLATES } from "@/lib/stockScheduleTemplates";

// The job schedule: phases and tasks with dates, subs, and dependencies.
// Stored in project_sheets.rows (see src/lib/schedule.js). Every change is
// recalculated (later tasks shift) and saved automatically.
// `saveProgress(percent)` overrides how the job's percent complete is saved
// (PM-only logins can't write projects directly).
export default function ScheduleEditor({ project, subcontractors, focusRowId, onRowsChange, saveProgress }) {
  // Ref, not state: debounced and on-leave saves must see the id a moment-ago
  // create returned, or a new schedule would be created twice.
  const sheetIdRef = useRef(null);
  const saving = useRef(Promise.resolve());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("saved"); // saving | saved | error
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null); // row being edited, or { newIn: phaseRowId }
  const [hideDone, setHideDone] = useState(false);
  const saveTimer = useRef();
  const pending = useRef(null);

  const subById = useMemo(() => Object.fromEntries(subcontractors.map((s) => [s.id, s])), [subcontractors]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sheets = await base44.entities.ProjectSheet.filter({ project_id: project.id }).catch(() => []);
      if (!alive) return;
      const sheet = sheets[0];
      sheetIdRef.current = sheet?.id || null;
      setRows(normalizeRows(sheet?.rows));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [project.id]);

  useEffect(() => { if (!loading) onRowsChange?.(rows); }, [rows, loading]);

  useEffect(() => {
    if (!focusRowId || loading) return;
    const row = rows.find((r) => r.id === focusRowId);
    if (row) setEditing(row);
  }, [focusRowId, loading]);

  // Flush a pending save when leaving the page.
  useEffect(() => () => { if (pending.current) persist(pending.current); }, []);

  // Saves run one after another so a create always finishes before the next update.
  const persist = (next) => {
    pending.current = null;
    setSaveState("saving");
    saving.current = saving.current.then(async () => {
      try {
        if (sheetIdRef.current) {
          await base44.entities.ProjectSheet.update(sheetIdRef.current, { rows: next });
        } else {
          const created = await base44.entities.ProjectSheet.create({ project_id: project.id, rows: next });
          sheetIdRef.current = created.id;
        }
        if (saveProgress) await saveProgress(percentComplete(next));
        else await base44.entities.Project.update(project.id, { percent_complete: percentComplete(next) });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    });
    return saving.current;
  };

  // Book a sub onto the job so they can see it in the Subcontractor Portal.
  const ensureAssigned = async (subId) => {
    if (!subId) return;
    const existing = await base44.entities.ProjectSubcontractor.filter({ project_id: project.id, subcontractor_id: subId }).catch(() => []);
    if (!existing.length) await base44.entities.ProjectSubcontractor.create({ project_id: project.id, subcontractor_id: subId }).catch(() => {});
  };

  const commit = (next) => {
    const calc = recalc(next);
    setRows(calc);
    pending.current = calc;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(calc), 500);
  };

  const updateRow = (id, patch) => {
    const before = rows.find((r) => r.id === id);
    if (patch.subcontractor_id && patch.subcontractor_id !== before?.subcontractor_id) ensureAssigned(patch.subcontractor_id);
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const start = (row) => {
    const today = todayIso();
    updateRow(row.id, { status: "In Progress", start_date: row.start_date && row.start_date <= today ? row.start_date : onWorkday(today) });
  };
  const finish = (row) => updateRow(row.id, { status: "Completed", percent_complete: 100, end_date: row.end_date && row.end_date < todayIso() ? row.end_date : todayIso() });

  // Builder templates come dated and chained; stock ones are dated here.
  const applyTemplate = (key, startDate) => {
    const stock = STOCK_SCHEDULE_TEMPLATES.find((t) => t.key === key && !TEMPLATES.some((b) => b.key === key));
    commit(stock ? fromTemplateRows(stock.rows, startDate) : buildFromTemplate(key, startDate));
  };

  const addPhase = () => {
    const name = prompt("Phase name (e.g. DECKING)");
    if (name?.trim()) commit([...rows, newPhaseRow(name.trim())]);
  };

  const renamePhase = (row) => {
    const name = prompt("Rename phase", row.section);
    if (name?.trim()) updateRow(row.id, { section: name.trim().toUpperCase() });
  };

  const deletePhase = (row) => {
    const idx = rows.findIndex((r) => r.id === row.id);
    let end = idx + 1;
    while (end < rows.length && !rows[end].is_section_header) end++;
    const count = end - idx - 1;
    if (!confirm(`Delete the ${row.section} phase${count ? ` and its ${count} task${count !== 1 ? "s" : ""}` : ""}?`)) return;
    const removed = new Set(rows.slice(idx, end).map((r) => r.id));
    commit(rows.filter((r) => !removed.has(r.id)).map((r) => (removed.has(r.depends_on) ? { ...r, depends_on: null } : r)));
  };

  const saveTask = (draft, phaseId) => {
    if (draft.subcontractor_id) ensureAssigned(draft.subcontractor_id);
    if (rows.some((r) => r.id === draft.id)) {
      commit(rows.map((r) => (r.id === draft.id ? draft : r)));
    } else {
      // New task: after the last task of its phase.
      const idx = rows.findIndex((r) => r.id === phaseId);
      let at = idx < 0 ? rows.length : idx + 1;
      while (at < rows.length && !rows[at].is_section_header) at++;
      commit([...rows.slice(0, at), draft, ...rows.slice(at)]);
    }
    setEditing(null);
  };

  const deleteTask = (row) => {
    commit(rows.filter((r) => r.id !== row.id).map((r) => (r.depends_on === row.id ? { ...r, depends_on: row.depends_on || null } : r)));
    setEditing(null);
  };

  const move = (row, dir) => {
    const i = rows.findIndex((r) => r.id === row.id);
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  if (!taskRows(rows).length && !rows.length) return <TemplatePicker project={project} onPick={applyTemplate} onBlank={addPhase} />;

  const today = todayIso();
  const tasks = taskRows(rows);
  const doneCount = tasks.filter(isDone).length;
  const undated = tasks.length > 0 && !tasks.some((r) => r.start_date);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {[["list", ListTree, "List"], ["gantt", GanttChartSquare, "Gantt"]].map(([key, Icon, label]) => (
            <button key={key} onClick={() => setView(key)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900")}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={addPhase}><Plus className="w-4 h-4 mr-1" /> Phase</Button>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed
        </label>
        <span className="ml-auto text-xs text-slate-500">
          {doneCount}/{tasks.length} done · {percentComplete(rows)}% ·{" "}
          {saveState === "saving" ? "Saving…" : saveState === "error" ? <span className="text-rose-600">Not saved, check your connection</span> : "Saved"}
        </span>
      </div>

      {undated && <DateSetter project={project} count={tasks.length} onSet={(start) => commit(chainFrom(rows, start))} />}

      {view === "gantt" ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <GanttView rows={rows} />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {rows.map((row) => {
            if (row.is_section_header) {
              return (
                <div key={row.id} className="flex items-center gap-2 bg-slate-50 px-3 py-2">
                  <button onClick={() => renamePhase(row)} className="text-xs font-bold tracking-wider text-slate-700 hover:underline">{row.section || "PHASE"}</button>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing({ newIn: row.id })}><Plus className="w-3.5 h-3.5 mr-0.5" /> Task</Button>
                    <button onClick={() => move(row, -1)} className="p-1 text-slate-400 hover:text-slate-700" title="Move up"><ChevronUp className="w-4 h-4" /></button>
                    <button onClick={() => move(row, 1)} className="p-1 text-slate-400 hover:text-slate-700" title="Move down"><ChevronDown className="w-4 h-4" /></button>
                    <button onClick={() => deletePhase(row)} className="p-1 text-slate-400 hover:text-rose-600" title="Delete phase"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            }
            if (hideDone && isDone(row)) return null;
            const late = !isDone(row) && row.end_date && row.end_date < today;
            const sub = subById[row.subcontractor_id];
            return (
              <div key={row.id} className={cn("flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5", focusRowId === row.id && "bg-amber-50")}>
                <button onClick={() => setEditing(row)} className="flex-1 min-w-0 text-left">
                  <p className={cn("text-sm font-medium text-slate-900 flex items-center gap-1.5", isDone(row) && "text-slate-400 line-through")}>
                    {row.is_milestone && <Flag className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                    {row.needs_inspection && <ClipboardCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                    <span className="truncate">{row.task || "Untitled task"}</span>
                  </p>
                  <p className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                    <span className={cn(late && "text-rose-600 font-medium")}>
                      <CalendarRange className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                      {row.start_date ? `${fmtShort(row.start_date)} – ${fmtShort(row.end_date)} · ` : "No dates · "}{parseDuration(row.duration)}d{late ? " · overdue" : ""}
                    </span>
                    {sub && <span><Wrench className="w-3 h-3 inline -mt-0.5 mr-0.5" />{sub.name}</span>}
                    {row.assigned_to && !sub && <span>{row.assigned_to}</span>}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={row.status || "Not Started"}
                    onChange={(e) => (e.target.value === "Completed" ? finish(row) : e.target.value === "In Progress" && row.status !== "In Progress" ? start(row) : updateRow(row.id, { status: e.target.value }))}
                    className={cn("h-8 rounded-md border-0 px-2 text-xs font-medium", STATUS_STYLE[row.status] || STATUS_STYLE["Not Started"])}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {!isDone(row) && row.status !== "In Progress" && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => start(row)}><Play className="w-3.5 h-3.5 mr-1" /> Start</Button>
                  )}
                  {row.status === "In Progress" && (
                    <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => finish(row)}><Check className="w-3.5 h-3.5 mr-1" /> Done</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <TaskDialog
          row={editing.newIn ? null : editing}
          phaseId={editing.newIn}
          rows={rows}
          subcontractors={subcontractors}
          onClose={() => setEditing(null)}
          onSave={(draft) => saveTask(draft, editing.newIn)}
          onDelete={deleteTask}
          onMove={(row, dir) => move(row, dir)}
        />
      )}
    </div>
  );
}

function DateSetter({ project, count, onSet }) {
  const [start, setStart] = useState(project.start_date || todayIso());
  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex-1 text-sm text-amber-900">
        <p className="font-medium">These {count} tasks don't have dates yet.</p>
        <p className="text-xs">Pick the start date and each task will follow the one before it, using its workdays.</p>
      </div>
      <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40 bg-white" />
      <Button size="sm" className="h-9 bg-slate-900 text-white" onClick={() => start && onSet(start)}>Set dates</Button>
    </div>
  );
}

function TemplatePicker({ project, onPick, onBlank }) {
  const [startDate, setStartDate] = useState(project.start_date || todayIso());
  const [key, setKey] = useState(project.project_type?.toLowerCase().includes("pool") || !project.project_type ? "pool" : "outdoor");
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 space-y-4 max-w-xl">
      <div>
        <h3 className="font-semibold text-slate-900">Build this job's schedule</h3>
        <p className="text-sm text-slate-500">Start from a template. Every task is chained to the one before it, so when one slips, the rest move with it. You can change anything afterwards.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Template</Label>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
            <optgroup label="Pools & outdoor living">
              {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
            <optgroup label="Other">
              {STOCK_SCHEDULE_TEMPLATES.filter((t) => !TEMPLATES.some((b) => b.key === t.key)).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <Label className="text-xs">Job starts</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-9" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onPick(key, startDate)} className="bg-slate-900 text-white">Create schedule</Button>
        <Button variant="outline" onClick={onBlank}>Start blank</Button>
      </div>
    </div>
  );
}

function TaskDialog({ row, phaseId, rows, subcontractors, onClose, onSave, onDelete, onMove }) {
  const isNew = !row;
  const [draft, setDraft] = useState(() => {
    if (row) return { ...row };
    // Default a new task to follow the last task in its phase.
    const idx = rows.findIndex((r) => r.id === phaseId);
    let last = null;
    for (let i = idx + 1; i < rows.length && !rows[i].is_section_header; i++) last = rows[i];
    const prev = last || [...rows.slice(0, Math.max(idx, 0))].reverse().find((r) => !r.is_section_header) || null;
    const start = prev?.end_date ? null : onWorkday(todayIso());
    return newTaskRow({ depends_on: prev?.id || null, start_date: start || "", end_date: start ? endFromDuration(start, 1) : "" });
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const others = taskRows(rows).filter((r) => r.id !== draft.id);
  const downstream = row ? dependentsOf(rows, row.id).size : 0;
  const datesChanged = row && (draft.start_date !== row.start_date || String(draft.duration) !== String(row.duration) || draft.end_date !== row.end_date);

  const setStart = (v) => set({ start_date: v, end_date: v ? endFromDuration(v, draft.duration) : "" });
  const setDuration = (v) => set({ duration: v, end_date: draft.start_date ? endFromDuration(draft.start_date, v) : draft.end_date });
  const setEnd = (v) => set({ end_date: v, duration: draft.start_date && v ? String(workdaysBetween(draft.start_date, v)) : draft.duration });

  const submit = (e) => {
    e.preventDefault();
    if (!draft.task.trim()) return;
    onSave({ ...draft, task: draft.task.trim(), percent_complete: isDone(draft) ? 100 : Number(draft.percent_complete) || 0 });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "Add task" : "Edit task"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Task</Label>
            <Input autoFocus={isNew} required value={draft.task} onChange={(e) => set({ task: e.target.value })} className="mt-1" placeholder="e.g. Gunite" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="date" value={draft.start_date || ""} onChange={(e) => setStart(e.target.value)} className="mt-1 h-9 text-sm px-2" disabled={!!draft.depends_on && !isDone(draft) && draft.status !== "In Progress"} />
            </div>
            <div>
              <Label className="text-xs">Workdays</Label>
              <Input type="number" min="1" value={draft.duration || ""} onChange={(e) => setDuration(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="date" value={draft.end_date || ""} onChange={(e) => setEnd(e.target.value)} className="mt-1 h-9 text-sm px-2" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Starts after</Label>
            <select value={draft.depends_on || ""} onChange={(e) => set({ depends_on: e.target.value || null })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
              <option value="">Nothing, I'll set the start date</option>
              {others.map((r) => <option key={r.id} value={r.id}>{r.task} (ends {fmtShort(r.end_date)})</option>)}
            </select>
            {draft.depends_on && !isDone(draft) && draft.status !== "In Progress" && (
              <p className="text-xs text-slate-500 mt-1">Starts the workday after that task ends, and moves when it moves.</p>
            )}
          </div>

          {datesChanged && downstream > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Saving moves {downstream} later task{downstream !== 1 ? "s" : ""} that depend on this one.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Subcontractor</Label>
              <select value={draft.subcontractor_id || ""} onChange={(e) => set({ subcontractor_id: e.target.value || null })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">None / our crew</option>
                {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <select value={draft.status || "Not Started"} onChange={(e) => set({ status: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {draft.subcontractor_id && (
            <p className="text-xs text-slate-500 -mt-2">They'll see this task and its dates in their Subcontractor Portal app, and get access to this job.</p>
          )}

          {!isDone(draft) && (
            <div>
              <Label className="text-xs">Progress: {Number(draft.percent_complete) || 0}%</Label>
              <input type="range" min="0" max="100" step="5" value={Number(draft.percent_complete) || 0} onChange={(e) => set({ percent_complete: Number(e.target.value) })} className="w-full mt-1 accent-amber-500" />
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!draft.is_milestone} onChange={(e) => set({ is_milestone: e.target.checked })} /><Flag className="w-4 h-4 text-violet-600" /> Milestone</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!draft.needs_inspection} onChange={(e) => set({ needs_inspection: e.target.checked })} /><ClipboardCheck className="w-4 h-4 text-sky-600" /> Needs inspection</label>
          </div>

          <div>
            <Label className="text-xs">Note for the sub (they can see this)</Label>
            <Textarea rows={2} value={draft.sub_notes || ""} onChange={(e) => set({ sub_notes: e.target.value })} className="mt-1 text-sm" placeholder="Gate code, where to stage materials…" />
          </div>
          <div>
            <Label className="text-xs">Internal notes</Label>
            <Textarea rows={2} value={draft.notes || ""} onChange={(e) => set({ notes: e.target.value })} className="mt-1 text-sm" />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {!isNew && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => onMove(row, -1)}><ChevronUp className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onMove(row, 1)}><ChevronDown className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="sm" className="text-rose-600" onClick={() => { if (confirm(`Delete "${row.task}"?`)) onDelete(row); }}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="bg-slate-900 text-white">{isNew ? "Add task" : "Save"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
