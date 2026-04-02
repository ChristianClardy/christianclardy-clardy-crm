import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  FolderKanban, 
  Plus,
  ArrowRight,
  GanttChart,
  LayoutList,
  Users,
  Receipt,
  DollarSign,
  Paperclip,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import ProjectCard from "@/components/projects/ProjectCard";
import TimelineChart from "@/components/timeline/TimelineChart";
import DeadlineAlerts from "@/components/dashboard/DeadlineAlerts";
import DashboardGantt from "@/components/dashboard/DashboardGantt";
import KPIGrid from "@/components/dashboard/KPIGrid";
import ProjectStatusChart from "@/components/dashboard/ProjectStatusChart";
import PriorityQueuePanel from "@/components/dashboard/PriorityQueuePanel";
import QuickNotes from "@/components/notes/QuickNotes";
import TaskDeadlinePanel from "@/components/dashboard/TaskDeadlinePanel";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const unsubScope = subscribeToCompanyScope(setSelectedCompanyScope);
    return () => unsubScope();
  }, []);

  const loadData = async () => {
    const [projectsData, clientsData, sheetsData] = await Promise.all([
      base44.entities.Project.list("-created_date", 50),
      base44.entities.Client.list("-created_date", 50),
      base44.entities.ProjectSheet.list("-created_date", 100),
    ]);

    // Build a map of project_id -> sheet dates derived from rows
    const sheetDatesByProject = {};
    for (const sheet of sheetsData) {
      // SDK may return fields at top level or nested under .data
      const projectId = sheet.project_id ?? sheet.data?.project_id;
      const rows = sheet.rows ?? sheet.data?.rows;
      if (!projectId || !rows?.length) continue;
      const dates = rows
        .filter(r => !r.is_section_header)
        .flatMap(r => [r.start_date, r.end_date].filter(d => d && d.trim() !== ""));
      if (!dates.length) continue;
      const sorted = [...dates].sort();
      sheetDatesByProject[projectId] = {
        start_date: sorted[0],
        end_date: sorted[sorted.length - 1],
      };
    }

    // Enrich projects: if a project sheet exists, override start/end dates from it
    const enriched = projectsData.map(p => {
      const sheetDates = sheetDatesByProject[p.id];
      if (sheetDates) {
        return { ...p, start_date: sheetDates.start_date, end_date: sheetDates.end_date };
      }
      return p;
    });

    setProjects(enriched);
    setClients(clientsData);
    setSheets(sheetsData);
    setLoading(false);
  };

  const clientMap = clients.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
  const visibleProjects = selectedCompanyScope === "all"
    ? projects
    : projects.filter((project) => project.company_id === selectedCompanyScope);

  const recentProjects = visibleProjects.slice(0, 4);
  const timelineProjects = visibleProjects.filter(p => p.start_date);
  const [timelineView, setTimelineView] = useState("gantt"); // "gantt" | "bars"
  const [notesOpen, setNotesOpen] = useState(true);
  const featureCards = [
    { title: "Lead Pipeline", description: "Prospects and workflow stages", href: createPageUrl("CRM?tab=prospects"), icon: Users },
    { title: "Estimate Tracking", description: "Quotes, status, and totals", href: createPageUrl("Estimates"), icon: Receipt },
    { title: "Project Tracker", description: "Schedules, progress, and status", href: createPageUrl("Projects"), icon: FolderKanban },
    { title: "Payment Tracker", description: "Draws, approvals, and paid amounts", href: createPageUrl("Payments"), icon: DollarSign },
    { title: "Document Storage", description: "Project and task files", href: createPageUrl("Documents"), icon: Paperclip },
    { title: "Task Dashboard", description: "Personal and assigned task view", href: createPageUrl("MyTodos"), icon: CheckSquare },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "#f5f0eb" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#b5965a", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="relative p-6 lg:p-10 max-w-7xl mx-auto space-y-10" style={{ backgroundColor: "#f5f0eb" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.18em" }}>Overview</p>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Dashboard</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-px w-8" style={{ backgroundColor: "#b5965a" }} />
            <p className="text-sm" style={{ color: "#7a6e66" }}>Welcome back. Here's your project overview.</p>
          </div>
        </div>
        <button
          onClick={() => navigate(createPageUrl("Projects") + "?new=true")}
          className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold tracking-wide transition-all duration-200"
          style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "#b5965a"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "#3d3530"}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ backgroundColor: "#ddd5c8" }} />

      {/* KPI Grid */}
      <KPIGrid projects={visibleProjects} clients={clients} />

      <PriorityQueuePanel />

      <TaskDeadlinePanel sheets={sheets} projects={visibleProjects} />

      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Integrated Workflows</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={title}
              to={href}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium" style={{ color: "#b5965a" }}>
                Open <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Status Chart + Deadline Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ProjectStatusChart projects={visibleProjects} />
        </div>
        <div className="lg:col-span-2">
          <DeadlineAlerts projects={visibleProjects} />
        </div>
      </div>

      {/* Timeline / Gantt Section */}
      {timelineProjects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Project Timeline</h2>
            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-all font-medium ${timelineView === "gantt" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  onClick={() => setTimelineView("gantt")}
                >
                  <GanttChart className="w-3.5 h-3.5" /> Gantt
                </button>
                <button
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-all font-medium ${timelineView === "bars" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  onClick={() => setTimelineView("bars")}
                >
                  <LayoutList className="w-3.5 h-3.5" /> Bars
                </button>
              </div>
              <Link 
                to={createPageUrl("Projects")}
                className="flex items-center gap-1 text-sm font-medium transition-colors"
                style={{ color: "#b5965a" }}
              >
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          {timelineView === "gantt" ? (
            <DashboardGantt projects={timelineProjects} clientMap={clientMap} />
          ) : (
            <TimelineChart 
              projects={timelineProjects}
              onProjectClick={(project) => navigate(createPageUrl(`ProjectDetail?id=${project.id}`))}
            />
          )}
        </div>
      )}

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Recent Projects</h2>
          <Link 
            to={createPageUrl("Projects")}
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: "#b5965a" }}
          >
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        {recentProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentProjects.map((project) => (
              <ProjectCard 
                key={project.id} 
                project={project}
                client={clientMap[project.client_id] || { name: "Unknown Client" }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded p-12 text-center" style={{ backgroundColor: "#fff", border: "1px solid #ddd5c8" }}>
            <div className="w-14 h-14 rounded flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#f5f0eb", border: "1px solid #ddd5c8" }}>
              <FolderKanban className="w-7 h-7" style={{ color: "#b5965a" }} />
            </div>
            <h3 className="font-semibold mb-1" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>No projects yet</h3>
            <p className="text-sm mb-5" style={{ color: "#7a6e66" }}>Create your first project to get started</p>
            <button
              onClick={() => navigate(createPageUrl("Projects") + "?new=true")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold tracking-wide transition-all duration-200"
              style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#b5965a"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "#3d3530"}
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        )}
      </div>

      <div className="fixed right-0 top-24 z-20 flex items-start">
        <button
          onClick={() => setNotesOpen(!notesOpen)}
          className="mt-6 flex items-center gap-2 rounded-l-xl border border-r-0 border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-600 shadow-sm hover:text-slate-900"
        >
          {notesOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Quick Notes</span>
        </button>

        {notesOpen && (
          <div className="w-[320px] max-w-[85vw] rounded-l-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <QuickNotes completedHideAfterHours={24} />
          </div>
        )}
      </div>
    </div>
  );
}