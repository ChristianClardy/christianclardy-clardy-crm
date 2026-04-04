import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, Edit2, Trash2, User, X } from "lucide-react";

const emptyForm = {
  title: "",
  details: "",
  follow_up_type: "reminder",
  follow_up_date: "",
  follow_up_time: "",
  assigned_to: "",
  status: "open",
};

const statusStyles = {
  open: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function LeadFollowUpPanel({ lead, followUps, onRefresh }) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Employee.list("full_name", 500)
      .then(data => setEmployees((data || []).filter(e => e.status !== "inactive")))
      .catch(() => {});
  }, []);

  const startEdit = (followUp) => {
    setEditingId(followUp.id);
    setForm({
      title:          followUp.title          || "",
      details:        followUp.details        || "",
      follow_up_type: followUp.follow_up_type || "reminder",
      follow_up_date: followUp.follow_up_date || "",
      follow_up_time: followUp.follow_up_time || "",
      assigned_to:    followUp.assigned_to    || "",
      status:         followUp.status         || "open",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await base44.entities.LeadFollowUp.update(editingId, form);
        setEditingId(null);
      } else {
        await base44.entities.LeadFollowUp.create({
          ...form,
          lead_id:   lead.id,
          lead_name: lead.full_name,
        });

        // Create calendar event for new follow-ups with date + time + assignee
        if (form.follow_up_date && form.follow_up_time && form.assigned_to) {
          const startDT = `${form.follow_up_date}T${form.follow_up_time}:00`;
          const endDate = new Date(startDT);
          endDate.setMinutes(endDate.getMinutes() + 15);
          const endDT = endDate.toISOString().slice(0, 19);
          await base44.entities.CalendarEvent.create({
            title:            `${form.title} — ${lead.full_name}`,
            description:      form.details || "",
            start_datetime:   startDT,
            end_datetime:     endDT,
            event_type:       form.follow_up_type === "meeting" ? "meeting" : "task",
            status:           "scheduled",
            assigned_users:   [form.assigned_to],
            visibility:       "team",
            linked_client_id: lead.linked_contact_id || null,
          });
        }
      }

      setForm(emptyForm);
      onRefresh?.();
    } catch (err) {
      // error already alerted by base44Client
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async (followUp) => {
    await base44.entities.LeadFollowUp.update(followUp.id, { status: "completed" });
    onRefresh?.();
  };

  const deleteFollowUp = async (followUp) => {
    if (!window.confirm(`Delete "${followUp.title}"?`)) return;
    await base44.entities.LeadFollowUp.delete(followUp.id);
    if (editingId === followUp.id) cancelEdit();
    onRefresh?.();
  };

  const isEditing = editingId !== null;

  return (
    <div className="grid gap-4 xl:grid-cols-[340px,1fr]">
      {/* Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{isEditing ? "Edit follow up" : "Add follow up"}</h2>
          {isEditing && (
            <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-8 text-sm" required />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.follow_up_type} onValueChange={(v) => setForm({ ...form, follow_up_type: v })}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["note","Note"],["reminder","Reminder"],["call","Call"],["email","Email"],["meeting","Meeting"]].map(([v,l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="flex items-center gap-1 text-xs"><CalendarDays className="h-3 w-3" /> Date {!isEditing && "*"}</Label>
              <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} className="mt-1 h-8 text-sm" required={!isEditing} />
            </div>
            <div>
              <Label className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> Time {!isEditing && "*"}</Label>
              <Input type="time" value={form.follow_up_time} onChange={(e) => setForm({ ...form, follow_up_time: e.target.value })} className="mt-1 h-8 text-sm" required={!isEditing} />
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1 text-xs"><User className="h-3 w-3" /> Assign To {!isEditing && "*"}</Label>
            <Select value={form.assigned_to || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "__none__" ? "" : v })}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Select —</SelectItem>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.full_name}>{emp.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} className="mt-1 text-sm" rows={2} />
          </div>

          <div className="flex gap-2">
            {isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit} className="flex-1">Cancel</Button>
            )}
            <Button type="submit" size="sm" disabled={saving} className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              {saving ? "Saving…" : isEditing ? "Update" : "Save & Schedule"}
            </Button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Follow ups</h2>
        <div className="mt-3 space-y-2">
          {followUps.map((followUp) => (
            <div key={followUp.id} className={`rounded-xl border p-3 ${editingId === followUp.id ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{followUp.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge className={`text-[10px] px-1.5 py-0 ${statusStyles[followUp.status] || statusStyles.open}`}>{followUp.status || "open"}</Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{followUp.follow_up_type || "reminder"}</Badge>
                    {followUp.follow_up_date && (
                      <Badge variant="outline" className="flex items-center gap-0.5 text-[10px] px-1.5 py-0">
                        <CalendarDays className="h-2.5 w-2.5" />
                        {followUp.follow_up_date}{followUp.follow_up_time && ` @ ${followUp.follow_up_time}`}
                      </Badge>
                    )}
                    {followUp.assigned_to && (
                      <Badge variant="outline" className="flex items-center gap-0.5 text-[10px] px-1.5 py-0">
                        <User className="h-2.5 w-2.5" /> {followUp.assigned_to}
                      </Badge>
                    )}
                  </div>
                  {followUp.details && <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{followUp.details}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {followUp.status !== "completed" && (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => markComplete(followUp)}>
                      Done
                    </Button>
                  )}
                  <button
                    onClick={() => editingId === followUp.id ? cancelEdit() : startEdit(followUp)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteFollowUp(followUp)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!followUps.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              No follow ups yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
