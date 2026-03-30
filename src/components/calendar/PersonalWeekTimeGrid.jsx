import { useEffect, useMemo, useState } from "react";
import { addDays, endOfDay, format, isSameDay, max, min, parseISO, startOfDay } from "date-fns";
import { buildWeekDays } from "@/lib/calendarUtils";
import { cn } from "@/lib/utils";

const START_HOUR = 6;
const END_HOUR = 21;
const ROW_HEIGHT = 44;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);

function slotValue(dayIndex, hour) {
  return dayIndex * 24 + hour;
}

function toLocalDateTime(day, hour) {
  return `${format(day, "yyyy-MM-dd")}T${String(hour).padStart(2, "0")}:00`;
}

export default function PersonalWeekTimeGrid({ currentDate, entries, onEntryClick, onCreateRange }) {
  const days = buildWeekDays(currentDate);
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);

  const positionedEntries = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      return entries
        .map((entry) => {
          const rawStart = entry.start_datetime ? parseISO(entry.start_datetime) : null;
          const rawEnd = entry.end_datetime ? parseISO(entry.end_datetime) : rawStart;
          if (!rawStart || !rawEnd) return null;
          if (rawStart > dayEnd || rawEnd < dayStart) return null;

          const start = max([rawStart, dayStart]);
          const end = min([rawEnd, dayEnd]);
          const top = Math.max(0, ((start.getHours() + start.getMinutes() / 60) - START_HOUR) * ROW_HEIGHT);
          const height = Math.max(24, ((end.getHours() + end.getMinutes() / 60) - (start.getHours() + start.getMinutes() / 60)) * ROW_HEIGHT);
          return { ...entry, top, height };
        })
        .filter(Boolean);
    });
  }, [days, entries]);

  useEffect(() => {
    if (!dragging || !selection) return;

    const handleMouseUp = () => {
      const startValue = slotValue(selection.startDayIndex, selection.startHour);
      const endValue = slotValue(selection.endDayIndex, selection.endHour);
      const from = Math.min(startValue, endValue);
      const to = Math.max(startValue, endValue);
      const startDayIndex = Math.floor(from / 24);
      const endDayIndex = Math.floor(to / 24);
      const startHour = from % 24;
      const endHour = (to % 24) + 1;

      onCreateRange?.({
        start_datetime: toLocalDateTime(days[startDayIndex], startHour),
        end_datetime: toLocalDateTime(days[endDayIndex], Math.min(endHour, 23)),
      });

      setDragging(false);
      setSelection(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [days, dragging, onCreateRange, selection]);

  const isSelected = (dayIndex, hour) => {
    if (!selection) return false;
    const startValue = slotValue(selection.startDayIndex, selection.startHour);
    const endValue = slotValue(selection.endDayIndex, selection.endHour);
    const from = Math.min(startValue, endValue);
    const to = Math.max(startValue, endValue);
    const current = slotValue(dayIndex, hour);
    return current >= from && current <= to;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid" style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}>
        <div className="border-b border-r border-slate-200 bg-white" />
        {days.map((day) => (
          <div key={day.toISOString()} className="border-b border-r border-slate-200 bg-white px-3 py-3 last:border-r-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{format(day, "EEE")}</div>
            <div className={cn("text-lg font-semibold", isSameDay(day, new Date()) ? "text-blue-600" : "text-slate-900")}>{format(day, "d")}</div>
          </div>
        ))}

        <div className="relative border-r border-slate-200 bg-slate-50">
          {HOURS.map((hour) => (
            <div key={hour} className="border-b border-slate-200 px-3 pt-1 text-xs text-slate-400" style={{ height: ROW_HEIGHT }}>
              {format(new Date(2026, 0, 1, hour), "ha")}
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => (
          <div key={day.toISOString()} className="relative border-r border-slate-200 last:border-r-0" style={{ height: HOURS.length * ROW_HEIGHT }}>
            {HOURS.map((hour) => (
              <div
                key={`${day.toISOString()}-${hour}`}
                className={cn("border-b border-slate-100 transition-colors", isSelected(dayIndex, hour) && "bg-blue-100")}
                style={{ height: ROW_HEIGHT }}
                onMouseDown={() => {
                  setSelection({ startDayIndex: dayIndex, startHour: hour, endDayIndex: dayIndex, endHour: hour });
                  setDragging(true);
                }}
                onMouseEnter={() => {
                  if (!dragging) return;
                  setSelection((current) => current ? { ...current, endDayIndex: dayIndex, endHour: hour } : current);
                }}
              />
            ))}

            <div className="pointer-events-none absolute inset-0">
              {positionedEntries[dayIndex].map((entry) => (
                <button
                  key={`${entry.id}-${dayIndex}`}
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onEntryClick?.(entry)}
                  className="pointer-events-auto absolute left-1 right-1 rounded-xl bg-blue-500 px-2 py-1 text-left text-xs font-medium text-white shadow-sm hover:bg-blue-600"
                  style={{ top: entry.top + 2, height: entry.height - 4 }}
                >
                  <div className="truncate font-semibold">{entry.title}</div>
                  <div className="truncate text-[11px] text-blue-100">{format(parseISO(entry.start_datetime), "h:mm a")} – {format(parseISO(entry.end_datetime), "h:mm a")}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}