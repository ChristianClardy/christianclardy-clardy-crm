import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReceivedPaymentsTable from "@/components/payments/ReceivedPaymentsTable";
import InvoicesTable from "@/components/payments/InvoicesTable";
import InvoiceDialog from "@/components/payments/InvoiceDialog";
import { getInvoiceBranding } from "@/components/payments/invoiceBrandingUtils";
import { DollarSign, Search, CheckCircle2, Clock, AlertCircle, RefreshCw, Plus, Palette } from "lucide-react";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";
import { cn } from "@/lib/utils";

const statusStyles = {
  pending: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export default function Payments() {
  const [draws, setDraws] = useState([]);
  const [payments, setPayments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({
    linked_job_id: "",
    invoice_name: "",
    invoice_type: "Progress Payment",
    amount: "",
    due_date: "",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const unsubScope = subscribeToCompanyScope(setSelectedCompanyScope);
    return () => unsubScope();
  }, []);

  const loadData = async () => {
    const [drawData, paymentData, projectData, clientData, companyData, invoiceData] = await Promise.all([
      base44.entities.Draw.list("-updated_date", 2000),
      base44.entities.Payment.list("-payment_date", 2000),
      base44.entities.Project.list("-updated_date", 500),
      base44.entities.Client.list("-updated_date", 500),
      base44.entities.CompanyProfile.list("name", 200),
      base44.entities.Invoice.list("-updated_date", 2000),
    ]);
    setDraws(drawData);
    setPayments(paymentData);
    setProjects(projectData);
    setClients(clientData);
    setCompanies(companyData);
    setInvoices(invoiceData);
    setLoading(false);
  };

const visibleProjects = useMemo(() => selectedCompanyScope === "all" ? projects : projects.filter((project) => project.company_id === selectedCompanyScope), [projects, selectedCompanyScope]);
  const projectMap = useMemo(() => Object.fromEntries(visibleProjects.map((p) => [p.id, p])), [visibleProjects]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const companyMap = useMemo(() => Object.fromEntries(companies.map((company) => [company.id, company])), [companies]);

  const filteredDraws = draws.filter((draw) => {
    const project = projectMap[draw.project_id];
    if (selectedCompanyScope !== "all" && !project) return false;
    const client = project ? clientMap[project.client_id] : null;
    const q = search.toLowerCase();
    return !q ||
      (draw.title || "").toLowerCase().includes(q) ||
      (project?.name || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (draw.status || "").toLowerCase().includes(q);
  });

  const filteredPayments = payments.filter((payment) => {
    const project = projectMap[payment.linked_job_id];
    if (selectedCompanyScope !== "all" && !project) return false;
    const client = project ? clientMap[project.client_id] : null;
    const q = search.toLowerCase();
    return !q ||
      (project?.name || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (payment.payment_method || "").toLowerCase().includes(q) ||
      (payment.reference_number || "").toLowerCase().includes(q) ||
      (payment.notes || "").toLowerCase().includes(q) ||
      (payment.payment_date || "").toLowerCase().includes(q);
  });

  const filteredInvoices = invoices.filter((invoice) => {
    const project = projectMap[invoice.linked_job_id];
    if (selectedCompanyScope !== "all" && !project) return false;
    const client = project ? clientMap[project.client_id] : null;
    const q = search.toLowerCase();
    return !q ||
      (invoice.invoice_name || "").toLowerCase().includes(q) ||
      (invoice.invoice_type || "").toLowerCase().includes(q) ||
      (invoice.invoice_status || "").toLowerCase().includes(q) ||
      (project?.name || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q);
  });

  const paidAmount = filteredDraws.filter((d) => d.status === "paid").reduce((sum, d) => sum + (d.amount || 0), 0);
  const scheduledAmount = filteredDraws.reduce((sum, d) => sum + (d.amount || 0), 0);
  const receivedAmount = filteredPayments.reduce((sum, payment) => sum + (payment.amount_received || 0), 0);
  const outstandingAmount = scheduledAmount - receivedAmount;
  const paymentCount = filteredPayments.length;

  const openInvoiceDialog = (invoice = null) => {
    if (invoice) {
      setEditingInvoice(invoice);
      setInvoiceForm({
        linked_job_id: invoice.linked_job_id || "",
        invoice_name: invoice.invoice_name || "",
        invoice_type: invoice.invoice_type || "Progress Payment",
        amount: invoice.amount ?? "",
        due_date: invoice.due_date || "",
      });
    } else {
      setEditingInvoice(null);
      setInvoiceForm({
        linked_job_id: visibleProjects[0]?.id || "",
        invoice_name: "",
        invoice_type: "Progress Payment",
        amount: "",
        due_date: "",
      });
    }
    setInvoiceDialogOpen(true);
  };

  const handleInvoiceSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      invoice_id: editingInvoice?.invoice_id || `INV-${Date.now()}`,
      linked_job_id: invoiceForm.linked_job_id,
      invoice_name: invoiceForm.invoice_name,
      invoice_type: invoiceForm.invoice_type,
      amount: Number(invoiceForm.amount || 0),
      due_date: invoiceForm.due_date || null,
      notes: invoiceForm.notes || "",
      invoice_status: editingInvoice?.invoice_status || "Draft",
    };

    if (editingInvoice) {
      await base44.entities.Invoice.update(editingInvoice.id, payload);
    } else {
      await base44.entities.Invoice.create(payload);
    }

    await loadData();
    setInvoiceDialogOpen(false);
  };

  const handleMarkInvoiceSent = async (invoice) => {
    await base44.entities.Invoice.update(invoice.id, {
      invoice_status: "Sent",
      date_sent: new Date().toISOString().slice(0, 10),
    });
    await loadData();
  };

  const handleDeleteInvoice = async (invoice) => {
    await base44.entities.Invoice.delete(invoice.id);
    await loadData();
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Payments</h1>
          <p className="mt-1 text-slate-500">Track draw schedules and payment activity.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative w-full sm:min-w-[320px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payments and invoices..." className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => openInvoiceDialog()} disabled={visibleProjects.length === 0}>
            <Plus className="h-4 w-4" />
            Create Invoice
          </Button>
          <Button variant="outline" asChild>
            <Link to="/InvoiceDesigner">
              <Palette className="h-4 w-4" />
              Invoice Design
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Scheduled Draws", value: scheduledAmount, icon: DollarSign, tone: "text-slate-900" },
          { label: "Recorded Payments", value: receivedAmount, icon: CheckCircle2, tone: "text-emerald-700" },
          { label: "Outstanding", value: outstandingAmount, icon: AlertCircle, tone: "text-amber-700" },
          { label: "Payment Records", value: paymentCount, icon: Clock, tone: "text-blue-700", plain: true },
        ].map(({ label, value, icon: Icon, tone, plain }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-sm">{label}</span></div>
            <p className={cn("mt-2 text-2xl font-bold", tone)}>{plain ? value : `$${Number(value || 0).toLocaleString()}`}</p>
          </div>
        ))}
      </div>

<InvoicesTable
        invoices={filteredInvoices}
        projectMap={projectMap}
        clientMap={clientMap}
        companyMap={companyMap}
        onEdit={openInvoiceDialog}
        onMarkSent={handleMarkInvoiceSent}
        onDelete={handleDeleteInvoice}
      />

      <ReceivedPaymentsTable payments={filteredPayments} projectMap={projectMap} clientMap={clientMap} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Draw Schedule</h2>
          <p className="mt-1 text-sm text-slate-500">Planned project draws and their payment status.</p>
        </div>
        {filteredDraws.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <DollarSign className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium">No draws found</p>
            <p className="mt-1 text-sm">Project draw schedules will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Draw</th>
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3">Paid</th>
                </tr>
              </thead>
              <tbody>
                {filteredDraws.map((draw) => {
                  const project = projectMap[draw.project_id];
                  const client = project ? clientMap[project.client_id] : null;
                  return (
                    <tr key={draw.id} className="border-b border-slate-100 hover:bg-amber-50/40">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{draw.title}</p>
                        <p className="text-xs text-slate-400">Draw #{draw.draw_number || "—"}</p>
                      </td>
                      <td className="px-5 py-4">
                        {project ? (
                          <Link to={createPageUrl(`ProjectDetail?id=${project.id}&tab=cashflow`)} className="font-medium text-amber-700 hover:text-amber-800">
                            {project.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{client?.name || "—"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-900">${Number(draw.amount || 0).toLocaleString()}</td>
                      <td className="px-5 py-4 text-center">
                        <Badge className={cn("capitalize", statusStyles[draw.status] || statusStyles.pending)}>{draw.status || "pending"}</Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{draw.due_date || "—"}</td>
                      <td className="px-5 py-4 text-slate-500">{draw.paid_date || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Need to add or edit payment draws? Open any <Link to={createPageUrl("Projects")} className="font-semibold underline">project</Link> and use its <span className="font-semibold">Cash Flow</span> tab.
      </div>

      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        form={invoiceForm}
        projects={visibleProjects}
        onChange={(field, value) => setInvoiceForm((prev) => ({ ...prev, [field]: value }))}
        onSubmit={handleInvoiceSubmit}
        isEditing={Boolean(editingInvoice)}
      />
    </div>
  );
}