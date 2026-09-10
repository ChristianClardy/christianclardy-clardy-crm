import { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, FileSignature, Upload, ExternalLink, FileText, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MERGE_SOURCES, extractContractTokens, renderContractTemplate, SAMPLE_CONTEXT } from "@/lib/contractMergeSources";
import MergeFieldPicker from "@/components/settings/MergeFieldPicker";

function blankMergeField() {
  return { id: Math.random().toString(36).slice(2, 10), anchor: "", source: MERGE_SOURCES[0].value };
}

const MERGE_GROUPS = [...new Set(MERGE_SOURCES.map((s) => s.group || "Other"))];
const KNOWN_SOURCES = new Set(MERGE_SOURCES.map((s) => s.value));

const EMPTY_TEMPLATE = {
  name: "",
  company_id: "",
  body_type: "text",
  body: "",
  field_defaults: {},
  file_url: "",
  file_name: "",
  file_type: "",
  merge_fields: [],
  is_active: true,
};

export default function ContractTemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef(null);
  const bodyRef = useRef(null);
  const cursorPos = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [t, c] = await Promise.all([
      base44.entities.ContractTemplate.list("sort_order").catch(() => []),
      base44.entities.CompanyProfile.list("name").catch(() => []),
    ]);
    setTemplates(t || []);
    setCompanies(c || []);
    setLoading(false);
  };

  const companyName = (id) => companies.find((c) => c.id === id)?.name || "Unassigned";

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_TEMPLATE, company_id: companies[0]?.id || "" });
    setDialogOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      ...EMPTY_TEMPLATE,
      ...t,
      body_type: t.body_type || "file",
      company_id: t.company_id || "",
      body: t.body || "",
      field_defaults: t.field_defaults && typeof t.field_defaults === "object" ? t.field_defaults : {},
      merge_fields: Array.isArray(t.merge_fields) && t.merge_fields.length ? t.merge_fields : [],
    });
    setDialogOpen(true);
  };

  const ff = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const updateMergeField = (id, patch) =>
    setForm((f) => ({ ...f, merge_fields: f.merge_fields.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const addMergeField = () => setForm((f) => ({ ...f, merge_fields: [...f.merge_fields, blankMergeField()] }));
  const removeMergeField = (id) => setForm((f) => ({ ...f, merge_fields: f.merge_fields.filter((m) => m.id !== id) }));

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      ff("file_url", file_url);
      ff("file_name", file.name);
      ff("file_type", file.type || "");
      if (!form.name) ff("name", file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const trackCursor = () => {
    if (bodyRef.current) cursorPos.current = bodyRef.current.selectionStart;
  };

  const insertToken = (token) => {
    setForm((f) => {
      const body = f.body || "";
      const pos = cursorPos.current != null ? cursorPos.current : body.length;
      const nextBody = body.slice(0, pos) + token + body.slice(pos);
      cursorPos.current = pos + token.length;
      return { ...f, body: nextBody };
    });
    // Restore focus + caret after the inserted token on the next tick.
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.focus();
      const pos = cursorPos.current;
      bodyRef.current.setSelectionRange(pos, pos);
    });
  };

  const handleBodyDrop = (e) => {
    e.preventDefault();
    const token = e.dataTransfer.getData("text/plain");
    if (token) insertToken(token);
  };

  const foundTokens = useMemo(() => extractContractTokens(form.body), [form.body]);
  const invalidTokens = foundTokens.filter((t) => !KNOWN_SOURCES.has(t));
  const defaultableTokens = foundTokens.filter((t) => KNOWN_SOURCES.has(t));

  const setFieldDefault = (source, value) =>
    setForm((f) => ({ ...f, field_defaults: { ...f.field_defaults, [source]: value } }));

  const previewText = useMemo(
    () => renderContractTemplate(form.body, SAMPLE_CONTEXT, form.field_defaults),
    [form.body, form.field_defaults]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.body_type === "text" ? !form.body.trim() : !form.file_url) return;
    const payload = {
      name: form.name.trim(),
      company_id: form.company_id || null,
      body_type: form.body_type,
      body: form.body_type === "text" ? form.body : null,
      field_defaults: form.body_type === "text"
        ? Object.fromEntries(
            Object.entries(form.field_defaults || {}).filter(([, v]) => (v || "").trim())
          )
        : {},
      file_url: form.body_type === "file" ? form.file_url : null,
      file_name: form.body_type === "file" ? (form.file_name || null) : null,
      file_type: form.body_type === "file" ? (form.file_type || null) : null,
      merge_fields: form.body_type === "file"
        ? (form.merge_fields || [])
            .filter((m) => (m.anchor || "").trim())
            .map((m) => ({ anchor: m.anchor.trim(), source: m.source }))
        : [],
      is_active: form.is_active !== false,
    };
    if (editing) {
      await base44.entities.ContractTemplate.update(editing.id, payload);
    } else {
      await base44.entities.ContractTemplate.create(payload);
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this contract template?")) {
      await base44.entities.ContractTemplate.delete(id);
      load();
    }
  };

  const canSubmit = form.body_type === "text" ? Boolean(form.body.trim()) : Boolean(form.file_url);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Contract Templates</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Write the contract in-app and search or drag merge fields straight into the text, or upload a Word/PDF
            file with tokens typed in and map them below. See the <span className="font-medium text-slate-600">Merge Fields</span> tab
            for the full list of what each field pulls in.
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-1">
          <Plus className="w-4 h-4" /> Add Contract Template
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          <FileSignature className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          No contract templates yet. Add one to reuse from a deal's Contracts tab.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => {
            const isText = (t.body_type || "file") === "text";
            const tokenCount = isText ? extractContractTokens(t.body).length : (t.merge_fields || []).length;
            return (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
                        isText ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {isText ? "Text" : "File"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {companyName(t.company_id)} · {tokenCount} merge field{tokenCount !== 1 ? "s" : ""}
                    </p>
                    {isText && t.body && (
                      <p className="mt-2 text-xs text-slate-500 line-clamp-3 whitespace-pre-line">{t.body}</p>
                    )}
                    {!isText && t.file_url && (
                      <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">
                        <ExternalLink className="w-3 h-3" /> {t.file_name || "View file"}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(t.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contract Template" : "Add Contract Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={(e) => ff("name", e.target.value)} required className="mt-1 h-9 text-sm" placeholder="e.g. Standard Pool Contract" />
              </div>
              <div>
                <Label className="text-xs">Company</Label>
                <select value={form.company_id || ""} onChange={(e) => ff("company_id", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                  <option value="">— Any —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {!editing && (
              <div className="flex gap-2 border-b border-slate-200 pb-1">
                {[{ key: "text", label: "Text Template", icon: FileText }, { key: "file", label: "Uploaded File", icon: Upload }].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => ff("body_type", key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px transition-colors",
                      form.body_type === key ? "border-amber-500 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-800"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            )}

            {form.body_type === "text" ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Contract Body</Label>
                  {invalidTokens.length > 0 && (
                    <p className="text-[11px] text-amber-600">
                      Not a recognized field: {invalidTokens.map((t) => `{{${t}}}`).join(", ")}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3" style={{ height: 360 }}>
                  <Textarea
                    ref={bodyRef}
                    value={form.body}
                    onChange={(e) => { ff("body", e.target.value); trackCursor(); }}
                    onSelect={trackCursor}
                    onClick={trackCursor}
                    onKeyUp={trackCursor}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleBodyDrop}
                    className="col-span-2 h-full resize-none text-sm font-mono"
                    placeholder="Dear {{client.name}},&#10;&#10;This agreement is for the project at {{project.address}}…&#10;&#10;Signature: **signature**"
                  />
                  <div className="col-span-1 h-full">
                    <MergeFieldPicker onInsert={insertToken} />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Click or drag a field from the panel to insert it at your cursor. Values are filled in automatically when a deal's Contracts tab sends the package.
                </p>

                {defaultableTokens.length > 0 && (
                  <div className="mt-3">
                    <Label className="text-xs">Field Defaults</Label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Optional — pin a fixed value for this template instead of pulling it from the deal/client each time. Leave blank to use live deal data.
                    </p>
                    <div className="space-y-1.5">
                      {defaultableTokens.map((source) => {
                        const meta = MERGE_SOURCES.find((s) => s.value === source);
                        return (
                          <div key={source} className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 w-40 flex-shrink-0 truncate" title={source}>
                              {meta?.label || source}
                            </span>
                            <input
                              type="text"
                              value={form.field_defaults?.[source] || ""}
                              onChange={(e) => setFieldDefault(source, e.target.value)}
                              placeholder="Use deal/client data"
                              className="h-8 text-xs border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 flex-1 min-w-0"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Contract File *</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" id="contract-file-input" />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1.5">
                      <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : form.file_url ? "Replace file" : "Upload file"}
                    </Button>
                    {form.file_url && !uploading && (
                      <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:text-amber-700 truncate">
                        {form.file_name}
                      </a>
                    )}
                  </div>
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
                          value={m.anchor}
                          onChange={(e) => updateMergeField(m.id, { anchor: e.target.value })}
                          placeholder="{{client_name}}"
                          className="h-8 text-xs font-mono border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 w-40 flex-shrink-0"
                        />
                        <select
                          value={m.source}
                          onChange={(e) => updateMergeField(m.id, { source: e.target.value })}
                          className="h-8 text-xs border border-slate-200 rounded-md px-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white flex-1 min-w-0"
                        >
                          {MERGE_GROUPS.map((group) => (
                            <optgroup key={group} label={group}>
                              {MERGE_SOURCES.filter((s) => (s.group || "Other") === group).map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button type="button" onClick={() => removeMergeField(m.id)} className="p-1 text-slate-300 hover:text-rose-500 flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {form.merge_fields.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-3">No merge fields yet — the anchor text must appear literally in the uploaded file.</p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              {form.body_type === "text" && (
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={!form.body.trim()} className="gap-1.5 mr-auto">
                  <Eye className="w-3.5 h-3.5" /> Preview
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={!canSubmit} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">{editing ? "Update" : "Add"} Template</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-400 -mt-2">
            Rendered with sample data — real sends pull from the actual deal/client/project instead.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 whitespace-pre-line">
            {previewText}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
