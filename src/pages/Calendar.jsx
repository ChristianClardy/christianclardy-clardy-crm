import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, HardHat, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CalendarMonthView from "@/components/calendar/CalendarMonthView";
import OperationsResourceTimeline from "@/components/calendar/OperationsResourceTimeline";
import CalendarTimeGrid from "@/components/calendar/CalendarTimeGrid";
import CalendarAgendaView from "@/components/calendar/CalendarAgendaView";
import CalendarEventDialog from "@/components/calendar/CalendarEventDialog";
import CalendarExportHelp from "@/components/calendar/CalendarExportHelp";
import { canUserSeeEvent, expandRecurringEvents, filterBySearch, getVisibleRange } from "@/lib/calendarEngine";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";
import { buildIcsFile, buildWeekDays, downloadIcsFile, getRangeLabel, shiftCalendarDate, sortEntries } from "@/lib/calendarUtils";
import { cn } from "@/lib/utils";

const statusColors = {
  scheduled: "bg-blue-500 hover:bg-blue-600",
  in_progress: "bg-amber-500 hover:bg-amber-600",
  completed: "bg-emerald-500 hover:bg-emerald-600",
  delayed: "bg-rose-500 hover:bg-rose-600",
};

const eventTypeColors = {
  meeting: "bg-slate-700 hover:bg-slate-800",
  estimate: "bg-purple-500 hover:bg-purple-600",
  build: "bg-amber-500 hover:bg-amber-600",
  inspection: "bg-cyan-500 hover:bg-cyan-600",
  task: "bg-blue-500 hover:bg-blue-600",
  admin: "bg-indigo-500 hover:bg-indigo-600",
  personal: "bg-pink-500 hover:bg-pink-600",
  other: "bg-slate-500 hover:bg-slate-600",
};

function normalizeOperationStatus(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("progress")) return "in_progress";
  if (raw.includes("complete")) return "completed";
  if (raw.includes("delay") || raw.includes("hold") || raw.includes("block")) return "delayed";
  if (raw.includes("scheduled")) return "scheduled";
  return "scheduled";
}

function toOperationDateTime(date, fallbackTime) {
  if (!date) return "";
  return `${date}T${fallbackTime}`;
}

