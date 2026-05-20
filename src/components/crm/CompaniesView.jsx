import { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Search, X, Building2, Globe, Phone, Mail, MapPin,
  Briefcase, DollarSign, FileText, Pencil, Trash2, ExternalLink,
  ChevronRight, Users, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Agriculture", "Construction", "Education", "Finance",
  "Government", "Healthcare", "Hospitality", "Legal",
  "Manufacturing", "Non-Profit", "Real Estate", "Retail",
  "Technology", "Transportation", "Other",
];

const COMPANY_SIZES = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+",
];

const EMPTY_FORM = {
  name: "", website: "", phone: "", email: "",
  industry: "", company_size: "", address: "",
  city: "", state: "", annual_revenue: "", notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value) {
  if (!value && value !== 0) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
}

// ─── Company Form Dialog ──────────────────────────────────────────────────────

function CompanyFormDialog({ open, onClose, onSaved, initialData }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              name:           initialData.name || "",
              website:        initialData.website || "",
              phone:          initialData.phone || "",
              email:          initialData.email || "",
              industry:       initialData.industry || "",
              company_size:   initialData.company_size || "",
              address:        initialData.address || "",
              city:           initialData.city || "",
              state:          initialData.state || "",
              annual_revenue: initialData.annual_revenue || "",
              notes:          initialData.notes || "",
            }
          : { ...EMPTY_FORM }
      );
    }
  }, [open, initialData]);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        annual_revenue: form.annual_revenue ? parseFloat(form.annual_revenue) : null,
      };
      if (initialData?.id) {
        await base44.entities.CRMCompany.update(initialData.id, payload);
      } else {
        await base44.entities.CRMCompany.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save company:", err?.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {initialData ? "Edit Company" : "New Company"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Company Name *</label>
            <Input value={form.name} onChange={set("name")} placeholder="Acme Landscaping LLC" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Industry</label>
              <select
                value={form.industry}
                onChange={set("industry")}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Company Size</label>
              <select
                value={form.company_size}
                onChange={set("company_size")}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Select size</option>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
              <Input value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="info@company.com" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Website</label>
            <Input value={form.website} onChange={set("website")} placeholder="https://company.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Street Address</label>
            <Input value={form.address} onChange={set("address")} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">City</label>
              <Input value={form.city} onChange={set("city")} placeholder="Nashville" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">State</label>
              <Input value={form.state} onChange={set("state")} placeholder="TN" maxLength={2} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Annual Revenue ($)</label>
            <Input
              type="number"
              min="0"
              step="1000"
              value={form.annual_revenue}
              onChange={set("annual_revenue")}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Notes</label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              placeholder="Internal notes about this company…"
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving ? "Saving…" : initialData ? "Save Changes" : "Create Company"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({ open, companyName, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-50">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Delete Company</h3>
            <p className="text-sm text-slate-500">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-semibold">{companyName}</span>?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button className="bg-rose-500 hover:bg-rose-600 text-white" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Company Detail Panel ─────────────────────────────────────────────────────

function DetailPanel({ company, leads, deals, onClose, onEdit, onDelete }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(company.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  // Sync when company changes
  useEffect(() => {
    setNotesValue(company.notes || "");
    setEditingNotes(false);
  }, [company.id, company.notes]);

  const companyLeads = useMemo(
    () => leads.filter((l) =>
      (l.company_id && l.company_id === company.id) ||
      (company.name && (l.full_name || "").toLowerCase().includes(company.name.toLowerCase().split(" ")[0]))
    ),
    [leads, company]
  );

  const companyDeals = useMemo(
    () => deals.filter((d) => d.company_id === company.id),
    [deals, company.id]
  );

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await base44.entities.CRMCompany.update(company.id, { notes: notesValue });
      setEditingNotes(false);
    } catch (err) {
      console.error("Failed to save notes:", err?.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const totalDealValue = companyDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div className="fixed right-0 top-0 z-40 h-full w-full sm:w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 shrink-0">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <Building2 className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 text-base truncate">{company.name}</h2>
              {company.industry && (
                <p className="text-xs text-slate-500 truncate">{company.industry}</p>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-slate-100">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-400 font-medium">Deals</p>
            <p className="text-2xl font-bold text-slate-900">{companyDeals.length}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-400 font-medium">Deal Value</p>
            <p className="text-2xl font-bold text-amber-600">{fmt(totalDealValue)}</p>
          </div>
        </div>

        {/* Contact info */}
        <section className="px-5 py-4 border-b border-slate-100 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact Info</h3>
          {company.phone && (
            <a href={`tel:${company.phone}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-amber-600 transition-colors">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {company.phone}
            </a>
          )}
          {company.email && (
            <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-amber-600 transition-colors truncate">
              <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{company.email}</span>
            </a>
          )}
          {company.website && (
            <a
              href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-slate-700 hover:text-amber-600 transition-colors"
            >
              <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{company.website}</span>
              <ExternalLink className="h-3 w-3 text-slate-300 shrink-0" />
            </a>
          )}
          {(company.address || company.city || company.state) && (
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                {[company.address, company.city, company.state].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
          {company.annual_revenue && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <DollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {fmt(company.annual_revenue)} annual revenue
            </div>
          )}
          {company.company_size && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {company.company_size} employees
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Notes</h3>
            {!editingNotes && (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Add notes about this company…"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs"
                >
                  {savingNotes ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingNotes(false); setNotesValue(company.notes || ""); }} className="text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">
              {company.notes || <span className="text-slate-400 italic">No notes yet.</span>}
            </p>
          )}
        </section>

        {/* Associated Leads */}
        <section className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Leads ({companyLeads.length})
          </h3>
          {companyLeads.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No associated leads.</p>
          ) : (
            <div className="space-y-1.5">
              {companyLeads.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{l.full_name}</p>
                    {l.project_type && <p className="text-xs text-slate-500">{l.project_type}</p>}
                  </div>
                  {l.status && (
                    <Badge className="text-[10px] bg-slate-100 text-slate-600">{l.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Associated Deals */}
        <section className="px-5 py-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Deals ({companyDeals.length})
          </h3>
          {companyDeals.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No associated deals.</p>
          ) : (
            <div className="space-y-1.5">
              {companyDeals.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{d.title}</p>
                    <p className="text-xs text-slate-500">{d.stage}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-slate-100 px-5 py-4 flex gap-2">
        <Button
          variant="outline"
          className="flex-1 text-sm"
          onClick={() => onEdit(company)}
        >
          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
        </Button>
        <Button
          variant="outline"
          className="text-rose-500 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
          onClick={() => onDelete(company)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CompaniesView() {
  const [companies, setCompanies] = useState([]);
  const [leads, setLeads] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadCompanies = useCallback(async () => {
    try {
      const data = await base44.entities.CRMCompany.list("-created_at", 500);
      setCompanies(data || []);
    } catch (err) {
      console.error("Failed to load companies:", err?.message);
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

  const loadDeals = useCallback(async () => {
    try {
      const data = await base44.entities.Deal.list("-created_at", 500);
      setDeals(data || []);
    } catch (err) {
      console.error("Failed to load deals:", err?.message);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadCompanies(), loadLeads(), loadDeals()]).finally(() => setLoading(false));
    const unsub = base44.entities.CRMCompany.subscribe(() => loadCompanies());
    return unsub;
  }, [loadCompanies, loadLeads, loadDeals]);

  // ── Deal count per company ────────────────────────────────────────────────

  const dealCountMap = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      if (d.company_id) map[d.company_id] = (map[d.company_id] || 0) + 1;
    });
    return map;
  }, [deals]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.industry || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q)
    );
  }, [companies, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleEdit = (company) => {
    setSelectedCompany(null);
    setEditCompany(company);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditCompany(null);
  };

  const handleDelete = (company) => {
    setDeleteTarget(company);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await base44.entities.CRMCompany.delete(deleteTarget.id);
      if (selectedCompany?.id === deleteTarget.id) setSelectedCompany(null);
      await loadCompanies();
    } catch (err) {
      console.error("Failed to delete company:", err?.message);
    } finally {
      setDeleteTarget(null);
    }
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

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, industry, or city…"
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => { setEditCompany(null); setFormOpen(true); }}
          className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Company
        </Button>
      </div>

      {/* Empty state */}
      {companies.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
            <Building2 className="h-8 w-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No companies yet</h3>
          <p className="mt-1 text-sm text-slate-500">Add your first company to start tracking relationships.</p>
          <Button
            onClick={() => { setEditCompany(null); setFormOpen(true); }}
            className="mt-5 bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        </div>
      )}

      {/* Table */}
      {companies.length > 0 && (
        <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden", selectedCompany && "mr-0 sm:mr-96")}>
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_140px_100px_160px_80px_120px_36px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
            {["Company", "Industry", "Size", "Location", "Deals", "Revenue", ""].map((h) => (
              <span key={h} className="text-xs font-bold uppercase tracking-wider text-slate-400">{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">No companies match your search.</div>
            ) : (
              filtered.map((company) => {
                const isSelected = selectedCompany?.id === company.id;
                return (
                  <div
                    key={company.id}
                    onClick={() => setSelectedCompany(isSelected ? null : company)}
                    className={cn(
                      "group grid grid-cols-1 sm:grid-cols-[1fr_140px_100px_160px_80px_120px_36px] gap-4 items-center px-5 py-3.5 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-amber-50 border-l-2 border-l-amber-400"
                        : "hover:bg-slate-50"
                    )}
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                        <Building2 className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{company.name}</p>
                        {company.email && (
                          <p className="text-xs text-slate-400 truncate">{company.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Industry */}
                    <div className="hidden sm:block">
                      {company.industry ? (
                        <Badge className="bg-slate-100 text-slate-600 text-[11px] font-medium">{company.industry}</Badge>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>

                    {/* Size */}
                    <div className="hidden sm:block text-sm text-slate-600">
                      {company.company_size ? `${company.company_size}` : <span className="text-slate-300">—</span>}
                    </div>

                    {/* Location */}
                    <div className="hidden sm:flex items-center gap-1.5 text-sm text-slate-600 min-w-0">
                      {company.city || company.state ? (
                        <>
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{[company.city, company.state].filter(Boolean).join(", ")}</span>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>

                    {/* Deal count */}
                    <div className="hidden sm:block">
                      <span className={cn(
                        "inline-flex items-center justify-center min-w-[28px] rounded-full px-2 py-0.5 text-xs font-bold",
                        (dealCountMap[company.id] || 0) > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-400"
                      )}>
                        {dealCountMap[company.id] || 0}
                      </span>
                    </div>

                    {/* Revenue */}
                    <div className="hidden sm:block text-sm font-medium text-slate-700">
                      {company.annual_revenue ? fmt(company.annual_revenue) : <span className="text-slate-300">—</span>}
                    </div>

                    {/* Chevron */}
                    <div className="hidden sm:flex justify-end">
                      <ChevronRight className={cn(
                        "h-4 w-4 text-slate-400 transition-transform",
                        isSelected && "rotate-90 text-amber-500"
                      )} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Side panel */}
      {selectedCompany && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-30 bg-black/20 sm:hidden"
            onClick={() => setSelectedCompany(null)}
          />
          <DetailPanel
            company={selectedCompany}
            leads={leads}
            deals={deals}
            onClose={() => setSelectedCompany(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </>
      )}

      {/* Dialogs */}
      <CompanyFormDialog
        open={formOpen}
        onClose={handleFormClose}
        onSaved={loadCompanies}
        initialData={editCompany}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        companyName={deleteTarget?.name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
