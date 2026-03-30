import { format } from "date-fns";
import { buildWeekDays, entryOverlapsDay, sortEntries } from "@/lib/calendarUtils";
import { cn } from "@/lib/utils";

export default function CalendarWeekListView({ currentDate, entries, entryClassName, getEntryLabel, onEntryClick }) {
  const days = buildWeekDays(currentDate);

  return (
    <div className="grid gap-4 md:grid-cols-7">
      {days.map((day) => {
        const dayEntries = sortEntries(entries.filter((entry) => entryOverlapsDay(entry, day)));
        return (
          <div key={day.toISOString()} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 border-b border-slate-100 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{format(day, "EEE")}</p>
              <p className="text-lg font-semibold text-slate-800">{format(day, "MMM d")}</p>
            </div>
            <div className="space-y-2">
              {dayEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">No items</div>
              ) : dayEntries.map((entry) => (
                <button
                  key={`${entry.id}-${day.toISOString()}`}
                  onClick={() => onEntryClick?.(entry)}
                  className={cn("w-full rounded-xl px-3 py-2 text-left text-xs font-medium", entryClassName)}
                >
                  {getEntryLabel(entry)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}