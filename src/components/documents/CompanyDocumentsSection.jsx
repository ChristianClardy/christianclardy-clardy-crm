import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Download, File, FileText, Image, Plus } from "lucide-react";

const DOCUMENT_TYPES = [
  "Contract",
  "Subcontract Agreement",
  "Scope of Work",
  "Amendment",
  "Permit",
  "HOA Approval",
  "Selection Sheet",
  "Invoice",
  "Change Order",
  "Warranty",
  "Other",
];

function FileIcon({ fileUrl }) {
  if (/(png|jpg|jpeg|gif|webp)$/i.test(fileUrl || "")) return <Image className="h-4 w-4 text-blue-500" />;
  if (/\.pdf$/i.test(fileUrl || "")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

export default function CompanyDocumentsSection({ selectedCompanyScope = "all", search = "" }) {
  const [documents, setDocuments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    document_name: "",
    linked_company_id: selectedCompanyScope !== "all" ? selectedCompanyScope : "",
    document_type: "Contract",
    notes: "",
    file: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      linked_company_id: selectedCompanyScope !== "all" ? selectedCompanyScope : current.linked_company_id,
    }));
  }, [selectedCompanyScope]);

  const loadData = async () => {
    const [documentData, companyData, me] = await Promise.all([
      base44.entities.Document.list("-upload_date", 1000),
      base44.entities.CompanyProfile.list("name", 200),
      base44.auth.me().catch(() => null),
    ]);
    setDocuments(documentData);
    setCompanies(companyData.filter((company) => company.is_active !== false));
    setUser(me);
  };

  const companyMap = useMemo(() => Object.fromEntries(companies.map((company) => [company.id, company])), [companies]);

  const filteredDocuments = useMemo(() => {
    let items = documents.filter((document) => document.linked_company_id);
    if (selectedCompanyScope !== "all") items = items.filter((document) => document.linked_company_id === selectedCompanyScope);
    const query = search.toLowerCase();
    if (!query) return items;
    return items.filter((document) =>
      [
        document.document_name,
        document.document_type,
        document.notes,
        companyMap[document.linked_company_id]?.name,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    );
  }, [companyMap, documents, search, selectedCompanyScope]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: form.file });
    await base44.entities.Document.create({
      document_id: `DOC-${Date.now()}`,
      document_name: form.document_name || form.file.name,
      linked_company_id: form.linked_company_id,
      document_type: form.document_type,
      file_upload: file_url,
      uploaded_by: user?.email || "",
      upload_date: new Date().toISOString().slice(0, 10),
      notes: form.notes,
    });
    setDialogOpen(false);
    setForm({
      document_name: "",
      linked_company_id: selectedCompanyScope !== "all" ? selectedCompanyScope : "",
      document_type: "Contract",
      notes: "",
      file: null,
    });
    setUploading(false);
    loadData();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Company Documents</h2>
          <p className="mt-1 text-sm text-slate-500">Store contracts, subcontract agreements, scope of work files, and other company-level documents.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="mr-2 h-4 w-4" /> Upload Document
        </Button>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium">No company documents yet</p>
          <p className="mt-1 text-sm">Uploaded company files will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Document</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((document) => (
                <tr key={document.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <FileIcon fileUrl={document.file_upload} />
                      <div>
                        <p className="font-medium text-slate-900">{document.document_name || "Document"}</p>
                        <p className="text-xs text-slate-400">{document.notes || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><Badge className="bg-slate-100 text-slate-700">{document.document_type}</Badge></td>
                  <td className="px-5 py-4 text-slate-600">{companyMap[document.linked_company_id]?.name || "—"}</td>
                  <td className="px-5 py-4 text-slate-500">{document.upload_date || "—"}</td>
                  <td className="px-5 py-4 text-right">
                    <a href={document.file_upload} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-amber-700 hover:text-amber-800">
                      <Download className="h-4 w-4" /> Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Company Document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Document Name</Label>
              <Input value={form.document_name} onChange={(e) => setForm((current) => ({ ...current, document_name: e.target.value }))} className="mt-1.5" placeholder="Optional display name" />
            </div>
            <div>
              <Label>Company *</Label>
              <Select value={form.linked_company_id || "__none__"} onValueChange={(value) => setForm((current) => ({ ...current, linked_company_id: value === "__none__" ? "" : value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select company</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document Type</Label>
              <Select value={form.document_type} onValueChange={(value) => setForm((current) => ({ ...current, document_type: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File *</Label>
              <Input type="file" className="mt-1.5" onChange={(e) => setForm((current) => ({ ...current, file: e.target.files?.[0] || null }))} required />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} className="mt-1.5" rows={3} placeholder="Optional notes" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={uploading || !form.linked_company_id} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}