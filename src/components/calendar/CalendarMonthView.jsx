import { useEffect, useState } from "react";
import { format } from "date-fns";
import { buildMonthWeeks, entryOverlapsDay, isOutsideCurrentMonth, sortEntries } from "@/lib/calendarUtils";
import { cn } from "@/lib/utils";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarMonthView({ currentDate, entries, entryClassName, getEntryLabel, onEntryClick, onCreateRange }) {
  const weeks = buildMonthWeeks(currentDate);
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging || !selection || !onCreateRange) return;

    const handleMouseUp = () => {
      const from = selection.start <= selection.end ? selection.startDay : selection.endDay;
      const to = selection.start <= selection.end ? selection.endDay : selection.startDay;
      onCreateRange({
        start_datetime: `${format(from, "yyyy-MM-dd")}T09:00`,
        end_datetime: `${format(to, "yyyy-MM-dd")}T17:00`,
      });
      setDragging(false);
      setSelection(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragging, onCreateRange, selection]);

  const isSelected = (day) => {
    if (!selection) return false;
    const start = selection.start <= selection.end ? selection.startDay : selection.endDay;
    const end = selection.start <= selection.end ? selection.endDay : selection.startDay;
    return day >= start && day <= end;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-white text-xs font-semibold uppercase tracking-wider text-slate-500">
        {dayLabels.map((label) => (
          <div key={label} className="border-r border-slate-200 px-4 py-3 text-left last:border-r-0">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-slate-200 last:border-b-0">
            {week.map((day) => {
              const dayEntries = sortEntries(entries.filter((entry) => entryOverlapsDay(entry, day)));
              return (
                <div
                  key={day.toISOString()}
                  className={cn("min-h-[152px] border-r border-slate-200 px-2 py-2 last:border-r-0", isSelected(day) && "bg-blue-50")}
                  onMouseDown={() => {
                    if (!onCreateRange) return;
                    setSelection({ start: day.getTime(), end: day.getTime(), startDay: day, endDay: day });
                    setDragging(true);
                  }}
                  onMouseEnter={() => {
                    if (!dragging || !onCreateRange) return;
                    setSelection((current) => current ? { ...current, end: day.getTime(), endDay: day } : current);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className={cn("text-sm font-semibold", isOutsideCurrentMonth(day, currentDate) ? "text-slate-300" : "text-slate-700")}>{format(day, "d")}</div>
                  </div>
                  <div className="space-y-1">
                    {dayEntries.slice(0, 4).map((entry) => (
                      <button
                        key={`${entry.id}-${day.toISOString()}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => onEntryClick?.(entry)}
                        className={cn("block w-full truncate rounded-md px-2 py-1 text-left text-xs font-medium", entryClassName)}
                      >
                        {getEntryLabel(entry)}
                      </button>
                    ))}
                    {dayEntries.length > 4 && <div className="px-2 text-[11px] font-medium text-slate-400">+{dayEntries.length - 4} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}