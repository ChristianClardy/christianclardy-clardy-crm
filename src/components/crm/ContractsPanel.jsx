import { useState, useEffect } from "react";
import { base44, getCurrentOrgId } from "@/api/base44Client";
import { FileSignature, Paperclip, FileText, Send, Loader2, Trash2, Eye, ArrowUp, ArrowDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import DocuSignEnvelopes from "@/components/docusign/DocuSignEnvelopes";
import { resolveContractMergeValue, renderContractTemplate } from "@/lib/contractMergeSources";
import { generateContractPdf } from "@/lib/generateContractPdf";
import { apiFetch } from "@/lib/apiFetch";
import { defaultChangeOrderBody } from "@/lib/changeOrderDocument";

// The built-in change order document, listed with the change order templates
// on a project so a change order can be sent with no template set up.
const BUILT_IN_CO = "__built_in_change_order__";
const BUILT_IN_CO_TEMPLATE = { id: BUILT_IN_CO, name: "Standard Change Order (built in)", body_type: "text", template_type: "change_order", builtIn: true };
const isChangeOrderTemplate = (t) => t?.template_type === "change_order";

// ─── Contracts Panel ────────────────────────────────────────────────────────
// Bundles any number of Contract Templates (merge-field mapped) + selected
// Documents + selected Estimates into one DocuSign envelope. Shared by the Deal detail
// modal's Contracts tab (deal + its lead) and a Lead's own page (lead only,
// no deal yet — sending the initial contract shouldn't require converting to
// a Deal first; api/_lib/dealAutomation.js creates/advances the Deal
// automatically once the envelope comes back signed).
//
// Customer info is resolved via lead.linked_contact_id -> clients, with the
// Lead's own name/email/phone/address layered on top (the Lead is the main
// contact) — that also pre-fills the first signer. project.* and estimate.* sources merge from
// the client's most recent project/estimate (estimate.* prefers whichever
// estimate is checked below). selections.* sources merge from that same
// project's Pool Selections record (src/components/projects/PoolSelectionsPanel.jsx),
// if one exists. deal.* sources are blank when there's no deal yet —
// resolveContractMergeValue handles a null deal gracefully.

// From a project (ProjectDetail's Contracts tab) pass `project` instead: the
// client, project, selections, draws, change orders and payments all come
// from that project, and the envelope is filed to it. On a project the
// change order templates are listed too, with a picker for which change
// order they merge ({{change_order.*}}). A package with a change order
// template is tracked on that change order, so signing it marks the change
// order approved (api/_lib/docusign.js). `initialChangeOrderId` comes from
// the Change Orders tab's "Send for signature": it preselects that change
// order and the first change order template.
export default function ContractsPanel({ lead = null, deal = null, project: fixedProject = null, initialChangeOrderId = null, onSent }) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [company, setCompany] = useState(null);
  const [project, setProject] = useState(null);
  const [selections, setSelections] = useState(null);
  const [draws, setDraws] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [contractTemplates, setContractTemplates] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [estimateVersion, setEstimateVersion] = useState(null);

  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [selectedChangeOrderId, setSelectedChangeOrderId] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [selectedEstimateIds, setSelectedEstimateIds] = useState([]);
  // Signing order = list order. #1 is always the sales agent preparing the
  // contract: the merge-field values (price, schedule, etc.) are locked to
  // them in DocuSign (api/docusign-send.js), so the customer can't change them.
  const agentSigner = () => ({ role: "agent", name: user?.full_name || "", email: user?.email || "" });
  const [signers, setSigners] = useState(() => [agentSigner(), { role: "client", name: "", email: "" }]);
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
      const clientId = fixedProject ? fixedProject.client_id : lead?.linked_contact_id;
      if (clientId) {
        const matches = await base44.entities.Client.filter({ id: clientId }).catch(() => []);
        resolvedClient = matches[0] || null;
      }
      let ests = [];
      let resolvedProject = fixedProject;
      if (resolvedClient?.id) {
        [ests, resolvedProject] = await Promise.all([
          base44.entities.Estimate.filter({ client_id: resolvedClient.id }, "-created_date").catch(() => []),
          fixedProject || base44.entities.Project.filter({ client_id: resolvedClient.id }, "-created_date").then((rows) => rows?.[0] || null).catch(() => null),
        ]);
      }
      const [resolvedSelections, resolvedDraws, resolvedChangeOrders, resolvedPayments] = resolvedProject?.id
        ? await Promise.all([
            base44.entities.PoolSelection.filter({ project_id: resolvedProject.id }).then((rows) => rows?.[0] || null).catch(() => null),
            base44.entities.Draw.filter({ project_id: resolvedProject.id }, "draw_number").catch(() => []),
            base44.entities.ChangeOrder.filter({ project_id: resolvedProject.id }).catch(() => []),
            base44.entities.Payment.filter({ linked_job_id: resolvedProject.id }).catch(() => []),
          ])
        : [null, [], [], []];
      if (cancelled) return;
      const companyId = fixedProject?.company_id || lead?.company_id;
      const resolvedCompany = (companyId && comps.find((c) => c.id === companyId)) || comps[0] || null;
      // The Lead is the main contact — its name/email/phone/address win over
      // the linked Client's, so an edit made on the Lead (e.g. switching the
      // signer to a spouse) shows up here even if the Client record lags.
      const contactClient = lead
        ? {
            ...(resolvedClient || {}),
            name: lead.full_name?.trim() || resolvedClient?.name || "",
            email: lead.email?.trim() || resolvedClient?.email || "",
            phone: lead.phone?.trim() || resolvedClient?.phone || "",
            address: lead.property_address?.trim() || resolvedClient?.address || "",
          }
        : resolvedClient;
      setClient(contactClient);
      setCompany(resolvedCompany);
      setProject(resolvedProject);
      setSelections(resolvedSelections);
      setDraws(resolvedDraws || []);
      setChangeOrders(resolvedChangeOrders || []);
      setPayments(resolvedPayments || []);
      const active = (templates || []).filter((t) => t.is_active !== false);
      if (fixedProject) {
        const coTemplates = [...active.filter(isChangeOrderTemplate), BUILT_IN_CO_TEMPLATE];
        setContractTemplates([...active.filter((t) => !isChangeOrderTemplate(t)), ...coTemplates]);
        if (initialChangeOrderId && (resolvedChangeOrders || []).some((c) => c.id === initialChangeOrderId)) {
          setSelectedChangeOrderId(initialChangeOrderId);
          setSelectedTemplateIds([coTemplates[0].id]);
        }
      } else {
        // Change order templates are sent from a project.
        setContractTemplates(active.filter((t) => !isChangeOrderTemplate(t)));
      }
      setDocuments(docs || []);
      setEstimates(ests || []);
      setSigners((prev) => [
        prev.find((sg) => sg.role === "agent") || agentSigner(),
        { role: "client", name: contactClient?.name || "", email: contactClient?.email || "" },
      ]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [deal?.id, lead?.id, lead?.full_name, lead?.email, lead?.phone, lead?.property_address, fixedProject?.id]);

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

  const changeOrder = changeOrders.find((c) => c.id === selectedChangeOrderId) || null;
  // Contract value plus every other approved change order.
  const changeOrderPriorTotal = Number(project?.contract_value || 0) + changeOrders
    .filter((c) => c.status === "approved" && c.id !== changeOrder?.id)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const sendableChangeOrders = changeOrders
    .filter((c) => c.status !== "void")
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const mergeCtx = { deal: deal || null, client, company, project, estimate: mergeEstimate, estimateVersion, selections, draws, changeOrders, payments, changeOrder, changeOrderPriorTotal };

  // Templates resolve in the order they were checked, and that's the order
  // they stack into the envelope — ahead of documents, then estimates.
  const preparedTemplates = selectedTemplateIds
    .map((id) => contractTemplates.find((t) => t.id === id))
    .filter(Boolean)
    .map((template) => {
      const isText = template.body_type === "text";
      const body = template.builtIn ? defaultChangeOrderBody(changeOrder) : template.body;
      return {
        template,
        isText,
        pdfTitle: template.builtIn ? `Change Order CO-${changeOrder?.number || ""} - ${project?.name || ""}` : template.name,
        body: isText ? renderContractTemplate(body, mergeCtx, template.field_defaults) : "",
        mergeFields: isText ? [] : (template.merge_fields || []).map((mf) => ({
          ...mf,
          value: resolveContractMergeValue(mf.source, mergeCtx),
        })),
      };
    });

  const sendsChangeOrder = preparedTemplates.some((p) => isChangeOrderTemplate(p.template));

  // Where the envelope is tracked and the signed copy filed.
  const entity = fixedProject
    ? (sendsChangeOrder && changeOrder ? { type: "change_order", id: changeOrder.id } : { type: "project", id: fixedProject.id })
    : deal ? { type: "deal", id: deal.id } : { type: "lead", id: lead?.id };

  const toggleTemplate = (id) => setSelectedTemplateIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleDoc = (id) => setSelectedDocIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleEstimate = (id) => setSelectedEstimateIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const updateSigner = (i, patch) => setSigners((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const addSigner = () => setSigners((prev) => [...prev, { role: "client", name: "", email: "" }]);
  const removeSigner = (i) => setSigners((prev) => prev.filter((_, idx) => idx !== i));
  // Customers can be reordered among themselves; the agent stays #1.
  const moveSigner = (i, dir) => setSigners((prev) => {
    const j = i + dir;
    if (j < 1 || j >= prev.length || prev[i].role === "agent") return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // The signed-in user loads after the panel can mount — fill in a blank agent.
  useEffect(() => {
    if (!user) return;
    setSigners((prev) => prev.map((sg) => (sg.role === "agent" && !sg.name && !sg.email ? agentSigner() : sg)));
  }, [user?.id]);

  // Renders the same PDF handleSend would upload, but only opens it locally —
  // no upload, no DocuSign call — so it's free to check before signers are
  // even filled in.
  const handlePreviewPdf = (prepared) => {
    const pdfFile = generateContractPdf(prepared.body, { title: prepared.pdfTitle });
    const url = URL.createObjectURL(pdfFile);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleSend = async () => {
    setSending(true);
    setSendError("");
    setSendOk(false);
    try {
      if (sendsChangeOrder && !changeOrder) throw new Error("Pick which change order to send with the change order template.");
      const docs = [];
      for (const p of preparedTemplates) {
        if (p.isText) {
          const pdfFile = generateContractPdf(p.body, { title: p.pdfTitle });
          const { file_url } = await base44.integrations.Core.UploadFile({ file: pdfFile });
          docs.push({ file_url, file_name: pdfFile.name });
        } else {
          docs.push({
            file_url: p.template.file_url,
            file_name: p.template.file_name || `${p.template.name}.pdf`,
            merge_fields: p.mergeFields.map((mf) => ({ anchor: mf.anchor, value: mf.value })),
          });
        }
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

      const agent = signers.find((s) => s.role === "agent");
      if (!agent?.name.trim() || !agent?.email.trim()) throw new Error("Add the sales agent's name and email — they sign first and own the contract details.");
      const validSigners = signers.filter((s) => s.name.trim() && s.email.trim());
      if (!validSigners.some((s) => s.role !== "agent")) throw new Error("Add at least one customer signer with a name and email.");

      const res = await apiFetch("/api/docusign-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: docs,
          subject: entity.type === "change_order"
            ? `Change Order CO-${changeOrder.number || ""}: ${changeOrder.title || ""} (${fixedProject.name})`
            : `Contract package: ${deal?.title || lead?.full_name || fixedProject?.name || client?.name || "New contract"}`,
          signers: validSigners,
          organization_id: getCurrentOrgId() || undefined,
          entity_type: entity.type,
          entity_id: entity.id,
          sent_by: user?.id,
          review: true,
          return_url: `${window.location.origin}/DocuSignSenderReturn`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to open the contract for review.");
      window.open(data.sender_view_url, "_blank");
      if (entity.type === "change_order") {
        await base44.entities.ChangeOrder.update(changeOrder.id, { status: "sent" }).catch(() => {});
      }
      setSendOk(true);
      onSent?.();
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
      {fixedProject && !client && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          This project has no client set, so client.* merge fields will be blank and there's no signer to fill in. Set the client on the project first.
        </p>
      )}
      {lead && !client && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          No contact-book record found for this lead yet — client.* merge tokens will render blank.
        </p>
      )}

      {/* Contract templates */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <FileSignature className="h-3.5 w-3.5" /> Contract Templates
        </label>
        {(() => {
          const renderList = (list) => (
            <div className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-slate-200 p-2">
              {list.map((t) => {
                const order = selectedTemplateIds.indexOf(t.id);
                return (
                  <label key={t.id} className="flex items-center gap-2 text-xs text-slate-700 py-0.5 cursor-pointer">
                    <input type="checkbox" checked={order !== -1} onChange={() => toggleTemplate(t.id)} className="rounded" />
                    <span className="truncate flex-1">{t.name}</span>
                    {order !== -1 && (
                      <span className="flex-shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">#{order + 1}</span>
                    )}
                  </label>
                );
              })}
            </div>
          );
          const contracts = contractTemplates.filter((t) => !isChangeOrderTemplate(t));
          const coTemplates = contractTemplates.filter(isChangeOrderTemplate);
          return (
            <>
              {contracts.length === 0 ? (
                <p className="text-[11px] text-slate-400">No contract templates yet — add one in Settings → Templates → Contract Templates.</p>
              ) : renderList(contracts)}
              {fixedProject && (
                <div className="mt-3">
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <FileSignature className="h-3.5 w-3.5" /> Change Order Templates
                  </label>
                  {renderList(coTemplates)}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-600 flex-shrink-0">Change order:</span>
                    <select
                      value={selectedChangeOrderId}
                      onChange={(e) => setSelectedChangeOrderId(e.target.value)}
                      className={cn("h-8 flex-1 min-w-0 rounded-md border bg-white px-2 text-xs", sendsChangeOrder && !changeOrder ? "border-rose-300" : "border-slate-200")}
                    >
                      <option value="">{sendableChangeOrders.length ? "Pick a change order…" : "No change orders on this project yet"}</option>
                      {sendableChangeOrders.map((c) => (
                        <option key={c.id} value={c.id}>
                          CO-{c.number || "?"} {c.title || ""} · ${Number(c.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {c.status || "draft"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Fills the Change Order merge fields. Signing a package with a change order template marks that change order approved.
                  </p>
                </div>
              )}
            </>
          );
        })()}
        {selectedTemplateIds.length > 1 && (
          <p className="mt-1 text-[11px] text-slate-400">Templates stack into the envelope in the order you check them.</p>
        )}

        {preparedTemplates.map((p) => (
          <div key={p.template.id} className="mt-2 rounded-lg border border-slate-200 p-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Merge Preview — {p.template.name}
              </p>
              {p.isText && (
                <button
                  type="button"
                  onClick={() => handlePreviewPdf(p)}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700"
                >
                  <Eye className="h-3 w-3" /> Preview PDF
                </button>
              )}
            </div>
            {p.isText ? (
              <div className="max-h-40 overflow-y-auto text-xs text-slate-700 whitespace-pre-line">{p.body}</div>
            ) : p.mergeFields.length > 0 ? (
              p.mergeFields.map((mf) => (
                <div key={mf.anchor} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-500 truncate">{mf.anchor}</span>
                  <span className={cn("truncate", mf.value ? "text-slate-800 font-medium" : "text-slate-300 italic")}>
                    {mf.value || "blank"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-400">No merge fields mapped on this template.</p>
            )}
          </div>
        ))}
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

      {/* Signers — listed in signing order */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">Signers (in signing order)</label>
        <div className="space-y-2">
          {signers.map((s, i) => {
            const isAgent = s.role === "agent";
            return (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
                  <Input value={s.name} onChange={(e) => updateSigner(i, { name: e.target.value })} placeholder={isAgent ? "Sales agent name" : "Customer name"} className="text-sm" />
                  <Input type="email" value={s.email} onChange={(e) => updateSigner(i, { email: e.target.value })} placeholder={isAgent ? "Sales agent email" : "Customer email"} className="text-sm" />
                  {isAgent ? (
                    <span className="w-[74px] flex-shrink-0" />
                  ) : (
                    <div className="flex flex-shrink-0 items-center">
                      <button type="button" title="Sign earlier" disabled={i <= 1} onClick={() => moveSigner(i, -1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Sign later" disabled={i === signers.length - 1} onClick={() => moveSigner(i, 1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Remove signer" disabled={signers.filter((x) => x.role !== "agent").length <= 1} onClick={() => removeSigner(i)} className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-25">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {isAgent && (
                  <p className="ml-8 mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <Lock className="h-3 w-3" /> Sales agent signs first. Contract price and all merge-field details are locked to them — the customer can't change them. Place their signature with <code className="bg-slate-100 px-1 rounded">**agent_signature**</code>.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={addSigner} className="mt-1.5 text-xs font-medium text-amber-600 hover:text-amber-700">
          + Add customer signer
        </button>
      </div>

      {sendError && <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{sendError}</p>}
      {sendOk && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">Opened for review in DocuSign — finish there to send it.</p>}

      <Button type="button" onClick={handleSend} disabled={sending} className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? "Opening in DocuSign…" : "Review & Send in DocuSign"}
      </Button>

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sent Envelopes</p>
        <DocuSignEnvelopes entityType={entity.type} entityId={entity.id} />
      </div>
    </div>
  );
}
