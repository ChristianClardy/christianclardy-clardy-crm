import { addDays, differenceInCalendarDays, format, isAfter, isBefore, startOfDay } from "date-fns";
import { buildWeekDays, entryRange, sortEntries } from "@/lib/calendarUtils";
import { cn } from "@/lib/utils";

const STATUS_CLASSES = {
  scheduled: "bg-slate-700",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  delayed: "bg-rose-500",
};

function buildLanes(entries, visibleStart, visibleEnd) {
  const laneEnds = [];

  return sortEntries(entries)
    .map((entry) => {
      const range = entryRange(entry);
      if (!range.start || !range.end) return null;

      const start = startOfDay(range.start);
      const end = startOfDay(range.end);
      if (isAfter(start, visibleEnd) || isBefore(end, visibleStart)) return null;

      const clampedStart = isBefore(start, visibleStart) ? visibleStart : start;
      const clampedEnd = isAfter(end, visibleEnd) ? visibleEnd : end;

      let laneIndex = laneEnds.findIndex((laneEnd) => isAfter(start, laneEnd));
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[laneIndex] = end;
      }

      return { entry, laneIndex, clampedStart, clampedEnd };
    })
    .filter(Boolean);
}

export default function OperationsResourceTimeline({ currentDate, viewMode, entries, onEntryClick }) {
  const days = viewMode === "day" ? [startOfDay(currentDate)] : buildWeekDays(currentDate);
  const visibleStart = days[0];
  const visibleEnd = days[days.length - 1];
  const dayWidth = viewMode === "day" ? 720 : 170;
  const resources = [...new Set(entries.map((entry) => entry.assignee).filter(Boolean))].sort();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Resource Timeline</h2>
        <p className="mt-1 text-sm text-slate-500">See crew and subcontractor allocation from project schedule assignments.</p>
      </div>

      {resources.length === 0 ? (
        <div className="px-6 py-12 text-center text-slate-500">No assigned project-sheet work found for this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${220 + days.length * dayWidth}px` }}>
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `220px ${days.length * dayWidth}px` }}>
              <div className="border-r border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Resource</div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)` }}>
                {days.map((day) => (
                  <div key={day.toISOString()} className="border-r border-slate-200 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 last:border-r-0">
                    {format(day, viewMode === "day" ? "EEEE, MMM d" : "EEE d")}
                  </div>
                ))}
              </div>
            </div>

            {resources.map((resource) => {
              const resourceEntries = entries.filter((entry) => entry.assignee === resource);
              const lanes = buildLanes(resourceEntries, visibleStart, visibleEnd);
              const laneCount = Math.max(1, lanes.reduce((max, item) => Math.max(max, item.laneIndex + 1), 0));

              return (
                <div key={resource} className="grid border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: `220px ${days.length * dayWidth}px` }}>
                  <div className="border-r border-slate-200 bg-white px-4 py-4">
                    <div className="font-medium text-slate-900">{resource}</div>
                    <div className="mt-1 text-xs text-slate-500">{lanes.length} allocation{lanes.length === 1 ? "" : "s"}</div>
                  </div>

                  <div className="relative bg-white" style={{ height: `${laneCount * 42 + 16}px` }}>
                    {days.map((day, index) => (
                      <div
                        key={`${resource}-${day.toISOString()}`}
                        className="absolute inset-y-0 border-r border-slate-100 last:border-r-0"
                        style={{ left: index * dayWidth, width: dayWidth }}
                      />
                    ))}

                    {lanes.map(({ entry, laneIndex, clampedStart, clampedEnd }) => {
                      const offset = differenceInCalendarDays(clampedStart, visibleStart);
                      const span = differenceInCalendarDays(addDays(clampedEnd, 1), clampedStart);

                      return (
                        <button
                          type="button"
                          key={entry.id}
                          title={`${entry.project_name} • ${entry.title}`}
                          onClick={() => onEntryClick?.(entry)}
                          className={cn(
                            "absolute overflow-hidden rounded-xl px-3 py-2 text-left text-xs text-white shadow-sm ring-1 ring-black/5 transition-opacity hover:opacity-90",
                            STATUS_CLASSES[entry.status] || STATUS_CLASSES.scheduled,
                            onEntryClick && "cursor-pointer"
                          )}
                          style={{
                            left: offset * dayWidth + 4,
                            top: laneIndex * 42 + 8,
                            width: Math.max(span * dayWidth - 8, 96),
                          }}
                        >
                          <div className="truncate font-semibold">{entry.project_name}</div>
                          <div className="truncate text-[11px] text-white/90">{entry.title}</div>
                          {entry.client_name ? <div className="truncate text-[10px] text-white/75">{entry.client_name}</div> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}