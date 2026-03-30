import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ImagePlus, Loader2, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import InvoicePreviewCard from "@/components/payments/InvoicePreviewCard";
import { defaultInvoiceBranding, getInvoiceBranding } from "@/components/payments/invoiceBrandingUtils";

export default function InvoiceDesigner() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [localLogoPreview, setLocalLogoPreview] = useState("");
  const [form, setForm] = useState(defaultInvoiceBranding);
  const [sampleInvoiceName, setSampleInvoiceName] = useState("Progress Billing - Phase 1");
  const [sampleAmount, setSampleAmount] = useState("12500");
  const [sampleDueDate, setSampleDueDate] = useState("");
  const [sampleScope, setSampleScope] = useState("Deposit for materials, mobilization, and initial construction work.");

  useEffect(() => {
    const load = async () => {
      const [companyData, projectData, clientData] = await Promise.all([
        base44.entities.CompanyProfile.list("name", 200),
        base44.entities.Project.list("-updated_date", 50),
        base44.entities.Client.list("-updated_date", 50),
      ]);
      setCompanies(companyData);
      setProjects(projectData);
      setClients(clientData);
      if (companyData[0]) {
        setSelectedCompanyId(companyData[0].id);
        setForm(getInvoiceBranding(companyData[0]));
      }
    };
    load();
  }, []);

  const selectedCompany = useMemo(() => companies.find((company) => company.id === selectedCompanyId), [companies, selectedCompanyId]);
  const sampleProject = projects.find((project) => project.company_id === selectedCompanyId) || projects[0];
  const sampleClient = clients.find((client) => client.id === sampleProject?.client_id) || clients[0];

  const handleCompanyChange = (companyId) => {
    setSelectedCompanyId(companyId);
    setLocalLogoPreview("");
    const company = companies.find((item) => item.id === companyId);
    setForm(getInvoiceBranding(company));
  };

  const handleSave = async () => {
    if (!selectedCompany) return;
    setSaving(true);
    await base44.entities.CompanyProfile.update(selectedCompany.id, {
      invoice_company_name: form.company_name,
      invoice_logo_url: form.logo_url,
      invoice_header_title: form.header_title,
      invoice_accent_color: form.accent_color,
      invoice_intro_text: form.intro_text,
      invoice_footer_text: form.footer_text,
      invoice_scope_label: form.default_scope_label,
    });
    setSaving(false);
  };

  const handleLogoFile = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    const previewUrl = URL.createObjectURL(file);
    setLocalLogoPreview(previewUrl);
    setUploadingLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((prev) => ({ ...prev, logo_url: file_url }));
      setLocalLogoPreview("");
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Invoice Designer</h1>
            <p className="mt-1 text-slate-500">Control your logo, company name, invoice look, and what the invoice is for.</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || !selectedCompanyId} className="bg-slate-900 text-white hover:bg-slate-800">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Design"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <Label>Company</Label>
            <select
              value={selectedCompanyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Company Name on Invoice</Label>
            <Input value={form.company_name} onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))} className="mt-1.5" />
          </div>

          <div>
            <Label>Logo</Label>
            <div
              className="mt-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleLogoFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                id="invoice-logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleLogoFile(e.target.files?.[0])}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                  {uploadingLogo ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : <ImagePlus className="h-5 w-5 text-slate-500" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Drop logo image here</p>
                  <p className="mt-1 text-xs text-slate-500">or choose a file from your computer</p>
                </div>
                <label htmlFor="invoice-logo-upload">
                  <Button type="button" variant="outline" className="cursor-pointer" asChild>
                    <span>
                      <Upload className="h-4 w-4" />
                      Choose Image
                    </span>
                  </Button>
                </label>
              </div>
            </div>
            {(localLogoPreview || form.logo_url) && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <img src={localLogoPreview || form.logo_url} alt="Invoice logo" className="h-12 w-12 rounded-lg object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{uploadingLogo ? "Uploading logo..." : "Logo uploaded"}</p>
                  <p className="truncate text-xs text-slate-500">{localLogoPreview ? "Preview ready" : form.logo_url}</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Header Title</Label>
              <Input value={form.header_title} onChange={(e) => setForm((prev) => ({ ...prev, header_title: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Accent Color</Label>
              <Input value={form.accent_color} onChange={(e) => setForm((prev) => ({ ...prev, accent_color: e.target.value }))} className="mt-1.5" placeholder="#b5965a" />
            </div>
          </div>

          <div>
            <Label>Intro Text</Label>
            <Textarea value={form.intro_text} onChange={(e) => setForm((prev) => ({ ...prev, intro_text: e.target.value }))} className="mt-1.5" rows={3} />
          </div>

          <div>
            <Label>Scope Label</Label>
            <Input value={form.default_scope_label} onChange={(e) => setForm((prev) => ({ ...prev, default_scope_label: e.target.value }))} className="mt-1.5" />
          </div>

          <div>
            <Label>Footer Text</Label>
            <Textarea value={form.footer_text} onChange={(e) => setForm((prev) => ({ ...prev, footer_text: e.target.value }))} className="mt-1.5" rows={3} />
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Preview Content</p>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Invoice Name</Label>
                <Input value={sampleInvoiceName} onChange={(e) => setSampleInvoiceName(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>What This Invoice Is For</Label>
                <Textarea value={sampleScope} onChange={(e) => setSampleScope(e.target.value)} className="mt-1.5" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount</Label>
                  <Input type="number" value={sampleAmount} onChange={(e) => setSampleAmount(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={sampleDueDate} onChange={(e) => setSampleDueDate(e.target.value)} className="mt-1.5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <InvoicePreviewCard
          branding={{ ...form, logo_url: localLogoPreview || form.logo_url }}
          companyName={form.company_name}
          invoiceName={sampleInvoiceName}
          projectName={sampleProject?.name}
          clientName={sampleClient?.name}
          amount={sampleAmount}
          dueDate={sampleDueDate}
          scopeText={sampleScope}
        />
      </div>
    </div>
  );
}