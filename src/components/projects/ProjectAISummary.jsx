import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import moment from "moment";

export default function ProjectAISummary({ project, tasks, client }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const generateSummary = async () => {
    setLoading(true);
    setSummary(null);

    const completedTasks = tasks.filter((t) => t.status === "completed");
    const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
    const blockedTasks = tasks.filter((t) => t.status === "blocked");
    const upcomingTasks = tasks
      .filter((t) => t.status !== "completed" && t.end_date)
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 3);

    const grossMargin = (project.billed_to_date || 0) - (project.costs_to_date || 0);
    const budgetUsed = project.contract_value
      ? Math.round(((project.costs_to_date || 0) / project.contract_value) * 100)
      : null;

    const daysToEnd = project.end_date
      ? moment(project.end_date).diff(moment(), "days")
      : null;

    const prompt = `You are a construction project manager AI assistant. Analyze the following project data and provide a concise executive summary.

PROJECT: ${project.name}
Client: ${client?.name || "Unknown"}
Status: ${project.status}
Type: ${project.project_type || "N/A"}
Progress: ${project.percent_complete || 0}% complete
Timeline: ${project.start_date ? moment(project.start_date).format("MMM D, YYYY") : "TBD"} → ${project.end_date ? moment(project.end_date).format("MMM D, YYYY") : "TBD"}
${daysToEnd !== null ? `Days remaining: ${daysToEnd} days` : ""}
Project Manager: ${project.project_manager || "Not assigned"}
Address: ${project.address || "Not set"}

FINANCIALS:
- Contract Value: $${(project.contract_value || 0).toLocaleString()}
- Costs to Date: $${(project.costs_to_date || 0).toLocaleString()}
- Billed to Date: $${(project.billed_to_date || 0).toLocaleString()}
- Gross Margin: $${grossMargin.toLocaleString()}
${budgetUsed !== null ? `- Budget Used: ${budgetUsed}%` : ""}

TASKS (${tasks.length} total):
- Completed: ${completedTasks.length}
- In Progress: ${inProgressTasks.length}
- Blocked: ${blockedTasks.length}
- Not Started: ${tasks.filter((t) => t.status === "not_started").length}
${upcomingTasks.length > 0 ? `Upcoming deadlines: ${upcomingTasks.map((t) => `"${t.name}" due ${moment(t.end_date).format("MMM D")}`).join(", ")}` : ""}
${blockedTasks.length > 0 ? `Blocked tasks: ${blockedTasks.map((t) => t.name).join(", ")}` : ""}

Provide a structured response with:
1. A 2-3 sentence executive summary of the project's current state.
2. 2-4 key risks or areas needing attention (be specific and actionable based on the data).
3. 1-2 upcoming milestones or recommended next steps.

Be direct, specific to the actual data provided, and use construction industry language.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          risks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                level: { type: "string", enum: ["high", "medium", "low"] },
                title: { type: "string" },
                detail: { type: "string" },
              },
            },
          },
          next_steps: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    });

    setSummary(result);
    setLoading(false);
  };

  const riskColors = {
    high: { bg: "bg-rose-50 border-rose-200", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
    medium: { bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    low: { bg: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-slate-900">AI Project Summary</span>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={generateSummary}
              className="text-slate-500 h-8 px-2"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
          )}
          {summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-slate-500 h-8 px-2"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        {!summary && !loading && (
          <div className="text-center py-4">
            <p className="text-sm text-slate-500 mb-4">
              Get an AI-powered analysis of this project — including risks, financial health, and recommended next steps.
            </p>
            <Button
              onClick={generateSummary}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Summary
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            <p className="text-sm text-slate-500">Analyzing project data…</p>
          </div>
        )}

        {summary && expanded && (
          <div className="space-y-5">
            {/* Summary text */}
            <p className="text-slate-700 leading-relaxed text-sm">{summary.summary}</p>

            {/* Risks */}
            {summary.risks?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Risks & Attention Areas
                </p>
                <div className="space-y-2">
                  {summary.risks.map((risk, i) => {
                    const colors = riskColors[risk.level] || riskColors.medium;
                    return (
                      <div key={i} className={cn("border rounded-xl p-3", colors.bg)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", colors.dot)} />
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", colors.badge)}>
                            {risk.level?.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-slate-800">{risk.title}</span>
                        </div>
                        <p className="text-xs text-slate-600 ml-4 leading-relaxed">{risk.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {summary.next_steps?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Recommended Next Steps
                </p>
                <ul className="space-y-1.5">
                  {summary.next_steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}