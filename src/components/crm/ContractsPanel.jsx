import { useState, useEffect } from "react";
import { base44, getCurrentOrgId } from "@/api/base44Client";
import { FileSignature, Paperclip, FileText, Send, Loader2, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import DocuSignEnvelopes from "@/components/docusign/DocuSignEnvelopes";
import { resolveContractMergeValue, renderContractTemplate } from "@/lib/contractMergeSources";
import { generateContractPdf } from "@/lib/generateContractPdf";

// ─── Contracts Panel ────────────────────────────────────────────────────────
// Bundles a Contract Template (merge-field mapped) + selected Documents +
// selected Estimates into one DocuSign envelope. Shared by the Deal detail
// modal's Contracts tab (deal + its lead) and a Lead's own page (lead only,
// no deal yet — sending the initial contract shouldn't require converting to
// a Deal first; api/_lib/dealAutomation.js creates/advances the Deal
// automatically once the envelope comes back signed).
//
// Customer info is resolved via lead.linked_contact_id -> clients — a Lead
// (or a Deal with no lead_id) with no linked contact simply has nothing to
// merge from client.* sources. project.* and estimate.* sources merge from
// the client's most recent project/estimate (estimate.* prefers whichever
// estimate is checked below). selections.* sources merge from that same
// project's Pool Selections record (src/components/projects/PoolSelectionsPanel.jsx),
// if one exists. deal.* sources are blank when there's no deal yet —
// resolveContractMergeValue handles a null deal gracefully.

export default function ContractsPanel({ lead, deal = null }) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [company, setCompany] = useState(null);
  const [project, setProject] = useState(null);
  const [selections, setSelections] = useState(null);
  const [contractTemplates, setContractTemplates] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [estimateVersion, setEstimateVersion] = useState(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [selectedEstimateIds, setSelectedEstimateIds] = useState([]);
  const [signers, setSigners] = useState([{ name: "", email: "" }]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendOk, setSendOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [templates, docs, comps] = await Promise.all([
        base44.entities.ContractTemplate.list("sort_order").catch(() => []),
        base44.entities.Document.list("-created_date").catch(() => []),
        base44.entities.CompanyProfile.list().catch(() => []),
      ]);
      let resolvedClient = null;
      if (lead?.linked_contact_id) {
        const matches = await base44.entities.Client.filter({ id: lead.linked_contact_id }).catch(() => []);
        resolvedClient = matches[0] || null;
      }
      let ests = [];
      let resolvedProject = null;
      if (resolvedClient?.id) {
        [ests, resolvedProject] = await Promise.all([
          base44.entities.Estimate.filter({ client_id: resolvedClient.id }, "-created_date").catch(() => []),
          base44.entities.Project.filter({ client_id: resolvedClient.id }, "-created_date").then((rows) => rows?.[0] || null).catch(() => null),
        ]);
      }
      const resolvedSelections = resolvedProject?.id
        ? await base44.entities.PoolSelection.filter({ project_id: resolvedProject.id }).then((rows) => rows?.[0] || null).catch(() => null)
        : null;
      if (cancelled) return;
      const resolvedCompany = (lead?.company_id && comps.find((c) => c.id === lead.company_id)) || comps[0] || null;
      setClient(resolvedClient);
      setCompany(resolvedCompany);
      setProject(resolvedProject);
      setSelections(resolvedSelections);
      setContractTemplates((templates || []).filter((t) => t.is_active !== false));
      setDocuments(docs || []);
      setEstimates(ests || []);
      setSigners(resolvedClient?.email ? [{ name: resolvedClient.name || "", email: resolvedClient.email }] : [{ name: "", email: "" }]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [deal?.id, lead?.id]);

  // Merge fields for estimate.* sources use whichever estimate is checked in
  // the picker below, falling back to the client's most recent estimate.
  const mergeEstimate = estimates.find((e) => selectedEstimateIds.includes(e.id)) || estimates[0] || null;

  useEffect(() => {
    let cancelled = false;
    if (!mergeEstimate?.id) { setEstimateVersion(null); return; }
    (async () => {
      const versions = await base44.entities.EstimateVersion
        .filter({ linked_estimate_id: mergeEstimate.id, active_version: true }, "-created_date")
        .catch(() => []);
      if (!cancelled) setEstimateVersion(versions?.[0] || null);
    })();
    return () => { cancelled = true; };
  }, [mergeEstimate?.id]);

  const selectedTemplate = contractTemplates.find((t) => t.id === selectedTemplateId) || null;
  const isTextTemplate = selectedTemplate?.body_type === "text";
  const mergeCtx = { deal: deal || null, client, company, project, estimate: mergeEstimate, estimateVersion, selections };
  const resolvedMergeFields = (selectedTemplate?.merge_fields || []).map((mf) => ({
    ...mf,
    value: resolveContractMergeValue(mf.source, mergeCtx),
  }));
  const resolvedBody = isTextTemplate ? renderContractTemplate(selectedTemplate.body, mergeCtx, selectedTemplate.field_defaults) : "";

  const toggleDoc = (id) => setSelectedDocIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleEstimate = (id) => setSelectedEstimateIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const updateSigner = (i, patch) => setSigners((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const addSigner = () => setSigners((prev) => [...prev, { name: "", email: "" }]);
  const removeSigner = (i) => setSigners((prev) => prev.filter((_, idx) => idx !== i));

  // Renders the same PDF handleSend would upload, but only opens it locally —
  // no upload, no DocuSign call — so it's free to check before signers are
  // even filled in.
  const handlePreviewPdf = () => {
    const pdfFile = generateContractPdf(resolvedBody, { title: selectedTemplate.name });
    const url = URL.createObjectURL(pdfFile);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleSend = async () => {
    setSending(true);
    setSendError("");
    setSendOk(false);
    try {
      const docs = [];
      if (isTextTemplate) {
        const pdfFile = generateContractPdf(resolvedBody, { title: selectedTemplate.name });
        const { file_url } = await base44.integrations.Core.UploadFile({ file: pdfFile });
        docs.push({ file_url, file_name: pdfFile.name });
      } else if (selectedTemplate) {
        docs.push({
          file_url: selectedTemplate.file_url,
          file_name: selectedTemplate.file_name || `${selectedTemplate.name}.pdf`,
          merge_fields: resolvedMergeFields.map((mf) => ({ anchor: mf.anchor, value: mf.value })),
        });
      }
      for (const docId of selectedDocIds) {
        const d = documents.find((x) => x.id === docId);
        if (d?.file_upload) docs.push({ file_url: d.file_upload, file_name: d.document_name || "Document.pdf" });
      }
      for (const estId of selectedEstimateIds) {
        const est = estimates.find((x) => x.id === estId);
        if (!est) continue;
        const atts = await base44.entities.Attachment.filter({ entity_type: "estimate", entity_id: est.id }, "-created_date").catch(() => []);
        const pdf = atts[0];
        if (pdf?.url) docs.push({ file_url: pdf.url, file_name: pdf.filename || `${est.title || "Estimate"}.pdf` });
      }
      if (docs.length === 0) throw new Error("Select at least one contract template, document, or estimate with a generated PDF.");

      const validSigners = signers.filter((s) => s.name.trim() && s.email.trim());
      if (validSigners.length === 0) throw new Error("Add at least one signer with a name and email.");

      const res = await fetch("/api/docusign-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: docs,
          subject: `Contract package: ${deal?.title || lead?.full_name || "New contract"}`,
          signers: validSigners,
          organization_id: getCurrentOrgId() || undefined,
          entity_type: deal ? "deal" : "lead",
          entity_id: deal ? deal.id : lead.id,
          sent_by: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send contract package.");
      setSendOk(true);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6 max-h-[70vh] overflow-y-auto">
      {deal && !lead && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          This deal has no associated lead, so there's no linked client to pull merge-field info from. Merge tokens will render blank.
        </p>
      )}
      {lead && !client && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          No contact-book record found for this lead yet — client.* merge tokens will render blank.
        </p>
      )}

      {/* Contract template */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <FileSignature className="h-3.5 w-3.5" /> Contract Template
        </label>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">— None —</option>
          {contractTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {contractTemplates.length === 0 && (
          <p className="mt-1 text-[11px] text-slate-400">No contract templates yet — add one in Settings → Templates → Contract Templates.</p>
        )}
        {isTextTemplate && resolvedBody && (
          <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Merge Preview</p>
            <div className="max-h-40 overflow-y-auto text-xs text-slate-700 whitespace-pre-line">{resolvedBody}</div>
          </div>
        )}
        {!isTextTemplate && selectedTemplate && resolvedMergeFields.length > 0 && (
          <div className="mt-2 rounded-lg border border-slate-200 p-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Merge Preview</p>
            {resolvedMergeFields.map((mf) => (
              <div key={mf.anchor} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-slate-500 truncate">{mf.anchor}</span>
                <span className={cn("truncate", mf.value ? "text-slate-800 font-medium" : "text-slate-300 italic")}>
                  {mf.value || "blank"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Paperclip className="h-3.5 w-3.5" /> Attach Documents
        </label>
        {documents.length === 0 ? (
          <p className="text-[11px] text-slate-400">No documents in the library yet.</p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-slate-200 p-2">
            {documents.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-xs text-slate-700 py-0.5 cursor-pointer">
                <input type="checkbox" checked={selectedDocIds.includes(d.id)} onChange={() => toggleDoc(d.id)} className="rounded" />
                <span className="truncate flex-1">{d.document_name || "Untitled document"}</span>
                {d.document_type && <span className="text-[10px] text-slate-400 flex-shrink-0">{d.document_type}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Estimates */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <FileText className="h-3.5 w-3.5" /> Attach Estimates
        </label>
        {estimates.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            {client ? "No estimates found for this client." : "No linked client to look up estimates for."}
          </p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-slate-200 p-2">
            {estimates.map((est) => (
              <label key={est.id} className="flex items-center gap-2 text-xs text-slate-700 py-0.5 cursor-pointer">
                <input type="checkbox" checked={selectedEstimateIds.includes(est.id)} onChange={() => toggleEstimate(est.id)} className="rounded" />
                <span className="truncate flex-1">{est.title || est.estimate_number || "Untitled estimate"}</span>
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-400">
          Only picks up an estimate's most recently generated PDF. If it doesn't have one yet, open it and use Download PDF or Send once first.
        </p>
      </div>

      {/* Signers */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">Signers</label>
        <div className="space-y-2">
          {signers.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={s.name} onChange={(e) => updateSigner(i, { name: e.target.value })} placeholder="Name" className="text-sm" />
              <Input type="email" value={s.email} onChange={(e) => updateSigner(i, { email: e.target.value })} placeholder="Email" className="text-sm" />
              {signers.length > 1 && (
                <button type="button" onClick={() => removeSigner(i)} className="p-1.5 text-slate-300 hover:text-rose-500 flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addSigner} className="mt-1.5 text-xs font-medium text-amber-600 hover:text-amber-700">
          + Add signer
        </button>
      </div>

      {sendError && <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{sendError}</p>}
      {sendOk && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">Contract package sent.</p>}

      <div className="flex gap-2">
        {isTextTemplate && (
          <Button type="button" variant="outline" onClick={handlePreviewPdf} className="gap-2">
            <Eye className="h-4 w-4" /> Preview PDF
          </Button>
        )}
        <Button type="button" onClick={handleSend} disabled={sending} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send Contract Package"}
        </Button>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sent Envelopes</p>
        <DocuSignEnvelopes entityType={deal ? "deal" : "lead"} entityId={deal ? deal.id : lead.id} />
      </div>
    </div>
  );
}
