import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CalendarEventDialog from "@/components/calendar/CalendarEventDialog";
import { CalendarDays, Clock3, Plus } from "lucide-react";

function formatDateTime(value) {
  if (!value) return "No date";
  return format(new Date(value), "MMM d, yyyy • h:mm a");
}

export default function AppointmentsPanel({
  title = "Appointments",
  linkedClientId = "",
  linkedProjectId = "",
  defaultLocation = "",
}) {
  const [appointments, setAppointments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [defaultValues, setDefaultValues] = useState(null);

  const loadData = async () => {
    const query = linkedProjectId
      ? { linked_project_id: linkedProjectId }
      : linkedClientId
        ? { linked_client_id: linkedClientId }
        : null;

    if (!query) {
      setAppointments([]);
      return;
    }

    const [appointmentData, projectData, clientData, employeeData, me] = await Promise.all([
      base44.entities.CalendarEvent.filter(query, "start_datetime", 200),
      base44.entities.Project.list("name", 500),
      base44.entities.Client.list("name", 500),
      base44.entities.Employee.list("full_name", 500),
      base44.auth.me().catch(() => null),
    ]);

    setAppointments(appointmentData || []);
    setProjects(projectData || []);
    setClients(clientData || []);
    setEmployees((employeeData || []).filter((employee) => employee.status === "active"));
    setCurrentUserName((employeeData || []).find((employee) => employee.email === me?.email)?.full_name || me?.full_name || "");
  };

  useEffect(() => {
    loadData();
    const unsubscribe = base44.entities.CalendarEvent.subscribe(() => loadData());
    return () => unsubscribe();
  }, [linkedClientId, linkedProjectId]);

  const projectMap = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project])), [projects]);

  const openNew = () => {
    setEditingEvent(null);
    setDefaultValues({
      linked_client_id: linkedClientId || "",
      linked_project_id: linkedProjectId || "",
      location: defaultLocation || "",
      event_type: "meeting",
      status: "scheduled",
    });
    setDialogOpen(true);
  };

  const openExisting = (appointment) => {
    setEditingEvent(appointment);
    setDefaultValues(null);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          </div>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {appointments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              No appointments yet.
            </div>
          ) : (
            appointments.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => openExisting(appointment)}
                className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{appointment.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatDateTime(appointment.start_datetime)}</span>
                      {appointment.assigned_users?.length > 0 && <span>{appointment.assigned_users.join(", ")}</span>}
                      {appointment.linked_project_id && <span>{projectMap[appointment.linked_project_id]?.name || "Project"}</span>}
                    </div>
                    {appointment.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{appointment.description}</p>}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                    {String(appointment.status || "scheduled").replaceAll("_", " ")}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <CalendarEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        initialRange={null}
        defaultValues={defaultValues}
        currentUserName={currentUserName}
        onSaved={loadData}
        projects={projects}
        clients={clients}
        employees={employees}
      />
    </>
  );
}