import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const entryTypeLabels = {
  note: "Note",
  call: "Call",
  email: "Email",
  text: "Text",
  meeting: "Meeting",
  status_change: "Status Change",
  system: "System",
};

function getLocalDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "MMM d, yyyy h:mm a");
}

const initialForm = {
  title: "",
  details: "",
  entry_type: "note",
  entry_datetime: getLocalDateTimeValue(),
};

export default function ContactHistoryPanel({
  title = "Communication & History",
  contactName = "",
  linkedLeadId = "",
  linkedClientId = "",
  sourceEntity = "system",
}) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const [leadEntries, clientEntries] = await Promise.all([
      linkedLeadId ? base44.entities.ContactHistory.filter({ linked_lead_id: linkedLeadId }, "-created_date", 200) : Promise.resolve([]),
      linkedClientId ? base44.entities.ContactHistory.filter({ linked_client_id: linkedClientId }, "-created_date", 200) : Promise.resolve([]),
    ]);

    const merged = [...leadEntries, ...clientEntries];
    const deduped = Array.from(new Map(merged.map((entry) => [entry.id, entry])).values());
    setEntries(deduped);
  };

  useEffect(() => {
    loadData();
    const unsubscribe = base44.entities.ContactHistory.subscribe((event) => {
      const eventLeadId = event?.data?.linked_lead_id || event?.old_data?.linked_lead_id;
      const eventClientId = event?.data?.linked_client_id || event?.old_data?.linked_client_id;
      if ((linkedLeadId && eventLeadId === linkedLeadId) || (linkedClientId && eventClientId === linkedClientId)) {
        loadData();
      }
    });
    return unsubscribe;
  }, [linkedLeadId, linkedClientId]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const left = new Date(b.entry_datetime || b.created_date || 0).getTime();
      const right = new Date(a.entry_datetime || a.created_date || 0).getTime();
      return left - right;
    });
  }, [entries]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.ContactHistory.create({
      ...form,
      contact_name: contactName,
      linked_lead_id: linkedLeadId,
      linked_client_id: linkedClientId,
      source_entity: sourceEntity,
    });
    setForm({ ...initialForm, entry_datetime: getLocalDateTimeValue() });
    setSaving(false);
    loadData();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Log activity</h2>
        <p className="mt-1 text-sm text-slate-500">Track calls, emails, texts, meetings, notes, and other important updates.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1.5"
              placeholder="Example: Sent follow-up email"
              required
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.entry_type} onValueChange={(value) => setForm({ ...form, entry_type: value })}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(entryTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date & time</Label>
            <Input
              type="datetime-local"
              value={form.entry_datetime}
              onChange={(e) => setForm({ ...form, entry_datetime: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Details</Label>
            <Textarea
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              className="mt-1.5"
              rows={5}
              placeholder="Add any important communication details here"
            />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Activity"}
          </Button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <Badge variant="outline">{sortedEntries.length} entries</Badge>
        </div>
        <div className="mt-5 space-y-4">
          {sortedEntries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{entry.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{entryTypeLabels[entry.entry_type] || entry.entry_type}</Badge>
                    {entry.source_entity && <Badge variant="outline">{entry.source_entity === "client" ? "Contact" : entry.source_entity === "lead" ? "Lead" : "System"}</Badge>}
                    {entry.status_from && entry.status_to && (
                      <Badge variant="outline">{entry.status_from} → {entry.status_to}</Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-500">{formatDateTime(entry.entry_datetime || entry.created_date)}</p>
              </div>
              {entry.details && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{entry.details}</p>}
              <p className="mt-3 text-xs text-slate-400">Added by {entry.created_by || "team"}</p>
            </div>
          ))}

          {!sortedEntries.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
              No communication history yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}