import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, max, min, parseISO, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

const START_HOUR = 5;
const END_HOUR = 23;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 24;
const SLOTS = Array.from({ length: ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES }, (_, index) => index);

function slotValue(dayIndex, slotIndex) {
  return dayIndex * 1000 + slotIndex;
}

function slotToDate(day, slotIndex) {
  const date = new Date(day);
  const totalMinutes = START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return date;
}

function localString(date) {
  return `${format(date, "yyyy-MM-dd")}T${format(date, "HH:mm")}`;
}

export default function CalendarTimeGrid({ dates, entries, onEntryClick, onCreateRange, onMoveEntry, onResizeEntry, getEventClassName, getEventSubtitle }) {
  const [interaction, setInteraction] = useState(null);
  const scrollRef = useRef(null);

  // Auto-scroll to current time (or 8am if overnight)
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const hours = now.getHours();
    const targetHour = hours >= START_HOUR && hours < END_HOUR ? hours : 8;
    const targetMinutes = (targetHour - START_HOUR) * 60;
    const targetSlot = targetMinutes / SLOT_MINUTES;
    const scrollTop = Math.max(0, targetSlot * SLOT_HEIGHT - 80);
    scrollRef.current.scrollTop = scrollTop;
  }, [dates]);

  const dayEntries = useMemo(() => {
    return dates.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      return entries
        .map((entry) => {
          const rawStart = parseISO(entry.start_datetime);
          const rawEnd = parseISO(entry.end_datetime);
          if (entry.all_day || rawStart > dayEnd || rawEnd < dayStart) return null;
          const start = max([rawStart, dayStart]);
          const end = min([rawEnd, dayEnd]);
          const startMinutes = start.getHours() * 60 + start.getMinutes();
          const endMinutes = end.getHours() * 60 + end.getMinutes();
          const top = ((startMinutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT;
          const height = Math.max(SLOT_HEIGHT, ((endMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT);
          return { ...entry, top, height };
        })
        .filter(Boolean);
    });
  }, [dates, entries]);

  useEffect(() => {
    if (!interaction) return;
    const handleMouseUp = () => {
      if (interaction.type === "create") {
        const start = Math.min(slotValue(interaction.startDayIndex, interaction.startSlotIndex), slotValue(interaction.endDayIndex, interaction.endSlotIndex));
        const end = Math.max(slotValue(interaction.startDayIndex, interaction.startSlotIndex), slotValue(interaction.endDayIndex, interaction.endSlotIndex));
        const startDayIndex = Math.floor(start / 1000);
        const endDayIndex = Math.floor(end / 1000);
        const startSlotIndex = start % 1000;
        const endSlotIndex = end % 1000;
        const startDate = slotToDate(dates[startDayIndex], startSlotIndex);
        const endDate = slotToDate(dates[endDayIndex], endSlotIndex + 1);
        onCreateRange?.({ start_datetime: localString(startDate), end_datetime: localString(endDate) });
      }

      if (interaction.type === "move") {
        const startDate = slotToDate(dates[interaction.dayIndex], interaction.slotIndex);
        const endDate = new Date(startDate.getTime() + interaction.durationMs);
        onMoveEntry?.(interaction.entry, { start_datetime: localString(startDate), end_datetime: localString(endDate) });
      }

      if (interaction.type === "resize") {
        const startDate = parseISO(interaction.entry.start_datetime);
        const endDate = slotToDate(dates[interaction.dayIndex], interaction.slotIndex + 1);
        if (endDate > startDate) {
          onResizeEntry?.(interaction.entry, { start_datetime: interaction.entry.start_datetime, end_datetime: localString(endDate) });
        }
      }

      setInteraction(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dates, interaction, onCreateRange, onMoveEntry, onResizeEntry]);

  const isSelected = (dayIndex, slotIndex) => {
    if (!interaction || interaction.type !== "create") return false;
    const start = Math.min(slotValue(interaction.startDayIndex, interaction.startSlotIndex), slotValue(interaction.endDayIndex, interaction.endSlotIndex));
    const end = Math.max(slotValue(interaction.startDayIndex, interaction.startSlotIndex), slotValue(interaction.endDayIndex, interaction.endSlotIndex));
    const current = slotValue(dayIndex, slotIndex);
    return current >= start && current <= end;
  };

  const gridCols = `72px repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm select-none">
      {/* Sticky day header */}
      <div className="grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: gridCols }}>
        <div className="border-r border-slate-200" />
        {dates.map((day) => (
          <div key={day.toISOString()} className="border-r border-slate-200 px-3 py-3 last:border-r-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{format(day, "EEE")}</div>
            <div className={cn("text-lg font-semibold", isSameDay(day, new Date()) ? "text-blue-600" : "text-slate-900")}>{format(day, "MMM d")}</div>
          </div>
        ))}
      </div>

      {/* Scrollable time body */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 580 }}>
        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          {/* Time labels */}
          <div className="border-r border-slate-200 bg-slate-50">
            {SLOTS.map((slotIndex) => (
              <div key={slotIndex} className="border-b border-slate-100 px-3 text-xs text-slate-400" style={{ height: SLOT_HEIGHT }}>
                {slotIndex % 2 === 0 ? format(slotToDate(new Date(2026, 0, 1), slotIndex), "ha") : ""}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dates.map((day, dayIndex) => (
            <div key={day.toISOString()} className="relative border-r border-slate-200 last:border-r-0" style={{ height: SLOTS.length * SLOT_HEIGHT }}>
              {SLOTS.map((slotIndex) => (
                <div
                  key={`${day.toISOString()}-${slotIndex}`}
                  className={cn(
                    "border-b border-slate-100 transition-colors cursor-pointer",
                    isSelected(dayIndex, slotIndex) ? "bg-blue-100" : "hover:bg-slate-50"
                  )}
                  style={{ height: SLOT_HEIGHT }}
                  onMouseDown={() => setInteraction({ type: "create", startDayIndex: dayIndex, startSlotIndex: slotIndex, endDayIndex: dayIndex, endSlotIndex: slotIndex })}
                  onMouseEnter={() => {
                    if (!interaction) return;
                    if (interaction.type === "create") setInteraction((current) => ({ ...current, endDayIndex: dayIndex, endSlotIndex: slotIndex }));
                    if (interaction.type === "move" || interaction.type === "resize") setInteraction((current) => ({ ...current, dayIndex, slotIndex }));
                  }}
                />
              ))}

              <div className="pointer-events-none absolute inset-0">
                {dayEntries[dayIndex].map((entry) => (
                  <button
                    key={`${entry.id}-${dayIndex}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setInteraction({
                        type: "move",
                        entry,
                        dayIndex,
                        slotIndex: Math.max(0, Math.round(entry.top / SLOT_HEIGHT)),
                        durationMs: parseISO(entry.end_datetime).getTime() - parseISO(entry.start_datetime).getTime(),
                      });
                    }}
                    onClick={() => onEntryClick?.(entry)}
                    className={cn("pointer-events-auto absolute left-1 right-1 rounded-xl px-2 py-1 text-left text-xs font-medium text-white shadow-sm", getEventClassName?.(entry))}
                    style={{ top: entry.top + 2, height: entry.height - 4 }}
                  >
                    <div className="truncate font-semibold">{entry.title}</div>
                    <div className="truncate text-[11px] text-white/80">{getEventSubtitle?.(entry) || `${format(parseISO(entry.start_datetime), "h:mm a")} – ${format(parseISO(entry.end_datetime), "h:mm a")}`}</div>
                    <div
                      className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize rounded-b-xl bg-black/10"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setInteraction({ type: "resize", entry, dayIndex, slotIndex: Math.max(0, Math.round((entry.top + entry.height) / SLOT_HEIGHT)) });
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
