import { format } from "date-fns";
import { entryOverlapsDay, sortEntries } from "@/lib/calendarUtils";

export default function OperationsDayView({ currentDate, entries }) {
  const assignees = [...new Set(entries.map((entry) => entry.assignee).filter(Boolean))].sort();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-lg font-semibold text-slate-900">{format(currentDate, "EEEE, MMMM d")}</p>
      </div>
      {assignees.length === 0 ? (
        <div className="px-4 py-12 text-center text-slate-500">No crew work scheduled for this day.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {assignees.map((assignee) => {
            const items = sortEntries(entries.filter((entry) => entry.assignee === assignee && entryOverlapsDay(entry, currentDate)));
            return (
              <div key={assignee} className="grid gap-3 px-4 py-4 md:grid-cols-[180px_1fr]">
                <div className="font-medium text-slate-800">{assignee}</div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">No work assigned</div>
                  ) : items.map((entry) => (
                    <div key={entry.id} className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      <div className="font-semibold">{entry.project_name || entry.projectName}</div>
                      <div>{entry.title}</div>
                      {entry.location && <div className="text-xs text-amber-700">{entry.location}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}