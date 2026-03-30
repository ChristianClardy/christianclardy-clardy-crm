import { format } from "date-fns";
import { buildWeekDays, entryOverlapsDay, sortEntries } from "@/lib/calendarUtils";

export default function OperationsWeekView({ currentDate, entries }) {
  const days = buildWeekDays(currentDate);
  const assignees = [...new Set(entries.map((entry) => entry.assignee).filter(Boolean))].sort();

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Crew / Sub</th>
            {days.map((day) => (
              <th key={day.toISOString()} className="px-4 py-3 text-center">{format(day, "EEE d")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignees.length === 0 ? (
            <tr>
              <td colSpan={days.length + 1} className="px-4 py-12 text-center text-slate-500">No assigned project-sheet work found.</td>
            </tr>
          ) : assignees.map((assignee) => (
            <tr key={assignee} className="border-b border-slate-100 align-top last:border-b-0">
              <td className="px-4 py-4 font-medium text-slate-800">{assignee}</td>
              {days.map((day) => {
                const dayEntries = sortEntries(entries.filter((entry) => entry.assignee === assignee && entryOverlapsDay(entry, day)));
                return (
                  <td key={`${assignee}-${day.toISOString()}`} className="px-3 py-3">
                    <div className="space-y-2">
                      {dayEntries.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-[11px] text-slate-300">—</div>
                      ) : dayEntries.map((entry) => (
                        <div key={entry.id} className="rounded-lg bg-amber-50 px-2 py-2 text-xs text-amber-900">
                          <div className="font-semibold">{entry.projectName}</div>
                          <div>{entry.title}</div>
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}