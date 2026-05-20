import { useEffect, useMemo, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import {
  Plus, Search, Phone, Mail, CalendarDays, UserRound,
  LayoutList, Columns3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LeadFormDialog from "@/components/crm/LeadFormDialog";
import { cn } from "@/lib/utils";

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  {
    key: "new",
    label: "New",
    match: ["New Lead"],
    defaultStatus: "New Lead",
    color: "bg-slate-400",
    headerBg: "bg-slate-50",
    dropBg: "bg-slate-100",
  },
  {
    key: "contacted",
    label: "Contacted",
    match: ["Contact Attempted", "Contacted", "Follow Up"],
    defaultStatus: "Contacted",
    color: "bg-blue-400",
    headerBg: "bg-blue-50",
    dropBg: "bg-blue-100",
  },
  {
    key: "appointment",
    label: "Appointment",
    match: ["Appointment Scheduled", "Site Visit Complete"],
    defaultStatus: "Appointment Scheduled",
    color: "bg-purple-400",
    headerBg: "bg-purple-50",
    dropBg: "bg-purple-100",
  },
  {
    key: "estimate",
    label: "Estimate",
    match: ["Estimate In Progress", "Estimate Sent", "Negotiation"],
    defaultStatus: "Estimate In Progress",
    color: "bg-indigo-400",
    headerBg: "bg-indigo-50",
    dropBg: "bg-indigo-100",
  },
  {
    key: "won",
    label: "Won",
    match: ["Won"],
    defaultStatus: "Won",
    color: "bg-emerald-400",
    headerBg: "bg-emerald-50",
    dropBg: "bg-emerald-100",
  },
  {
    key: "lost",
    label: "Lost",
    match: ["Lost", "On Hold"],
    defaultStatus: "Lost",
    color: "bg-rose-400",
    headerBg: "bg-rose-50",
    dropBg: "bg-rose-100",
  },
];

const statusStyles = {
  "New Lead":             "bg-slate-100 text-slate-700",
  "Contact Attempted":   "bg-amber-100 text-amber-700",
  Contacted:             "bg-blue-100 text-blue-700",
  "Appointment Scheduled": "bg-purple-100 text-purple-700",
  "Site Visit Complete": "bg-violet-100 text-violet-700",
  "Estimate In Progress": "bg-indigo-100 text-indigo-700",
  "Estimate Sent":       "bg-cyan-100 text-cyan-700",
  "Follow Up":           "bg-orange-100 text-orange-700",
  Negotiation:           "bg-yellow-100 text-yellow-700",
  Won:                   "bg-emerald-100 text-emerald-700",
  Lost:                  "bg-rose-100 text-rose-700",
  "On Hold":             "bg-slate-200 text-slate-700",
};

const DEAD_STATUSES = ["Lost"];

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
        <Badge className={cn("shrink-0 text-[10px]", statusStyles[lead.status] || "bg-slate-100 text-slate-700")}>
          {lead.status || "New Lead"}
        </Badge>
      </div>

      {lead.project_type && (
        <p className="mt-1 text-xs text-slate-500">{lead.project_type}</p>
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
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      {/* Header */}
      <div className={cn("rounded-xl px-3 py-2 mb-2 flex items-center justify-between", column.headerBg)}>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", column.color)} />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{column.label}</span>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-white rounded-full px-1.5 py-0.5 border border-slate-200">
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, column)}
        className={cn(
          "flex-1 rounded-xl border-2 border-dashed p-2 space-y-2 min-h-[120px] transition-all duration-150",
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeadList({ archived = false }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState("kanban"); // "kanban" | "list"
  const [draggingOver, setDraggingOver] = useState(null);
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

  useEffect(() => {
    loadLeads();
    const unsubscribe = base44.entities.Lead.subscribe(() => loadLeads());
    return unsubscribe;
  }, []);

  const visibleLeads = useMemo(() =>
    leads.filter((lead) =>
      archived
        ? DEAD_STATUSES.includes(lead.status)
        : !DEAD_STATUSES.includes(lead.status)
    ), [leads, archived]);

  const filteredLeads = useMemo(() => visibleLeads.filter((lead) => {
    const value = search.toLowerCase();
    return !value ||
      (lead.full_name || "").toLowerCase().includes(value) ||
      (lead.email || "").toLowerCase().includes(value) ||
      (lead.phone || "").toLowerCase().includes(value) ||
      (lead.project_description || "").toLowerCase().includes(value);
  }), [visibleLeads, search]);

  // Funnel summary counts (using original 5-bucket grouping for the header stats)
  const funnelCounts = useMemo(() => [
    { label: "New",         count: visibleLeads.filter(l => ["New Lead"].includes(l.status || "New Lead")).length },
    { label: "Contacted",   count: visibleLeads.filter(l => ["Contact Attempted", "Contacted", "Follow Up"].includes(l.status)).length },
    { label: "Appointment", count: visibleLeads.filter(l => ["Appointment Scheduled", "Site Visit Complete"].includes(l.status)).length },
    { label: "Estimate",    count: visibleLeads.filter(l => ["Estimate In Progress", "Estimate Sent", "Negotiation"].includes(l.status)).length },
    { label: "Won",         count: visibleLeads.filter(l => l.status === "Won").length },
  ], [visibleLeads]);

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

  const handleDrop = async (e, column) => {
    e.preventDefault();
    setDraggingOver(null);
    const lead = dragLeadRef.current;
    dragLeadRef.current = null;
    if (!lead) return;

    const alreadyInColumn = column.match.includes(lead.status || "New Lead");
    if (alreadyInColumn) return;

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => l.id === lead.id ? { ...l, status: column.defaultStatus } : l)
    );

    try {
      await base44.entities.Lead.update(lead.id, { status: column.defaultStatus });
    } catch {
      // Revert on failure
      setLeads((prev) =>
        prev.map((l) => l.id === lead.id ? { ...l, status: lead.status } : l)
      );
    }
  };

  const handleDragEnd = () => {
    setDraggingOver(null);
    dragLeadRef.current = null;
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
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          {funnelCounts.map((b) => (
            <div key={b.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{b.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{b.count}</p>
            </div>
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
    </div>
  );
}
