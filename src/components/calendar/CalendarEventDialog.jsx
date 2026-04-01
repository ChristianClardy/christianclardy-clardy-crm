import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import NextStepsPanel from "@/components/scheduling/NextStepsPanel";

const reminderOptions = [
  { label: "None", value: "none" },
  { label: "15 minutes", value: "15" },
  { label: "1 hour", value: "60" },
  { label: "24 hours", value: "1440" },
];

const weekdayOptions = [
  { label: "Mon", value: "mon" },
  { label: "Tue", value: "tue" },
  { label: "Wed", value: "wed" },
  { label: "Thu", value: "thu" },
  { label: "Fri", value: "fri" },
  { label: "Sat", value: "sat" },
  { label: "Sun", value: "sun" },
];

const emptyForm = {
  title: "",
  description: "",
  location: "",
  start_datetime: "",
  end_datetime: "",
  all_day: false,
  assigned_users: [],
  linked_client_id: "",
  linked_project_id: "",
  event_type: "meeting",
  status: "scheduled",
  visibility: "team",
  recurrence_type: "none",
  recurrence_interval: 1,
  recurrence_until: "",
  recurrence_days: [],
  reminder_minutes: [],
};

function buildPeopleOptions(clients = [], projects = []) {
  const clientOptions = clients.map((client) => ({
    id: client.id,
    label: client.name,
    address: client.address || "",
    projectId: client.linked_property_id || "",
  }));

  const projectDerived = projects
    .filter((project) => project.client_id)
    .map((project) => ({
      id: project.client_id,
      label: `${project.name} (${project.address || "Project"})`,
      address: project.address || "",
      projectId: project.id,
    }));

  return Array.from(new Map([...clientOptions, ...projectDerived].map((item) => [item.id, item])).values());
}

