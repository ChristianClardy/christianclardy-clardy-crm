import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Search, Phone, Mail, CalendarDays, UserRound,
  LayoutList, Columns3, Filter, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LeadFormDialog from "@/components/crm/LeadFormDialog";
import { cn } from "@/lib/utils";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";

const ContactDetailSlider = lazy(() => import("@/components/crm/ContactDetailSlider"));

// ─── Status normaliser ───────────────────────────────────────────────────────
// Maps raw DB enum values to the display strings the kanban uses.
// Leads created through the UI already have display strings; older records
// or defaults from the Postgres enum need remapping.
const STATUS_MAP = {
  new:        "New Lead",
  contacted:  "Contacted",
  qualified:  "Appointment Scheduled",
  proposal:   "Estimate In Progress",
  won:        "Won",
  lost:       "Lost",
};
const normalizeStatus = (s) => STATUS_MAP[s] ?? s ?? "New Lead";

// ─── Kanban columns ───────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "new",         label: "New",         match: ["New Lead"],                                                    defaultStatus: "New Lead",             color: "bg-slate-400",   headerBg: "bg-slate-50",   dropBg: "bg-slate-100"   },
  { key: "contacted",   label: "Contacted",   match: ["Contact Attempted","Contacted","Follow Up"],                   defaultStatus: "Contacted",            color: "bg-blue-400",    headerBg: "bg-blue-50",    dropBg: "bg-blue-100"    },
  { key: "appointment", label: "Appointment", match: ["Appointment Scheduled","Site Visit Complete","Design Appointment Scheduled"],                 defaultStatus: "Appointment Scheduled", color: "bg-purple-400",  headerBg: "bg-purple-50",  dropBg: "bg-purple-100"  },
  { key: "estimate",    label: "Estimate",    match: ["Estimate In Progress","Estimate Sent","Negotiation"],          defaultStatus: "Estimate In Progress", color: "bg-indigo-400",  headerBg: "bg-indigo-50",  dropBg: "bg-indigo-100"  },
  { key: "won",         label: "Won",         match: ["Won"],                                                         defaultStatus: "Won",                  color: "bg-emerald-400", headerBg: "bg-emerald-50", dropBg: "bg-emerald-100" },
  { key: "lost",        label: "Lost",        match: ["Lost","On Hold"],                                              defaultStatus: "Lost",                 color: "bg-rose-400",    headerBg: "bg-rose-50",    dropBg: "bg-rose-100"    },
];

const statusStyles = {
  "New Lead":              "bg-slate-100 text-slate-700",
  "Contact Attempted":     "bg-amber-100 text-amber-700",
  Contacted:               "bg-blue-100 text-blue-700",
  "Appointment Scheduled": "bg-purple-100 text-purple-700",
  "Site Visit Complete":   "bg-violet-100 text-violet-700",
  "Design Appointment Scheduled": "bg-fuchsia-50 text-fuchsia-600",
  "Estimate In Progress":  "bg-indigo-100 text-indigo-700",
  "Estimate Sent":         "bg-cyan-100 text-cyan-700",
  "Follow Up":             "bg-orange-100 text-orange-700",
  Negotiation:             "bg-yellow-100 text-yellow-700",
  Won:                     "bg-emerald-100 text-emerald-700",
  Lost:                    "bg-rose-100 text-rose-700",
  "On Hold":               "bg-slate-200 text-slate-700",
};

const DEAD = ["Lost", "lost"];

// ─── Contact card ─────────────────────────────────────────────────────────────

