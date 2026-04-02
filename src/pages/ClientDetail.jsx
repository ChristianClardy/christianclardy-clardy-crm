import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  Edit2,
  Trash2,
  Plus,
  FileBarChart2,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProjectCard from "@/components/projects/ProjectCard";
import ClientWorkflowControl from "@/components/clients/ClientWorkflowControl";
import AppointmentsPanel from "@/components/scheduling/AppointmentsPanel";
import NextStepsPanel from "@/components/scheduling/NextStepsPanel";
import ContactHistoryPanel from "@/components/crm/ContactHistoryPanel";
import { cn } from "@/lib/utils";

const statusStyles = {
  active: { label: "Active", class: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Inactive", class: "bg-slate-100 text-slate-600" },
  prospect: { label: "Prospect", class: "bg-blue-100 text-blue-700" },
};

const ESTIMATE_STATUS = {
  draft:    { label: "Draft",    className: "bg-slate-100 text-slate-600",    icon: Clock },
  sent:     { label: "Sent",     className: "bg-blue-100 text-blue-700",      icon: Send },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-700",     icon: XCircle },
  revised:  { label: "Revised",  className: "bg-amber-100 text-amber-700",   icon: RefreshCw },
};

export default function ClientDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("id");

  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (!clientId) return;

    loadData();
    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubClients = base44.entities.Client.subscribe(() => loadData());

    return () => {
      unsubProjects();
      unsubClients();
    };
  }, [clientId]);

  const loadData = async () => {
    try {
      const [clientData, projectsData, estimatesData] = await Promise.all([
        base44.entities.Client.get(clientId),
        base44.entities.Project.filter({ client_id: clientId }, "-created_date"),
        base44.entities.Estimate.filter({ client_id: clientId }, "-created_date"),
      ]);
      setClient(clientData);
      setFormData(clientData);
      setProjects(projectsData);
      setEstimates(estimatesData);
    } catch (error) {
      console.error("Error loading client:", error);
      setClient(null);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateClient = async (e) => {
    e.preventDefault();
    await base44.entities.Client.update(clientId, { ...formData, sync_locked: true });
    setIsEditDialogOpen(false);
    loadData();
  };

  const handleDeleteClient = async () => {
    if (confirm("Are you sure you want to delete this client? This will not delete associated projects.")) {
      await base44.entities.Client.delete(clientId);
      navigate(createPageUrl("Clients"));
    }
  };

  // Calculate WIP summary for this client
  const totalContractValue = projects.reduce((sum, p) => sum + (p.contract_value || 0), 0);
  const totalCosts = projects.reduce((sum, p) => sum + (p.costs_to_date || 0), 0);
  const totalBilled = projects.reduce((sum, p) => sum + (p.billed_to_date || 0), 0);
  const activeProjects = projects.filter((p) => p.status === "in_progress");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">Contact not found</h2>
        <Link to={createPageUrl("Clients")} className="text-amber-600 hover:text-amber-700 mt-2 inline-block">
          Back to Contacts
        </Link>
      </div>
    );
  }

  const status = statusStyles[client.status] || statusStyles.active;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Link
            to={createPageUrl("Clients")}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Contacts
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
                {client.name}
              </h1>
              {client.contact_person && (
                <p className="text-slate-500">{client.contact_person}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={cn("font-medium", status.class)}>{status.label}</Badge>
                <ClientWorkflowControl client={client} onUpdated={loadData} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(createPageUrl(`Calendar?mode=calendar&new=task&clientId=${clientId}`))}>
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
          <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={handleDeleteClient}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {client.email && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Mail className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <a href={`mailto:${client.email}`} className="text-slate-900 hover:text-amber-600">
                  {client.email}
                </a>
              </div>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Phone className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Phone</p>
                <a href={`tel:${client.phone}`} className="text-slate-900 hover:text-amber-600">
                  {client.phone}
                </a>
              </div>
            </div>
          )}
          {client.address && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Address</p>
                <p className="text-slate-900">{client.address}</p>
              </div>
            </div>
          )}
        </div>
        {client.notes && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-medium text-slate-500 mb-2">Notes</h3>
            <p className="text-slate-700">{client.notes}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AppointmentsPanel title="Appointments" linkedClientId={clientId} />
        <NextStepsPanel title="Follow-Up / Next Steps" linkedClientId={clientId} />
      </div>

      <ContactHistoryPanel
        title="Communication & History"
        contactName={client.name || ""}
        linkedLeadId={client.linked_lead_id || ""}
        linkedClientId={clientId}
        sourceEntity="client"
      />

      {/* WIP Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart2 className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-900">WIP Summary</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-sm text-slate-500">Active Projects</p>
            <p className="text-2xl font-bold text-slate-900">{activeProjects.length}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-sm text-slate-500">Total Contract Value</p>
            <p className="text-2xl font-bold text-slate-900">${(totalContractValue / 1000).toFixed(0)}K</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-sm text-slate-500">Costs to Date</p>
            <p className="text-2xl font-bold text-slate-900">${(totalCosts / 1000).toFixed(0)}K</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-sm text-slate-500">Billed to Date</p>
            <p className="text-2xl font-bold text-emerald-600">${(totalBilled / 1000).toFixed(0)}K</p>
          </div>
        </div>
      </div>

      {/* Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Projects ({projects.length})</h2>
          <Button
            onClick={() => navigate(createPageUrl("Projects") + "?new=true")}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Project
          </Button>
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} client={client} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">No projects for this contact yet</p>
          </div>
        )}
      </div>

      {/* Estimates */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Estimates ({estimates.length})</h2>
          <Button
            size="sm"
            onClick={() => navigate(createPageUrl(`EstimateDetail?new=true&client_id=${clientId}`))}
          >
            <Plus className="w-4 h-4 mr-1" />
            New Estimate
          </Button>
        </div>
        {estimates.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-2.5 text-left">Estimate #</th>
                  <th className="px-5 py-2.5 text-left">Title</th>
                  <th className="px-5 py-2.5 text-left">Issue Date</th>
                  <th className="px-5 py-2.5 text-right">Total</th>
                  <th className="px-5 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map(est => {
                  const st = ESTIMATE_STATUS[est.status] || ESTIMATE_STATUS.draft;
                  const Icon = st.icon;
                  return (
                    <tr
                      key={est.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-amber-50/40 cursor-pointer transition-colors"
                      onClick={() => navigate(createPageUrl(`EstimateDetail?id=${est.id}`))}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{est.estimate_number || "—"}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{est.title}</td>
                      <td className="px-5 py-3 text-slate-500">{est.issue_date || "—"}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">
                        ${Number(est.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full", st.className)}>
                          <Icon className="w-3 h-3" /> {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No estimates for this contact yet</p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateClient} className="space-y-4">
            <div>
              <Label>Company Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input
                value={formData.contact_person || ""}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status || "active"} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500">
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}