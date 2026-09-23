import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUB_REQUIREMENTS, ACKNOWLEDGMENT_TEXT } from "@/lib/barrierChecklist";

const NO_PROJECT = "__none__";

const emptyAck = (subId, user) => ({
  subcontractor_id: subId || "",
  project_id: "",
  project_manager: "",
  authorized_representative: "",
  signature_name: "",
  signed_date: new Date().toLocaleDateString("en-CA"),
  principle_representative: user?.full_name || "",
  principle_signature_name: "",
  document_url: "",
  notes: "",
});

export default function SubAcknowledgmentDialog({ open, onOpenChange, ack, defaultSubId, subcontractors, projects, user, onSaved }) {
  const [form, setForm] = useState(emptyAck(defaultSubId, user));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    if (open) setForm(ack ? { ...emptyAck(null, user), ...ack } : emptyAck(defaultSubId, user));
  }, [open, ack, defaultSubId, user]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set({ document_url: file_url });
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.subcontractor_id) { alert("Select a subcontractor."); return; }
    if (!form.signature_name?.trim() && !form.document_url) {
      alert("Enter the subcontractor's typed signature or attach the signed document.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload.id;
      const project = projects.find((p) => p.id === form.project_id);
      if (project?.company_id) payload.company_id = project.company_id;
      const saved = ack?.id ? await base44.entities.SubBarrierAck.update(ack.id, payload) : await base44.entities.SubBarrierAck.create(payload);
      onSaved?.(saved);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subcontractor Barrier Policy Acknowledgment</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Subcontractor</Label>
            <Select value={form.subcontractor_id || ""} onValueChange={(v) => set({ subcontractor_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
              <SelectContent>
                {subcontractors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Project (optional)</Label>
            <Select value={form.project_id || NO_PROJECT} onValueChange={(v) => set({ project_id: v === NO_PROJECT ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>All Principle pool/spa projects</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Project Manager</Label>
            <Input value={form.project_manager || ""} onChange={(e) => set({ project_manager: e.target.value })} />
          </div>
          <div>
            <Label>Date signed</Label>
            <Input type="date" value={form.signed_date || ""} onChange={(e) => set({ signed_date: e.target.value })} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 max-h-64 overflow-y-auto">
          <p className="text-sm font-semibold text-slate-800">Mandatory requirements (summary)</p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {SUB_REQUIREMENTS.map(([title, body]) => (
              <li key={title} className="text-sm text-slate-600"><span className="font-medium text-slate-800">{title}.</span> {body}</li>
            ))}
          </ol>
        </div>

        <p className="text-sm text-slate-600 italic">{ACKNOWLEDGMENT_TEXT}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Authorized representative</Label>
            <Input value={form.authorized_representative || ""} onChange={(e) => set({ authorized_representative: e.target.value })} />
          </div>
          <div>
            <Label>Subcontractor signature (typed)</Label>
            <Input className="font-serif italic" value={form.signature_name || ""} onChange={(e) => set({ signature_name: e.target.value })} />
          </div>
          <div>
            <Label>Principle representative</Label>
            <Input value={form.principle_representative || ""} onChange={(e) => set({ principle_representative: e.target.value })} />
          </div>
          <div>
            <Label>Principle signature (typed)</Label>
            <Input className="font-serif italic" value={form.principle_signature_name || ""} onChange={(e) => set({ principle_signature_name: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Paperclip className="w-4 h-4 mr-1" />}
            Attach signed copy
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx" className="hidden" onChange={handleFile} />
          {form.document_url && <a href={form.document_url} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:underline truncate">View attached document</a>}
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploading} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save acknowledgment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
