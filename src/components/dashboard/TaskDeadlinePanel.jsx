import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const SEVEN_DAYS = new Date(TODAY);
SEVEN_DAYS.setDate(SEVEN_DAYS.getDate() + 7);

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  d.setHours(0, 0, 0, 0);
  return isNaN(d) ? null : d;
}

function daysLabel(date) {
  const diff = Math.round((date - TODAY) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `${diff}d left`;
}

function TaskRow({ task, projectName, onClick, overdue }) {
  const date = parseDate(task.end_date);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all hover:shadow-sm group",
        overdue
          ? "bg-rose-50 border-rose-200 hover:border-rose-400"
          : "bg-amber-50 border-amber-200 hover:border-amber-400"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{task.task}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{projectName}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-xs font-semibold px-2 py-0.5 rounded-full",
          overdue ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
        )}>
          {date ? daysLabel(date) : "—"}
        </span>
        <ArrowRight className={cn("w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity", overdue ? "text-rose-500" : "text-amber-500")} />
      </div>
    </button>
  );
}

export default function TaskDeadlinePanel({ sheets = [], projects = [] }) {
  const navigate = useNavigate();

  const projectMap = useMemo(() =>
    projects.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
  [projects]);

  const { pastDue, nearingDue } = useMemo(() => {
    const past = [];
    const nearing = [];

    for (const sheet of sheets) {
      const rows = sheet.rows ?? sheet.data?.rows ?? [];
      const projectId = sheet.project_id ?? sheet.data?.project_id;
      if (!projectId) continue;

      for (const row of rows) {
        if (row.is_section_header) continue;
        if (!row.task || !row.end_date) continue;
        if ((row.status || "").toLowerCase() === "completed") continue;

        const date = parseDate(row.end_date);
        if (!date) continue;

        const entry = { ...row, _sheetId: sheet.id, _projectId: projectId };

        if (date < TODAY) {
          past.push(entry);
        } else if (date <= SEVEN_DAYS) {
          nearing.push(entry);
        }
      }
    }

    // Sort: most overdue first / soonest deadline first
    past.sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
    nearing.sort((a, b) => new Date(a.end_date) - new Date(b.end_date));

    return { pastDue: past, nearingDue: nearing };
  }, [sheets]);

  if (pastDue.length === 0 && nearingDue.length === 0) return null;

  const goToProject = (projectId) =>
    navigate(createPageUrl(`ProjectDetail?id=${projectId}`));

  const Panel = ({ title, icon: Icon, items, overdue, accentColor }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: accentColor }} />
        <h3 className="text-sm font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>
          {title}
        </h3>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: accentColor }}>
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic px-1">None — all clear!</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((task, i) => (
            <TaskRow
              key={`${task._sheetId}-${i}`}
              task={task}
              projectName={projectMap[task._projectId]?.name || "Unknown Project"}
              overdue={overdue}
              onClick={() => goToProject(task._projectId)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.18em" }}>Schedule</p>
        <h2 className="text-lg font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Task Deadlines</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        <Panel
          title="Past Deadline"
          icon={AlertTriangle}
          items={pastDue}
          overdue={true}
          accentColor="#e11d48"
        />
        <div className="hidden sm:block w-px bg-slate-200" />
        <Panel
          title="Nearing Deadline"
          icon={Clock}
          items={nearingDue}
          overdue={false}
          accentColor="#d97706"
        />
      </div>
    </div>
  );
}
