import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, Download, File, FileText, Image, Plus, Send,
  Trash2, Link2, CheckCircle, Loader2, ShieldCheck, ExternalLink,
  Search as SearchIcon, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const DOC_TYPES = [
  "Contract",
  "Subcontract Agreement",
  "Scope of Work",
  "Proposal",
  "Change Order Template",
  "Lien Waiver Form",
  "Certificate of Insurance",
  "W-9",
  "Warranty",
  "HOA Approval",
  "Permit",
  "Amendment",
  "Invoice Template",
  "Other",
];

const TYPE_COLORS = {
  "Contract":               "bg-blue-100 text-blue-700",
  "Subcontract Agreement":  "bg-purple-100 text-purple-700",
  "Scope of Work":          "bg-amber-100 text-amber-700",
  "Proposal":               "bg-emerald-100 text-emerald-700",
  "Change Order Template":  "bg-orange-100 text-orange-700",
  "Lien Waiver Form":       "bg-rose-100 text-rose-700",
  "Certificate of Insurance":"bg-cyan-100 text-cyan-700",
  "W-9":                    "bg-slate-100 text-slate-700",
  "Warranty":               "bg-teal-100 text-teal-700",
};

function FileIcon({ url, type }) {
  if (type?.startsWith("image/") || /(png|jpg|jpeg|gif|webp)$/i.test(url || ""))
    return <Image className="h-5 w-5 text-blue-500" />;
  if (type === "application/pdf" || /\.pdf$/i.test(url || ""))
    return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-slate-400" />;
}

