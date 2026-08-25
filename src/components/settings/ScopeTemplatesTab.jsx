import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, FileText, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { extractTemplateTokens } from "@/lib/scopeTemplateEngine";

// Same taxonomy LeadFormDialog.jsx / PublicLeadCaptureForm.jsx use for
// lead.project_type — kept in sync by hand since neither is a DB enum.
export const PROJECT_TYPES = [
  "Pergola", "Covered Patio", "Cabana", "Outdoor Kitchen", "Pool", "Remodel", "Addition", "Backyard Revamp", "Other",
];

const MERGE_FORMATS = [
  { value: "dimensions", label: "Dimensions (L' x W')" },
  { value: "quantity",   label: "Quantity + Unit" },
  { value: "cost",       label: "Line Total ($)" },
  { value: "count",      label: "Quantity (number only)" },
  { value: "raw",        label: "Description (raw text)" },
];

function blankMergeField() {
  return { id: Math.random().toString(36).slice(2, 10), key: "", cost_code_id: "", format: "raw" };
}

const EMPTY_TEMPLATE = {
  name: "",
  company_id: "",
  project_type: PROJECT_TYPES[0],
  body: "",
  merge_fields: [],
  is_active: true,
};

const BODY_HELP = `Write the scope like normal text. Two special tokens:

  {{tag_key}}                          — filled in from a merge field below
  {{#if COST_CODE}}shown{{else}}not{{/if}}   — shown only if a line item with
                                          that cost code is on the estimate

Example:
  Pool Dimensions: {{pool_size}}
  {{#if POOL-RAISEDBEAM}}Includes raised beam water feature wall.{{else}}Raised Beam Water Feature Removal would save $8,000.{{/if}}`;

