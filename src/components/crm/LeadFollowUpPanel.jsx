import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const initialForm = {
  title: "",
  details: "",
  follow_up_type: "reminder",
  follow_up_date: "",
  status: "open",
};

const statusStyles = {
  open: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function LeadFollowUpPanel({ lead, followUps, onRefresh }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await base44.entities.LeadFollowUp.create({
        ...form,
        lead_id: lead.id,
        lead_name: lead.full_name,
        assigned_to: lead.assigned_sales_rep || "",
      });
      setForm(initialForm);
      onRefresh?.();
    } catch (err) {
      // error already alerted by base44Client — just keep the form so nothing is lost
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async (followUp) => {
    await base44.entities.LeadFollowUp.update(followUp.id, { status: "completed" });
    onRefresh?.();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add follow up</h2>
        <p className="mt-1 text-sm text-slate-500">If you add a follow-up date, it will also show on the calendar.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" required />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.follow_up_type} onValueChange={(value) => setForm({ ...form, follow_up_type: value })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[
                  ["note", "Note"], ["reminder", "Reminder"], ["call", "Call"], ["email", "Email"], ["meeting", "Meeting"]
                ].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Follow up date</Label>
            <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Details / Notes</Label>
            <Textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} className="mt-1.5" rows={5} />
          </div>
          <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : "Save Follow Up"}</Button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Lead updates</h2>
        <div className="mt-5 space-y-4">
          {followUps.map((followUp) => (
            <div key={followUp.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{followUp.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusStyles[followUp.status] || statusStyles.open}>{followUp.status || "open"}</Badge>
                    <Badge variant="outline">{followUp.follow_up_type || "reminder"}</Badge>
                    {followUp.follow_up_date && <Badge variant="outline">{followUp.follow_up_date}</Badge>}
                  </div>
                </div>
                {followUp.status !== "completed" && (
                  <Button variant="outline" size="sm" onClick={() => markComplete(followUp)}>
                    Mark complete
                  </Button>
                )}
              </div>
              {followUp.details && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{followUp.details}</p>}
              <p className="mt-3 text-xs text-slate-400">Created by {followUp.created_by || "team"}</p>
            </div>
          ))}

          {!followUps.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
              No follow ups yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}