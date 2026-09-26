import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Loader2, ClipboardCheck, RotateCcw, User, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PhotoPicker from "@/components/app/PhotoPicker";
import { uploadImages } from "@/lib/uploadImages";
import { fmtLong, todayIso, taskRows } from "@/lib/schedule";

// Inspections for one job, stored on permit_inspection_tasks (title = the
// inspection, due_date = when it's scheduled; `completed` mirrors a pass so
// the older permit checklist still reads right). See 039_builder_portal_pm.sql.
export const RESULTS = {
  scheduled: { label: "Scheduled", cls: "bg-sky-100 text-sky-700" },
  passed: { label: "Passed", cls: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Partial", cls: "bg-amber-100 text-amber-800" },
  failed: { label: "Failed", cls: "bg-rose-100 text-rose-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};

const COMMON = [
  "Pre-gunite / steel", "Plumbing pressure test", "Electrical bonding", "Deck / pre-pour", "Gas line",
  "Footing", "Framing", "Rough-in", "Barrier / fence", "Electrical final", "Final",
];

export default function Inspections({ project, rows = [], user, onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // item | { new: true, title? }

  useEffect(() => {
    base44.entities.PermitInspectionTask.filter({ project_id: project.id }, "due_date", 500)
      .catch(() => [])
      .then((data) => { setItems(data); setLoading(false); });
  }, [project.id]);

  useEffect(() => { if (!loading) onChange?.(items); }, [items, loading]);

  const upsertLocal = (saved) => setItems((prev) => (prev.some((i) => i.id === saved.id) ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));

  // Tasks flagged "needs inspection" in the schedule with nothing booked yet.
  const booked = new Set(items.map((i) => i.schedule_row_id).filter(Boolean));
  const unbooked = taskRows(rows).filter((r) => r.needs_inspection && !booked.has(r.id));

  const sorted = [...items].sort((a, b) => {
    const rank = (i) => (i.result === "scheduled" || !i.result ? 0 : 1);
    return rank(a) - rank(b) || (a.due_date || "9").localeCompare(b.due_date || "9");
  });

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  const today = todayIso();

  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <p className="text-sm text-slate-500">Schedule inspections and record the result. A failed inspection can be rebooked in one tap.</p>
        <Button size="sm" className="ml-auto shrink-0 bg-slate-900 text-white" onClick={() => setEditing({ new: true })}><Plus className="w-4 h-4 mr-1" /> Schedule</Button>
      </div>

      {unbooked.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <p className="font-medium mb-1">From the schedule, not booked yet:</p>
          <div className="flex flex-wrap gap-2">
            {unbooked.map((r) => (
              <button key={r.id} onClick={() => setEditing({ new: true, title: r.task, due_date: r.start_date, schedule_row_id: r.id })}
                className="rounded-full border border-sky-300 bg-white px-2.5 py-0.5 text-xs hover:bg-sky-100">
                <Plus className="w-3 h-3 inline -mt-0.5" /> {r.task}
              </button>
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <ClipboardCheck className="w-7 h-7 mx-auto mb-2 text-slate-300" /> No inspections yet.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {sorted.map((i) => {
            const r = RESULTS[i.result] || RESULTS[i.completed ? "passed" : "scheduled"];
            const overdue = (i.result === "scheduled" || !i.result) && i.due_date && i.due_date < today;
            return (
              <button key={i.id} onClick={() => setEditing(i)} className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-1.5 px-3 py-2.5 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{i.title}</p>
                  <p className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                    <span className={cn(overdue && "text-rose-600 font-medium")}><CalendarDays className="w-3 h-3 inline -mt-0.5" /> {i.due_date ? fmtLong(i.due_date) : "No date"}{overdue ? " · result not recorded" : ""}</span>
                    {i.inspector && <span><User className="w-3 h-3 inline -mt-0.5" /> {i.inspector}</span>}
                    {i.notes && <span className="truncate max-w-xs">{i.notes}</span>}
                  </p>
                </div>
                <span className={cn("self-start sm:self-center text-xs font-medium px-2 py-0.5 rounded-full", r.cls)}>{r.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <InspectionDialog
          item={editing.new ? null : editing}
          defaults={editing.new ? editing : null}
          project={project}
          rows={rows}
          user={user}
          onClose={() => setEditing(null)}
          onSaved={(saved, rebook) => { upsertLocal(saved); setEditing(rebook ? { new: true, title: saved.title, schedule_row_id: saved.schedule_row_id } : null); }}
          onDeleted={(id) => { setItems((prev) => prev.filter((x) => x.id !== id)); setEditing(null); }}
        />
      )}
    </div>
  );
}

function InspectionDialog({ item, defaults, project, rows, user, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(() => ({
    title: item?.title || defaults?.title || "",
    due_date: item?.due_date || defaults?.due_date || "",
    inspector: item?.inspector || "",
    schedule_row_id: item?.schedule_row_id || defaults?.schedule_row_id || "",
    result: item?.result || "scheduled",
    result_date: item?.result_date || "",
    notes: item?.notes || "",
    photos: item?.photos || [],
  }));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const setResult = (result) => set({ result, result_date: result === "scheduled" ? "" : form.result_date || todayIso() });

  const addPhotos = async (files) => {
    setUploading(true);
    try {
      set({ photos: [...form.photos, ...(await uploadImages(files, { user }))] });
    } catch (err) {
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const save = async (rebook = false) => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        title: form.title.trim(),
        due_date: form.due_date || null,
        result_date: form.result_date || null,
        schedule_row_id: form.schedule_row_id || null,
        completed: form.result === "passed",
      };
      const saved = item
        ? await base44.entities.PermitInspectionTask.update(item.id, data)
        : await base44.entities.PermitInspectionTask.create({ ...data, project_id: project.id });
      onSaved(saved, rebook);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete the ${item.title} inspection?`)) return;
    await base44.entities.PermitInspectionTask.delete(item.id);
    onDeleted(item.id);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? item.title : "Schedule inspection"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
          <div>
            <Label className="text-xs">Inspection</Label>
            <Input required list="inspection-types" value={form.title} onChange={(e) => set({ title: e.target.value })} className="mt-1" placeholder="e.g. Pre-gunite / steel" />
            <datalist id="inspection-types">{COMMON.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Inspector</Label>
              <Input value={form.inspector} onChange={(e) => set({ inspector: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Schedule task</Label>
            <select value={form.schedule_row_id} onChange={(e) => set({ schedule_row_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
              <option value="">Not linked</option>
              {taskRows(rows).map((r) => <option key={r.id} value={r.id}>{r.task}</option>)}
            </select>
          </div>

          <div>
            <Label className="text-xs">Result</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(RESULTS).map(([key, { label, cls }]) => (
                <button key={key} type="button" onClick={() => setResult(key)}
                  className={cn("rounded-full px-3 py-1 text-xs font-medium border", form.result === key ? cn(cls, "border-transparent ring-2 ring-slate-900/20") : "border-slate-200 bg-white text-slate-600")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {form.result !== "scheduled" && (
            <div>
              <Label className="text-xs">Result date</Label>
              <Input type="date" value={form.result_date} onChange={(e) => set({ result_date: e.target.value })} className="mt-1 h-9 text-sm w-44" />
            </div>
          )}
          <div>
            <Label className="text-xs">{form.result === "failed" || form.result === "partial" ? "What needs correcting" : "Notes"}</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="mt-1 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Photos (inspection card, corrections)</Label>
            <PhotoPicker busy={uploading} onFiles={addPhotos} />
            {form.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {form.photos.map((p) => (
                  <div key={p.url} className="relative">
                    <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg" /></a>
                    <button type="button" onClick={() => set({ photos: form.photos.filter((x) => x.url !== p.url) })} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {item && <Button type="button" variant="ghost" size="sm" className="text-rose-600" onClick={remove}>Delete</Button>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              {(form.result === "failed" || form.result === "partial") && (
                <Button type="button" variant="outline" disabled={saving || uploading} onClick={() => save(true)}><RotateCcw className="w-4 h-4 mr-1" /> Save & rebook</Button>
              )}
              <Button type="submit" disabled={saving || uploading} className="bg-slate-900 text-white">{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
