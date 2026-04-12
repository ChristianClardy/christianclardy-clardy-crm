import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import CompanyDocumentsSection from "@/components/documents/CompanyDocumentsSection";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";
import { Search, FileText, Image, File, Download, FolderOpen, Send, Plus, Trash2, Loader2, CheckCircle } from "lucide-react";

function FileIcon({ fileType }) {
  if (fileType?.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

const EMPTY_SIGNER = { name: "", email: "" };

function SendDocuSignModal({ doc, onClose }) {
  const [signers, setSigners]   = useState([{ ...EMPTY_SIGNER }]);
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState(null); // null | { ok, message }

  const updateSigner = (i, field, value) =>
    setSigners((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const addSigner = () => setSigners((prev) => [...prev, { ...EMPTY_SIGNER }]);
  const removeSigner = (i) => setSigners((prev) => prev.filter((_, idx) => idx !== i));

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/docusign-send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          file_url:  doc.file_url,
          file_name: doc.file_name,
          signers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send envelope.");
      setResult({ ok: true, message: `Envelope sent! ID: ${data.envelope_id}` });
    } catch (err) {
      setResult({ ok: false, message: err.message });
    }
    setSending(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" /> Send via DocuSign
          </DialogTitle>
        </DialogHeader>

        {result?.ok ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-900">Sent for Signature</p>
            <p className="text-sm text-slate-500">{result.message}</p>
            <Button onClick={onClose} size="sm" className="bg-slate-900 text-white">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-700 font-medium truncate">
              {doc.file_name}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Signers</Label>
                <button type="button" onClick={addSigner} className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800">
                  <Plus className="w-3 h-3" /> Add signer
                </button>
              </div>

              {signers.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <Input
                      required
                      placeholder="Full name"
                      value={s.name}
                      onChange={(e) => updateSigner(i, "name", e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      required
                      type="email"
                      placeholder="Email address"
                      value={s.email}
                      onChange={(e) => updateSigner(i, "email", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  {signers.length > 1 && (
                    <button type="button" onClick={() => removeSigner(i)} className="mt-1 p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {result && !result.ok && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {result.message}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={sending} className="bg-[#1A2B3C] hover:bg-[#243647] text-white">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {sending ? "Sending…" : "Send for Signature"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Documents() {
  const [attachments, setAttachments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [docusignConnected, setDocusignConnected] = useState(false);
  const [sendTarget, setSendTarget] = useState(null);

  useEffect(() => {
    loadData();
    checkDocuSign();
    const unsubScope = subscribeToCompanyScope(setSelectedCompanyScope);
    return () => unsubScope();
  }, []);

  const loadData = async () => {
    const [attachmentData, projectData, taskData] = await Promise.all([
      base44.entities.Attachment.list("-created_date", 2000),
      base44.entities.Project.list("-updated_date", 500),
      base44.entities.Task.list("-updated_date", 2000),
    ]);
    setAttachments(attachmentData);
    setProjects(projectData);
    setTasks(taskData);
    setLoading(false);
  };

  const checkDocuSign = async () => {
    const { data } = await supabase
      .from("company_profiles")
      .select("settings")
      .limit(1)
      .single();
    setDocusignConnected(!!data?.settings?.docusign?.access_token);
  };

  const visibleProjects = useMemo(() => selectedCompanyScope === "all" ? projects : projects.filter((project) => project.company_id === selectedCompanyScope), [projects, selectedCompanyScope]);
  const projectMap = useMemo(() => Object.fromEntries(visibleProjects.map((p) => [p.id, p])), [visibleProjects]);
  const taskMap = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);

  const filtered = attachments.filter((doc) => {
    const task = taskMap[doc.entity_id];
    const project = doc.entity_type === "project" ? projectMap[doc.entity_id] : projectMap[task?.project_id];
    if (selectedCompanyScope !== "all" && !project) return false;
    const q = search.toLowerCase();
    return !q ||
      (doc.file_name || "").toLowerCase().includes(q) ||
      (doc.uploaded_by || "").toLowerCase().includes(q) ||
      (project?.name || "").toLowerCase().includes(q) ||
      (task?.name || "").toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Document Storage</h1>
          <p className="mt-1 text-slate-500">Browse uploaded project and task files in one place.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..." className="pl-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Total Files</p><p className="mt-2 text-2xl font-bold text-slate-900">{filtered.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Project Files</p><p className="mt-2 text-2xl font-bold text-slate-900">{filtered.filter((d) => d.entity_type === "project").length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Task Files</p><p className="mt-2 text-2xl font-bold text-slate-900">{filtered.filter((d) => d.entity_type === "task").length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Projects With Files</p><p className="mt-2 text-2xl font-bold text-slate-900">{new Set(filtered.map((d) => d.entity_type === "project" ? d.entity_id : taskMap[d.entity_id]?.project_id).filter(Boolean)).size}</p></div>
      </div>

      <CompanyDocumentsSection selectedCompanyScope={selectedCompanyScope} search={search} />

      {sendTarget && (
        <SendDocuSignModal doc={sendTarget} onClose={() => setSendTarget(null)} />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium">No documents found</p>
            <p className="mt-1 text-sm">Files uploaded in project or task areas will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Uploaded By</th>
                  <th className="px-5 py-3">Uploaded</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => {
                  const task = taskMap[doc.entity_id];
                  const project = doc.entity_type === "project" ? projectMap[doc.entity_id] : projectMap[task?.project_id];
                  return (
                    <tr key={doc.id} className="border-b border-slate-100 hover:bg-amber-50/40">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <FileIcon fileType={doc.file_type} />
                          <div>
                            <p className="font-medium text-slate-900">{doc.file_name}</p>
                            <p className="text-xs text-slate-400">{task?.name || task?.title || ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><Badge className="capitalize bg-slate-100 text-slate-600">{doc.entity_type}</Badge></td>
                      <td className="px-5 py-4">
                        {project ? (
                          <Link to={createPageUrl(`ProjectDetail?id=${project.id}&tab=files`)} className="font-medium text-amber-700 hover:text-amber-800">{project.name}</Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{doc.uploaded_by || "—"}</td>
                      <td className="px-5 py-4 text-slate-500">{doc.created_date ? new Date(doc.created_date).toLocaleDateString() : "—"}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {docusignConnected && (
                            <button
                              onClick={() => setSendTarget(doc)}
                              className="inline-flex items-center gap-1 text-sm font-medium text-[#1A2B3C] hover:text-[#243647]"
                              title="Send for signature via DocuSign"
                            >
                              <Send className="h-4 w-4" /> Sign
                            </button>
                          )}
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-amber-700 hover:text-amber-800">
                            <Download className="h-4 w-4" /> Open
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}