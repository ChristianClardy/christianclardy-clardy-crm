import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Plus, Search, FileText, Send, CheckCircle, XCircle, Clock, RefreshCw, Copy, Trash2, User, Lock, GitBranch, UploadCloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCompanyScope, scopeFilter, getSelectedCompanyScope } from "@/lib/companyScope";
import { parseMasterEstimateWorkbook } from "@/lib/masterEstimateImport";
import { PROJECT_TYPES } from "@/components/settings/ScopeTemplatesTab";

const STATUS_STYLES = {
  draft:    { label: "Draft",    className: "bg-slate-100 text-slate-600",   icon: Clock },
  sent:     { label: "Sent",     className: "bg-blue-100 text-blue-700",     icon: Send },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-700",    icon: XCircle },
  revised:  { label: "Revised",  className: "bg-amber-100 text-amber-700",  icon: RefreshCw },
};

export default function Estimates() {
  const navigate = useNavigate();
  const companyScope = useCompanyScope();
  const [estimates, setEstimates] = useState([]);
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");

  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importReview, setImportReview] = useState(null); // { parsed, clientOptionId, companyId }
  const [creatingImport, setCreatingImport] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    loadData();
    base44.entities.CompanyProfile.list("name").then(setCompanies).catch(() => {});
  }, []);

  const loadData = async () => {
    try {
      const [estData, clientData, leadData] = await Promise.all([
        base44.entities.Estimate.list("-created_date"),
        base44.entities.Client.list(),
        base44.entities.Lead.list(),
      ]);
      const estimates = Array.isArray(estData) ? estData : [];

      // Retroactively assign numbers to estimates that don't have one.
      // Sort unnumbered ones oldest-first so numbers are assigned chronologically.
      const maxExisting = estimates.reduce((max, e) => {
        const m = (e.estimate_number || "").match(/(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
      const unnumbered = estimates
        .filter(e => !e.estimate_number)
        .sort((a, b) => new Date(a.created_date || a.created_at || 0) - new Date(b.created_date || b.created_at || 0));
      if (unnumbered.length) {
        let counter = maxExisting;
        await Promise.all(unnumbered.map(e => {
          counter++;
          const num = `EST-${String(counter).padStart(3, "0")}`;
          e.estimate_number = num; // update local copy immediately
          return base44.entities.Estimate.update(e.id, { estimate_number: num }).catch(() => {});
        }));
      }

      setEstimates(estimates);
      const leadsAsClients = (leadData || []).map(l => ({
        id:   l.id,
        name: l.full_name || l.name || l.email || "Unnamed Lead",
      }));
      setClients([...(clientData || []), ...leadsAsClients]);
    } catch (err) {
      console.error("Estimates loadData error:", err);
      setLoadError(err?.message || "Failed to load estimates.");
    } finally {
      setLoading(false);
    }
  };

  const clientMap = clients.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});

  const handleDuplicate = async (e, est) => {
    e.stopPropagation();
    const { id, created_at, updated_at, created_date, updated_date, estimate_number, client_name, ...rest } = est;
    const copy = await base44.entities.Estimate.create({
      ...rest,
      title: `${est.title || "Estimate"} (Copy)`,
      status: "draft",
    });
    navigate(createPageUrl(`EstimateDetail?id=${copy.id}`));
  };

  const handleDelete = async (e, est) => {
    e.stopPropagation();
    if (!confirm(`Delete "${est.title || "this estimate"}"? This cannot be undone.`)) return;
    await base44.entities.Estimate.delete(est.id);
    setEstimates(prev => prev.filter(e => e.id !== est.id));
  };

  // ── Drag-and-drop workbook import ─────────────────────────────────────────
  // Deterministic parser for Christian's own fixed "Estimate MASTER.xlsx"
  // template (src/lib/masterEstimateImport.js) — not a general file reader.

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    dragCounter.current += 1;
    setDragActive(true);
  };
  const handleDragOver = (e) => e.preventDefault();
  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragActive(false); }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await handleImportFile(file);
  };

  const handleImportFile = async (file) => {
    setImportError("");
    setImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseMasterEstimateWorkbook(arrayBuffer);
      if (!parsed.header.clientName) {
        throw new Error("No client name found (cell C6) — this looks like a blank template, not a completed estimate.");
      }
      if (parsed.lineItems.length === 0) {
        throw new Error("No line items with both Qty and Unit Cost filled in were found.");
      }

      const freshClients = await base44.entities.Client.list().catch(() => []);
      const nameLower = parsed.header.clientName.trim().toLowerCase();
      const matched = freshClients.find((c) => (c.name || "").trim().toLowerCase() === nameLower);

      const scope = getSelectedCompanyScope();
      setClients(freshClients);
      setImportReview({
        parsed,
        clientOptionId: matched ? matched.id : "__new__",
        matchedClientName: matched?.name || null,
        companyId: scope !== "all" ? scope : (companies[0]?.id || ""),
      });
    } catch (err) {
      setImportError(err.message || "Could not read this file.");
    } finally {
      setImporting(false);
    }
  };

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await handleImportFile(file);
  };

  const handleConfirmImport = async () => {
    if (!importReview) return;
    setCreatingImport(true);
    try {
      const { parsed, clientOptionId, companyId } = importReview;
      let clientId = clientOptionId;
      if (clientOptionId === "__new__") {
        const created = await base44.entities.Client.create({
          name: parsed.header.clientName,
          phone: parsed.header.phone || null,
          address: parsed.header.propertyAddress || null,
        });
        clientId = created.id;
      }

      const projectTypeMatch = PROJECT_TYPES.find(
        (p) => p.toLowerCase() === (parsed.header.projectType || "").trim().toLowerCase()
      );
      const marginPercent = parsed.marginPercent != null ? parsed.marginPercent : 40;
      const lineItems = parsed.lineItems.map((li) => ({
        id: Math.random().toString(36).slice(2, 10),
        trade: li.trade,
        sectionType: "trade",
        description: li.description,
        notes: "",
        unit: li.unit || "",
        quantity: li.quantity,
        cost_per_unit: li.cost_per_unit,
        cost_code_id: null,
        cost_code_label: "",
        material_cost_per_unit: "",
        labor_cost_per_unit: "",
        subcontract_cost_per_unit: "",
        length_ft: "",
        width_ft: "",
      }));
      const totalCost = lineItems.reduce((sum, li) => sum + li.quantity * li.cost_per_unit, 0);
      const rawTotal = parsed.totalSellPrice != null ? parsed.totalSellPrice : totalCost / (1 - marginPercent / 100);
      const total = Math.round(rawTotal * 100) / 100;

      const created = await base44.entities.Estimate.create({
        title: `${parsed.header.clientName} — Pool Estimate`,
        client_id: clientId,
        project_id: null,
        company_id: companyId || null,
        project_type: projectTypeMatch || "Pool",
        issue_date: parsed.header.estimateDate || null,
        notes: parsed.header.propertyAddress ? `Property: ${parsed.header.propertyAddress}` : "",
        status: "draft",
        line_items: lineItems,
        section_margins: {},
        total,
        margin_percent: marginPercent,
        margin_override: marginPercent, // drives the editable margin slider on load
      });

      setImportReview(null);
      navigate(createPageUrl(`EstimateDetail?id=${created.id}`));
    } catch (err) {
      setImportError(err.message || "Could not create the estimate.");
      setCreatingImport(false);
      return;
    }
    setCreatingImport(false);
  };

  const scopedEstimates = scopeFilter(estimates, companyScope);

  const filtered = scopedEstimates.filter(e =>
    e.title?.toLowerCase().includes(search.toLowerCase()) ||
    clientMap[e.client_id]?.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.estimate_number?.toLowerCase().includes(search.toLowerCase())
  );

  // Separate amendments from root estimates
  const rootEstimates = filtered.filter(e => !e.amendment_of);
  const amendmentMap = filtered
    .filter(e => e.amendment_of)
    .reduce((acc, e) => {
      (acc[e.amendment_of] = acc[e.amendment_of] || []).push(e);
      return acc;
    }, {});

  // Group root estimates by client, unassigned last
  const groups = [];
  const seen = new Set();
  for (const est of rootEstimates) {
    const key = est.client_id || "__none__";
    if (!seen.has(key)) { seen.add(key); groups.push(key); }
  }
  const grouped = groups.map(key => ({
    clientId: key === "__none__" ? null : key,
    clientName: key === "__none__" ? "Unassigned" : (clientMap[key]?.name || "Unknown"),
    estimates: rootEstimates.filter(e => (e.client_id || "__none__") === key),
  }));

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (loadError) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-center p-8">
      <FileText className="w-10 h-10 text-slate-300" />
      <p className="text-slate-600 font-medium">Could not load estimates</p>
      <p className="text-sm text-slate-400">{loadError}</p>
      <Button onClick={loadData} variant="outline" className="mt-2">Retry</Button>
    </div>
  );

  return (
    <div
      className="relative p-6 lg:p-8 max-w-6xl mx-auto space-y-6"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-amber-500/10 backdrop-blur-[1px] pointer-events-none">
          <div className="rounded-2xl border-2 border-dashed border-amber-500 bg-white px-10 py-8 text-center shadow-xl">
            <UploadCloud className="w-10 h-10 text-amber-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-900">Drop the completed estimate workbook</p>
            <p className="text-sm text-slate-500 mt-1">Principle Outdoor Living Estimate MASTER.xlsx format</p>
          </div>
        </div>
      )}
      {importing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60">
          <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 shadow-lg px-5 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            <span className="text-sm font-medium text-slate-700">Reading workbook…</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Estimates</h1>
          <p className="text-slate-500 mt-1">{scopedEstimates.length} total estimates · drag a completed estimate workbook anywhere on this page to import it</p>
        </div>
        <div className="flex items-center gap-2">
          <input id="estimate-import-input" type="file" accept=".xlsx" className="hidden" onChange={handleFilePick} />
          <Button variant="outline" onClick={() => document.getElementById("estimate-import-input")?.click()} className="gap-1.5">
            <UploadCloud className="w-4 h-4" /> Import Workbook
          </Button>
          <Button
            onClick={() => navigate(createPageUrl("EstimateDetail?new=true"))}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Estimate
          </Button>
        </div>
      </div>

      {importError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center justify-between gap-3">
          <span>{importError}</span>
          <button onClick={() => setImportError("")} className="text-rose-400 hover:text-rose-600"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search estimates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-white border-slate-200 rounded-xl h-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="font-semibold text-slate-900 mb-1">No estimates yet</h3>
          <p className="text-slate-500 text-sm mb-6">Create your first estimate to send to a client.</p>
          <Button onClick={() => navigate(createPageUrl("EstimateDetail?new=true"))} className="bg-gradient-to-r from-amber-500 to-orange-500">
            <Plus className="w-4 h-4 mr-2" /> New Estimate
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ clientId, clientName, estimates: groupEsts }) => (
            <div key={clientId ?? "__none__"} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {/* Client header */}
              <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200">
                <User className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-slate-800">{clientName}</span>
                <span className="ml-1 text-xs text-slate-400 font-normal">({groupEsts.length})</span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-2.5 text-left">Estimate #</th>
                    <th className="px-5 py-2.5 text-left">Title</th>
                    <th className="px-5 py-2.5 text-left">Issue Date</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                    <th className="px-5 py-2.5 text-center">Status</th>
                    <th className="px-5 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupEsts.flatMap(est => {
                    const st = STATUS_STYLES[est.status] || STATUS_STYLES.draft;
                    const Icon = st.icon;
                    const amds = (amendmentMap[est.id] || []).sort((a, b) => (a.amendment_number || 0) - (b.amendment_number || 0));
                    const rows = [
                      <tr
                        key={est.id}
                        className="border-b border-slate-100 hover:bg-amber-50/40 cursor-pointer transition-colors"
                        onClick={() => navigate(createPageUrl(`EstimateDetail?id=${est.id}`))}
                      >
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{est.estimate_number || "—"}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            {est.is_locked && <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" title="Signed & Locked" />}
                            {est.title}
                            {amds.length > 0 && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{amds.length} amd</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{est.issue_date || "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">
                          ${Number(est.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full", st.className)}>
                            <Icon className="w-3 h-3" /> {st.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(e) => handleDuplicate(e, est)} title="Duplicate" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => handleDelete(e, est)} title="Delete" className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>,
                      ...amds.map(amd => {
                        const ast = STATUS_STYLES[amd.status] || STATUS_STYLES.draft;
                        const AIcon = ast.icon;
                        return (
                          <tr
                            key={amd.id}
                            className="border-b border-slate-100 hover:bg-amber-50/40 cursor-pointer transition-colors bg-amber-50/20"
                            onClick={() => navigate(createPageUrl(`EstimateDetail?id=${amd.id}`))}
                          >
                            <td className="pl-10 pr-5 py-2.5 font-mono text-xs text-amber-600">
                              <div className="flex items-center gap-1.5">
                                <GitBranch className="w-3 h-3 text-amber-400" />
                                {amd.estimate_number || `AMD-${amd.amendment_number}`}
                              </div>
                            </td>
                            <td className="px-5 py-2.5 text-sm text-slate-700">
                              <div className="flex items-center gap-2">
                                {amd.is_locked && <Lock className="w-3 h-3 text-emerald-600 shrink-0" />}
                                <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded mr-1">AMD #{amd.amendment_number}</span>
                                {amd.title}
                              </div>
                            </td>
                            <td className="px-5 py-2.5 text-xs text-slate-400">{amd.issue_date || "—"}</td>
                            <td className="px-5 py-2.5 text-right text-sm font-semibold text-slate-700">
                              ${Number(amd.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-5 py-2.5 text-center">
                              <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full", ast.className)}>
                                <AIcon className="w-3 h-3" /> {ast.label}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-center">
                              <button onClick={(e) => handleDelete(e, amd)} title="Delete" className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      }),
                    ];
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!importReview} onOpenChange={(open) => !open && setImportReview(null)}>
        {importReview && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Estimate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-3 space-y-1 text-sm">
                <p><span className="text-slate-400">Property:</span> {importReview.parsed.header.propertyAddress || "—"}</p>
                <p><span className="text-slate-400">Estimator:</span> {importReview.parsed.header.estimator || "—"}</p>
                <p><span className="text-slate-400">Date:</span> {importReview.parsed.header.estimateDate || "—"}</p>
                <p><span className="text-slate-400">Line items:</span> {importReview.parsed.lineItems.length}</p>
                <p><span className="text-slate-400">Total:</span> {(() => {
                  const totalCost = importReview.parsed.lineItems.reduce((s, li) => s + li.quantity * li.cost_per_unit, 0);
                  const marginPercent = importReview.parsed.marginPercent != null ? importReview.parsed.marginPercent : 40;
                  const total = importReview.parsed.totalSellPrice != null ? importReview.parsed.totalSellPrice : totalCost / (1 - marginPercent / 100);
                  return `$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                })()}</p>
              </div>

              <div>
                <Label className="text-xs">Client</Label>
                <select
                  value={importReview.clientOptionId}
                  onChange={(e) => setImportReview((r) => ({ ...r, clientOptionId: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 bg-white"
                >
                  <option value="__new__">
                    + Create new client "{importReview.parsed.header.clientName}"
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.name === importReview.matchedClientName ? " (matched)" : ""}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">Company</Label>
                <select
                  value={importReview.companyId}
                  onChange={(e) => setImportReview((r) => ({ ...r, companyId: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 bg-white"
                >
                  <option value="">— Unassigned —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {importError && <p className="text-xs text-rose-600">{importError}</p>}

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <Button variant="outline" onClick={() => setImportReview(null)}>Cancel</Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={creatingImport}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-2"
                >
                  {creatingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {creatingImport ? "Creating…" : "Create Estimate"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
