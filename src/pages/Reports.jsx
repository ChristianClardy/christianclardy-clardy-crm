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
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString()}`;
}

// Assembles the same sections an AI report used to write prose for, straight
// from projectDetails — deterministic and free, since every number in here
// was already computed without AI; only the write-up used to be AI-generated.
function buildReportText(projectDetails, { frequency, reportDate, periodLabel, activeSections, scopeLabel }) {
  const lines = [];
  lines.push(`# ${frequency === "weekly" ? "Weekly" : "Monthly"} Construction Status Report`);
  lines.push(`**${scopeLabel}** — ${reportDate}`);
  lines.push("");

  for (const proj of projectDetails) {
    lines.push("---");
    lines.push(`## ${proj.name}`);
    lines.push(`*Client: ${proj.client} · Status: ${proj.status || "—"} · Project Manager: ${proj.projectManager || "Not assigned"}*`);
    lines.push("");

    if (activeSections.includes("progress")) {
      lines.push("### Progress & Completion");
      lines.push(`- **${proj.percentComplete}%** complete`);
      lines.push(`- Timeline: ${proj.startDate ? moment(proj.startDate).format("MMM D, YYYY") : "TBD"} → ${proj.endDate ? moment(proj.endDate).format("MMM D, YYYY") : "TBD"}`);
      lines.push("");
    }

    if (activeSections.includes("financials")) {
      lines.push("### Financial Summary");
      lines.push(`- Contract Value: ${fmtMoney(proj.contractValue)}`);
      lines.push(`- Costs to Date: ${fmtMoney(proj.costsToDate)}`);
      lines.push(`- Billed to Date: ${fmtMoney(proj.billedToDate)}`);
      lines.push(`- Gross Margin: ${fmtMoney(proj.grossMargin)}`);
      lines.push("");
    }

    if (activeSections.includes("risks")) {
      lines.push("### Risks & Issues");
      if (proj.overdueTasks.length) {
        proj.overdueTasks.forEach(t => lines.push(`- **${t.name}** — due ${t.due ? moment(t.due).format("MMM D") : "—"}, ${t.daysOverdue} day${t.daysOverdue === 1 ? "" : "s"} overdue`));
      } else {
        lines.push("- No overdue items.");
      }
      lines.push("");
    }

    if (activeSections.includes("milestones")) {
      lines.push("### Upcoming Milestones");
      if (proj.upcomingMilestones.length) {
        proj.upcomingMilestones.forEach(t => lines.push(`- ${t.name} — due ${t.due ? moment(t.due).format("MMM D") : "—"} (${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"})`));
      } else {
        lines.push(`- Nothing due ${periodLabel}.`);
      }
      lines.push("");
    }

    if (activeSections.includes("tasks")) {
      lines.push("### Task Status");
      lines.push(`- Total: ${proj.tasks.total} · Completed: ${proj.tasks.completed} · In Progress: ${proj.tasks.inProgress} · Blocked: ${proj.tasks.blocked}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("## Summary");
  const withOverdue = projectDetails.filter(p => p.overdueTasks.length > 0).length;
  const avgComplete = projectDetails.length
    ? Math.round(projectDetails.reduce((sum, p) => sum + (p.percentComplete || 0), 0) / projectDetails.length)
    : 0;
  lines.push(`- ${projectDetails.length} project${projectDetails.length === 1 ? "" : "s"} in this report, averaging ${avgComplete}% complete.`);
  lines.push(withOverdue
    ? `- ${withOverdue} project${withOverdue === 1 ? " has" : "s have"} overdue items needing attention.`
    : "- No projects have overdue items.");

  return lines.join("\n");
}

const SECTIONS = [
  { key: "progress", label: "Progress & Completion", icon: BarChart3 },
  { key: "financials", label: "Financial Summary", icon: TrendingUp },
  { key: "risks", label: "Risks & Issues", icon: AlertTriangle },
  { key: "milestones", label: "Upcoming Milestones", icon: Calendar },
  { key: "tasks", label: "Task Status", icon: ClipboardList },
];

export default function Reports() {
  const companyScope = useCompanyScope();
  const [projectsRaw, setProjects] = useState([]);
  const [clientsRaw, setClients] = useState([]);
  const projects = scopeFilter(projectsRaw, companyScope);
  const clients = scopeFilter(clientsRaw, companyScope);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Config
  const [selectedProject, setSelectedProject] = useState("all");
  const [frequency, setFrequency] = useState("weekly");
  const [enabledSections, setEnabledSections] = useState({
    progress: true, financials: true, risks: true, milestones: true, tasks: true,
  });
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
    const scopeLabel = selectedProject === "all" ? "All Active Projects" : targetProjects[0]?.name;

    try {
      const result = buildReportText(projectDetails, { frequency, reportDate, periodLabel, activeSections, scopeLabel });
      setReport(result);
      setReportMeta({
        date: reportDate,
        frequency,
        projectLabel: scopeLabel,
        sections: activeSections,
      });
      setExpanded(true);
    } catch (err) {
      console.error("Failed to generate report:", err?.message);
      alert("Could not generate the report. Please try again.");
    } finally {
      setGenerating(false);
    }
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
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Project Reports</h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-px w-8" style={{ backgroundColor: "#b5965a" }} />
          <p className="text-sm" style={{ color: "#7a6e66" }}>Generate status reports straight from live project data.</p>
        </div>
      </div>

      <div className="h-px" style={{ backgroundColor: "#ddd5c8" }} />

      {/* Config Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <h2 className="text-base font-semibold" style={{ color: "#3d3530" }}>Report Configuration</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <FileText className="w-4 h-4" />
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