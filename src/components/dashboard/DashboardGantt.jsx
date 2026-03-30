import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ZoomIn, ZoomOut, CalendarDays } from "lucide-react";

const STATUS_COLORS = {
  planning:    { bar: "#c9ac76", progress: "#b5965a", text: "#8a7040", label: "Planning" },
  in_progress: { bar: "#60a5fa", progress: "#2563eb", text: "#1e40af", label: "In Progress" },
  on_hold:     { bar: "#94a3b8", progress: "#64748b", text: "#475569", label: "On Hold" },
  completed:   { bar: "#4ade80", progress: "#16a34a", text: "#166534", label: "Completed" },
  cancelled:   { bar: "#f87171", progress: "#dc2626", text: "#991b1b", label: "Cancelled" },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ROW_H = 48;
const LABEL_W = 220;

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date)   { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function daysBetween(a, b)  { return Math.round((b - a) / 86400000); }

function Tooltip({ project, clientName, visible, x, y }) {
  if (!visible) return null;
  const colors = STATUS_COLORS[project.status] || STATUS_COLORS.planning;
  return (
    <div
      className="fixed z-50 pointer-events-none rounded-xl shadow-2xl border px-4 py-3 w-60"
      style={{ left: x + 14, top: y - 10, backgroundColor: "#fff", borderColor: "#ddd5c8" }}
    >
      <p className="text-xs font-bold mb-0.5" style={{ color: "#3d3530" }}>{project.name}</p>
      {clientName && <p className="text-[11px] mb-2" style={{ color: "#7a6e66" }}>{clientName}</p>}
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colors.bar }} />
        <span className="text-[11px] font-medium" style={{ color: colors.text }}>{colors.label}</span>
      </div>
      {project.start_date && (
        <p className="text-[11px]" style={{ color: "#7a6e66" }}>
          Start: <span style={{ color: "#3d3530" }}>{project.start_date}</span>
        </p>
      )}
      {project.end_date && (
        <p className="text-[11px]" style={{ color: "#7a6e66" }}>
          End: <span style={{ color: "#3d3530" }}>{project.end_date}</span>
        </p>
      )}
      <div className="mt-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px]" style={{ color: "#7a6e66" }}>Progress</span>
          <span className="text-[10px] font-semibold" style={{ color: "#3d3530" }}>{project.percent_complete || 0}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "#f0ece6" }}>
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${project.percent_complete || 0}%`, backgroundColor: colors.progress }}
          />
        </div>
      </div>
      {project.contract_value > 0 && (
        <p className="text-[11px] mt-2" style={{ color: "#7a6e66" }}>
          Value: <span style={{ color: "#3d3530" }}>${(project.contract_value / 1000).toFixed(0)}K</span>
        </p>
      )}
    </div>
  );
}

export default function DashboardGantt({ projects, clientMap }) {
  const navigate = useNavigate();
  const scrollRef = useRef();
  const [dayPx, setDayPx] = useState(5);
  const [tooltip, setTooltip] = useState({ visible: false, project: null, x: 0, y: 0 });

  const { rangeStart, rangeEnd, months } = useMemo(() => {
    const withDates = projects.filter(p => p.start_date || p.end_date);
    if (!withDates.length) return { rangeStart: new Date(), rangeEnd: new Date(), months: [] };

    const starts = withDates.map(p => p.start_date ? new Date(p.start_date) : new Date());
    const ends = withDates.map(p => p.end_date
      ? new Date(p.end_date)
      : (p.start_date ? new Date(new Date(p.start_date).getTime() + 30*86400000) : new Date()));

    let earliest = addMonths(startOfMonth(new Date(Math.min(...starts))), -1);
    let latest = endOfMonth(addMonths(new Date(Math.max(...ends)), 1));

    const months = [];
    let cur = startOfMonth(earliest);
    while (cur <= latest) { months.push(new Date(cur)); cur = addMonths(cur, 1); }

    return { rangeStart: earliest, rangeEnd: latest, months };
  }, [projects]);

  const totalDays = daysBetween(rangeStart, rangeEnd);
  const totalWidth = totalDays * dayPx;
  const today = new Date();
  const todayOffset = daysBetween(rangeStart, today) * dayPx;

  // Scroll to today on mount / zoom change
  useEffect(() => {
    if (scrollRef.current && todayOffset > 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 150);
    }
  }, [todayOffset, dayPx]);

  const getBarProps = (project) => {
    const start = project.start_date ? new Date(project.start_date) : null;
    const end = project.end_date ? new Date(project.end_date) : null;
    if (!start && !end) return null;
    const s = start || end;
    const e = end || addMonths(start, 1);
    const left = Math.max(0, daysBetween(rangeStart, s)) * dayPx;
    const width = Math.max(6, daysBetween(s, e)) * dayPx;
    const pct = Math.min(100, Math.max(0, project.percent_complete || 0));
    const isLate = end && end < today && project.status !== "completed" && project.status !== "cancelled";
    return { left, width, pct, isLate };
  };

  if (!projects.filter(p => p.start_date || p.end_date).length) {
    return (
      <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: "#fff", borderColor: "#ddd5c8" }}>
        <p className="text-sm" style={{ color: "#7a6e66" }}>No projects with dates to display.</p>
      </div>
    );
  }

  return (
    <>
      {tooltip.visible && tooltip.project && (
        <Tooltip
          project={tooltip.project}
          clientName={clientMap[tooltip.project.client_id]?.name}
          visible={tooltip.visible}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}

      <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ backgroundColor: "#fff", borderColor: "#ddd5c8" }}>
        {/* Zoom controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "#ddd5c8", backgroundColor: "#faf8f5" }}>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" style={{ color: "#b5965a" }} />
            <span className="text-xs font-semibold" style={{ color: "#5a4f48" }}>
              {months[0] ? `${MONTH_NAMES[months[0].getMonth()]} ${months[0].getFullYear()}` : ""} — {months[months.length - 1] ? `${MONTH_NAMES[months[months.length-1].getMonth()]} ${months[months.length-1].getFullYear()}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDayPx(d => Math.max(2, d - 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" style={{ color: "#7a6e66" }} />
            </button>
            <span className="text-xs px-2" style={{ color: "#7a6e66" }}>{dayPx}px/day</span>
            <button
              onClick={() => setDayPx(d => Math.min(12, d + 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" style={{ color: "#7a6e66" }} />
            </button>
          </div>
        </div>

        <div className="flex">
          {/* Fixed label column */}
          <div className="flex-shrink-0 bg-white" style={{ width: LABEL_W, borderRight: "1px solid #ddd5c8" }}>
            <div className="flex items-center px-3 border-b" style={{ height: 36, borderColor: "#ddd5c8", backgroundColor: "#f5f0eb" }}>
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#7a6e66" }}>Project</span>
            </div>
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center px-3 gap-2 cursor-pointer hover:bg-amber-50 transition-colors"
                style={{ height: ROW_H, borderBottom: "1px solid #f0ece6" }}
                onClick={() => navigate(createPageUrl(`ProjectDetail?id=${project.id}`))}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[project.status]?.bar || "#c9ac76" }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate leading-tight" style={{ color: "#3d3530" }}>{project.name}</p>
                  <p className="text-[10px] truncate leading-tight" style={{ color: "#7a6e66" }}>{clientMap[project.client_id]?.name || ""}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable chart */}
          <div className="flex-1 overflow-x-auto" ref={scrollRef} style={{ maxHeight: Math.min(projects.length * ROW_H + 36 + 8, 520) }}>
            <div style={{ width: Math.max(totalWidth, 400), minWidth: "100%" }}>
              {/* Month headers */}
              <div className="flex border-b" style={{ height: 36, backgroundColor: "#f5f0eb", borderColor: "#ddd5c8" }}>
                {months.map((m, i) => {
                  const daysInMonth = daysBetween(m, endOfMonth(m)) + 1;
                  const w = daysInMonth * dayPx;
                  return (
                    <div
                      key={i}
                      className="flex-shrink-0 flex items-center justify-center border-r text-[11px] font-semibold select-none"
                      style={{ width: w, borderColor: "#ddd5c8", color: "#5a4f48" }}
                    >
                      {w > 40 ? `${MONTH_NAMES[m.getMonth()]} ${m.getFullYear()}` : w > 20 ? MONTH_NAMES[m.getMonth()] : ""}
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              <div className="relative">
                {/* Month column shading */}
                {months.map((m, i) => {
                  const daysInMonth = daysBetween(m, endOfMonth(m)) + 1;
                  const left = daysBetween(rangeStart, m) * dayPx;
                  const w = daysInMonth * dayPx;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r pointer-events-none"
                      style={{ left, width: w, borderColor: "#f0ece6", backgroundColor: i % 2 === 0 ? "transparent" : "#faf8f5" }}
                    />
                  );
                })}

                {/* Today line */}
                {todayOffset >= 0 && todayOffset <= totalWidth && (
                  <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: todayOffset, width: 2, backgroundColor: "#e11d48" }}>
                    <div className="absolute -top-px left-2 text-[9px] font-bold text-white bg-rose-500 px-1 py-px rounded whitespace-nowrap" style={{ top: 2 }}>
                      Today
                    </div>
                  </div>
                )}

                {/* Project bars */}
                {projects.map((project) => {
                  const bar = getBarProps(project);
                  const colors = STATUS_COLORS[project.status] || STATUS_COLORS.planning;
                  return (
                    <div
                      key={project.id}
                      className="relative"
                      style={{ height: ROW_H, borderBottom: "1px solid #f0ece6" }}
                    >
                      {bar && (
                        <div
                          className="absolute rounded-full cursor-pointer transition-all duration-150 hover:opacity-90 hover:scale-y-105"
                          style={{
                            left: bar.left,
                            width: bar.width,
                            height: 22,
                            top: (ROW_H - 22) / 2,
                            backgroundColor: bar.isLate ? "#fecaca" : colors.bar + "30",
                            border: `2px solid ${bar.isLate ? "#ef4444" : colors.bar}`,
                            overflow: "hidden",
                          }}
                          onClick={() => navigate(createPageUrl(`ProjectDetail?id=${project.id}`))}
                          onMouseEnter={(e) => setTooltip({ visible: true, project, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
                          onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
                        >
                          {/* Progress fill */}
                          <div
                            className="absolute left-0 top-0 bottom-0 rounded-full"
                            style={{ width: `${bar.pct}%`, backgroundColor: bar.isLate ? "#f87171" : colors.progress + "99" }}
                          />
                          {/* % label */}
                          {bar.width > 50 && (
                            <span
                              className="absolute inset-0 flex items-center justify-center text-[10px] font-bold select-none"
                              style={{ color: bar.isLate ? "#991b1b" : colors.text }}
                            >
                              {bar.pct}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-t" style={{ borderColor: "#ddd5c8", backgroundColor: "#faf8f5" }}>
          {Object.entries(STATUS_COLORS).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: val.bar }} />
              <span className="text-[11px]" style={{ color: "#7a6e66" }}>{val.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-300 border border-red-400" />
            <span className="text-[11px]" style={{ color: "#7a6e66" }}>Overdue</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-0.5 h-3 bg-rose-500 rounded" />
            <span className="text-[11px]" style={{ color: "#7a6e66" }}>Today</span>
          </div>
        </div>
      </div>
    </>
  );
}