export default function CalendarEventDialog({ open, onOpenChange, event, initialRange, defaultValues, currentUserName = "", onSaved, projects, clients, employees }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title || "",
        description: event.description || "",
        location: event.location || "",
        start_datetime: String(event.start_datetime || "").slice(0, 16),
        end_datetime: String(event.end_datetime || "").slice(0, 16),
        all_day: Boolean(event.all_day),
        assigned_users: event.assigned_users || [],
        linked_client_id: event.linked_client_id || "",
        linked_project_id: event.linked_project_id || "",
        event_type: event.event_type || "meeting",
        status: event.status || "scheduled",
        visibility: event.visibility || "team",
        recurrence_type: event.recurrence_type || "none",
        recurrence_interval: event.recurrence_interval || 1,
        recurrence_until: String(event.recurrence_until || "").slice(0, 16),
        recurrence_days: event.recurrence_days || [],
        reminder_minutes: event.reminder_minutes || [],
      });
      return;
    }

    const seedValues = {
      ...emptyForm,
      ...defaultValues,
      assigned_users: defaultValues?.assigned_users || (currentUserName ? [currentUserName] : []),
    };

    if (initialRange) {
      setForm({
        ...seedValues,
        start_datetime: initialRange.start_datetime.slice(0, 16),
        end_datetime: initialRange.end_datetime.slice(0, 16),
      });
      return;
    }

    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const toLocal = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setForm({
      ...seedValues,
      start_datetime: toLocal(start),
      end_datetime: toLocal(end),
    });
  }, [currentUserName, defaultValues, event, initialRange, open]);

  const selectedProject = useMemo(() => projects.find((project) => project.id === form.linked_project_id), [form.linked_project_id, projects]);
  const peopleOptions = useMemo(() => buildPeopleOptions(clients, projects), [clients, projects]);

  const toggleAssignedUser = (name) => {
    setForm((current) => ({
      ...current,
      assigned_users: current.assigned_users.includes(name)
        ? current.assigned_users.filter((item) => item !== name)
        : [...current.assigned_users, name],
    }));
  };

  const toggleRecurrenceDay = (day) => {
    setForm((current) => ({
      ...current,
      recurrence_days: current.recurrence_days.includes(day)
        ? current.recurrence_days.filter((item) => item !== day)
        : [...current.recurrence_days, day],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const payload = {
        ...form,
        linked_client_id: form.linked_client_id || null,
        linked_project_id: form.linked_project_id || null,
        recurrence_until: form.recurrence_until || null,
        created_by: authUser?.email || null,
      };

      if (event?.source_event_id || event?.id) {
        await base44.entities.CalendarEvent.update(event.source_event_id || event.id, payload);
      } else {
        await base44.entities.CalendarEvent.create(payload);
      }

      onOpenChange(false);
      await onSaved?.();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    const targetId = event?.source_event_id || event?.id;
    if (!targetId) return;
    await base44.entities.CalendarEvent.delete(targetId);
    onOpenChange(false);
    await onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit Calendar Item" : "New Calendar Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} className="mt-1.5" required />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.event_type} onValueChange={(value) => setForm((current) => ({ ...current, event_type: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="estimate">Estimate</SelectItem>
                  <SelectItem value="build">Build</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="admin">Admin Time</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox checked={form.all_day} onCheckedChange={(checked) => setForm((current) => ({ ...current, all_day: Boolean(checked) }))} />
            <Label>All-day event</Label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Start</Label>
              <Input type="datetime-local" value={form.start_datetime} onChange={(e) => setForm((current) => ({ ...current, start_datetime: e.target.value }))} className="mt-1.5" required />
            </div>
            <div>
              <Label>End</Label>
              <Input type="datetime-local" value={form.end_datetime} onChange={(e) => setForm((current) => ({ ...current, end_datetime: e.target.value }))} className="mt-1.5" required />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Linked Person / Customer</Label>
              <Select
                value={form.linked_client_id || "__none__"}
                onValueChange={(value) => {
                  const selectedPerson = peopleOptions.find((item) => item.id === value);
                  setForm((current) => ({
                    ...current,
                    linked_client_id: value === "__none__" ? "" : value,
                    linked_project_id: value === "__none__" ? current.linked_project_id : (selectedPerson?.projectId || current.linked_project_id),
                    location: value === "__none__" ? current.location : (selectedPerson?.address || current.location),
                  }));
                }}
              >
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {peopleOptions.map((person) => <SelectItem key={person.id} value={person.id}>{person.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Linked Project</Label>
              <Select value={form.linked_project_id || "__none__"} onValueChange={(value) => setForm((current) => ({ ...current, linked_project_id: value === "__none__" ? "" : value, location: value === "__none__" ? current.location : (projects.find((project) => project.id === value)?.address || current.location) }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} className="mt-1.5" placeholder={selectedProject?.address || "Address or job site"} />
          </div>

          <div>
            <Label>Assigned Team Members</Label>
            <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {employees.map((employee) => {
                const active = form.assigned_users.includes(employee.full_name);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => toggleAssignedUser(employee.full_name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                  >
                    {employee.full_name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Visibility</Label>
              <Select value={form.visibility} onValueChange={(value) => setForm((current) => ({ ...current, visibility: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team-only</SelectItem>
                  <SelectItem value="company">Public within company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reminder</Label>
              <Select value={String(form.reminder_minutes?.[0] ?? "none")} onValueChange={(value) => setForm((current) => ({ ...current, reminder_minutes: value === "none" ? [] : [Number(value)] }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reminderOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Recurrence</Label>
                <Select value={form.recurrence_type} onValueChange={(value) => setForm((current) => ({ ...current, recurrence_type: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Every</Label>
                <Input type="number" min="1" value={form.recurrence_interval} onChange={(e) => setForm((current) => ({ ...current, recurrence_interval: Number(e.target.value) || 1 }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Ends</Label>
                <Input type="datetime-local" value={form.recurrence_until} onChange={(e) => setForm((current) => ({ ...current, recurrence_until: e.target.value }))} className="mt-1.5" />
              </div>
            </div>
            {form.recurrence_type === "custom" && (
              <div className="mt-4">
                <Label>Repeat on</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {weekdayOptions.map((day) => (
                    <button key={day.value} type="button" onClick={() => toggleRecurrenceDay(day.value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${form.recurrence_days.includes(day.value) ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Description / Notes</Label>
            <Textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} className="mt-1.5" rows={4} />
          </div>

          {event?.id && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {event.linked_client_id && (
                  <Button type="button" variant="outline" onClick={() => {
                    onOpenChange(false);
                    navigate(createPageUrl(`ClientDetail?id=${event.linked_client_id}`));
                  }}>
                    Open Contact File
                  </Button>
                )}
                {event.linked_project_id && (
                  <Button type="button" variant="outline" onClick={() => {
                    onOpenChange(false);
                    navigate(createPageUrl(`ProjectDetail?id=${event.linked_project_id}&tab=appointments`));
                  }}>
                    Open Project File
                  </Button>
                )}
              </div>
              <NextStepsPanel
                title="Follow-Up / Next Steps"
                linkedClientId={event.linked_client_id || ""}
                linkedProjectId={event.linked_project_id || ""}
                linkedCalendarEventId={event.source_event_id || event.id}
                defaultAssignee={form.assigned_users?.[0] || ""}
                employees={employees}
              />
            </div>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <div>{event && <Button type="button" variant="outline" className="text-rose-600" onClick={handleDelete}>Delete</Button>}</div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-slate-900 text-white hover:bg-slate-800">Save</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}