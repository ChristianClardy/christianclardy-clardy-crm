import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus, Search, Compass, Pencil, Trash2, Receipt, MapPin,
  Clock, CheckCircle, Send, X, Loader2, ChevronRight,
  TreePine, Waves, UtensilsCrossed, Fence, Sun, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  { key: "pergola",          label: "Pergola",           icon: Sun },
  { key: "patio_cover",     label: "Patio Cover",        icon: Layers },
  { key: "cabana",          label: "Cabana",             icon: Fence },
  { key: "outdoor_kitchen", label: "Outdoor Kitchen",    icon: UtensilsCrossed },
  { key: "pool",            label: "Pool",               icon: Waves },
  { key: "golf_green",      label: "Golf Green",         icon: TreePine },
  { key: "landscaping",     label: "Landscaping",        icon: TreePine },
  { key: "concrete_pavers", label: "Concrete & Pavers",  icon: Layers },
  { key: "other",           label: "Other",              icon: Compass },
];

const STATUSES = [
  { key: "concept",    label: "Concept",     className: "bg-slate-100 text-slate-600" },
  { key: "in_design",  label: "In Design",   className: "bg-blue-100 text-blue-700" },
  { key: "review",    label: "Client Review", className: "bg-amber-100 text-amber-700" },
  { key: "approved",  label: "Approved",    className: "bg-emerald-100 text-emerald-700" },
  { key: "converted", label: "Converted",   className: "bg-violet-100 text-violet-700" },
];

const EMPTY_FORM = {
  title: "",
  client_name: "",
  address: "",
  project_types: [],
  notes: "",
  status: "concept",
  estimate_id: "",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUSES.find(s => s.key === status) || STATUSES[0];
  return (
    <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full", cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ─── Project type chips ───────────────────────────────────────────────────────

function TypeChip({ typeKey, small = false }) {
  const cfg = PROJECT_TYPES.find(t => t.key === typeKey);
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-medium",
      small ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
    )}>
      <Icon className={small ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {cfg.label}
    </span>
  );
}

// ─── New / Edit dialog ────────────────────────────────────────────────────────

