import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertOctagon, Clock, ArrowRight, Loader2, CalendarClock } from "lucide-react";
import moment from "moment";
import { cn } from "@/lib/utils";

export default function DeadlineAlerts({ projects }) {
  const [sheetRows, setSheetRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSheetData();
  }, [projects]);

  const loadSheetData = async () => {
    if (!projects.length) { setLoading(false); return; }
    const activeProjects = projects.filter(p => p.status !== "completed" && p.status !== "cancelled");
    const sheets = await Promise.all(
      activeProjects.map(p => base44.entities.ProjectSheet.filter({ project_id: p.id }))
    );

    const today = moment().startOf("day");
    const soonThreshold = moment().add(7, "days").endOf("day");

    const allRows = [];
    sheets.forEach((sheetArr, i) => {
      const proj = activeProjects[i];
      const sheet = sheetArr[0];
      if (!sheet?.rows) return;
      sheet.rows.forEach(row => {
        if (row.is_section_header || !row.end_date || row.status?.toLowerCase() === "completed") return;
        const due = moment(row.end_date);
        if (!due.isValid()) return;
        const daysOverdue = today.diff(due, "days");
        const daysUntilDue = due.diff(today, "days");

        if (daysOverdue > 0) {
          allRows.push({ ...row, project: proj, daysOverdue, type: "overdue" });
        } else if (daysUntilDue <= 7) {
          allRows.push({ ...row, project: proj, daysUntilDue, type: "upcoming" });
        }
      });
    });

    // Sort: overdue by most overdue first, upcoming by soonest first
    setSheetRows(allRows);
    setLoading(false);
  };

  const overdue = sheetRows.filter(r => r.type === "overdue").sort((a, b) => b.daysOverdue - a.daysOverdue);
  const upcoming = sheetRows.filter(r => r.type === "upcoming").sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#b5965a" }} />
      </div>
    );
  }

  if (!overdue.length && !upcoming.length) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* OVERDUE */}
      {overdue.length > 0 && (
        <div className="rounded-xl overflow-hidden border-2 border-rose-300" style={{ backgroundColor: "#fff" }}>
          <div className="flex items-center gap-3 px-5 py-4 bg-rose-600">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold tracking-wide text-sm uppercase">Overdue Tasks</p>
              <p className="text-rose-200 text-xs">{overdue.length} task{overdue.length !== 1 ? "s" : ""} past due</p>
            </div>
          </div>
          <div className="divide-y divide-rose-50">
            {overdue.slice(0, 6).map((row, i) => (
              <Link
                key={i}
                to={createPageUrl(`ProjectDetail?id=${row.project.id}&tab=sheet&taskId=${row.id}`)}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-rose-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-800 truncate">{row.task || row.section || "Unnamed task"}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{row.project.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs font-bold text-white bg-rose-500 px-2 py-0.5 rounded-full">
                    {row.daysOverdue}d overdue
                  </span>
                  <span className="text-xs text-slate-400">{moment(row.end_date).format("MMM D")}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-rose-300 group-hover:text-rose-500 mt-1 flex-shrink-0 transition-colors" />
              </Link>
            ))}
            {overdue.length > 6 && (
              <p className="px-5 py-3 text-xs text-rose-400 font-medium">+{overdue.length - 6} more overdue items</p>
            )}
          </div>
        </div>
      )}

      {/* UPCOMING */}
      {upcoming.length > 0 && (
        <div className="rounded-xl overflow-hidden border-2 border-amber-200" style={{ backgroundColor: "#fff" }}>
          <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: "#b5965a" }}>
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <CalendarClock className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold tracking-wide text-sm uppercase">Nearing Deadlines</p>
              <p className="text-amber-100 text-xs">{upcoming.length} task{upcoming.length !== 1 ? "s" : ""} due within 7 days</p>
            </div>
          </div>
          <div className="divide-y divide-amber-50">
            {upcoming.slice(0, 6).map((row, i) => (
              <Link
                key={i}
                to={createPageUrl(`ProjectDetail?id=${row.project.id}&tab=sheet&taskId=${row.id}`)}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-amber-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900 truncate">{row.task || row.section || "Unnamed task"}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{row.project.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={cn(
                    "text-xs font-bold text-white px-2 py-0.5 rounded-full",
                    row.daysUntilDue === 0 ? "bg-orange-500" : "bg-amber-500"
                  )}>
                    {row.daysUntilDue === 0 ? "Due today" : `${row.daysUntilDue}d left`}
                  </span>
                  <span className="text-xs text-slate-400">{moment(row.end_date).format("MMM D")}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-amber-300 group-hover:text-amber-500 mt-1 flex-shrink-0 transition-colors" />
              </Link>
            ))}
            {upcoming.length > 6 && (
              <p className="px-5 py-3 text-xs text-amber-500 font-medium">+{upcoming.length - 6} more upcoming items</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}