// ── Send-to-Client modal ──────────────────────────────────────────────────────
function SendModal({ doc, docusignConnected, onClose }) {
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState("");
  const [signers, setSigners] = useState([{ name: "", email: "" }]);
  const [mode, setMode] = useState("pick"); // "pick" | "send" | "sent"
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Client.list("name", 500),
      base44.entities.Lead.list("-created_date", 500),
    ]).then(([c, l]) => { setClients(c); setLeads(l); });
  }, []);

  const q = search.toLowerCase();
  const matchedClients = clients.filter(
    (c) => (c.full_name || c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)
  );
  const matchedLeads = leads.filter(
    (l) => (l.name || l.contact_name || "").toLowerCase().includes(q) || (l.email || "").toLowerCase().includes(q)
  );

  const pickContact = (name, email) => {
    setSigners([{ name, email: email || "" }]);
    setMode("send");
  };

  const updateSigner = (i, field, val) =>
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));

  const copyLink = () => {
    navigator.clipboard.writeText(doc.file_upload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/docusign-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: doc.file_upload,
          file_name: doc.document_name,
          signers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send envelope.");
      setResult({ ok: true, message: `Envelope sent! ID: ${data.envelope_id}` });
      setMode("sent");
    } catch (err) {
      setResult({ ok: false, message: err.message });
    }
    setSending(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send className="w-4 h-4 text-amber-600" /> Send Document
          </DialogTitle>
        </DialogHeader>

        {/* Doc name banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2 text-sm text-slate-700 font-medium">
          <FileIcon url={doc.file_upload} />
          <span className="truncate">{doc.document_name}</span>
          <a href={doc.file_upload} target="_blank" rel="noopener noreferrer" className="ml-auto text-amber-600 hover:text-amber-700 shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {mode === "sent" && (
          <div className="py-6 text-center space-y-3">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-900">Sent for Signature</p>
            <p className="text-sm text-slate-500">{result?.message}</p>
            <Button onClick={onClose} size="sm" className="bg-slate-900 text-white">Done</Button>
          </div>
        )}

        {mode === "pick" && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Choose a recipient from CRM</p>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <SearchIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients or leads…"
                  className="text-sm bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-400"
                />
                {search && <button onClick={() => setSearch("")}><X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" /></button>}
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1">
              {matchedClients.length > 0 && (
                <>
                  <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Clients</p>
                  {matchedClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => pickContact(c.full_name || c.name || "", c.email || "")}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-800">{c.full_name || c.name}</p>
                      <p className="text-xs text-slate-400">{c.email || "No email on file"}</p>
                    </button>
                  ))}
                </>
              )}
              {matchedLeads.length > 0 && (
                <>
                  <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Leads</p>
                  {matchedLeads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => pickContact(l.name || l.contact_name || "", l.email || "")}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-800">{l.name || l.contact_name}</p>
                      <p className="text-xs text-slate-400">{l.email || "No email on file"}</p>
                    </button>
                  ))}
                </>
              )}
              {!matchedClients.length && !matchedLeads.length && (
                <p className="text-xs text-slate-400 px-3 py-4 text-center italic">No results — or enter manually below</p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-3">
              <button
                onClick={() => setMode("send")}
                className="text-xs text-amber-700 font-medium hover:text-amber-800"
              >
                Enter recipient manually →
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5"
                >
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {mode === "send" && (
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-2">
              {signers.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <Input required placeholder="Recipient name" value={s.name} onChange={(e) => updateSigner(i, "name", e.target.value)} className="h-8 text-sm" />
                    <Input required type="email" placeholder="Email address" value={s.email} onChange={(e) => updateSigner(i, "email", e.target.value)} className="h-8 text-sm" />
                  </div>
                  {signers.length > 1 && (
                    <button type="button" onClick={() => setSigners((p) => p.filter((_, idx) => idx !== i))} className="mt-1 p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setSigners((p) => [...p, { name: "", email: "" }])} className="text-xs font-medium text-amber-700 hover:text-amber-800 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add another signer
              </button>
            </div>

            {!docusignConnected && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <p className="font-medium mb-1">DocuSign not connected</p>
                <p className="text-xs text-amber-700">Connect DocuSign in Settings to send for e-signature. For now, copy the link below to share manually.</p>
                <button type="button" onClick={copyLink} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800 underline hover:text-amber-900">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copied ? "Link copied!" : "Copy document link"}
                </button>
              </div>
            )}

            {result && !result.ok && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{result.message}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
              <button type="button" onClick={() => setMode("pick")} className="text-xs text-slate-500 hover:text-slate-700">← Back</button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                {docusignConnected && (
                  <Button type="submit" size="sm" disabled={sending} className="bg-[#1A2B3C] hover:bg-[#243647] text-white">
                    {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    {sending ? "Sending…" : "Send for Signature"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CompanyDocumentsSection({ selectedCompanyScope = "all", search = "" }) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState(null);
  const [docusignConnected, setDocusignConnected] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState(null);
  const [filterType, setFilterType] = useState("All");
  const [form, setForm] = useState({
    document_name: "",
    document_type: "Contract",
    notes: "",
    file: null,
  });

  useEffect(() => {
    loadData();
    checkDocuSign();
  }, []);

  const loadData = async () => {
    const [docs, me] = await Promise.all([
      base44.entities.Document.list("-upload_date", 1000),
      base44.auth.me().catch(() => null),
    ]);
    setDocuments(docs);
    setUser(me);
  };

  const checkDocuSign = async () => {
    const { data } = await supabase.from("company_profiles").select("settings").limit(1).single();
    setDocusignConnected(!!data?.settings?.docusign?.access_token);
  };

  const filtered = useMemo(() => {
    let items = documents;
    if (filterType !== "All") items = items.filter((d) => d.document_type === filterType);
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((d) =>
      [d.document_name, d.document_type, d.notes].filter(Boolean).some((v) => v.toLowerCase().includes(q))
    );
  }, [documents, filterType, search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: form.file });
      await base44.entities.Document.create({
        document_id: `DOC-${Date.now()}`,
        document_name: form.document_name || form.file.name,
        document_type: form.document_type,
        file_upload: file_url,
        uploaded_by: user?.email || "",
        upload_date: new Date().toISOString().slice(0, 10),
        notes: form.notes,
      });
      setDialogOpen(false);
      setForm({ document_name: "", document_type: "Contract", notes: "", file: null });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (id) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    await base44.entities.Document.delete(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const usedTypes = [...new Set(documents.map((d) => d.document_type).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* DocuSign status banner */}
      {!docusignConnected && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">DocuSign not connected</p>
            <p className="text-xs text-amber-700">Connect DocuSign in Settings to send documents for e-signature directly from this library.</p>
          </div>
          <Badge className="bg-amber-100 text-amber-700 text-xs shrink-0">Coming Soon</Badge>
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {["All", ...usedTypes].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
                filterType === t
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800 shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Upload Document
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium">No documents yet</p>
            <p className="mt-1 text-sm">Upload contracts, proposals, SOW templates, and more.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Document</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Uploaded</th>
                  <th className="px-5 py-3">By</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <FileIcon url={doc.file_upload} />
                        <div>
                          <p className="font-medium text-slate-900">{doc.document_name || "Document"}</p>
                          {doc.notes && <p className="text-xs text-slate-400 truncate max-w-xs">{doc.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge className={cn("text-xs", TYPE_COLORS[doc.document_type] || "bg-slate-100 text-slate-600")}>
                        {doc.document_type || "Other"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{doc.upload_date || "—"}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{doc.uploaded_by || "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setSendTarget(doc)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800"
                          title="Send to client"
                        >
                          <Send className="h-3.5 w-3.5" /> Send
                        </button>
                        <a
                          href={doc.file_upload}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800"
                        >
                          <Download className="h-3.5 w-3.5" /> Open
                        </a>
                        <button
                          onClick={() => deleteDoc(doc.id)}
                          className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Company Document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Document Name</Label>
              <Input
                value={form.document_name}
                onChange={(e) => setForm((f) => ({ ...f, document_name: e.target.value }))}
                className="mt-1.5"
                placeholder="e.g. Master Service Agreement v2"
              />
            </div>
            <div>
              <Label>Document Type</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm((f) => ({ ...f, document_type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File *</Label>
              <Input
                type="file"
                className="mt-1.5"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
                required
              />
              <p className="mt-1 text-xs text-slate-400">PDF, Word, Excel, images supported.</p>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1.5"
                rows={2}
                placeholder="Optional description or version notes"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={uploading || !form.file}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send modal */}
      {sendTarget && (
        <SendModal doc={sendTarget} docusignConnected={docusignConnected} onClose={() => setSendTarget(null)} />
      )}
    </div>
  );
}