function ContactCard({ lead, draggable, onDragStart, onClick }) {
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, lead) : undefined}
      onClick={() => onClick(lead)}
      className={cn(
        "block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all cursor-pointer",
        "hover:shadow-md hover:border-amber-300",
        draggable && "active:opacity-60 active:scale-95"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[11px] font-bold shrink-0">
            {(lead.full_name || "?")[0].toUpperCase()}
          </div>
          <h3 className="text-sm font-semibold text-slate-900 leading-snug truncate">{lead.full_name}</h3>
        </div>
        <Badge className={cn("shrink-0 text-[10px]", statusStyles[lead._status || lead.status] || "bg-slate-100 text-slate-700")}>
          {lead._status || lead.status || "New Lead"}
        </Badge>
      </div>

      {lead.project_type && (
        <p className="mt-1 text-xs text-slate-500">{lead.project_type}</p>
      )}

      <div className="mt-2 space-y-1 text-xs text-slate-400">
        {lead.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{lead.phone}</div>}
        {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{lead.email}</span></div>}
        {lead.assigned_sales_rep && <div className="flex items-center gap-1.5"><UserRound className="h-3 w-3" />{lead.assigned_sales_rep}</div>}
        {lead.follow_up_date && <div className="flex items-center gap-1.5"><CalendarDays className="h-3 w-3" />{lead.follow_up_date}</div>}
      </div>

      {lead.project_description && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{lead.project_description}</p>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ column, leads, onDrop, onDragStart, onDragOver, draggingOver, onCardClick }) {
  const isOver = draggingOver === column.key;
  return (
    <div className="flex flex-col min-w-[230px] w-[230px] shrink-0">
      <div className={cn("rounded-xl px-3 py-2 mb-2 flex items-center justify-between", column.headerBg)}>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", column.color)} />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{column.label}</span>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-white rounded-full px-1.5 py-0.5 border border-slate-200">
          {leads.length}
        </span>
      </div>
      <div
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, column)}
        className={cn(
          "flex-1 rounded-xl border-2 border-dashed p-2 space-y-2 min-h-[120px] transition-all duration-150",
          isOver ? cn("border-slate-400", column.dropBg) : "border-transparent"
        )}
      >
        {leads.map((lead) => (
          <ContactCard key={lead.id} lead={lead} draggable onDragStart={onDragStart} onClick={onCardClick} />
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ContactsView() {
  const companyScope = useCompanyScope();
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [view, setView]           = useState("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingOver, setDraggingOver] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [repFilter, setRepFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const dragLeadRef = useRef(null);

  const loadLeads = async () => {
    try {
      const data = await base44.entities.Lead.list("-created_date", 500);
      setLeads(data || []);
    } catch (err) {
      console.error("Failed to load contacts:", err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
    const unsub = base44.entities.Lead.subscribe(() => loadLeads());
    return unsub;
  }, []);

  const scopedLeads = useMemo(() => scopeFilter(leads, companyScope), [leads, companyScope]);

  const reps = useMemo(() => [...new Set(scopedLeads.map(l => l.assigned_sales_rep).filter(Boolean))], [scopedLeads]);

  // Normalise statuses so enum defaults ('new','contacted',etc.) map correctly
  const leadsNorm = useMemo(() => scopedLeads.map(l => ({ ...l, _status: normalizeStatus(l.status) })), [scopedLeads]);

  const activeLeads = useMemo(() => leadsNorm.filter(l => !DEAD.includes(l._status)), [leadsNorm]);

  const filteredLeads = useMemo(() => activeLeads.filter(l => {
    if (repFilter !== "all" && l.assigned_sales_rep !== repFilter) return false;
    const q = search.toLowerCase();
    return !q ||
      (l.full_name || "").toLowerCase().includes(q) ||
      (l.email || "").toLowerCase().includes(q) ||
      (l.phone || "").toLowerCase().includes(q) ||
      (l.project_description || "").toLowerCase().includes(q);
  }), [activeLeads, search, repFilter]);

  const funnelCounts = useMemo(() => [
    { label: "New",         count: activeLeads.filter(l => l._status === "New Lead").length },
    { label: "Contacted",   count: activeLeads.filter(l => ["Contact Attempted","Contacted","Follow Up"].includes(l._status)).length },
    { label: "Appointment", count: activeLeads.filter(l => ["Appointment Scheduled","Site Visit Complete","Design Appointment Scheduled"].includes(l._status)).length },
    { label: "Estimate",    count: activeLeads.filter(l => ["Estimate In Progress","Estimate Sent","Negotiation"].includes(l._status)).length },
    { label: "Won",         count: activeLeads.filter(l => l._status === "Won").length },
  ], [activeLeads]);

  // Any status that doesn't match a known column falls into "New" as a catch-all
  const allKnownStatuses = new Set(COLUMNS.flatMap(c => c.match));
  const columnLeads = useMemo(() =>
    Object.fromEntries(COLUMNS.map(col => [
      col.key,
      filteredLeads.filter(l =>
        col.key === "new"
          ? col.match.includes(l._status) || !allKnownStatuses.has(l._status)
          : col.match.includes(l._status)
      ),
    ])), [filteredLeads]);

  // Drag handlers
  const handleDragStart = (e, lead) => {
    dragLeadRef.current = lead;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDraggingOver(colKey);
  };
  const handleDrop = async (e, column) => {
    e.preventDefault();
    setDraggingOver(null);
    const lead = dragLeadRef.current; dragLeadRef.current = null;
    if (!lead || column.match.includes(lead._status || "New Lead")) return;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: column.defaultStatus } : l));
    try {
      await base44.entities.Lead.update(lead.id, { status: column.defaultStatus });
    } catch {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: lead.status } : l));
    }
  };

  const handleUpdateLead = async (id, patch) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    if (selectedLead?.id === id) setSelectedLead(prev => ({ ...prev, ...patch }));
    await base44.entities.Lead.update(id, patch);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" /></div>;

  return (
    <div className="space-y-4 p-5">
      {/* Funnel summary */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        {funnelCounts.map(b => (
          <div key={b.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{b.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{b.count}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" className="pl-9" />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
              showFilters ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}
          >
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {["kanban","list"].map(v => (
              <button key={v} onClick={() => setView(v)} className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                view === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              )}>
                {v === "kanban" ? <><Columns3 className="h-3.5 w-3.5" /> Board</> : <><LayoutList className="h-3.5 w-3.5" /> List</>}
              </button>
            ))}
          </div>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Owner:</span>
            <select
              value={repFilter}
              onChange={e => setRepFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
            >
              <option value="all">All Reps</option>
              {reps.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Kanban board */}
      {view === "kanban" && (
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          onDragLeave={() => setDraggingOver(null)}
          onDragEnd={() => { setDraggingOver(null); dragLeadRef.current = null; }}
        >
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              column={col}
              leads={columnLeads[col.key] || []}
              draggingOver={draggingOver}
              onDragStart={handleDragStart}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDrop={handleDrop}
              onCardClick={setSelectedLead}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="space-y-2">
          {filteredLeads.map(lead => (
            <div
              key={lead.id}
              onClick={() => setSelectedLead(lead)}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-amber-300 cursor-pointer transition-all flex items-center gap-4"
            >
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0">
                {(lead.full_name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{lead.full_name}</span>
                  <Badge className={cn("text-[10px]", statusStyles[lead._status || lead.status] || "bg-slate-100 text-slate-700")}>
                    {lead._status || lead.status || "New Lead"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">{lead.project_type} {lead.email && `· ${lead.email}`}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400 shrink-0">
                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                {lead.assigned_sales_rep && <span className="flex items-center gap-1"><UserRound className="w-3 h-3" />{lead.assigned_sales_rep}</span>}
              </div>
            </div>
          ))}
          {filteredLeads.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              No contacts found.
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <LeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={loadLeads} />

      {/* Contact detail slider */}
      {selectedLead && (
        <Suspense fallback={null}>
          <ContactDetailSlider
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onUpdate={handleUpdateLead}
          />
        </Suspense>
      )}
    </div>
  );
}
