import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_COLORS = {
  "Completed":  { bar: "bg-emerald-500", text: "text-emerald-700", track: "bg-emerald-100" },
  "In Progress":{ bar: "bg-amber-400",   text: "text-amber-700",   track: "bg-amber-50"    },
  "Blocked":    { bar: "bg-rose-500",    text: "text-rose-700",    track: "bg-rose-50"     },
  "On Hold":    { bar: "bg-orange-400",  text: "text-orange-700",  track: "bg-orange-50"   },
  "Not Started":{ bar: "bg-slate-300",   text: "text-slate-500",   track: "bg-slate-50"    },
};

function getColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS["Not Started"];
}

function isoToDate(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? null : d;
}

function startOfWeek(d) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  copy.setDate(copy.getDate() - day);
  return copy;
}

function addDaysD(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatShortDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const MIN_DAY_PX = 6;
const MAX_DAY_PX = 60;
const DEFAULT_DAY_PX = 28;

export default function GanttView({ rows, externalDayPx, onExternalDayPxChange }) {
  const scrollRef = useRef();
  const [internalDayPx, setInternalDayPx] = useState(DEFAULT_DAY_PX);

  // Support both controlled (from ProjectDetail) and uncontrolled (standalone)
  const dayPx = externalDayPx !== undefined ? externalDayPx : internalDayPx;
  const setDayPx = (val) => {
    const next = typeof val === "function" ? val(dayPx) : val;
    if (onExternalDayPxChange) onExternalDayPxChange(next);
    else setInternalDayPx(next);
  };

  // Compute project date range
  const taskRows = rows.filter(r => !r.is_section_header && r.start_date && r.end_date);

  const { minDate, maxDate } = useMemo(() => {
    if (taskRows.length === 0) {
      const today = new Date();
      return { minDate: startOfWeek(today), maxDate: addDaysD(today, 60) };
    }
    const starts = taskRows.map(r => isoToDate(r.start_date)).filter(Boolean);
    const ends   = taskRows.map(r => isoToDate(r.end_date)).filter(Boolean);
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    // pad 7 days on each side
    return { minDate: addDaysD(startOfWeek(min), -7), maxDate: addDaysD(max, 14) };
  }, [taskRows.length, rows]);

  const totalDays = Math.ceil((maxDate - minDate) / 86400000) + 1;
  const totalWidth = totalDays * dayPx;

  // Build week headers
  const weeks = useMemo(() => {
    const result = [];
    let cur = new Date(startOfWeek(minDate));
    while (cur <= maxDate) {
      result.push(new Date(cur));
      cur = addDaysD(cur, 7);
    }
    return result;
  }, [minDate, maxDate]);

  const dayOffset = (dateStr) => {
    const d = isoToDate(dateStr);
    if (!d) return null;
    return Math.round((d - minDate) / 86400000);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = Math.round((today - minDate) / 86400000);
  const showToday = todayOffset >= 0 && todayOffset <= totalDays;

  // Scroll to today on first render
  const scrolledRef = useRef(false);

  const handleWheel = useCallback((e) => {
    const isZoomGesture = e.ctrlKey || e.metaKey;
    if (isZoomGesture) {
      e.preventDefault();
      const delta = -e.deltaY;
      setDayPx(px => Math.min(MAX_DAY_PX, Math.max(MIN_DAY_PX, px + delta * 0.3)));
    }
  }, []);

  const containerRef = (el) => {
    if (el && !scrolledRef.current) {
      scrolledRef.current = true;
      const scrollTarget = Math.max(0, todayOffset * dayPx - 200);
      el.scrollLeft = scrollTarget;
    }
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
    }
    scrollRef.current = el;
  };

  const scroll = (dir) => {
    if (scrollRef.current) scrollRef.current.scrollLeft += dir * dayPx * 14;
  };

  if (rows.filter(r => !r.is_section_header).length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
        <p className="text-sm">No tasks to display in Gantt view.</p>
        <p className="text-xs mt-1">Add tasks with start and end dates to see the timeline.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex">
        {/* Left: task names (frozen) */}
        <div className="flex-shrink-0 w-56 border-r border-slate-200 z-10 bg-white">
          {/* Header spacer */}
          <div className="h-10 border-b border-slate-200 bg-slate-50 flex items-center px-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</span>
          </div>
          {rows.map((row) => {
            if (row.is_section_header) {
              return (
                <div
                  key={row.id}
                  className="h-9 flex items-center px-3 bg-slate-700 text-white text-xs font-semibold uppercase tracking-wider border-b border-slate-600 truncate"
                >
                  {row.section}
                </div>
              );
            }
            return (
              <div
                key={row.id}
                className="h-9 flex items-center px-3 border-b border-slate-100 text-xs text-slate-700 truncate hover:bg-amber-50"
                title={row.task}
              >
                <span className="truncate">{row.task || "—"}</span>
              </div>
            );
          })}
        </div>

        {/* Right: scrollable Gantt area */}
        <div className="flex-1 overflow-x-auto relative" ref={containerRef}>
          <div style={{ width: totalWidth }} className="relative">
            {/* Week headers */}
            <div className="h-10 border-b border-slate-200 bg-slate-50 flex sticky top-0 z-10" style={{ width: totalWidth }}>
              {weeks.map((week, i) => {
                const left = Math.round((week - minDate) / 86400000) * dayPx;
                const isLastWeek = i === weeks.length - 1;
                const nextWeek = isLastWeek ? addDaysD(week, 7) : weeks[i + 1];
                const width = Math.round((nextWeek - week) / 86400000) * dayPx;
                return (
                  <div
                    key={i}
                    className="absolute top-0 border-r border-slate-200 flex items-center px-2 h-full"
                    style={{ left, width }}
                  >
                    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">{formatShortDate(week)}</span>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {rows.map((row) => {
              if (row.is_section_header) {
                return (
                  <div
                    key={row.id}
                    className="h-9 bg-slate-700 border-b border-slate-600 relative"
                    style={{ width: totalWidth }}
                  >
                    {/* vertical grid lines */}
                    {weeks.map((week, i) => {
                      const left = Math.round((week - minDate) / 86400000) * DAY_PX;
                      return <div key={i} className="absolute top-0 bottom-0 border-l border-slate-600/40" style={{ left }} />;
                    })}
                  </div>
                );
              }

              const startOff = dayOffset(row.start_date);
              const endOff   = dayOffset(row.end_date);
              const hasBar   = startOff !== null && endOff !== null && endOff >= startOff;
              const barWidth = hasBar ? Math.max((endOff - startOff + 1) * dayPx, 4) : 0;
              const pct      = Math.max(0, Math.min(100, Number(row.percent_complete) || 0));
              const colors   = getColor(row.status);

              return (
                <div
                  key={row.id}
                  className="h-9 border-b border-slate-100 relative flex items-center"
                  style={{ width: totalWidth }}
                >
                  {/* Grid lines */}
                  {weeks.map((week, i) => {
                    const left = Math.round((week - minDate) / 86400000) * dayPx;
                    return <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left }} />;
                  })}

                  {/* Today line */}
                  {showToday && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                      style={{ left: todayOffset * dayPx }}
                    />
                  )}

                  {/* Task bar */}
                  {hasBar && (
                    <div
                      className={cn("absolute h-5 rounded-full overflow-hidden shadow-sm", colors.track)}
                      style={{ left: startOff * dayPx + 2, width: barWidth - 4 }}
                      title={`${row.task}: ${row.start_date} → ${row.end_date} (${pct}%)`}
                    >
                      {/* Progress fill */}
                      <div
                        className={cn("h-full rounded-full transition-all", colors.bar)}
                        style={{ width: `${pct}%` }}
                      />
                      {/* Label */}
                      {barWidth > 60 && (
                        <span className={cn("absolute inset-0 flex items-center px-2 text-[10px] font-medium truncate", colors.text)}>
                          {row.task}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Dependency arrow stub */}
                  {row.depends_on && (() => {
                    const pred = rows.find(r => r.id === row.depends_on);
                    if (!pred || !pred.end_date || !row.start_date) return null;
                    const predEndOff = dayOffset(pred.end_date);
                    const rowStartOff = dayOffset(row.start_date);
                    if (predEndOff === null || rowStartOff === null) return null;
                    const x1 = predEndOff * dayPx + dayPx;
                    const x2 = rowStartOff * dayPx + 2;
                    if (x2 <= x1) return null;
                    return (
                      <svg
                        className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: x1, width: x2 - x1, height: 12 }}
                      >
                        <line x1={0} y1={6} x2={x2 - x1 - 4} y2={6} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 2" />
                        <polygon points={`${x2 - x1 - 4},3 ${x2 - x1},6 ${x2 - x1 - 4},9`} fill="#94a3b8" />
                      </svg>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Navigation + Zoom */}
      <div className="border-t border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={() => scroll(-1)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-200 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> 2 weeks back
          </button>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-emerald-500 inline-block" /> Completed</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-amber-400 inline-block" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-slate-300 inline-block" /> Not Started</span>
            <span className="flex items-center gap-1"><span className="w-1 h-3 bg-red-400 inline-block" /> Today</span>
          </div>
          <button onClick={() => scroll(1)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-200 transition-colors">
            2 weeks forward <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-4 pb-1.5 flex justify-end">
          <span className="text-[10px] text-slate-400">Pinch or ⌘+scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}