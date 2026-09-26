import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CalendarDays, Loader2, MapPin, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtLong, fmtShort, todayIso, isDone, STATUS_STYLE } from "@/lib/schedule";

// A subcontractor's own booked tasks across their jobs, from the Builder
// Portal schedules. sub_portal_schedule() (039_builder_portal_pm.sql) returns
// only rows booked to this sub on jobs they're assigned to.
export default function SubSchedule() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    supabase.rpc("sub_portal_schedule").then(({ data, error: err }) => {
      if (err) setError(err.message);
      setRows(data || []);
    });
  }, []);

  if (!rows) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  if (error) return <p className="text-sm text-rose-600">Couldn't load your schedule: {error}</p>;

  const today = todayIso();
  const past = (r) => isDone(r) || (r.end_date && r.end_date < today);
  const visible = rows.filter((r) => showPast || !past(r));
  const current = visible.filter((r) => !past(r) && r.start_date && r.start_date <= today);
  const upcoming = visible.filter((r) => !past(r) && !(r.start_date && r.start_date <= today));
  const done = visible.filter(past);

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500" style={{ borderColor: "#ddd5c8" }}>
        <CalendarDays className="w-7 h-7 mx-auto mb-2 text-slate-300" />
        You're not booked on any job tasks yet. Your project manager will add you to the schedule.
      </div>
    );
  }

  const Group = ({ title, items }) => items.length > 0 && (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold" style={{ color: "#3d3530" }}>{title}</h3>
      <div className="rounded-xl border bg-white divide-y divide-slate-100" style={{ borderColor: "#ddd5c8" }}>
        {items.map((r) => (
          <div key={`${r.project_id}-${r.row_id}`} className="px-4 py-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn("font-medium text-slate-900", isDone(r) && "line-through text-slate-400")}>{r.task}</p>
                <p className="text-xs text-slate-500"><MapPin className="w-3 h-3 inline -mt-0.5" /> {r.project_name}{r.phase ? ` · ${r.phase}` : ""}</p>
              </div>
              <span className={cn("shrink-0 text-xs font-medium px-2 py-0.5 rounded-full", STATUS_STYLE[r.status] || STATUS_STYLE["Not Started"])}>{r.status || "Not Started"}</span>
            </div>
            <p className="text-sm text-slate-700">
              <CalendarDays className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              {r.start_date ? (r.start_date === r.end_date ? fmtLong(r.start_date) : `${fmtLong(r.start_date)} – ${fmtShort(r.end_date)}`) : "Date to be confirmed"}
            </p>
            {r.notes && <p className="text-xs rounded-lg bg-amber-50 px-2 py-1 text-amber-900"><StickyNote className="w-3 h-3 inline -mt-0.5 mr-1" />{r.notes}</p>}
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <Group title="On now" items={current} />
      <Group title="Coming up" items={upcoming} />
      {showPast && <Group title="Finished" items={done} />}
      <button onClick={() => setShowPast((v) => !v)} className="text-sm font-medium hover:underline" style={{ color: "#b5965a" }}>
        {showPast ? "Hide finished" : "Show finished"}
      </button>
    </div>
  );
}
