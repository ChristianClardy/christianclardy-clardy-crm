import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  planning:    { bg: "bg-slate-400",   text: "text-white", dot: "bg-slate-400" },
  in_progress: { bg: "bg-amber-400",   text: "text-white", dot: "bg-amber-400" },
  on_hold:     { bg: "bg-rose-400",    text: "text-white", dot: "bg-rose-400" },
  completed:   { bg: "bg-emerald-500", text: "text-white", dot: "bg-emerald-500" },
  cancelled:   { bg: "bg-slate-300",   text: "text-slate-600", dot: "bg-slate-300" },
};

const STATUS_LABELS = {
  planning: "Planning",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Returns projects that span or start/end in a given day
function getProjectsForDay(projects, dateStr) {
  return projects.filter((p) => {
    if (!p.start_date && !p.end_date) return false;
    const start = p.start_date || p.end_date;
    const end = p.end_date || p.start_date;
    return dateStr >= start && dateStr <= end;
  });
}

function isProjectStart(project, dateStr) {
  return project.start_date === dateStr;
}

function isProjectEnd(project, dateStr) {
  return (project.end_date || project.start_date) === dateStr;
}

export default function ProjectCalendarView({ projects, clientMap }) {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tooltip, setTooltip] = useState(null); // { project, x, y }
  const tooltipRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });

  // Build a 6-row grid (max 42 cells)
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Legend: unique statuses present in projects
  const legendStatuses = [...new Set(projects.map(p => p.status).filter(Boolean))];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold text-slate-900 w-44 text-center">
            {monthName} {year}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="text-xs text-slate-500 h-8">
            Today
          </Button>
        </div>
        {/* Legend */}
        {legendStatuses.length > 0 && (
          <div className="hidden sm:flex items-center gap-3 flex-wrap">
            {legendStatuses.map(s => (
              <div key={s} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={cn("w-2.5 h-2.5 rounded-full", STATUS_STYLES[s]?.dot || "bg-slate-300")} />
                {STATUS_LABELS[s] || s}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 divide-x divide-slate-100">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="min-h-[100px] bg-slate-50/50 border-b border-slate-100" />;
          }
          const dateStr = toDateStr(year, month, day);
          const isToday = dateStr === todayStr;
          const dayProjects = getProjectsForDay(projects, dateStr);

          return (
            <div
              key={dateStr}
              className={cn(
                "min-h-[100px] border-b border-slate-100 p-1.5 flex flex-col gap-1",
                isToday && "bg-amber-50/50"
              )}
            >
              {/* Day number */}
              <div className={cn(
                "text-xs font-semibold self-start w-6 h-6 flex items-center justify-center rounded-full",
                isToday ? "bg-amber-500 text-white" : "text-slate-500"
              )}>
                {day}
              </div>

              {/* Project blocks */}
              <div className="flex flex-col gap-0.5">
                {dayProjects.slice(0, 3).map(p => {
                  const style = STATUS_STYLES[p.status] || STATUS_STYLES.planning;
                  const isStart = isProjectStart(p, dateStr);
                  const isEnd = isProjectEnd(p, dateStr);
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(createPageUrl(`ProjectDetail?id=${p.id}`))}
                      className={cn(
                        "w-full text-left text-[10px] font-medium px-1.5 py-0.5 truncate transition-opacity hover:opacity-80",
                        style.bg, style.text,
                        isStart && "rounded-l-full",
                        isEnd && "rounded-r-full",
                        !isStart && !isEnd && "rounded-none",
                        isStart && isEnd && "rounded-full"
                      )}
                      title={p.name}
                    >
                      {isStart ? p.name : ""}
                    </button>
                  );
                })}
                {dayProjects.length > 3 && (
                  <span className="text-[10px] text-slate-400 pl-1">+{dayProjects.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* No projects notice */}
      {projects.filter(p => p.start_date || p.end_date).length === 0 && (
        <div className="py-8 text-center text-slate-400 text-sm border-t border-slate-100">
          No projects with dates found. Add start/end dates to projects to see them here.
        </div>
      )}
    </div>
  );
}