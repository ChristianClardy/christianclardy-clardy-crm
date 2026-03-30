import { format, parseISO } from "date-fns";
import { groupAgendaEntries } from "@/lib/calendarEngine";

export default function CalendarAgendaView({ entries, renderMeta, onEntryClick }) {
  const grouped = groupAgendaEntries(entries);

  if (grouped.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">No upcoming items found.</div>;
  }

  return (
    <div className="space-y-4">
      {grouped.map(([dateKey, items]) => (
        <div key={dateKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{format(parseISO(dateKey), "EEEE, MMMM d")}</p>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((entry) => (
              <button key={entry.id} onClick={() => onEntryClick?.(entry)} className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{entry.title}</p>
                  <p className="text-sm text-slate-500">{entry.location || entry.project_name || "No location"}</p>
                </div>
                <div className="text-sm text-slate-500">{renderMeta?.(entry)}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}