import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import moment from "moment";
import { createPageUrl } from "@/utils";

import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  DollarSign,
  Edit2,
  Trash2,
  LayoutGrid,
  TableProperties,
  Images,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Paperclip,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import { cn } from "@/lib/utils";
import ProjectSheetKeyboardView from "@/components/sheet/ProjectSheetKeyboardView";
import PhotoGallery from "@/components/projects/PhotoGallery";
import ClientWorkflowControl from "@/components/clients/ClientWorkflowControl";
import ProjectAISummary from "@/components/projects/ProjectAISummary";
import ProjectTimeline from "@/components/projects/ProjectTimeline";

import CommentSection from "@/components/collaboration/CommentSection";
import AttachmentSection from "@/components/collaboration/AttachmentSection";
import ProjectFiles from "@/components/projects/ProjectFiles";
import CashFlowTracker from "@/components/cashflow/CashFlowTracker";
import ProjectFinancials from "@/components/financials/ProjectFinancials";
import PermitTracker from "@/components/projects/PermitTracker";
import AITaskManager from "@/components/projects/AITaskManager";
import AppointmentsPanel from "@/components/scheduling/AppointmentsPanel";
import NextStepsPanel from "@/components/scheduling/NextStepsPanel";

const statusStyles = {
  planning: { label: "Planning", class: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In Progress", class: "bg-amber-100 text-amber-700" },
  on_hold: { label: "On Hold", class: "bg-rose-100 text-rose-700" },
  completed: { label: "Completed", class: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", class: "bg-slate-100 text-slate-500" },
};



export default function ProjectDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("id");
  const requestedTab = urlParams.get("tab");
  const taskId = urlParams.get("taskId");

  const MIN_DAY_PX = 6;
  const MAX_DAY_PX = 60;
  const DEFAULT_DAY_PX = 28;

  const [project, setProject] = useState(null);
  const [client, setClient] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [activeTab, setActiveTab] = useState(["overview", "timeline", "appointments", "permits", "sheet", "photos", "files", "collaboration", "cashflow", "financials"].includes(requestedTab) ? requestedTab : "overview");
  const [sheetRows, setSheetRows] = useState([]);
  const [aiSheetRows, setAiSheetRows] = useState(null); // rows pushed by AI to the sheet
  const [loading, setLoading] = useState(true);
  const [ganttZoom, setGanttZoom] = useState(DEFAULT_DAY_PX);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (projectId) loadData();
    loadCompanies();
  }, [projectId]);

  const loadCompanies = async () => {
    const data = await base44.entities.CompanyProfile.list("name", 200);
    setCompanies(data.filter((company) => company.is_active !== false));
  };

  const loadData = async () => {
    try {
      const proj = await base44.entities.Project.get(projectId);
      setProject(proj);
      setFormData(proj);

      if (proj?.client_id) {
        const clientData = await base44.entities.Client.get(proj.client_id);
        setClient(clientData);
      } else {
        setClient(null);
      }
    } catch (error) {
      console.error("Error loading project:", error);
      setProject(null);
      setClient(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    await base44.entities.Project.update(projectId, {
      ...formData,
      contract_value: parseFloat(formData.contract_value) || 0,
      costs_to_date: parseFloat(formData.costs_to_date) || 0,
      original_costs: parseFloat(formData.original_costs) || 0,
      amendment_costs: parseFloat(formData.amendment_costs) || 0,
      billed_to_date: parseFloat(formData.billed_to_date) || 0,
      percent_complete: formData.percent_complete || 0,
      sync_locked: true,
    });
    setIsEditDialogOpen(false);
    loadData();
  };

  const handleDeleteProject = async () => {
    if (confirm("Are you sure you want to delete this project?")) {
      await base44.entities.Project.delete(projectId);
      navigate(createPageUrl("Projects"));
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">Project not found</h2>
        <Link to={createPageUrl("Projects")} className="text-amber-600 hover:text-amber-700 mt-2 inline-block">
          Back to Projects
        </Link>
      </div>
    );
  }

  const status = statusStyles[project.status] || statusStyles.planning;

  return (
    <div className="min-h-screen">
    <div className="p-6 lg:p-8 max-w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Link
            to={createPageUrl("Projects")}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>
            <Badge className={cn("font-medium", status.class)}>{status.label}</Badge>
          </div>
          {(client || project.company_id) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {client && (
                <>
                  <Link
                    to={createPageUrl(`ClientDetail?id=${client.id}`)}
                    className="text-amber-600 hover:text-amber-700 font-medium"
                  >
                    {client.name}
                  </Link>
                  <ClientWorkflowControl client={client} onUpdated={loadData} />
                </>
              )}
              {project.company_id && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {companies.find((company) => company.id === project.company_id)?.name || "Company"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
            <Edit2 className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={handleDeleteProject}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "overview"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <LayoutGrid className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab("permits")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "permits"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <FileText className="w-4 h-4" />
          Permits
        </button>
        <button
          onClick={() => setActiveTab("sheet")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "sheet"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <TableProperties className="w-4 h-4" />
          Project Sheet
        </button>
        <button
           onClick={() => setActiveTab("timeline")}
           className={cn(
             "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
             activeTab === "timeline"
               ? "bg-white text-slate-900 shadow-sm"
               : "text-slate-500 hover:text-slate-700"
           )}
         >
           <Calendar className="w-4 h-4" />
           Timeline
         </button>
         <button
           onClick={() => setActiveTab("appointments")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "appointments"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Calendar className="w-4 h-4" />
            Appointments
          </button>
          <button
            onClick={() => setActiveTab("photos")}
           className={cn(
             "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
             activeTab === "photos"
               ? "bg-white text-slate-900 shadow-sm"
               : "text-slate-500 hover:text-slate-700"
           )}
         >
           <Images className="w-4 h-4" />
           Photos
         </button>
         <button
           onClick={() => setActiveTab("files")}
           className={cn(
             "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
             activeTab === "files"
               ? "bg-white text-slate-900 shadow-sm"
               : "text-slate-500 hover:text-slate-700"
           )}
         >
           <Paperclip className="w-4 h-4" />
           Files
         </button>
         <button
           onClick={() => setActiveTab("collaboration")}
           className={cn(
             "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
             activeTab === "collaboration"
               ? "bg-white text-slate-900 shadow-sm"
               : "text-slate-500 hover:text-slate-700"
           )}
         >
           <MessageSquare className="w-4 h-4" />
           Comments
         </button>
         <button
           onClick={() => setActiveTab("cashflow")}
           className={cn(
             "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
             activeTab === "cashflow"
               ? "bg-white text-slate-900 shadow-sm"
               : "text-slate-500 hover:text-slate-700"
           )}
         >
           <TrendingUp className="w-4 h-4" />
           Cash Flow
         </button>
         <button
           onClick={() => setActiveTab("financials")}
           className={cn(
             "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
             activeTab === "financials"
               ? "bg-white text-slate-900 shadow-sm"
               : "text-slate-500 hover:text-slate-700"
           )}
         >
           <BarChart3 className="w-4 h-4" />
           Financials
         </button>
        </div>

      {/* Timeline tab */}
       {activeTab === "timeline" && (
         <ProjectTimeline
           project={project}
           tasks={sheetRows
             .filter(r => !r.is_section_header && r.end_date)
             .map(r => ({
               id: r.id,
               name: r.task || r.section || "Unnamed",
               status: r.status === "Completed" ? "completed"
                 : r.status === "In Progress" ? "in_progress"
                 : r.status === "Blocked" ? "blocked"
                 : "not_started",
               end_date: r.end_date,
               start_date: r.start_date,
               assigned_to: r.assigned_to,
               description: r.notes,
             }))}
         />
       )}

       {/* Project Sheet tab — always mounted so AI updates apply even when on other tabs */}
       <div className={activeTab !== "sheet" ? "hidden" : ""}>
         <div className="relative">
           <ProjectSheetKeyboardView
             projectId={projectId}
             focusTaskId={taskId}
             externalGanttZoom={ganttZoom}
             onGanttZoomChange={setGanttZoom}
             onRowsChange={setSheetRows}
             externalRows={aiSheetRows}
           />
           <AITaskManager
             project={project}
             tasks={[]}
             sheetRows={sheetRows}
             onRefresh={loadData}
             onUpdateSheetRows={setAiSheetRows}
           />
         </div>
       </div>

       {activeTab === "appointments" && (
         <div className="grid gap-6 xl:grid-cols-2">
           <AppointmentsPanel
             title="Project Appointments"
             linkedClientId={project.client_id || ""}
             linkedProjectId={projectId}
             defaultLocation={project.address || ""}
           />
           <NextStepsPanel
             title="Project Follow-Up / Next Steps"
             linkedClientId={project.client_id || ""}
             linkedProjectId={projectId}
           />
         </div>
       )}

       {/* Permit tab */}
       {activeTab === "permits" && (
         <PermitTracker project={project} onProjectUpdated={loadData} />
       )}

       {/* Photos tab */}
       {activeTab === "photos" && (
         <PhotoGallery projectId={projectId} />
       )}

       {/* Financials tab */}
       {activeTab === "financials" && (
         <ProjectFinancials project={project} onUpdateProject={loadData} />
       )}

       {/* Cash Flow tab */}
       {activeTab === "cashflow" && (
         <CashFlowTracker
           projectId={projectId}
           contractValue={project.contract_value || 0}
           acculynxJobId={project.acculynx_job_id || ""}
           onProjectUpdated={loadData}
         />
       )}

       {/* Files tab */}
       {activeTab === "files" && (
         <ProjectFiles projectId={projectId} />
       )}

       {/* Collaboration tab */}
       {activeTab === "collaboration" && (
         <div className="bg-white rounded-2xl border border-slate-200 p-6">
           <CommentSection entityType="project" entityId={projectId} />
         </div>
       )}

      {/* Overview tab */}
      {activeTab === "overview" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Project Progress</h2>
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-500">Overall Completion</span>
                <span className="font-semibold text-slate-900">{project.percent_complete || 0}%</span>
              </div>
              <Progress value={project.percent_complete || 0} className="h-3" />
            </div>
            {project.description && (
              <p className="text-slate-600 text-sm leading-relaxed">{project.description}</p>
            )}
          </div>


        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Summary */}
          <ProjectAISummary project={project} tasks={sheetRows} client={client} />

          {/* Details Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Details</h2>
            {project.address && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-500">Location</p>
                  <p className="text-slate-900">{project.address}</p>
                </div>
              </div>
            )}
            {(project.start_date || project.end_date) && (
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-500">Timeline</p>
                  <p className="text-slate-900">
                    {project.start_date ? moment(project.start_date).format("MMM D, YYYY") : "TBD"} -{" "}
                    {project.end_date ? moment(project.end_date).format("MMM D, YYYY") : "TBD"}
                  </p>
                </div>
              </div>
            )}
            {project.project_manager && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-500">Project Manager</p>
                  <p className="text-slate-900">{project.project_manager}</p>
                </div>
              </div>
            )}
          </div>

          {/* Financials Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Financials</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Contract Value</span>
                <span className="font-semibold text-slate-900">${(project.contract_value || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Costs to Date</span>
                <span className="font-semibold text-slate-900">${(project.costs_to_date || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Billed to Date</span>
                <span className="font-semibold text-slate-900">${(project.billed_to_date || 0).toLocaleString()}</span>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Margin</span>
                  <span className="font-semibold text-emerald-600">
                    ${((project.billed_to_date || 0) - (project.costs_to_date || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>}

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateProject} className="space-y-4">
            <div>
              <Label>Project Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Company</Label>
              <Select value={formData.company_id || "__none__"} onValueChange={(v) => setFormData({ ...formData, company_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="No company" />
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
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v, ...(v === "completed" ? { percent_complete: 100 } : {}) })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Progress: {formData.percent_complete || 0}%</Label>
              <Slider
                value={[formData.percent_complete || 0]}
                onValueChange={([v]) => setFormData({ ...formData, percent_complete: v })}
                max={100}
                step={5}
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date || ""}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date || ""}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Contract Value ($)</Label>
              <Input
                type="number"
                value={formData.contract_value || ""}
                onChange={(e) => setFormData({ ...formData, contract_value: e.target.value })}
                className="mt-1.5"
              />
            </div>

            {/* Original Costs */}
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-100 pb-1">Original Costs</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Costs to Date ($)</Label>
                  <Input
                    type="number"
                    value={formData.costs_to_date || ""}
                    onChange={(e) => setFormData({ ...formData, costs_to_date: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Original Cost Budget ($)</Label>
                  <Input
                    type="number"
                    value={formData.original_costs || ""}
                    onChange={(e) => setFormData({ ...formData, original_costs: e.target.value })}
                    className="mt-1.5"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Amendment Costs */}
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 border-b border-slate-100 pb-1">Amendment Costs <span className="normal-case font-normal text-slate-400">(After Execution of Contract)</span></p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amendment Costs ($)</Label>
                  <Input
                    type="number"
                    value={formData.amendment_costs || ""}
                    onChange={(e) => setFormData({ ...formData, amendment_costs: e.target.value })}
                    className="mt-1.5"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label className="text-slate-500">Total Costs (auto)</Label>
                  <div className="mt-1.5 px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm text-slate-700 font-medium">
                    ${((parseFloat(formData.original_costs) || 0) + (parseFloat(formData.amendment_costs) || 0)).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Billed to Date ($)</Label>
              <Input
                type="number"
                value={formData.billed_to_date || ""}
                onChange={(e) => setFormData({ ...formData, billed_to_date: e.target.value })}
                className="mt-1.5"
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

  </div>
  );
}