export default function Calendar() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const quickClientId = urlParams.get("clientId") || "";
  const quickNewType = urlParams.get("new") || "";
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("operations");
  const [viewMode, setViewMode] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());
  const [employees, setEmployees] = useState([]);
  const [projectSheets, setProjectSheets] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [initialRange, setInitialRange] = useState(null);

  useEffect(() => {
    loadData();
    const unsubEvents = base44.entities.CalendarEvent.subscribe(() => loadData());
    const unsubSheets = base44.entities.ProjectSheet.subscribe(() => loadData());
    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubScope = subscribeToCompanyScope(setSelectedCompanyScope);
    return () => {
      unsubEvents();
      unsubSheets();
      unsubProjects();
      unsubScope();
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    const me = await base44.auth.me().catch(() => null);
    setUser(me);

    const [projectsData, clientsData, leadsData, employeesData, sheetsData, eventsData] = await Promise.all([
      base44.entities.Project.list("-updated_date", 500),
      base44.entities.Client.list("-updated_date", 500),
      base44.entities.Lead.list("-updated_date", 500),
      base44.entities.Employee.list("-updated_date", 500),
      base44.entities.ProjectSheet.list("-updated_date", 500),
      base44.entities.CalendarEvent.list("start_datetime", 1000),
    ]);

    setProjects(projectsData);
    setClients([
      ...clientsData,
      ...leadsData.map((lead) => ({
        id: lead.linked_contact_id || lead.id,
        name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        address: lead.property_address,
        linked_property_id: lead.linked_property_id,
      })),
    ]);
    setLeads(leadsData);
    setEmployees(employeesData.filter((employee) => employee.status === "active"));
    setProjectSheets(sheetsData);
    setCalendarEvents(eventsData);
    setLoading(false);
  };

  const currentUserName = useMemo(() => employees.find((employee) => employee.email === user?.email)?.full_name || user?.full_name || "", [employees, user]);
  const visibleProjects = useMemo(() => selectedCompanyScope === "all" ? projects : projects.filter((project) => project.company_id === selectedCompanyScope), [projects, selectedCompanyScope]);
  const projectMap = useMemo(() => Object.fromEntries(visibleProjects.map((project) => [project.id, project])), [visibleProjects]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client])), [clients]);
  const visibleRange = useMemo(() => getVisibleRange(currentDate, viewMode), [currentDate, viewMode]);
  const timeGridDates = useMemo(() => viewMode === "day" ? [startOfDay(currentDate)] : buildWeekDays(currentDate), [currentDate, viewMode]);

  const rawOperationsEntries = useMemo(() => {
    const rows = projectSheets.flatMap((sheet) => {
      const projectId = sheet.project_id ?? sheet.data?.project_id;
      const project = projectMap[projectId];
      const client = clientMap[project?.client_id];
      const sheetRows = sheet.rows ?? sheet.data?.rows ?? [];

      return sheetRows
        .filter((row) => !row.is_section_header && row.assigned_to && (row.start_date || row.end_date))
        .filter(() => Boolean(project))
        .map((row) => ({
          id: `${projectId}-${row.id}`,
          title: row.task || "Task",
          description: row.notes || "",
          assignee: row.assigned_to,
          project_name: project?.name || "Project",
          client_name: client?.name || "",
          linked_project_id: projectId || "",
          location: project?.address || "",
          status: normalizeOperationStatus(row.status),
          event_type: "build",
          all_day: false,
          start_date: row.start_date || row.end_date,
          end_date: row.end_date || row.start_date,
          start_datetime: toOperationDateTime(row.start_date || row.end_date, "08:00"),
          end_datetime: toOperationDateTime(row.end_date || row.start_date, "17:00"),
        }));
    });

    return sortEntries(rows);
  }, [clientMap, projectMap, projectSheets, selectedCompanyScope]);

  const assignees = useMemo(() => [
    "all",
    ...new Set([
      ...rawOperationsEntries.map((entry) => entry.assignee),
      ...employees.map((employee) => employee.full_name),
      ...calendarEvents.flatMap((entry) => entry.assigned_users || []),
    ].filter(Boolean)),
  ], [calendarEvents, employees, rawOperationsEntries]);

  const operationsEntries = useMemo(() => {
    let items = rawOperationsEntries;
    if (assigneeFilter !== "all") items = items.filter((entry) => entry.assignee === assigneeFilter);
    if (projectFilter !== "all") items = items.filter((entry) => entry.linked_project_id === projectFilter);
    if (statusFilter !== "all") items = items.filter((entry) => String(entry.status || "").toLowerCase() === statusFilter);
    return filterBySearch(items, search);
  }, [assigneeFilter, projectFilter, rawOperationsEntries, search, statusFilter]);

  const baseVisibleEvents = useMemo(() => {
    let items = calendarEvents.filter((entry) => canUserSeeEvent(entry, user, currentUserName));
    if (selectedCompanyScope !== "all") {
      items = items.filter((entry) => !entry.linked_project_id || Boolean(projectMap[entry.linked_project_id]));
    }
    if (assigneeFilter !== "all") items = items.filter((entry) => (entry.assigned_users || []).includes(assigneeFilter));
    if (projectFilter !== "all") items = items.filter((entry) => entry.linked_project_id === projectFilter);
    if (eventTypeFilter !== "all") items = items.filter((entry) => entry.event_type === eventTypeFilter);
    if (statusFilter !== "all") items = items.filter((entry) => entry.status === statusFilter);
    return filterBySearch(items, search).map((entry) => ({
      ...entry,
      project_name: projectMap[entry.linked_project_id]?.name || "",
      client_name: clientMap[entry.linked_client_id]?.name || "",
    }));
  }, [assigneeFilter, calendarEvents, clientMap, currentUserName, eventTypeFilter, projectFilter, projectMap, search, selectedCompanyScope, statusFilter, user]);

  const visibleCalendarEvents = useMemo(() => expandRecurringEvents(baseVisibleEvents, visibleRange.start, visibleRange.end), [baseVisibleEvents, visibleRange.end, visibleRange.start]);

  const handleExportCalendar = () => {
    downloadIcsFile("company-calendar.ics", buildIcsFile("Company Calendar", visibleCalendarEvents));
  };

  const handleExportOperations = () => {
    downloadIcsFile("crew-schedule.ics", buildIcsFile("Crew Schedule", operationsEntries));
  };

  const openNewEvent = (range = null) => {
    setEditingEvent(null);
    setInitialRange(range);
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!loading && quickNewType === "task") {
      setEditingEvent(null);
      setInitialRange(null);
      setDialogOpen(true);
    }
  }, [loading, quickNewType]);

  const openExistingEvent = (entry) => {
    const sourceId = entry.source_event_id || entry.id;
    const sourceEvent = calendarEvents.find((item) => item.id === sourceId) || entry;
    setEditingEvent(sourceEvent);
    setInitialRange(null);
    setDialogOpen(true);
  };

  const openOperationsProject = (entry) => {
    if (!entry?.linked_project_id) return;
    navigate(createPageUrl(`ProjectDetail?id=${entry.linked_project_id}`));
  };

  const handleMoveEvent = async (entry, nextRange) => {
    const sourceId = entry.source_event_id || entry.id;
    await base44.entities.CalendarEvent.update(sourceId, nextRange);
    await loadData();
  };

  const getEventClassName = (entry) => statusColors[entry.status] || eventTypeColors[entry.event_type] || eventTypeColors.other;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Calendar</h1>
          <p className="mt-1 text-slate-500">{mode === "operations" ? "Timeline view of crew and subcontractor allocation from project schedules." : "Outlook-style scheduling for crews, meetings, inspections, and personal planning."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-slate-100 p-1">
            {[
              { key: "operations", label: "Operations", icon: HardHat },
              { key: "calendar", label: "Calendar", icon: CalendarDays },
            ].map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setMode(key)} className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all", mode === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {["day", "week", "month", "agenda"].map((key) => (
              <button key={key} onClick={() => setViewMode(key)} className={cn("rounded-lg px-3 py-2 text-sm font-medium capitalize transition-all", viewMode === key ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900")}>{key}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, projects, people..." className="pl-9" />
          </div>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger><SelectValue placeholder={mode === "operations" ? "Resource" : "User"} /></SelectTrigger>
            <SelectContent>
              {assignees.map((assignee) => <SelectItem key={assignee} value={assignee}>{assignee === "all" ? (mode === "operations" ? "All resources" : "All users") : assignee}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {visibleProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {mode === "calendar" && (
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Event type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="estimate">Estimate</SelectItem>
                <SelectItem value="build">Build</SelectItem>
                <SelectItem value="inspection">Inspection</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate((date) => shiftCalendarDate(date, viewMode, "prev"))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate((date) => shiftCalendarDate(date, viewMode, "next"))}><ChevronRight className="h-4 w-4" /></Button>
          <div className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Showing</div>
            <div className="text-sm font-semibold text-slate-900">{getRangeLabel(currentDate, viewMode)}</div>
          </div>
          {mode === "calendar" ? (
            <Button onClick={() => openNewEvent()} className="bg-slate-900 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" /> New Event</Button>
          ) : (
            <Button variant="outline" onClick={handleExportOperations}>Export Ops</Button>
          )}
        </div>
      </div>

      {mode === "operations" ? (
        viewMode === "month" ? (
          <CalendarMonthView
            currentDate={currentDate}
            entries={operationsEntries}
            entryClassName="bg-amber-500 text-white hover:bg-amber-600"
            getEntryLabel={(entry) => entry.title}
            onEntryClick={openOperationsProject}
          />
        ) : viewMode === "agenda" ? (
          <CalendarAgendaView
            entries={operationsEntries.filter((entry) => {
              const start = new Date(entry.start_date || entry.end_date || currentDate);
              return start >= visibleRange.start && start <= visibleRange.end;
            })}
            onEntryClick={openOperationsProject}
            renderMeta={(entry) => `${entry.assignee} · ${entry.project_name}`}
          />
        ) : (
          <OperationsResourceTimeline
            currentDate={currentDate}
            viewMode={viewMode}
            entries={operationsEntries}
            onEntryClick={openOperationsProject}
          />
        )
      ) : (
        viewMode === "month" ? (
          <CalendarMonthView currentDate={currentDate} entries={visibleCalendarEvents} entryClassName="bg-blue-500 text-white hover:bg-blue-600" getEntryLabel={(entry) => entry.title} onEntryClick={openExistingEvent} onCreateRange={openNewEvent} />
        ) : viewMode === "agenda" ? (
          <CalendarAgendaView entries={visibleCalendarEvents} onEntryClick={openExistingEvent} renderMeta={(entry) => `${format(new Date(entry.start_datetime), "h:mm a")} · ${entry.project_name || entry.location || entry.visibility}`} />
        ) : (
          <CalendarTimeGrid dates={viewMode === "day" ? [startOfDay(currentDate)] : buildWeekDays(currentDate)} entries={visibleCalendarEvents} onEntryClick={openExistingEvent} onCreateRange={openNewEvent} onMoveEntry={handleMoveEvent} onResizeEntry={handleMoveEvent} getEventClassName={getEventClassName} getEventSubtitle={(entry) => entry.project_name || entry.location || entry.status?.replace("_", " ")} />
        )
      )}

      <CalendarExportHelp onExportPersonal={handleExportCalendar} onExportOperations={handleExportOperations} />

      <CalendarEventDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setInitialRange(null); }} event={editingEvent} initialRange={initialRange} defaultValues={quickNewType === "task" ? { event_type: "task", linked_client_id: quickClientId } : undefined} currentUserName={currentUserName} onSaved={loadData} projects={visibleProjects} clients={clients} employees={employees} />
    </div>
  );
}