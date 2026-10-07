import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { useRolePermissions } from "@/lib/useRolePermissions";
import MessageBodyEditor from "./MessageBodyEditor";
import { confirmAction } from "@/components/ui/confirm-dialog";

export default function TemplatesTab() {
  const scope = useCompanyScope();
  const { readOnly } = useRolePermissions();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => base44.entities.MessageTemplate.list("name", 1000).then((t) => { setTemplates(t); setLoading(false); });
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => scopeFilter(templates, scope), [templates, scope]);

  const save = async () => {
    if (!editing.name.trim() || !editing.body.trim()) return;
    setSaving(true);
    const { id, name, channel, subject, body } = editing;
    const row = { name, channel, subject: channel === "email" ? subject : null, body };
    if (id) await base44.entities.MessageTemplate.update(id, row);
    else await base44.entities.MessageTemplate.create(row);
    setSaving(false);
    setEditing(null);
    load();
  };

  const remove = async (t) => {
    if (!await confirmAction(`Delete template "${t.name}"?`)) return;
    await base44.entities.MessageTemplate.delete(t.id);
    load();
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Saved emails and texts you can drop into a one-off message, a drip step, or a broadcast.</p>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing({ name: "", channel: "sms", subject: "", body: "" })}><MessageSquare className="mr-2 h-4 w-4" /> New text template</Button>
            <Button onClick={() => setEditing({ name: "", channel: "email", subject: "", body: "" })}><Plus className="mr-2 h-4 w-4" /> New email template</Button>
          </div>
        )}
      </div>

      {!visible.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No templates yet.</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((t) => (
          <div key={t.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-2">
              {t.channel === "email" ? <Mail className="mt-0.5 h-4 w-4 text-blue-600" /> : <MessageSquare className="mt-0.5 h-4 w-4 text-emerald-600" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{t.name}</p>
                {t.subject && <p className="truncate text-xs text-slate-500">{t.subject}</p>}
              </div>
              {!readOnly && (
                <div className="flex">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing({ ...t, subject: t.subject || "" })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
            <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{t.body}</p>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : `New ${editing?.channel === "email" ? "email" : "text"} template`}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Template name</Label>
                <Input className="mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Site visit confirmation" />
              </div>
              <MessageBodyEditor channel={editing.channel} value={editing} showTemplates={false} onChange={(v) => setEditing({ ...editing, ...v })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !editing?.name?.trim() || !editing?.body?.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
