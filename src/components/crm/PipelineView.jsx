import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Search, X, DollarSign, TrendingUp, Briefcase, Users,
  CalendarDays, UserRound, ChevronDown, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Stage definitions ────────────────────────────────────────────────────────

const STAGES = [
  {
    key:         "Lead",
    label:       "Lead",
    probability: 20,
    color:       "bg-slate-400",
    headerBg:    "bg-slate-800",
    accentText:  "text-slate-300",
    dropBg:      "bg-slate-50",
    pillBg:      "bg-slate-100 text-slate-700",
  },
  {
    key:         "Qualified",
    label:       "Qualified",
    probability: 40,
    color:       "bg-blue-400",
    headerBg:    "bg-blue-900",
    accentText:  "text-blue-300",
    dropBg:      "bg-blue-50",
    pillBg:      "bg-blue-100 text-blue-700",
  },
  {
    key:         "Proposal",
    label:       "Proposal",
    probability: 60,
    color:       "bg-purple-400",
    headerBg:    "bg-purple-900",
    accentText:  "text-purple-300",
    dropBg:      "bg-purple-50",
    pillBg:      "bg-purple-100 text-purple-700",
  },
  {
    key:         "Negotiation",
    label:       "Negotiation",
    probability: 70,
    color:       "bg-amber-400",
    headerBg:    "bg-amber-900",
    accentText:  "text-amber-300",
    dropBg:      "bg-amber-50",
    pillBg:      "bg-amber-100 text-amber-800",
  },
  {
    key:         "Contract Sent",
    label:       "Contract Sent",
    probability: 85,
    color:       "bg-indigo-400",
    headerBg:    "bg-indigo-900",
    accentText:  "text-indigo-300",
    dropBg:      "bg-indigo-50",
    pillBg:      "bg-indigo-100 text-indigo-700",
  },
  {
    key:         "Closed Won",
    label:       "Closed Won",
    probability: 100,
    color:       "bg-emerald-400",
    headerBg:    "bg-emerald-900",
    accentText:  "text-emerald-300",
    dropBg:      "bg-emerald-50",
    pillBg:      "bg-emerald-100 text-emerald-700",
  },
  {
    key:         "Closed Lost",
    label:       "Closed Lost",
    probability: 0,
    color:       "bg-rose-400",
    headerBg:    "bg-rose-900",
    accentText:  "text-rose-300",
    dropBg:      "bg-rose-50",
    pillBg:      "bg-rose-100 text-rose-700",
  },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value) {
  if (!value && value !== 0) return "$0";
  return "$" + Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtCompact(value) {
  if (!value && value !== 0) return "$0";
  const n = Number(value);
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Add/Edit Deal Dialog ─────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "",
  value: "",
  stage: "Lead",
  close_date: "",
  assigned_to: "",
  description: "",
  probability: 20,
};

function DealFormDialog({ open, onClose, onSaved, initialData, leads }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title:       initialData.title || "",
              value:       initialData.value || "",
              stage:       initialData.stage || "Lead",
              close_date:  initialData.close_date || "",
              assigned_to: initialData.assigned_to || "",
              description: initialData.description || "",
              probability: initialData.probability ?? STAGE_MAP[initialData.stage || "Lead"]?.probability ?? 20,
              lead_id:     initialData.lead_id || "",
            }
          : { ...EMPTY_FORM }
      );
    }
  }, [open, initialData]);

  const set = (k) => (e) => {
    const val = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [k]: val };
      if (k === "stage") next.probability = STAGE_MAP[val]?.probability ?? prev.probability;
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        value: form.value ? parseFloat(form.value) : 0,
        probability: parseInt(form.probability, 10),
      };
      if (initialData?.id) {
        await base44.entities.Deal.update(initialData.id, payload);
      } else {
        await base44.entities.Deal.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save deal:", err?.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {initialData ? "Edit Deal" : "New Deal"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Deal Title *</label>
            <Input value={form.title} onChange={set("title")} placeholder="e.g. Smith Backyard Renovation" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Value ($)</label>
              <Input type="number" min="0" step="0.01" value={form.value} onChange={set("value")} placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Close Date</label>
              <Input type="date" value={form.close_date} onChange={set("close_date")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Stage</label>
              <select
                value={form.stage}
                onChange={set("stage")}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Probability (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={form.probability}
                onChange={set("probability")}
                placeholder="50"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Associated Lead</label>
            <select
              value={form.lead_id || ""}
              onChange={set("lead_id")}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">None</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>{l.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Assigned To</label>
            <Input value={form.assigned_to} onChange={set("assigned_to")} placeholder="Rep name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
            <textarea
              value={form.description}
              onChange={set("description")}
              placeholder="Deal notes, scope, context…"
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving ? "Saving…" : initialData ? "Save Changes" : "Create Deal"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lost Reason Dialog ───────────────────────────────────────────────────────

function LostReasonDialog({ open, onConfirm, onDismiss }) {
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) setReason(""); }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <AlertCircle className="h-5 w-5 text-rose-500" />
          <h2 className="text-base font-bold text-slate-900">Mark as Lost</h2>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-slate-500">Optionally add a reason this deal was lost.</p>
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Budget constraints, chose competitor…"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <Button variant="outline" onClick={onDismiss}>Cancel</Button>
          <Button className="bg-rose-500 hover:bg-rose-600 text-white" onClick={() => onConfirm(reason)}>
            Mark Lost
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ deal, stage, leadName, onDragStart, onEdit }) {
  const prob = deal.probability ?? stage.probability;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, deal)}
      onClick={() => onEdit(deal)}
      className={cn(
        "group relative cursor-grab active:cursor-grabbing rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm",
        "hover:shadow-md hover:border-slate-300 transition-all select-none active:opacity-60 active:scale-95",
        "min-w-[240px]"
      )}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-slate-900 leading-snug pr-8 truncate">{deal.title}</p>

      {/* Lead name */}
      {leadName && (
        <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1 truncate">
          <UserRound className="h-3 w-3 shrink-0" />
          {leadName}
        </p>
      )}

      {/* Value */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-base font-bold text-slate-800">{fmt(deal.value)}</span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", stage.pillBg)}>
          {prob}%
        </span>
      </div>

      {/* Meta row */}
      <div className="mt-2 space-y-1 text-xs text-slate-400">
        {deal.close_date && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3" />
            {deal.close_date}
          </div>
        )}
        {deal.assigned_to && (
          <div className="flex items-center gap-1.5 truncate">
            <UserRound className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.assigned_to}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stage Column ─────────────────────────────────────────────────────────────

function StageColumn({ stage, deals, leadMap, draggingOver, onDragStart, onDragOver, onDrop, onEdit }) {
  const isOver = draggingOver === stage.key;
  const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      {/* Dark header */}
      <div className={cn("rounded-xl px-3 py-2.5 mb-2", stage.headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", stage.color)} />
            <span className="text-xs font-bold uppercase tracking-wider text-white">{stage.label}</span>
          </div>
          <span className="text-xs font-bold text-white/70 bg-white/10 rounded-full px-2 py-0.5">
            {deals.length}
          </span>
        </div>
        <p className={cn("mt-1 text-sm font-bold", stage.accentText)}>{fmtCompact(totalValue)}</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, stage)}
        className={cn(
          "flex-1 rounded-xl border-2 border-dashed p-2 space-y-2 min-h-[120px] overflow-y-auto max-h-[calc(100vh-280px)] transition-all duration-150",
          isOver
            ? cn("border-amber-400", stage.dropBg)
            : "border-transparent"
        )}
      >
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            stage={stage}
            leadName={leadMap[deal.lead_id]}
            onDragStart={onDragStart}
            onEdit={onEdit}
          />
        ))}
        {deals.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-16 text-[10px] text-slate-300 font-medium uppercase tracking-wider">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PipelineView() {
  const [deals, setDeals] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [draggingOver, setDraggingOver] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editDeal, setEditDeal] = useState(null);
  const [lostDialog, setLostDialog] = useState(null); // { deal, targetStage }
  const dragDealRef = useRef(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadDeals = useCallback(async () => {
    try {
      const data = await base44.entities.Deal.list("-created_at", 500);
      setDeals(data || []);
    } catch (err) {
      console.error("Failed to load deals:", err?.message);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await base44.entities.Lead.list("-created_at", 500);
      setLeads(data || []);
    } catch (err) {
      console.error("Failed to load leads:", err?.message);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadDeals(), loadLeads()]).finally(() => setLoading(false));
    const unsub = base44.entities.Deal.subscribe(() => loadDeals());
    return unsub;
  }, [loadDeals, loadLeads]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const leadMap = useMemo(
    () => Object.fromEntries(leads.map((l) => [l.id, l.full_name])),
    [leads]
  );

  const assignees = useMemo(() => {
    const set = new Set(deals.map((d) => d.assigned_to).filter(Boolean));
    return [...set].sort();
  }, [deals]);

  const filteredDeals = useMemo(() => {
    const q = search.toLowerCase();
    return deals.filter((d) => {
      const matchSearch =
        !q ||
        (d.title || "").toLowerCase().includes(q) ||
        (leadMap[d.lead_id] || "").toLowerCase().includes(q);
      const matchAssigned = !filterAssigned || d.assigned_to === filterAssigned;
      return matchSearch && matchAssigned;
    });
  }, [deals, search, filterAssigned, leadMap]);

  const stageDeals = useMemo(() =>
    Object.fromEntries(
      STAGES.map((s) => [s.key, filteredDeals.filter((d) => d.stage === s.key)])
    ),
    [filteredDeals]
  );

  // Summary bar numbers (use all deals, not filtered, for pipeline total)
  const allActiveDeals = useMemo(() => deals.filter((d) => d.stage !== "Closed Lost"), [deals]);
  const pipelineValue = useMemo(() => allActiveDeals.reduce((s, d) => s + (Number(d.value) || 0), 0), [allActiveDeals]);
  const expectedValue = useMemo(() =>
    allActiveDeals.reduce((s, d) => {
      const prob = d.probability ?? STAGE_MAP[d.stage]?.probability ?? 0;
      return s + (Number(d.value) || 0) * (prob / 100);
    }, 0),
    [allActiveDeals]
  );
  const avgDealSize = allActiveDeals.length > 0 ? pipelineValue / allActiveDeals.length : 0;

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = (e, deal) => {
    dragDealRef.current = deal;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", deal.id);
  };

  const handleDragOver = (e, stageKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDraggingOver(stageKey);
  };

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    setDraggingOver(null);
    const deal = dragDealRef.current;
    dragDealRef.current = null;
    if (!deal) return;
    if (deal.stage === targetStage.key) return;

    if (targetStage.key === "Closed Lost") {
      // Prompt for lost reason before committing
      setLostDialog({ deal, targetStage });
      return;
    }

    await moveDeal(deal, targetStage, {});
  };

  const handleDragEnd = () => {
    setDraggingOver(null);
    dragDealRef.current = null;
  };

  const moveDeal = async (deal, targetStage, extra) => {
    const updates = {
      stage: targetStage.key,
      probability: targetStage.probability,
      ...extra,
    };
    if (targetStage.key === "Closed Won") {
      updates.won_at = new Date().toISOString();
    }

    // Optimistic update
    setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, ...updates } : d));

    try {
      await base44.entities.Deal.update(deal.id, updates);
    } catch {
      // Revert
      setDeals((prev) => prev.map((d) => d.id === deal.id ? deal : d));
    }
  };

  const handleLostConfirm = async (reason) => {
    if (!lostDialog) return;
    const { deal, targetStage } = lostDialog;
    setLostDialog(null);
    await moveDeal(deal, targetStage, {
      lost_reason: reason || "",
      lost_at: new Date().toISOString(),
    });
  };

  // ── Edit handler ──────────────────────────────────────────────────────────

  const handleEdit = (deal) => {
    setEditDeal(deal);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditDeal(null);
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-6 pb-6 lg:px-8 lg:pb-8">

      {/* Summary bar */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Pipeline Value",  value: fmtCompact(pipelineValue), icon: DollarSign,  iconColor: "text-amber-500" },
          { label: "Active Deals",    value: allActiveDeals.length,     icon: Briefcase,   iconColor: "text-blue-500" },
          { label: "Expected Value",  value: fmtCompact(expectedValue), icon: TrendingUp,  iconColor: "text-emerald-500" },
          { label: "Avg Deal Size",   value: fmtCompact(avgDealSize),   icon: Users,       iconColor: "text-purple-500" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
            <div className={cn("p-2 rounded-xl bg-slate-50", stat.iconColor)}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="mt-0.5 text-xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter / toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-3 flex-wrap">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals or contacts…"
              className="pl-9"
            />
          </div>
          <div className="relative">
            <select
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value)}
              className="w-44 appearance-none rounded-md border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">All Reps</option>
              {assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
        <Button
          onClick={() => { setEditDeal(null); setFormOpen(true); }}
          className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Deal
        </Button>
      </div>

      {/* Kanban board */}
      <div
        className="flex gap-3 overflow-x-auto pb-4"
        onDragLeave={() => setDraggingOver(null)}
        onDragEnd={handleDragEnd}
      >
        {STAGES.map((stage) => (
          <StageColumn
            key={stage.key}
            stage={stage}
            deals={stageDeals[stage.key] || []}
            leadMap={leadMap}
            draggingOver={draggingOver}
            onDragStart={handleDragStart}
            onDragOver={(e) => handleDragOver(e, stage.key)}
            onDrop={handleDrop}
            onEdit={handleEdit}
          />
        ))}
      </div>

      {/* Dialogs */}
      <DealFormDialog
        open={formOpen}
        onClose={handleFormClose}
        onSaved={loadDeals}
        initialData={editDeal}
        leads={leads}
      />

      <LostReasonDialog
        open={!!lostDialog}
        onConfirm={handleLostConfirm}
        onDismiss={() => setLostDialog(null)}
      />
    </div>
  );
}
