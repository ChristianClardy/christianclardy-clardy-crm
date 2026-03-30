import { useMemo, useRef } from "react";
import moment from "moment";
import { cn } from "@/lib/utils";

const typeColors = {
  residential: "#3b82f6",
  commercial: "#a855f7",
  renovation: "#f59e0b",
  new_construction: "#10b981",
  infrastructure: "#64748b",
};

const DAY_PX = 28; // pixels per day column

export default function TimelineChart({ projects, onProjectClick }) {
  const scrollRef = useRef(null);

  const { minDate, totalDays, todayOffset, monthHeaders, dayHeaders, projectBars } = useMemo(() => {
    if (!projects.length) return {};

    const dates = projects.flatMap(p => [
      p.start_date ? moment(p.start_date) : null,
      p.end_date   ? moment(p.end_date)   : null,
    ]).filter(Boolean);

    if (!dates.length) return {};

    const today = moment().startOf("day");
    dates.push(today);

    const minDate = moment.min(dates).startOf("day").subtract(3, "days");
    const maxDate = moment.max(dates).startOf("day").add(7, "days");
    const totalDays = maxDate.diff(minDate, "days") + 1;
    const todayOffset = today.diff(minDate, "days");

    // Month headers
    const monthHeaders = [];
    let cur = minDate.clone().startOf("month");
    while (cur.isBefore(maxDate)) {
      const mStart = moment.max(cur.clone(), minDate);
      const mEnd   = moment.min(cur.clone().endOf("month"), maxDate);
      const startDay = mStart.diff(minDate, "days");
      const spanDays = mEnd.diff(mStart, "days") + 1;
      monthHeaders.push({ label: cur.format("MMM YYYY"), startDay, spanDays });
      cur.add(1, "month").startOf("month");
    }

    // Day headers
    const dayHeaders = [];
    for (let i = 0; i < totalDays; i++) {
      const d = minDate.clone().add(i, "days");
      dayHeaders.push({ day: d.date(), dow: d.format("dd")[0], isToday: i === todayOffset, isSunday: d.day() === 0, isSaturday: d.day() === 6 });
    }

    // Project bars
    const projectBars = projects
      .filter(p => p.start_date)
      .map(p => {
        const start = moment(p.start_date).startOf("day");
        const end   = p.end_date ? moment(p.end_date).startOf("day") : start.clone().add(30, "days");
        return {
          project: p,
          startDay: start.diff(minDate, "days"),
          spanDays: end.diff(start, "days") + 1,
          color: typeColors[p.project_type] || "#94a3b8",
        };
      });

    return { minDate, totalDays, todayOffset, monthHeaders, dayHeaders, projectBars };
  }, [projects]);

  if (!minDate) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">No projects with dates to display on timeline</p>
      </div>
    );
  }

  const NAME_COL = 200;
  const totalWidth = NAME_COL + totalDays * DAY_PX;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: totalWidth, minWidth: "100%" }}>

          {/* Month header row */}
          <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: 28 }}>
            {/* Name column placeholder */}
            <div style={{ width: NAME_COL, minWidth: NAME_COL }} className="border-r border-slate-200 shrink-0" />
            {monthHeaders.map((m, i) => (
              <div
                key={i}
                className="border-r border-slate-200 flex items-center px-2 text-xs font-semibold text-slate-600 overflow-hidden"
                style={{ width: m.spanDays * DAY_PX, minWidth: m.spanDays * DAY_PX }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Day header row */}
          <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: 24 }}>
            <div style={{ width: NAME_COL, minWidth: NAME_COL }} className="border-r border-slate-200 shrink-0" />
            {dayHeaders.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center justify-center text-[9px] border-r border-slate-100 shrink-0 font-medium leading-none",
                  d.isToday  && "bg-blue-500 text-white rounded-none",
                  !d.isToday && (d.isSaturday || d.isSunday) && "bg-slate-100 text-slate-400",
                  !d.isToday && !(d.isSaturday || d.isSunday) && "text-slate-500"
                )}
                style={{ width: DAY_PX, minWidth: DAY_PX }}
              >
                <span>{d.dow}</span>
                <span>{d.day}</span>
              </div>
            ))}
          </div>

          {/* Project rows */}
          {projectBars.map(({ project, startDay, spanDays, color }) => (
            <div
              key={project.id}
              className="flex items-center border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors relative"
              style={{ height: 44 }}
              onClick={() => onProjectClick?.(project)}
            >
              {/* Project name */}
              <div
                className="shrink-0 px-3 text-sm font-medium text-slate-700 truncate border-r border-slate-200 h-full flex items-center"
                style={{ width: NAME_COL }}
              >
                {project.name}
              </div>

              {/* Day cells background */}
              <div className="relative flex h-full">
                {dayHeaders.map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "border-r border-slate-100 shrink-0 h-full",
                      d.isToday && "bg-blue-50",
                      !d.isToday && (d.isSaturday || d.isSunday) && "bg-slate-50"
                    )}
                    style={{ width: DAY_PX }}
                  />
                ))}

                {/* Today vertical line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none"
                    style={{ left: todayOffset * DAY_PX + DAY_PX / 2 }}
                  />
                )}

                {/* Project bar */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-md flex items-center px-2 shadow-sm z-20"
                  style={{
                    left: startDay * DAY_PX,
                    width: Math.max(spanDays * DAY_PX - 2, DAY_PX),
                    height: 26,
                    backgroundColor: color,
                  }}
                >
                  <span className="text-xs font-medium text-white truncate">
                    {project.percent_complete || 0}%
                  </span>
                </div>
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" />Residential</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-500 inline-block" />Commercial</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500 inline-block" />Renovation</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" />New Construction</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-4 bg-blue-500 inline-block" />Today</span>
      </div>
    </div>
  );
}