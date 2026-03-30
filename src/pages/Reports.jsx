import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import {
  FileText, Loader2, Download, RefreshCw, ChevronDown, ChevronUp,
  CheckSquare, Square, Sparkles, Calendar, BarChart3, AlertTriangle,
  TrendingUp, ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const SECTIONS = [
  { key: "progress", label: "Progress & Completion", icon: BarChart3 },
  { key: "financials", label: "Financial Summary", icon: TrendingUp },
  { key: "risks", label: "Risks & Issues", icon: AlertTriangle },
  { key: "milestones", label: "Upcoming Milestones", icon: Calendar },
  { key: "tasks", label: "Task Status", icon: ClipboardList },
];

export default function Reports() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Config
  const [selectedProject, setSelectedProject] = useState("all");
  const [frequency, setFrequency] = useState("weekly");
  const [enabledSections, setEnabledSections] = useState({
    progress: true, financials: true, risks: true, milestones: true, tasks: true,
  });
  const [tone, setTone] = useState("professional");

  // Report output
  const [report, setReport] = useState(null);
  const [reportMeta, setReportMeta] = useState(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, c] = await Promise.all([
      base44.entities.Project.list("-created_date", 100),
      base44.entities.Client.list("-created_date", 100),
    ]);
    setProjects(p);
    setClients(c);
    setLoading(false);
  };

  const clientMap = clients.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});

  const toggleSection = (key) => {
    setEnabledSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const generateReport = async () => {
    setGenerating(true);
    setReport(null);

    const targetProjects = selectedProject === "all"
      ? projects.filter(p => p.status !== "cancelled")
      : projects.filter(p => p.id === selectedProject);

    // Fetch tasks & sheets for selected projects
    const projectDetails = await Promise.all(
      targetProjects.map(async (proj) => {
        const [tasks, sheets] = await Promise.all([
          base44.entities.Task.filter({ project_id: proj.id }),
          base44.entities.ProjectSheet.filter({ project_id: proj.id }),
        ]);
        const client = clientMap[proj.client_id];
        const sheet = sheets[0];
        const sheetRows = sheet?.rows?.filter(r => !r.is_section_header) || [];
        const overdueTasks = sheetRows.filter(r => r.end_date && moment(r.end_date).isBefore(moment(), "day") && r.status !== "completed");
        const upcomingTasks = sheetRows.filter(r => r.end_date && moment(r.end_date).isBetween(moment(), moment().add(14, "days"), "day", "[]") && r.status !== "completed");

        return {
          name: proj.name,
          client: client?.name || "Unknown",
          status: proj.status,
          percentComplete: proj.percent_complete || 0,
          startDate: proj.start_date,
          endDate: proj.end_date,
          contractValue: proj.contract_value || 0,
          costsToDate: proj.costs_to_date || 0,
          billedToDate: proj.billed_to_date || 0,
          amendmentCosts: proj.amendment_costs || 0,
          grossMargin: (proj.billed_to_date || 0) - (proj.costs_to_date || 0),
          projectManager: proj.project_manager,
          tasks: {
            total: tasks.length,
            completed: tasks.filter(t => t.status === "completed").length,
            inProgress: tasks.filter(t => t.status === "in_progress").length,
            blocked: tasks.filter(t => t.status === "blocked").length,
          },
          overdueTasks: overdueTasks.map(r => ({ name: r.task || r.section, due: r.end_date, daysOverdue: moment().diff(moment(r.end_date), "days") })),
          upcomingMilestones: upcomingTasks.map(r => ({ name: r.task || r.section, due: r.end_date, daysLeft: moment(r.end_date).diff(moment(), "days") })),
        };
      })
    );

    const activeSections = Object.keys(enabledSections).filter(k => enabledSections[k]);
    const periodLabel = frequency === "weekly" ? "this week" : "this month";
    const reportDate = moment().format("MMMM D, YYYY");

    const prompt = `
You are a professional construction project manager generating a ${frequency} status report dated ${reportDate}.

Report scope: ${selectedProject === "all" ? "All active projects" : targetProjects[0]?.name}
Tone: ${tone}
Sections to include: ${activeSections.join(", ")}

PROJECT DATA:
${JSON.stringify(projectDetails, null, 2)}

Generate a well-structured ${frequency} construction project status report. Use clear headings with markdown (## for sections, ### for subsections).

Include only these sections (in order): ${activeSections.map(s => SECTIONS.find(sec => sec.key === s)?.label).join(", ")}.

For each section:
${activeSections.includes("progress") ? "- Progress: Summarize overall completion %, timeline status (on track / behind / ahead), and key accomplishments." : ""}
${activeSections.includes("financials") ? "- Financials: Contract value, costs to date, billed to date, gross margin. Flag any budget concerns." : ""}
${activeSections.includes("risks") ? "- Risks: List overdue tasks, blocked items, budget overruns, or timeline concerns with severity (High/Medium/Low)." : ""}
${activeSections.includes("milestones") ? "- Milestones: List tasks due in the next 14 days with their due dates and assigned team members." : ""}
${activeSections.includes("tasks") ? "- Tasks: Breakdown of task statuses and any notable blockers." : ""}

End with a brief executive summary paragraph (2-3 sentences).
Keep it concise, professional, and actionable. Use bullet points where appropriate.
`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    setReport(result);
    setReportMeta({
      date: reportDate,
      frequency,
      projectLabel: selectedProject === "all" ? "All Projects" : targetProjects[0]?.name,
      sections: activeSections,
    });
    setExpanded(true);
    setGenerating(false);
  };

  const handleDownload = () => {
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${reportMeta?.projectLabel?.replace(/\s+/g, "-").toLowerCase()}-${moment().format("YYYY-MM-DD")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "#f5f0eb" }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#b5965a" }} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8" style={{ backgroundColor: "#f5f0eb", minHeight: "100vh" }}>
      {/* Header */}
      <div>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.18em" }}>AI-Powered</p>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Project Reports</h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-px w-8" style={{ backgroundColor: "#b5965a" }} />
          <p className="text-sm" style={{ color: "#7a6e66" }}>Generate automated status reports using AI based on live project data.</p>
        </div>
      </div>

      <div className="h-px" style={{ backgroundColor: "#ddd5c8" }} />

      {/* Config Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <h2 className="text-base font-semibold" style={{ color: "#3d3530" }}>Report Configuration</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Project */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Project</Label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active Projects</SelectItem>
                {projects.filter(p => p.status !== "cancelled").map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly Report</SelectItem>
                <SelectItem value="monthly">Monthly Report</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tone */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="concise">Concise & Brief</SelectItem>
                <SelectItem value="detailed">Detailed & Thorough</SelectItem>
                <SelectItem value="executive">Executive Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Section Toggles */}
        <div>
          <Label className="text-xs uppercase tracking-wide text-slate-500 mb-3 block">Include Sections</Label>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => toggleSection(key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                  enabledSections[key]
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                )}
              >
                {enabledSections[key]
                  ? <CheckSquare className="w-3.5 h-3.5" />
                  : <Square className="w-3.5 h-3.5" />}
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={generateReport}
            disabled={generating || Object.values(enabledSections).every(v => !v)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 disabled:opacity-50"
            style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.backgroundColor = "#b5965a"; }}
            onMouseLeave={e => { if (!generating) e.currentTarget.style.backgroundColor = "#3d3530"; }}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? "Generating Report..." : "Generate Report"}
          </button>
        </div>
      </div>

      {/* Report Output */}
      {report && reportMeta && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Report Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100" style={{ backgroundColor: "#faf8f5" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#b5965a" }}>
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">
                  {reportMeta.frequency === "weekly" ? "Weekly" : "Monthly"} Report — {reportMeta.projectLabel}
                </p>
                <p className="text-xs text-slate-500">{reportMeta.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
              <Button variant="outline" size="sm" onClick={generateReport} disabled={generating}>
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", generating && "animate-spin")} />
                Regenerate
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Report Body */}
          {expanded && (
            <div className="px-8 py-6">
              <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-slate-100
                [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-4 [&_h3]:mb-1.5
                [&_ul]:my-2 [&_ul]:ml-4 [&_ul]:list-disc
                [&_li]:my-0.5
                [&_p]:my-2 [&_p]:leading-relaxed
                [&_strong]:text-slate-900
              ">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!report && !generating && (
        <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#f5f0eb", border: "1px solid #ddd5c8" }}>
            <Sparkles className="w-6 h-6" style={{ color: "#b5965a" }} />
          </div>
          <p className="font-semibold mb-1" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>No report generated yet</p>
          <p className="text-sm" style={{ color: "#7a6e66" }}>Configure your settings above and click Generate Report.</p>
        </div>
      )}
    </div>
  );
}