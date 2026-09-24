import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Check, X, Minus, Loader2, Trash2, AlertTriangle, ShieldCheck, Fence, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CERTIFICATION_TEXT,
  FENCE_CHECKPOINTS,
  applicableSections,
  logStatus,
  photoKind,
  STATUS_STYLES,
} from "@/lib/barrierChecklist";

const today = () => new Date().toLocaleDateString("en-CA");

const emptyLog = (projectId, user, subIds = []) => ({
  project_id: projectId || "",
  log_date: today(),
  site_supervisor: user?.full_name || "",
  subcontractor_ids: subIds,
  crew_notes: "",
  checklist: {},
  permanent_inspection: false,
  deficiency_found: false,
  deficiency_description: "",
  corrective_action: "",
  corrected_at: null,
  corrected_by: "",
  certified: false,
  certified_by: "",
  certified_at: null,
  progress_notes: "",
  photos: [],
  notes: "",
});

// Before noon a new fence photo defaults to the start-of-day check, after to end-of-day.
const defaultCheckpoint = () => (new Date().getHours() < 12 ? "start" : "end");

const STATE_BUTTONS = [
  { value: "pass", icon: Check, label: "Pass", active: "bg-emerald-500 text-white border-emerald-500" },
  { value: "fail", icon: X, label: "Fail", active: "bg-red-500 text-white border-red-500" },
  { value: "na", icon: Minus, label: "N/A", active: "bg-slate-500 text-white border-slate-500" },
];