export default function ScopeTemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [costCodes, setCostCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [filterCompany, setFilterCompany] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [t, c, cc] = await Promise.all([
      base44.entities.ScopeTemplate.list("sort_order").catch(() => []),
      base44.entities.CompanyProfile.list("name").catch(() => []),
      base44.entities.CostCode.list("sort_order").catch(() => []),
    ]);
    setTemplates(t || []);
    setCompanies(c || []);
    setCostCodes(cc || []);
    setLoading(false);
  };

  const companyName = (id) => companies.find((c) => c.id === id)?.name || "Unassigned";

  const visibleTemplates = useMemo(
    () => (filterCompany ? templates.filter((t) => t.company_id === filterCompany) : templates),
    [templates, filterCompany]
  );

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_TEMPLATE, company_id: filterCompany || companies[0]?.id || "" });
    setDialogOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      ...EMPTY_TEMPLATE,
      ...t,
      company_id: t.company_id || "",
      merge_fields: Array.isArray(t.merge_fields) && t.merge_fields.length ? t.merge_fields : [],
    });
    setDialogOpen(true);
  };

  const openDuplicate = (t) => {
    setEditing(null);
    setForm({
      ...EMPTY_TEMPLATE,
      ...t,
      id: undefined,
      name: `${t.name} (Copy)`,
      merge_fields: (t.merge_fields || []).map((f) => ({ ...f, id: Math.random().toString(36).slice(2, 10) })),
    });
    setDialogOpen(true);
  };

  const ff = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const updateMergeField = (id, patch) =>
    setForm((f) => ({ ...f, merge_fields: f.merge_fields.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const addMergeField = () => setForm((f) => ({ ...f, merge_fields: [...f.merge_fields, blankMergeField()] }));
  const removeMergeField = (id) => setForm((f) => ({ ...f, merge_fields: f.merge_fields.filter((m) => m.id !== id) }));

  const { tags: foundTags, codes: foundCodes } = useMemo(() => extractTemplateTokens(form.body), [form.body]);
  const mappedKeys = useMemo(() => new Set((form.merge_fields || []).map((m) => m.key)), [form.merge_fields]);
  const unmappedTags = foundTags.filter((t) => !mappedKeys.has(t));
  const knownCodes = useMemo(() => new Set(costCodes.map((c) => c.code)), [costCodes]);
  const unknownCodes = foundCodes.filter((c) => !knownCodes.has(c));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      company_id: form.company_id || null,
      project_type: form.project_type || "Other",
      body: form.body || "",
      merge_fields: (form.merge_fields || [])
        .filter((m) => (m.key || "").trim())
        .map((m) => ({ key: m.key.trim(), cost_code_id: m.cost_code_id || null, format: m.format || "raw" })),
      is_active: form.is_active !== false,
    };
    if (editing) {
      await base44.entities.ScopeTemplate.update(editing.id, payload);
    } else {
      await base44.entities.ScopeTemplate.create(payload);
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this scope template?")) {
      await base44.entities.ScopeTemplate.delete(id);
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Scope Templates</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Per company + project type. On an estimate, "Generate Scope" fills the Notes/Scope field from the
            matching template and the estimate's current line items — after that it's just editable text.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white"
          >
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-1">
            <Plus className="w-4 h-4" /> Add Template
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleTemplates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          No scope templates yet. Add one to auto-fill the scope on matching estimates.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleTemplates.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                      {t.project_type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {companyName(t.company_id)} · {(t.merge_fields || []).length} merge field{(t.merge_fields || []).length !== 1 ? "s" : ""}
                  </p>
                  {t.body && <p className="mt-2 text-xs text-slate-500 line-clamp-3 whitespace-pre-line">{t.body}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDuplicate(t)} title="Duplicate">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Edit">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(t.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Scope Template" : "Add Scope Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={(e) => ff("name", e.target.value)} required className="mt-1 h-9 text-sm" placeholder="e.g. Raised Spa Pool Package" />
              </div>
              <div>
                <Label className="text-xs">Company</Label>
                <select value={form.company_id || ""} onChange={(e) => ff("company_id", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                  <option value="">— Any —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Project Type</Label>
                <select value={form.project_type} onChange={(e) => ff("project_type", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                  {PROJECT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Scope Body</Label>
              </div>
              <Textarea
                value={form.body}
                onChange={(e) => ff("body", e.target.value)}
                className="text-sm font-mono"
                rows={14}
                placeholder={BODY_HELP}
              />
              {(unmappedTags.length > 0 || unknownCodes.length > 0) && (
                <div className="mt-1.5 space-y-0.5">
                  {unmappedTags.length > 0 && (
                    <p className="text-[11px] text-amber-600">
                      Not mapped to a merge field yet: {unmappedTags.map((t) => `{{${t}}}`).join(", ")}
                    </p>
                  )}
                  {unknownCodes.length > 0 && (
                    <p className="text-[11px] text-amber-600">
                      No cost code found with code: {unknownCodes.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Merge Fields</Label>
                <button type="button" onClick={addMergeField} className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
                  <Plus className="w-3.5 h-3.5" /> Add merge field
                </button>
              </div>
              <div className="space-y-2">
                {form.merge_fields.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2">
                    <input
                      type="text"
                      value={m.key}
                      onChange={(e) => updateMergeField(m.id, { key: e.target.value.replace(/\s+/g, "_") })}
                      placeholder="tag_key"
                      className="h-8 text-xs font-mono border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 w-32 flex-shrink-0"
                    />
                    <select
                      value={m.cost_code_id || ""}
                      onChange={(e) => updateMergeField(m.id, { cost_code_id: e.target.value })}
                      className="h-8 text-xs border border-slate-200 rounded-md px-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white flex-1 min-w-0"
                    >
                      <option value="">— Pick a cost code —</option>
                      {costCodes.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} · {cc.name}</option>)}
                    </select>
                    <select
                      value={m.format}
                      onChange={(e) => updateMergeField(m.id, { format: e.target.value })}
                      className="h-8 text-xs border border-slate-200 rounded-md px-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white w-44 flex-shrink-0"
                    >
                      {MERGE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeMergeField(m.id)} className="p-1 text-slate-300 hover:text-rose-500 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {form.merge_fields.length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center py-3">No merge fields yet — add one to bind a {"{{tag}}"} to a cost code.</p>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                A merge field fills in from the first line item on the estimate whose cost code matches. "Dimensions" needs Length/Width set on that line item.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">{editing ? "Update" : "Add"} Template</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