function DesignDialog({ open, initial, clients, estimates, onClose, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial]);

  const toggle = (key) =>
    setForm(f => ({
      ...f,
      project_types: f.project_types.includes(key)
        ? f.project_types.filter(k => k !== key)
        : [...f.project_types, key],
    }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        title:         form.title,
        client_name:   form.client_name,
        address:       form.address,
        project_types: form.project_types,
        notes:         form.notes,
        status:        form.status,
        estimate_id:   form.estimate_id || null,
      };
      if (initial?.id) {
        await base44.entities.Design.update(initial.id, payload);
        onSaved(null);
      } else {
        const created = await base44.entities.Design.create(payload);
        onSaved(created?.id || null);
      }
      onClose();
    } catch (err) {
      setSaveError(err?.message || "Failed to save design. Make sure the designs table exists in Supabase.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Compass className="w-4 h-4 text-amber-600" />
            {initial?.id ? "Edit Design" : "New Design"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 mt-1">
          {/* Title */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Design Title *</Label>
            <Input
              required
              autoFocus
              placeholder="e.g. Smith Backyard Pergola + Kitchen"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Client name + address */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Client Name</Label>
              <Input
                placeholder="Client or lead name"
                value={form.client_name}
                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                list="client-suggestions"
              />
              <datalist id="client-suggestions">
                {clients.map(c => <option key={c.id} value={c.name || c.full_name} />)}
              </datalist>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Property Address</Label>
              <Input
                placeholder="123 Main St"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
          </div>

          {/* Project types */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-2 block">Project Types</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPES.map(type => {
                const Icon = type.icon;
                const selected = form.project_types.includes(type.key);
                return (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => toggle(type.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all",
                      selected
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-amber-300"
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Status</Label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: s.key }))}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all",
                    form.status === s.key
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Link to estimate */}
          {estimates.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">
                Linked Estimate <span className="normal-case font-normal text-slate-400">(optional)</span>
              </Label>
              <select
                value={form.estimate_id || ""}
                onChange={e => setForm(f => ({ ...f, estimate_id: e.target.value }))}
                className="w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white"
              >
                <option value="">— Not linked —</option>
                {estimates.map(est => (
                  <option key={est.id} value={est.id}>
                    {est.estimate_number ? `${est.estimate_number} · ` : ""}{est.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Notes</Label>
            <Textarea
              placeholder="Client preferences, site constraints, style notes…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="min-h-20 text-sm"
            />
          </div>

          {saveError && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{saveError}</p>
          )}
          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !form.title.trim()}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white min-w-[100px]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : initial?.id ? "Save Changes" : "Create Design"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Design card ──────────────────────────────────────────────────────────────

function DesignCard({ design, linkedEstimate, onEdit, onDelete, onOpenEstimate, onOpenEditor }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-200 transition-all overflow-hidden group">
      {/* Top accent strip colored by status */}
      <div className={cn(
        "h-1.5",
        design.status === "approved"  ? "bg-emerald-400" :
        design.status === "converted" ? "bg-violet-400"  :
        design.status === "review"    ? "bg-amber-400"   :
        design.status === "in_design" ? "bg-blue-400"    :
        "bg-slate-200"
      )} />

      <div className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 truncate">{design.title}</h3>
            {design.client_name && (
              <p className="text-xs text-slate-500 mt-0.5">{design.client_name}</p>
            )}
          </div>
          <StatusBadge status={design.status} />
        </div>

        {/* Address */}
        {design.address && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{design.address}</span>
          </div>
        )}

        {/* Project types */}
        {design.project_types?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {design.project_types.map(t => <TypeChip key={t} typeKey={t} small />)}
          </div>
        )}

        {/* Notes preview */}
        {design.notes && (
          <p className="text-xs text-slate-400 line-clamp-2">{design.notes}</p>
        )}

        {/* Linked estimate */}
        {linkedEstimate && (
          <button
            onClick={onOpenEstimate}
            className="flex items-center gap-2 w-full text-left bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 hover:bg-violet-100 transition-colors group/est"
          >
            <Receipt className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-violet-700 truncate">
                {linkedEstimate.estimate_number} · {linkedEstimate.title}
              </p>
              <p className="text-[10px] text-violet-400">Linked estimate</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-violet-400 group-hover/est:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Date */}
        <p className="text-[10px] text-slate-300">
          {design.created_at ? new Date(design.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
        </p>
      </div>

      {/* Open Designer — always visible primary action */}
      <div className="px-5 pb-4">
        <button
          onClick={onOpenEditor}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-semibold rounded-xl py-2.5 transition-all shadow-sm hover:shadow-md"
        >
          <Compass className="w-4 h-4" /> Open 2D Designer
        </button>
      </div>

      {/* Secondary actions — edit / delete on hover */}
      <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit Details
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DesignPortal() {
  const navigate = useNavigate();
  const [designs, setDesigns]   = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editing, setEditing]           = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [d, e, c] = await Promise.all([
        base44.entities.Design.list("-created_at").catch(() => []),
        base44.entities.Estimate.list("-created_date").catch(() => []),
        base44.entities.Client.list().catch(() => []),
      ]);
      setDesigns(Array.isArray(d) ? d : []);
      setEstimates(Array.isArray(e) ? e : []);
      setClients(Array.isArray(c) ? c : []);
    } finally {
      setLoading(false);
    }
  };

  const openNew  = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (d) => { setEditing(d);   setDialogOpen(true); };

  const handleSaved = (newId) => {
    loadData();
    if (newId) navigate(createPageUrl(`DesignEditor?id=${newId}`));
  };;

  const handleDelete = async (id) => {
    if (!confirm("Delete this design?")) return;
    await base44.entities.Design.delete(id);
    setDesigns(prev => prev.filter(d => d.id !== id));
  };

  const filtered = designs.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || [d.title, d.client_name, d.address].filter(Boolean).some(v => v.toLowerCase().includes(q));
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Group by status for the pipeline view
  const counts = {};
  STATUSES.forEach(s => { counts[s.key] = designs.filter(d => d.status === s.key).length; });

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Design Portal</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Design Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Plan and present outdoor living designs before building your estimate.</p>
        </div>
        <Button
          onClick={openNew}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-2 shrink-0 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" /> New Design
        </Button>
      </div>

      {/* Pipeline counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(statusFilter === s.key ? "all" : s.key)}
            className={cn(
              "bg-white rounded-2xl border p-4 text-left transition-all hover:shadow-sm",
              statusFilter === s.key ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
            )}
          >
            <p className="text-2xl font-bold text-slate-900">{counts[s.key] || 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search designs, clients, addresses…"
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-full border transition-all",
              statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
            )}
          >
            All
          </button>
          {STATUSES.map(s => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(statusFilter === s.key ? "all" : s.key)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full border transition-all",
                statusFilter === s.key ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto">
            <Compass className="w-7 h-7 text-amber-400" />
          </div>
          <p className="font-semibold text-slate-700">
            {search || statusFilter !== "all" ? "No designs match your filters" : "No designs yet"}
          </p>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            {search || statusFilter !== "all"
              ? "Try clearing your search or filter."
              : "Create your first design to start planning an outdoor living project."}
          </p>
          {!search && statusFilter === "all" && (
            <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white mt-2">
              <Plus className="w-4 h-4 mr-1.5" /> New Design
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(design => {
            const linked = design.estimate_id ? estimates.find(e => e.id === design.estimate_id) : null;
            return (
              <DesignCard
                key={design.id}
                design={design}
                linkedEstimate={linked}
                onEdit={() => openEdit(design)}
                onDelete={() => handleDelete(design.id)}
                onOpenEstimate={() => navigate(createPageUrl(`EstimateDetail?id=${design.estimate_id}`))}
                onOpenEditor={() => navigate(createPageUrl(`DesignEditor?id=${design.id}`))}
              />
            );
          })}
        </div>
      )}

      {/* New / Edit dialog */}
      <DesignDialog
        open={dialogOpen}
        initial={editing}
        clients={clients}
        estimates={estimates}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
