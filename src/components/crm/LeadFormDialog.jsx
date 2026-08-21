import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeadSources } from "@/lib/leadSources";
import { ensureContactForLead } from "@/lib/leadConversion";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";

const initialForm = {
  full_name: "",
  email: "",
  phone: "",
  property_address: "",
  project_type: "Other",
  lead_source: "Website",
  assigned_sales_rep: "",
  follow_up_date: "",
  estimated_budget: "",
  project_description: "",
  notes: "",
};

const initialAppointment = {
  title: "",
  date: "",
  start_time: "",
  end_time: "",
  location: "",
  notes: "",
};

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

export default function LeadFormDialog({ open, onOpenChange, onCreated, lead = null }) {
  const isEditing = Boolean(lead);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [existingLeads, setExistingLeads] = useState([]);
  const [dupError, setDupError] = useState("");
  const [scheduleAppointment, setScheduleAppointment] = useState(false);
  const [appointment, setAppointment] = useState(initialAppointment);
  const leadSourceOptions = useLeadSources();
  const companyScope = useCompanyScope();

  useEffect(() => {
    if (!open) return;
    setDupError("");
    setForm(
      isEditing
        ? {
            full_name: lead.full_name || "",
            email: lead.email || "",
            phone: lead.phone || "",
            property_address: lead.property_address || "",
            project_type: lead.project_type || "Other",
            lead_source: lead.lead_source || "Website",
            assigned_sales_rep: lead.assigned_sales_rep || "",
            follow_up_date: lead.follow_up_date || "",
            estimated_budget: lead.estimated_budget ?? "",
            project_description: lead.project_description || "",
            notes: lead.notes || "",
          }
        : initialForm
    );
    setScheduleAppointment(false);
    setAppointment(initialAppointment);
    base44.entities.Employee.list("full_name", 500).then((data) => setEmployees((data || []).filter((employee) => employee.status !== "inactive")));
    base44.entities.Lead.list("-created_date", 5000).then(setExistingLeads);
  }, [open, lead, isEditing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDupError("");

    const normName  = form.full_name.trim().toLowerCase();
    const normEmail = form.email?.trim().toLowerCase();
    const normPhone = form.phone?.trim().replace(/\D/g, "");

    const scopedLeads = scopeFilter(existingLeads, companyScope).filter((l) => l.status !== "Lost/No Decision");
    const dup = scopedLeads.find((l) =>
      l.id !== lead?.id && (
        l.full_name?.trim().toLowerCase() === normName ||
        (normEmail && l.email?.trim().toLowerCase() === normEmail) ||
        (normPhone && l.phone?.replace(/\D/g, "") === normPhone)
      )
    );

    if (dup) {
      const reason =
        dup.full_name?.trim().toLowerCase() === normName  ? `A lead named "${dup.full_name}" already exists.` :
        normEmail && dup.email?.trim().toLowerCase() === normEmail ? `A lead with email "${dup.email}" already exists.` :
        `A lead with phone "${dup.phone}" already exists.`;
      setDupError(reason);
      return;
    }

    const payload = {
      ...form,
      estimated_budget: form.estimated_budget === "" ? null : Number(form.estimated_budget),
    };

    setSaving(true);
    try {
      if (isEditing) {
        await base44.entities.Lead.update(lead.id, payload);
      } else {
        const hasAppointment = scheduleAppointment && appointment.date && appointment.start_time;
        const createdLead = await base44.entities.Lead.create({
          ...payload,
          status: hasAppointment ? "Appointment Scheduled" : "New Lead",
        });

        if (hasAppointment) {
          try {
            const client = await ensureContactForLead(createdLead);
            const endTime = appointment.end_time || addMinutes(appointment.start_time, 60);
            await base44.entities.CalendarEvent.create({
              title: appointment.title || `${createdLead.full_name} - Appointment`,
              description: [form.project_description, appointment.notes].filter(Boolean).join("\n\n"),
              location: appointment.location || createdLead.property_address || "",
              start_datetime: `${appointment.date}T${appointment.start_time}:00`,
              end_datetime: `${appointment.date}T${endTime}:00`,
              event_type: "meeting",
              status: "scheduled",
              assigned_users: createdLead.assigned_sales_rep ? [createdLead.assigned_sales_rep] : [],
              visibility: "team",
              linked_client_id: client?.id || null,
              lead_id: createdLead.id,
            });
          } catch (err) {
            console.error("Failed to schedule appointment:", err?.message);
          }
        } else {
          ensureContactForLead(createdLead).catch((err) =>
            console.error("Failed to add lead to contact book:", err?.message)
          );
        }

        setForm(initialForm);
        setScheduleAppointment(false);
        setAppointment(initialAppointment);
      }
      onOpenChange(false);
      onCreated?.();
    } catch {
      // error already shown by base44Client alert
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Lead" : "Add Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Lead Name *</Label>
              <Input value={form.full_name} onChange={(e) => { setDupError(""); setForm({ ...form, full_name: e.target.value }); }} className="mt-1.5" required />
              {dupError && <p className="text-sm text-rose-600 mt-1">{dupError}</p>}
            </div>
            <div>
              <Label>Assigned Sales Rep *</Label>
              <Select value={form.assigned_sales_rep} onValueChange={(value) => setForm({ ...form, assigned_sales_rep: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => <SelectItem key={employee.id} value={employee.full_name}>{employee.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => { setDupError(""); setForm({ ...form, email: e.target.value }); }} className="mt-1.5" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => { setDupError(""); setForm({ ...form, phone: e.target.value }); }} className="mt-1.5" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Lead Source</Label>
              <Select value={form.lead_source} onValueChange={(value) => setForm({ ...form, lead_source: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {leadSourceOptions.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={(value) => setForm({ ...form, project_type: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    "Pergola", "Covered Patio", "Cabana", "Outdoor Kitchen", "Pool", "Remodel", "Addition", "Backyard Revamp", "Other"
                  ].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Next Follow Up</Label>
              <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Estimated Budget</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 25000"
                value={form.estimated_budget}
                onChange={(e) => setForm({ ...form, estimated_budget: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Project Description</Label>
            <Textarea value={form.project_description} onChange={(e) => setForm({ ...form, project_description: e.target.value })} className="mt-1.5" rows={3} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" rows={3} />
          </div>

          {!isEditing && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <Checkbox checked={scheduleAppointment} onCheckedChange={(checked) => setScheduleAppointment(Boolean(checked))} />
                <Label>Schedule an appointment for this lead</Label>
              </div>
              {scheduleAppointment && (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-slate-500">
                    This will be added to {form.assigned_sales_rep || "the assigned sales rep"}'s calendar.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={appointment.title}
                        onChange={(e) => setAppointment({ ...appointment, title: e.target.value })}
                        placeholder={`${form.full_name || "Lead"} - Appointment`}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Location</Label>
                      <Input
                        value={appointment.location}
                        onChange={(e) => setAppointment({ ...appointment, location: e.target.value })}
                        placeholder={form.property_address || "Address or job site"}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={appointment.date}
                        onChange={(e) => setAppointment({ ...appointment, date: e.target.value })}
                        className="mt-1.5"
                        required={scheduleAppointment}
                      />
                    </div>
                    <div>
                      <Label>Start Time *</Label>
                      <Input
                        type="time"
                        value={appointment.start_time}
                        onChange={(e) => setAppointment({ ...appointment, start_time: e.target.value })}
                        className="mt-1.5"
                        required={scheduleAppointment}
                      />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={appointment.end_time}
                        onChange={(e) => setAppointment({ ...appointment, end_time: e.target.value })}
                        className="mt-1.5"
                        placeholder="+1 hr"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Appointment Notes</Label>
                    <Textarea
                      value={appointment.notes}
                      onChange={(e) => setAppointment({ ...appointment, notes: e.target.value })}
                      className="mt-1.5"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Lead")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}