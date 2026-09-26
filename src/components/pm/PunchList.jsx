import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Loader2, Check, RotateCcw, MapPin, Wrench, CalendarDays, X, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PhotoPicker from "@/components/app/PhotoPicker";
import { uploadImages } from "@/lib/uploadImages";
import { fmtShort, todayIso } from "@/lib/schedule";

// Punch list for one job. open → ready (work done, waiting on the PM) →
// closed (PM verified). Staff only (punch_list_items, 039_builder_portal_pm.sql).
export const PUNCH_STATUS = {
  open: { label: "Open", cls: "bg-rose-100 text-rose-700" },
  ready: { label: "Ready to verify", cls: "bg-amber-100 text-amber-800" },
  closed: { label: "Closed", cls: "bg-emerald-100 text-emerald-700" },
};

const FILTERS = [["active", "Open & ready"], ["closed", "Closed"], ["all", "All"]];

export default function PunchList({ project, subcontractors, user, onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState(null); // item | "new"

  const subById = Object.fromEntries(subcontractors.map((s) => [s.id, s]));

  useEffect(() => {
    base44.entities.PunchListItem.filter({ project_id: project.id }, "created_date", 1000)
      .catch(() => [])
      .then((data) => { setItems(data); setLoading(false); });
  }, [project.id]);

  useEffect(() => { if (!loading) onChange?.(items); }, [items, loading]);

  const upsertLocal = (saved) => setItems((prev) => (prev.some((i) => i.id === saved.id) ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));

  const setStatus = async (item, status) => {
    const patch = status === "closed"
      ? { status, closed_at: new Date().toISOString(), closed_by: user?.full_name || user?.email || "" }
      : { status, closed_at: null, closed_by: null };
    upsertLocal(await base44.entities.PunchListItem.update(item.id, patch));
  };

  const visible = items
    .filter((i) => (filter === "all" ? true : filter === "closed" ? i.status === "closed" : i.status !== "closed"))
    .sort((a, b) => (a.status === b.status ? (a.due_date || "9").localeCompare(b.due_date || "9") : a.status === "open" ? -1 : 1));

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  const today = todayIso();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", filter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600")}>
            {label}
          </button>
        ))}
        <Button size="sm" className="ml-auto bg-slate-900 text-white" onClick={() => setEditing("new")}><Plus className="w-4 h-4 mr-1" /> Add item</Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <ListChecks className="w-7 h-7 mx-auto mb-2 text-slate-300" />
          {items.length === 0 ? "No punch list items yet." : "Nothing here."}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {visible.map((item) => {
            const st = PUNCH_STATUS[item.status] || PUNCH_STATUS.open;
            const late = item.status !== "closed" && item.due_date && item.due_date < today;
            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
                {item.photos?.[0] && <img src={item.photos[0].url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                <button onClick={() => setEditing(item)} className="flex-1 min-w-0 text-left">
                  <p className={cn("text-sm font-medium text-slate-900", item.status === "closed" && "line-through text-slate-400")}>{item.title}</p>
                  <p className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                    {item.location && <span><MapPin className="w-3 h-3 inline -mt-0.5" /> {item.location}</span>}
                    {subById[item.subcontractor_id] && <span><Wrench className="w-3 h-3 inline -mt-0.5" /> {subById[item.subcontractor_id].name}</span>}
                    {item.due_date && <span className={cn(late && "text-rose-600 font-medium")}><CalendarDays className="w-3 h-3 inline -mt-0.5" /> Due {fmtShort(item.due_date)}</span>}
                    {item.photos?.length > 1 && <span>{item.photos.length} photos</span>}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", st.cls)}>{st.label}</span>
                  {item.status === "open" && <Button size="sm" variant="outline" className="h-8" onClick={() => setStatus(item, "ready")}>Work done</Button>}
                  {item.status !== "closed" && (
                    <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStatus(item, "closed")}><Check className="w-3.5 h-3.5 mr-1" /> Verify & close</Button>
                  )}
                  {item.status === "closed" && <Button size="sm" variant="ghost" className="h-8" onClick={() => setStatus(item, "open")}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PunchItemDialog
          item={editing === "new" ? null : editing}
          project={project}
          subcontractors={subcontractors}
          user={user}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { upsertLocal(saved); setEditing(null); }}
          onDeleted={(id) => { setItems((prev) => prev.filter((i) => i.id !== id)); setEditing(null); }}
        />
      )}
    </div>
  );
}

function PunchItemDialog({ item, project, subcontractors, user, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(() => ({
    title: item?.title || "", location: item?.location || "", description: item?.description || "",
    subcontractor_id: item?.subcontractor_id || "", due_date: item?.due_date || "", photos: item?.photos || [],
  }));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const addPhotos = async (files) => {
    setUploading(true);
    try {
      const uploaded = await uploadImages(files, { user });
      set({ photos: [...form.photos, ...uploaded] });
    } catch (err) {
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form, title: form.title.trim(), subcontractor_id: form.subcontractor_id || null, due_date: form.due_date || null };
      const saved = item
        ? await base44.entities.PunchListItem.update(item.id, data)
        : await base44.entities.PunchListItem.create({ ...data, project_id: project.id, status: "open", created_by: user?.full_name || user?.email || "" });
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    await base44.entities.PunchListItem.delete(item.id);
    onDeleted(item.id);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Punch list item" : "Add punch list item"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs">What needs fixing</Label>
            <Input required autoFocus={!item} value={form.title} onChange={(e) => set({ title: e.target.value })} className="mt-1" placeholder="e.g. Chipped coping stone by steps" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Location</Label>
              <Input value={form.location} onChange={(e) => set({ location: e.target.value })} className="mt-1 h-9 text-sm" placeholder="Spa, north deck…" />
            </div>
            <div>
              <Label className="text-xs">Due</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Responsible sub</Label>
            <select value={form.subcontractor_id} onChange={(e) => set({ subcontractor_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
              <option value="">Our crew</option>
              {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Details</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} className="mt-1 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Photos</Label>
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
          {item?.status === "closed" && item.closed_by && (
            <p className="text-xs text-emerald-700">Closed by {item.closed_by}{item.closed_at ? ` on ${new Date(item.closed_at).toLocaleDateString()}` : ""}.</p>
          )}
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            {item && <Button type="button" variant="ghost" size="sm" className="text-rose-600" onClick={remove}>Delete</Button>}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving || uploading} className="bg-slate-900 text-white">{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