export default function DailyLogDialog({ open, onOpenChange, log, projects, subcontractors, user, defaultProjectId, defaultSubIds, onSaved }) {
  const [form, setForm] = useState(emptyLog(defaultProjectId, user));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null); // "progress" | "fence" | null

  useEffect(() => {
    if (!open) return;
    setForm(log ? { ...emptyLog(null, user), ...log, checklist: log.checklist || {}, photos: log.photos || [], subcontractor_ids: log.subcontractor_ids || [] } : emptyLog(defaultProjectId, user, defaultSubIds || []));
  }, [open, log, defaultProjectId, user]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const setItem = (key, value) =>
    setForm((f) => {
      const checklist = { ...f.checklist, [key]: f.checklist[key] === value ? undefined : value };
      const anyFail = Object.values(checklist).includes("fail");
      return { ...f, checklist, deficiency_found: anyFail || f.deficiency_found };
    });

  const passAll = (section) =>
    setForm((f) => {
      const checklist = { ...f.checklist };
      section.items.forEach(([k]) => { if (!checklist[k]) checklist[k] = "pass"; });
      return { ...f, checklist };
    });

  const toggleSub = (id) =>
    set({ subcontractor_ids: form.subcontractor_ids.includes(id) ? form.subcontractor_ids.filter((s) => s !== id) : [...form.subcontractor_ids, id] });

  const handlePhotos = async (kind, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(kind);
    try {
      const uploaded = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploaded.push({
          url: file_url,
          filename: file.name,
          caption: "",
          kind,
          ...(kind === "fence" ? { checkpoint: defaultCheckpoint() } : {}),
          uploaded_at: new Date().toISOString(),
          uploaded_by: user?.full_name || "",
        });
      }
      setForm((f) => ({ ...f, photos: [...f.photos, ...uploaded] }));
    } catch (err) {
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const updatePhoto = (url, patch) =>
    setForm((f) => ({ ...f, photos: f.photos.map((p) => (p.url === url ? { ...p, ...patch } : p)) }));

  const removePhoto = (url) => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.url !== url) }));

  const handleSave = async () => {
    if (!form.project_id) { alert("Select a project."); return; }
    if (form.certified && !form.certified_by?.trim()) { alert("Type the site supervisor's name to certify."); return; }
    setSaving(true);
    try {
      const checklist = Object.fromEntries(Object.entries(form.checklist).filter(([, v]) => v));
      const payload = {
        ...form,
        checklist,
        certified_at: form.certified ? form.certified_at || new Date().toISOString() : null,
        created_by: log?.created_by || user?.full_name || user?.email,
      };
      delete payload.id;
      // Inherit the project's company so logs land in the right brand even under "All companies".
      const project = projects.find((p) => p.id === form.project_id);
      if (project?.company_id) payload.company_id = project.company_id;
      const saved = log?.id ? await base44.entities.BarrierDailyLog.update(log.id, payload) : await base44.entities.BarrierDailyLog.create(payload);
      onSaved?.(saved);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const { status, answered, total, failed, hasFencePhoto } = logStatus(form);
  const photoProps = { photos: form.photos, uploading, onUpload: handlePhotos, onUpdate: updatePhoto, onRemove: removePhoto };
  const statusStyle = STATUS_STYLES[status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Daily Log
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusStyle.className)}>{statusStyle.label}</span>
            <span className="text-xs font-normal text-slate-500">Fence compliance {answered}/{total}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Header fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label>Project</Label>
            <Select value={form.project_id || ""} onValueChange={(v) => set({ project_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.log_date || ""} onChange={(e) => set({ log_date: e.target.value })} />
          </div>
          <div>
            <Label>Site Supervisor</Label>
            <Input value={form.site_supervisor || ""} onChange={(e) => set({ site_supervisor: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Crew / Other on site</Label>
            <Input value={form.crew_notes || ""} onChange={(e) => set({ crew_notes: e.target.value })} placeholder="Crew names, deliveries, etc." />
          </div>
        </div>

        <div>
          <Label>Subcontractors on site today</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {subcontractors.length === 0 && <span className="text-sm text-slate-400">No subcontractors set up (Settings → Subcontractors).</span>}
            {subcontractors.map((s) => {
              const on = form.subcontractor_ids.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => toggleSub(s.id)}
                  className={cn("px-3 py-1 rounded-full text-sm border transition-colors",
                    on ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-amber-400")}>
                  {s.name}{s.trade ? ` · ${s.trade}` : ""}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Part 1: Daily progress ── */}
        <section className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-1.5"><Hammer className="w-4 h-4 text-amber-600" /> Daily Progress</h3>
            <p className="text-xs text-slate-500">Photos of the work done on the job today.</p>
          </div>
          <PhotoSection kind="progress" {...photoProps} />
          <Textarea rows={2} placeholder="Work completed today / progress notes" value={form.progress_notes || ""} onChange={(e) => set({ progress_notes: e.target.value })} />
        </section>

        {/* ── Part 2: Daily fence compliance ── */}
        <div className="pt-2">
          <h3 className="font-semibold text-slate-900 flex items-center gap-1.5"><Fence className="w-4 h-4 text-emerald-700" /> Daily Fence Compliance</h3>
          <p className="text-xs text-slate-500">Pool Barrier Safety checklist. Needs every item answered, at least one fence photo, and the supervisor's certification.</p>
        </div>

        <section className={cn("rounded-xl border p-4 space-y-3", hasFencePhoto ? "border-emerald-200" : "border-amber-300 bg-amber-50/40")}>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Fence photos <span className="text-red-600">*</span></h3>
            <p className="text-xs text-slate-500">
              Photograph the full barrier and gates, at least once a day. Take one at start of day and one at end of day, and photograph any repair.
            </p>
          </div>
          <PhotoSection kind="fence" {...photoProps} />
          {!hasFencePhoto && <p className="text-xs text-amber-700">No fence photo yet. The day can't be marked compliant without one.</p>}
        </section>

        {/* Checklist sections A–D */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-slate-800">Permanent barrier inspection today</p>
            <p className="text-xs text-slate-500">Turn on to include section D once the permanent barrier is going in.</p>
          </div>
          <Switch checked={!!form.permanent_inspection} onCheckedChange={(v) => set({ permanent_inspection: v })} />
        </div>

        {applicableSections(form).map((section) => (
          <section key={section.key} className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
              <h3 className="font-semibold text-slate-800 text-sm">{section.title}</h3>
              <button type="button" onClick={() => passAll(section)} className="text-xs text-amber-700 hover:underline">Mark remaining pass</button>
            </div>
            {section.note && <p className="px-4 pt-2 text-xs text-slate-500">{section.note}</p>}
            <ul className="divide-y divide-slate-100">
              {section.items.map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className={cn("text-sm", form.checklist[key] === "fail" ? "text-red-700 font-medium" : "text-slate-700")}>{label}</span>
                  <div className="flex gap-1 shrink-0">
                    {STATE_BUTTONS.map(({ value, icon: Icon, label: l, active }) => (
                      <button key={value} type="button" title={l} onClick={() => setItem(key, value)}
                        className={cn("w-8 h-8 rounded-md border flex items-center justify-center transition-colors",
                          form.checklist[key] === value ? active : "bg-white text-slate-400 border-slate-200 hover:border-slate-400")}>
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* E. Corrective action */}
        <section className={cn("rounded-xl border p-4 space-y-3", form.deficiency_found ? "border-red-200 bg-red-50/40" : "border-slate-200")}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              {form.deficiency_found && <AlertTriangle className="w-4 h-4 text-red-500" />}
              E. Corrective Action
            </h3>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Deficiency identified?
              <Switch checked={!!form.deficiency_found} onCheckedChange={(v) => set({ deficiency_found: v })} />
            </label>
          </div>
          {failed > 0 && !form.corrected_at && (
            <p className="text-xs text-red-600">{failed} item{failed !== 1 ? "s" : ""} failed. Describe the deficiency and the fix, then mark it corrected.</p>
          )}
          {form.deficiency_found && (
            <>
              <div>
                <Label>Description of deficiency</Label>
                <Textarea rows={2} value={form.deficiency_description || ""} onChange={(e) => set({ deficiency_description: e.target.value })} />
              </div>
              <div>
                <Label>Corrective action taken</Label>
                <Textarea rows={2} value={form.corrective_action || ""} onChange={(e) => set({ corrective_action: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Date/time corrected</Label>
                  <Input type="datetime-local"
                    value={form.corrected_at ? toLocalInput(form.corrected_at) : ""}
                    onChange={(e) => set({ corrected_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div>
                  <Label>Corrected by</Label>
                  <Input value={form.corrected_by || ""} onChange={(e) => set({ corrected_by: e.target.value })} />
                </div>
              </div>
            </>
          )}
        </section>

        {/* F. Certification */}
        <section className={cn("rounded-xl border p-4 space-y-3", form.certified ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200")}>
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> F. Daily Certification
          </h3>
          <p className="text-sm text-slate-600 italic">{CERTIFICATION_TEXT}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <Label>Site supervisor signature (type full name)</Label>
              <Input value={form.certified_by || ""} onChange={(e) => set({ certified_by: e.target.value })} className="font-serif italic" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
              <Switch checked={!!form.certified} onCheckedChange={(v) => set({ certified: v, certified_by: form.certified_by || form.site_supervisor, certified_at: v ? form.certified_at : null })} />
              I certify this inspection
            </label>
          </div>
          {form.certified_at && <p className="text-xs text-slate-500">Certified {new Date(form.certified_at).toLocaleString()}</p>}
        </section>

        {/* Notes (the checklist's photo documentation is the Fence photos section above) */}
        <div>
          <Label>Additional notes</Label>
          <Textarea rows={2} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white pb-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !!uploading} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save daily log
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Upload + grid for one kind of photo. Fence photos also get a checkpoint tag.
function PhotoSection({ kind, photos, uploading, onUpload, onUpdate, onRemove }) {
  const inputRef = useRef();
  const mine = photos.filter((p) => photoKind(p) === kind);
  const busy = uploading === kind;
  return (
    <div className="space-y-3">
      <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={!!uploading}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
        {busy ? "Uploading…" : kind === "fence" ? "Add fence photos" : "Add progress photos"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => { const files = e.target.files; onUpload(kind, files); e.target.value = ""; }}
      />
      {mine.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {mine.map((p) => (
            <div key={p.url} className="space-y-1">
              <div className="relative group">
                <img src={p.url} alt={p.caption || p.filename} className="w-full h-28 object-cover rounded-lg" />
                <button type="button" onClick={() => onRemove(p.url)}
                  className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {kind === "fence" && (
                <select
                  value={p.checkpoint || "other"}
                  onChange={(e) => onUpdate(p.url, { checkpoint: e.target.value })}
                  className="w-full h-8 text-xs rounded-md border border-slate-200 bg-white px-2"
                >
                  {FENCE_CHECKPOINTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              )}
              <Input className="h-8 text-xs" placeholder="Caption" value={p.caption || ""} onChange={(e) => onUpdate(p.url, { caption: e.target.value })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
