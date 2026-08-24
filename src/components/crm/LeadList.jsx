import { useEffect, useMemo, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import {
  Plus, Search, Phone, Mail, CalendarDays, UserRound,
  LayoutList, Columns3, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LeadFormDialog from "@/components/crm/LeadFormDialog";
import LostReasonDialog from "@/components/crm/LostReasonDialog";
import { cn } from "@/lib/utils";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { setLeadStatus, markLeadLost, ensureContactForLead } from "@/lib/leadConversion";
import { DEAD_LEAD_STATUSES } from "@/lib/leadStages";

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  {
    key: "new",
    label: "New Lead",
    match: ["New Lead"],
    defaultStatus: "New Lead",
    color: "bg-slate-400",
    headerBg: "bg-slate-50",
    dropBg: "bg-slate-100",
  },
  {
    key: "contact_attempted",
    label: "Contact Attempted",
    match: ["Contact Attempted"],
    defaultStatus: "Contact Attempted",
    color: "bg-amber-400",
    headerBg: "bg-amber-50",
    dropBg: "bg-amber-100",
  },
  {
    key: "contacted",
    label: "Contacted",
    match: ["Contacted"],
    defaultStatus: "Contacted",
    color: "bg-blue-400",
    headerBg: "bg-blue-50",
    dropBg: "bg-blue-100",
  },
  {
    key: "appointment_scheduled",
    label: "Appointment Scheduled",
    match: ["Appointment Scheduled"],
    defaultStatus: "Appointment Scheduled",
    color: "bg-purple-400",
    headerBg: "bg-purple-50",
    dropBg: "bg-purple-100",
  },
  {
    key: "site_visit",
    label: "Site Visit Complete",
    match: ["Site Visit Complete"],
    defaultStatus: "Site Visit Complete",
    color: "bg-violet-400",
    headerBg: "bg-violet-50",
    dropBg: "bg-violet-100",
  },
  {
    key: "design_appointment",
    label: "Design Appointment Scheduled",
    match: ["Design Appointment Scheduled"],
    defaultStatus: "Design Appointment Scheduled",
    color: "bg-fuchsia-300",
    headerBg: "bg-fuchsia-50",
    dropBg: "bg-fuchsia-100",
  },
  {
    key: "design",
    label: "In Design",
    match: ["In Design"],
    defaultStatus: "In Design",
    color: "bg-fuchsia-400",
    headerBg: "bg-fuchsia-50",
    dropBg: "bg-fuchsia-100",
  },
  {
    key: "estimate",
    label: "Estimate In Progress",
    match: ["Estimate In Progress"],
    defaultStatus: "Estimate In Progress",
    color: "bg-indigo-400",
    headerBg: "bg-indigo-50",
    dropBg: "bg-indigo-100",
  },
  {
    key: "quote",
    label: "Quote and Design Delivered/Price Locked",
    match: ["Quote Delivered/Price Locked"],
    defaultStatus: "Quote Delivered/Price Locked",
    color: "bg-cyan-400",
    headerBg: "bg-cyan-50",
    dropBg: "bg-cyan-100",
  },
  {
    key: "negotiating",
    label: "Negotiating/Revising Scope",
    match: ["Negotiating/Revising Scope"],
    defaultStatus: "Negotiating/Revising Scope",
    color: "bg-yellow-400",
    headerBg: "bg-yellow-50",
    dropBg: "bg-yellow-100",
  },
  {
    key: "won",
    label: "Contract Signed/Deposit Collected (Won)",
    match: ["Contract Signed/Deposit Collected (Won)"],
    defaultStatus: "Contract Signed/Deposit Collected (Won)",
    color: "bg-emerald-400",
    headerBg: "bg-emerald-50",
    dropBg: "bg-emerald-100",
  },
  {
    key: "lost",
    label: "Lost/No Decision",
    match: ["Lost/No Decision"],
    defaultStatus: "Lost/No Decision",
    color: "bg-rose-400",
    headerBg: "bg-rose-50",
    dropBg: "bg-rose-100",
  },
];

const statusStyles = {
  "New Lead":                                 "bg-slate-100 text-slate-700",
  "Contact Attempted":                        "bg-amber-100 text-amber-700",
  Contacted:                                  "bg-blue-100 text-blue-700",
  "Appointment Scheduled":                    "bg-purple-100 text-purple-700",
  "Site Visit Complete":                      "bg-violet-100 text-violet-700",
  "Design Appointment Scheduled":             "bg-fuchsia-50 text-fuchsia-600",
  "In Design":                                "bg-fuchsia-100 text-fuchsia-700",
  "Estimate In Progress":                     "bg-indigo-100 text-indigo-700",
  "Quote Delivered/Price Locked":              "bg-cyan-100 text-cyan-700",
  "Negotiating/Revising Scope":                "bg-yellow-100 text-yellow-700",
  "Contract Signed/Deposit Collected (Won)":   "bg-emerald-100 text-emerald-700",
  "Lost/No Decision":                          "bg-rose-100 text-rose-700",
};

const DEAD_STATUSES = DEAD_LEAD_STATUSES;

// ─── Lead card (shared by both views) ────────────────────────────────────────

function LeadCard({ lead, draggable, onDragStart }) {
  return (
    <Link
      to={`/LeadDetail?id=${lead.id}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, lead) : undefined}
      className={cn(
        "block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all",
        "hover:shadow-md hover:border-slate-300",
        draggable && "cursor-grab active:cursor-grabbing active:opacity-60 active:scale-95"
      )}
      onClick={(e) => {
        // Prevent navigation if the user just finished a drag
        if (e.defaultPrevented) e.preventDefault();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 leading-snug">{lead.full_name}</h3>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={cn("text-[10px]", statusStyles[lead.status] || "bg-slate-100 text-slate-700")}>
            {lead.status || "New Lead"}
          </Badge>
          {lead.is_prospect && (
            <Badge className="bg-amber-100 text-[10px] text-amber-700">Prospect</Badge>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
        {lead.project_type && <p className="text-xs text-slate-500">{lead.project_type}</p>}
        {lead.estimated_budget != null && lead.estimated_budget !== "" && (
          <p className="text-xs font-semibold text-emerald-700">${Number(lead.estimated_budget).toLocaleString()}</p>
        )}
      </div>

      {["Appointment Scheduled", "Site Visit Complete", "Design Appointment Scheduled"].includes(lead.status) && lead._appointmentDate && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-purple-700">
          <CalendarDays className="h-3 w-3" />
          {new Date(lead._appointmentDate).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          })}
        </div>
      )}

      {lead.status === "Lost/No Decision" && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
          <Tag className="h-3 w-3" />
          {lead.lost_reason || "No reason set"}
        </div>
      )}

      <div className="mt-2.5 space-y-1 text-xs text-slate-400">
        {lead.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{lead.phone}</div>}
        {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{lead.email}</span></div>}
        {lead.assigned_sales_rep && <div className="flex items-center gap-1.5"><UserRound className="h-3 w-3" />{lead.assigned_sales_rep}</div>}
        {lead.follow_up_date && <div className="flex items-center gap-1.5"><CalendarDays className="h-3 w-3" />{lead.follow_up_date}</div>}
      </div>

      {lead.project_description && (
        <p className="mt-2.5 line-clamp-2 text-xs text-slate-500">{lead.project_description}</p>
      )}
    </Link>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ column, leads, onDrop, onDragStart, onDragOver, draggingOver }) {
  const isOver = draggingOver === column.key;

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0 max-h-[calc(100vh-320px)]">
      {/* Header */}
      <div className={cn("rounded-xl px-3 py-2 mb-2 flex items-center justify-between shrink-0", column.headerBg)}>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", column.color)} />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{column.label}</span>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-white rounded-full px-1.5 py-0.5 border border-slate-200">
          {leads.length}
        </span>
      </div>

      {/* Drop zone — scrolls internally so a long column doesn't stretch the
          whole page and push the board's horizontal scrollbar out of view */}
      <div
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, column)}
        className={cn(
          "flex-1 min-h-[120px] overflow-y-auto rounded-xl border-2 border-dashed p-2 space-y-2 transition-all duration-150",
          isOver
            ? cn("border-slate-400", column.dropBg)
            : "border-transparent"
        )}
      >
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            draggable
            onDragStart={onDragStart}
          />
        ))}
        {leads.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-16 text-[10px] text-slate-300 font-medium uppercase tracking-wider">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Design appointment prompt ─────────────────────────────────────────────────

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

function DesignAppointmentDialog({ lead, saving, onSkip, onSave }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onSkip(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule design appointment</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          When is the design appointment for {lead.full_name}?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onSkip} disabled={saving}>Skip</Button>
          <Button onClick={() => onSave({ date, time })} disabled={saving || !date || !time}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeadList({ archived = false }) {
  const companyScope = useCompanyScope();
  const [leads, setLeads] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState("kanban"); // "kanban" | "list"
  const [draggingOver, setDraggingOver] = useState(null);
  const [appointmentPrompt, setAppointmentPrompt] = useState(null); // { lead, column } | null
  const [schedulingAppointment, setSchedulingAppointment] = useState(false);
  const [lostReasonPrompt, setLostReasonPrompt] = useState(null); // lead | null
  const [savingLostReason, setSavingLostReason] = useState(false);
  const [reasonFilter, setReasonFilter] = useState("all");
  const dragLeadRef = useRef(null);

  const loadLeads = async () => {
    try {
      const data = await base44.entities.Lead.list("-created_date", 500);
      setLeads(data || []);
    } catch (err) {
      console.error("Failed to load leads:", err?.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarEvents = async () => {
    try {
      const data = await base44.entities.CalendarEvent.list("start_datetime", 2000);
      setCalendarEvents(data || []);
    } catch (err) {
      console.error("Failed to load calendar events:", err?.message);
    }
  };

  useEffect(() => {
    loadLeads();
    loadCalendarEvents();
    const unsubLeads = base44.entities.Lead.subscribe(() => loadLeads());
    const unsubEvents = base44.entities.CalendarEvent.subscribe(() => loadCalendarEvents());
    return () => {
      unsubLeads();
      unsubEvents();
    };
  }, []);

  // Calendar event to surface on each lead's card (via lead_id, set when an
  // appointment is scheduled — see LeadFormDialog.jsx's "Schedule an
  // appointment" flow and the design-appointment prompt below), keyed by lead
  // id. A lead can have more than one linked event (e.g. the original site
  // visit plus a later design appointment), so this prefers the soonest
  // upcoming one and only falls back to a past event if nothing is upcoming.
  const appointmentByLeadId = useMemo(() => {
    const map = {};
    const now = Date.now();
    for (const event of calendarEvents) {
      if (!event.lead_id) continue;
      const existing = map[event.lead_id];
      if (!existing) {
        map[event.lead_id] = event;
        continue;
      }

      const eventTime = new Date(event.start_datetime).getTime();
      const existingTime = new Date(existing.start_datetime).getTime();
      const eventUpcoming = eventTime >= now;
      const existingUpcoming = existingTime >= now;

      if (eventUpcoming !== existingUpcoming) {
        if (eventUpcoming) map[event.lead_id] = event;
      } else if (eventUpcoming) {
        if (eventTime < existingTime) map[event.lead_id] = event;
      } else {
        if (eventTime > existingTime) map[event.lead_id] = event;
      }
    }
    return map;
  }, [calendarEvents]);

  const scopedLeads = useMemo(
    () => scopeFilter(leads, companyScope).map((lead) => ({
      ...lead,
      _appointmentDate: appointmentByLeadId[lead.id]?.start_datetime || null,
    })),
    [leads, companyScope, appointmentByLeadId]
  );

  const visibleLeads = useMemo(() =>
    scopedLeads.filter((lead) =>
      archived
        ? DEAD_STATUSES.includes(lead.status)
        : !DEAD_STATUSES.includes(lead.status)
    ), [scopedLeads, archived]);

  const filteredLeads = useMemo(() => visibleLeads.filter((lead) => {
    if (archived && reasonFilter !== "all") {
      const leadReason = lead.lost_reason || "Unset";
      if (leadReason !== reasonFilter) return false;
    }
    const value = search.toLowerCase();
    return !value ||
      (lead.full_name || "").toLowerCase().includes(value) ||
      (lead.email || "").toLowerCase().includes(value) ||
      (lead.phone || "").toLowerCase().includes(value) ||
      (lead.project_description || "").toLowerCase().includes(value);
  }), [visibleLeads, search, archived, reasonFilter]);

  // Lost-reason breakdown, shown on the archived tab so lost leads can be
  // reviewed and filtered by why the deal was lost.
  const reasonCounts = useMemo(() => {
    if (!archived) return [];
    const counts = {};
    for (const lead of visibleLeads) {
      const key = lead.lost_reason || "Unset";
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [visibleLeads, archived]);

  // Funnel summary counts for the header stats
  const funnelCounts = useMemo(() => [
    { label: "New",         count: visibleLeads.filter(l => ["New Lead"].includes(l.status || "New Lead")).length },
    { label: "Contacted",   count: visibleLeads.filter(l => ["Contact Attempted", "Contacted"].includes(l.status)).length },
    { label: "Appointment", count: visibleLeads.filter(l => ["Appointment Scheduled", "Site Visit Complete", "Design Appointment Scheduled"].includes(l.status)).length },
    { label: "In Design",   count: visibleLeads.filter(l => l.status === "In Design").length },
    { label: "Estimate",    count: visibleLeads.filter(l => ["Estimate In Progress", "Quote Delivered/Price Locked", "Negotiating/Revising Scope"].includes(l.status)).length },
    { label: "Won",         count: visibleLeads.filter(l => l.status === "Contract Signed/Deposit Collected (Won)").length },
  ], [visibleLeads]);

  // Total projected value across all active (non-lost) leads. Leads move out
  // of visibleLeads (and out of this total) as soon as they're marked Lost.
  const activePipelineValue = useMemo(
    () => visibleLeads.reduce((sum, l) => sum + (Number(l.estimated_budget) || 0), 0),
    [visibleLeads]
  );

  // Group leads into kanban columns
  const columnLeads = useMemo(() =>
    Object.fromEntries(
      COLUMNS.map((col) => [
        col.key,
        filteredLeads.filter((l) => col.match.includes(l.status || "New Lead")),
      ])
    ), [filteredLeads]);

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = (e, lead) => {
    dragLeadRef.current = lead;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
  };

  const handleDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDraggingOver(colKey);
  };

  const moveLeadToColumn = async (lead, column) => {
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => l.id === lead.id ? { ...l, status: column.defaultStatus } : l)
    );

    try {
      await setLeadStatus(lead, column.defaultStatus);
    } catch {
      // Revert on failure
      setLeads((prev) =>
        prev.map((l) => l.id === lead.id ? { ...l, status: lead.status } : l)
      );
    }
  };

  const handleDrop = async (e, column) => {
    e.preventDefault();
    setDraggingOver(null);
    const lead = dragLeadRef.current;
    dragLeadRef.current = null;
    if (!lead) return;

    const alreadyInColumn = column.match.includes(lead.status || "New Lead");
    if (alreadyInColumn) return;

    // Moving into "Design Appointment Scheduled" is when the design
    // appointment gets booked, so pause here and ask for the date/time
    // before committing the status change.
    if (column.key === "design_appointment") {
      setAppointmentPrompt({ lead, column });
      return;
    }

    // Moving into "Lost/No Decision" requires a reason code, so pause here
    // instead of committing the status change immediately.
    if (column.key === "lost") {
      setLostReasonPrompt(lead);
      return;
    }

    await moveLeadToColumn(lead, column);
  };

  const handleDragEnd = () => {
    setDraggingOver(null);
    dragLeadRef.current = null;
  };

  const handleSkipAppointment = () => {
    if (!appointmentPrompt) return;
    const { lead, column } = appointmentPrompt;
    setAppointmentPrompt(null);
    moveLeadToColumn(lead, column);
  };

  const handleSaveAppointment = async ({ date, time }) => {
    if (!appointmentPrompt) return;
    const { lead, column } = appointmentPrompt;
    setSchedulingAppointment(true);
    try {
      const endTime = addMinutes(time, 60);
      // Ensure the lead has a linked contact before booking so the
      // appointment's "Linked Person / Customer" always resolves to who it
      // was actually created for, instead of being left blank.
      const client = await ensureContactForLead(lead);
      await base44.entities.CalendarEvent.create({
        title: `${lead.full_name} - Design Appointment`,
        start_datetime: `${date}T${time}:00`,
        end_datetime: `${date}T${endTime}:00`,
        event_type: "meeting",
        status: "scheduled",
        assigned_users: lead.assigned_sales_rep ? [lead.assigned_sales_rep] : [],
        visibility: "team",
        linked_client_id: client?.id || null,
        lead_id: lead.id,
      });
    } catch (err) {
      console.error("Failed to schedule design appointment:", err?.message);
    } finally {
      setSchedulingAppointment(false);
    }
    setAppointmentPrompt(null);
    await moveLeadToColumn(lead, column);
  };

  const handleCancelLostReason = () => setLostReasonPrompt(null);

  const handleSaveLostReason = async ({ reason, notes }) => {
    const lead = lostReasonPrompt;
    if (!lead) return;
    setSavingLostReason(true);
    setLeads((prev) =>
      prev.map((l) => l.id === lead.id ? { ...l, status: "Lost/No Decision", lost_reason: reason, lost_reason_notes: notes } : l)
    );
    try {
      await markLeadLost(lead, { reason, notes });
    } catch (err) {
      console.error("Failed to mark lead lost:", err?.message);
      setLeads((prev) =>
        prev.map((l) => l.id === lead.id ? { ...l, status: lead.status, lost_reason: lead.lost_reason, lost_reason_notes: lead.lost_reason_notes } : l)
      );
    } finally {
      setSavingLostReason(false);
    }
    setLostReasonPrompt(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-6 pb-6 lg:px-8 lg:pb-8">

      {/* Funnel summary */}
      {!archived && (
        <>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Active Pipeline Value</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">${activePipelineValue.toLocaleString()}</p>
            <p className="mt-1 text-xs text-emerald-700/80">Projected total across {visibleLeads.length} active leads — drops off once a lead is marked Lost.</p>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {funnelCounts.map((b) => (
              <div key={b.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{b.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{b.count}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lost-reason breakdown */}
      {archived && reasonCounts.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {reasonCounts.map(([reason, count]) => (
            <button
              key={reason}
              type="button"
              onClick={() => setReasonFilter((current) => current === reason ? "all" : reason)}
              className={cn(
                "rounded-2xl border p-4 text-left shadow-sm transition-colors",
                reasonFilter === reason
                  ? "border-rose-400 bg-rose-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{reason}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{count}</p>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={archived ? "Search archived leads..." : "Search leads..."}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {archived && reasonCounts.length > 0 && (
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All reasons" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reasons</SelectItem>
                {reasonCounts.map(([reason]) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* View toggle */}
          {!archived && (
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "kanban"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <Columns3 className="h-3.5 w-3.5" /> Board
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "list"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <LayoutList className="h-3.5 w-3.5" /> List
              </button>
            </div>
          )}

          {!archived && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* ── Kanban board ── */}
      {view === "kanban" && !archived && (
        <div className="overflow-x-auto pb-4">
          <div
            className="flex gap-3 min-w-max"
            onDragLeave={() => setDraggingOver(null)}
            onDragEnd={handleDragEnd}
          >
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                column={col}
                leads={columnLeads[col.key] || []}
                draggingOver={draggingOver}
                onDragStart={handleDragStart}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── List view ── */}
      {(view === "list" || archived) && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} draggable={false} />
            ))}
          </div>

          {!filteredLeads.length && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              {archived ? "No archived leads." : "No leads found."}
            </div>
          )}
        </>
      )}

      <LeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={loadLeads} />

      {appointmentPrompt && (
        <DesignAppointmentDialog
          lead={appointmentPrompt.lead}
          saving={schedulingAppointment}
          onSkip={handleSkipAppointment}
          onSave={handleSaveAppointment}
        />
      )}

      {lostReasonPrompt && (
        <LostReasonDialog
          lead={lostReasonPrompt}
          saving={savingLostReason}
          onCancel={handleCancelLostReason}
          onSave={handleSaveLostReason}
        />
      )}
    </div>
  );
}
