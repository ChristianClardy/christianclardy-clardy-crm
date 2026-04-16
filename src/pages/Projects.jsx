import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  CalendarDays,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectCard from "@/components/projects/ProjectCard";
import TimelineChart from "@/components/timeline/TimelineChart";
import ProjectCalendarView from "@/components/projects/ProjectCalendarView";
import TemplatePicker from "@/components/projects/TemplatePicker";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";
import { cn } from "@/lib/utils";

export default function Projects() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const [isDialogOpen, setIsDialogOpen] = useState(urlParams.get("new") === "true");
  const [selectedTemplate, setSelectedTemplate] = useState(null); // { type, template }

  const [formData, setFormData] = useState({
    name: "",
    client_id: "",
    description: "",
    status: "planning",
    start_date: "",
    end_date: "",
    contract_value: "",
    project_manager: "",
    address: "",
    project_type: "residential",
    company_id: selectedCompanyScope !== "all" ? selectedCompanyScope : "",
    });

  const [employees, setEmployees] = useState([]);
  const [newClientMode, setNewClientMode] = useState(false);
  const [newClientFirstName, setNewClientFirstName] = useState("");
  const [newClientLastName, setNewClientLastName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  useEffect(() => {
    loadData();

    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubClients = base44.entities.Client.subscribe(() => loadData());
    const unsubScope = subscribeToCompanyScope(setSelectedCompanyScope);

    return () => {
      unsubProjects();
      unsubClients();
      unsubScope();
    };
  }, []);

  const loadData = async () => {
    try {
      const [projectsData, clientsData, templatesData, employeesData, companiesData] = await Promise.all([
        base44.entities.Project.list("-created_date"),
        base44.entities.Client.list(),
        base44.entities.ProjectSheetTemplate.list(),
        base44.entities.Employee.list(),
        base44.entities.CompanyProfile.list("name", 200),
      ]);
      setProjects(projectsData);
      setClients(clientsData);
      setTemplates(templatesData);
      setEmployees(employeesData);
      setCompanies(companiesData.filter((company) => company.is_active !== false));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const clientMap = clients.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
  const visibleProjects = selectedCompanyScope === "all"
    ? projects
    : projects.filter((project) => project.company_id === selectedCompanyScope);

  const filteredProjects = visibleProjects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clientMap[project.client_id]?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    let clientId = formData.client_id;
    if (newClientMode) {
      if (!newClientFirstName.trim()) return;
      const fullName = [newClientFirstName, newClientLastName].filter(Boolean).join(" ").trim();
      const created = await base44.entities.Client.create({ first_name: newClientFirstName.trim(), last_name: newClientLastName.trim(), name: fullName, email: newClientEmail, phone: newClientPhone, status: "active", sync_locked: true });
      clientId = created.id;
      setClients(prev => [...prev, created]);
    }

    const data = {
      ...formData,
      client_id: clientId,
      contract_value: formData.contract_value ? parseFloat(formData.contract_value) : 0,
      sync_locked: true,
    };
    const newProject = await base44.entities.Project.create(data);
    
    // If a template is selected, create a project sheet from it
    if (selectedTemplate) {
      let rows = [];
      if (selectedTemplate.type === "saved") {
        rows = selectedTemplate.template.rows || [];
      } else if (selectedTemplate.type === "ai") {
        rows = selectedTemplate.template.rows || [];
      }
      if (rows.length) {
        await base44.entities.ProjectSheet.create({
          project_id: newProject.id,
          rows,
        });
      }
    }
    
    setIsDialogOpen(false);
    setFormData({
      name: "",
      client_id: "",
      description: "",
      status: "planning",
      start_date: "",
      end_date: "",
      contract_value: "",
      project_manager: "",
      address: "",
      project_type: "residential",
      company_id: selectedCompanyScope !== "all" ? selectedCompanyScope : "",
    });
    setSelectedTemplate(null);
    setNewClientMode(false);
    setNewClientName("");
    setNewClientEmail("");
    setNewClientPhone("");
    navigate(createPageUrl(`ProjectDetail?id=${newProject.id}`));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Projects
          </h1>
          <p className="text-slate-500 mt-1">
            {filteredProjects.length} total projects
          </p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-orange-500/25"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-slate-200 rounded-xl h-11"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-white border-slate-200 rounded-xl h-11">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList className="bg-slate-100">
            <TabsTrigger value="grid" className="data-[state=active]:bg-white">
              <LayoutGrid className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-white">
              <Calendar className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="calendar" className="data-[state=active]:bg-white">
              <CalendarDays className="w-4 h-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {viewMode === "grid" ? (
        filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                client={clientMap[project.client_id]}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <h3 className="font-semibold text-slate-900 mb-2">No projects found</h3>
            <p className="text-slate-500 mb-4">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first project to get started"}
            </p>
          </div>
        )
      ) : viewMode === "timeline" ? (
        <TimelineChart
          projects={filteredProjects}
          onProjectClick={(project) => navigate(createPageUrl(`ProjectDetail?id=${project.id}`))}
        />
      ) : (
        <ProjectCalendarView
          projects={filteredProjects}
          clientMap={clientMap}
        />
      )}

      {/* New Project Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Project Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Company</Label>
              <Select value={formData.company_id || "__none__"} onValueChange={(value) => setFormData({ ...formData, company_id: value === "__none__" ? "" : value })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No company</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Contact *</Label>
                <button type="button" onClick={() => { setNewClientMode(m => !m); setFormData(f => ({ ...f, client_id: "" })); }}
                  className="text-xs text-amber-600 hover:underline">
                  {newClientMode ? "← Select existing contact" : "+ Create new contact"}
                </button>
              </div>
              {newClientMode ? (
                <div className="space-y-2 border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="First name *" value={newClientFirstName} onChange={e => setNewClientFirstName(e.target.value)} required className="bg-white" />
                    <Input placeholder="Last name" value={newClientLastName} onChange={e => setNewClientLastName(e.target.value)} className="bg-white" />
                  </div>
                  <Input placeholder="Email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} className="bg-white" />
                  <Input placeholder="Phone" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} className="bg-white" />
                </div>
              ) : (
                <Select
                  value={formData.client_id}
                  onValueChange={(value) => {
                    const client = clients.find(c => c.id === value);
                    setFormData(f => ({
                      ...f,
                      client_id: value,
                      description: f.description || client?.notes || "",
                      address: f.address || client?.address || "",
                    }));
                  }}
                >
                  <SelectTrigger className="mt-0">
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Description</Label>
                {!newClientMode && formData.client_id && clientMap[formData.client_id]?.notes && (
                  <button type="button" onClick={() => setFormData(f => ({ ...f, description: clientMap[formData.client_id].notes }))}
                    className="text-xs text-amber-600 hover:underline">Autofill from contact</button>
                )}
              </div>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-0"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Project Type</Label>
                <Select
                  value={formData.project_type}
                  onValueChange={(value) => setFormData({ ...formData, project_type: value })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="renovation">Renovation</SelectItem>
                    <SelectItem value="new_construction">New Construction</SelectItem>
                    <SelectItem value="infrastructure">Infrastructure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Contract Value ($)</Label>
              <Input
                type="number"
                value={formData.contract_value}
                onChange={(e) => setFormData({ ...formData, contract_value: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Project Manager</Label>
              {employees.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  <Select
                    value={employees.some(e => e.full_name === formData.project_manager) ? formData.project_manager : "__custom__"}
                    onValueChange={(value) => {
                      if (value !== "__custom__") setFormData(f => ({ ...f, project_manager: value }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select or type below" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === "active").map(e => (
                        <SelectItem key={e.id} value={e.full_name}>{e.full_name} — {e.role}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Type manually…</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={formData.project_manager}
                    onChange={(e) => setFormData(f => ({ ...f, project_manager: e.target.value }))}
                    placeholder="Or type a name"
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <Input
                  value={formData.project_manager}
                  onChange={(e) => setFormData({ ...formData, project_manager: e.target.value })}
                  className="mt-1.5"
                />
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Project Address</Label>
                {!newClientMode && formData.client_id && clientMap[formData.client_id]?.address && (
                  <button type="button" onClick={() => setFormData(f => ({ ...f, address: clientMap[formData.client_id].address }))}
                    className="text-xs text-amber-600 hover:underline">Use contact address</button>
                )}
              </div>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="mt-0"
              />
            </div>
            <div>
              <Label>Project Sheet Template (Optional)</Label>
              <TemplatePicker
                savedTemplates={templates}
                onSelect={setSelectedTemplate}
                selectedLabel={
                  selectedTemplate?.type === "saved"
                    ? selectedTemplate.template.name
                    : selectedTemplate?.type === "ai"
                    ? `AI: ${selectedTemplate.template.label}`
                    : null
                }
                onClear={() => setSelectedTemplate(null)}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                Create Project
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}