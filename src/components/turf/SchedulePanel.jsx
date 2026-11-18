import { useMemo, useState } from "react";
import { addMonths, addWeeks, format, isSameMonth } from "date-fns";
import { buildMonthWeeks, buildWeekDays } from "@/lib/calendarUtils";
import { STAGE_FILTERS } from "@/lib/turf/constants";
import { customerOptions, entryClass, groupUndated, scheduleCensus, splitSchedule } from "@/lib/turf/schedule";
import { cn } from "@/lib/utils";

const inputClass = "h-8 w-full min-w-[7rem] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900";

export default function SchedulePanel({ model, readOnly, initialDate, onPatch, onOpen, tracks = { install: true, distribution: true }, companyName = "Turf'n Texas" }) {
  const [cursor, setCursor] = useState(() => initialDate || new Date());
  const [view, setView] = useState("week");
  const [track, setTrack] = useState(() => new URLSearchParams(window.location.search).get("track") || "all");
  const [stage, setStage] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [group, setGroup] = useState("track");
  const [over, setOver] = useState("");

  const filters = { track, stage, customer };
  const allowed = (item) => (item.track === "install" ? tracks.install : tracks.distribution);
  const everything = useMemo(() => splitSchedule(model, {}), [model]);
  const split = useMemo(() => splitSchedule(model, filters), [model, track, stage, customer]);
  const dated = split.dated.filter(allowed);
  const undated = split.undated.filter(allowed);
  const customers = customerOptions([...everything.dated, ...everything.undated].filter(allowed));
  const census = scheduleCensus(model);
  const stageChoices = STAGE_FILTERS.filter((item) => track === "all" || item.track === track || item.track === "both");
  const sections = groupUndated(undated, group);
  const byDay = (day) => dated.filter((item) => item.date === format(day, "yyyy-MM-dd"));

  const dropOn = (day) => (event) => {
    event.preventDefault();
    setOver("");
    if (readOnly) return;
    const id = event.dataTransfer.getData("text/plain");
    const item = [...dated, ...undated].find((entry) => entry.id === id);
    if (!item) return;
    onPatch(item, { date: format(day, "yyyy-MM-dd") });
  };

  const days = view === "week"
    ? buildWeekDays(cursor)
    : buildMonthWeeks(cursor).flat();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {["week", "month"].map((mode) => (
            <button key={mode} type="button" onClick={() => setView(mode)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize", view === mode ? "bg-slate-900 text-white" : "text-slate-600")}>{mode}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" onClick={() => setCursor((date) => view === "month" ? addMonths(date, -1) : addWeeks(date, -1))}>Back</button>
          <button type="button" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" onClick={() => setCursor(initialDate || new Date())}>Today</button>
          <button type="button" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" onClick={() => setCursor((date) => view === "month" ? addMonths(date, 1) : addWeeks(date, 1))}>Next</button>
          <p className="px-2 text-sm font-semibold text-slate-800">{format(cursor, view === "month" ? "MMMM yyyy" : "'Week of' MMM d, yyyy")}</p>
        </div>
        <Filter label="Track" value={track} onChange={setTrack} options={[
          ["all", "Install and distribution"],
          ...(tracks.install ? [["install", "Install"]] : []),
          ...(tracks.distribution ? [["distribution", "Distribution"]] : []),
        ]} />
        <Filter label="Stage" value={stage} onChange={setStage} options={[["all", "All stages"], ...stageChoices.map((item) => [item.key, item.label])]} />
        <Filter label="Customer" value={customer} onChange={setCustomer} options={[["all", "All customers"], ...customers.map((name) => [name, name])]} />
      </div>

      <p className="text-sm text-slate-700">
        <span className="font-semibold">{census.shown} jobs</span> from {companyName} ({census.dated} with a date, {census.undated} unscheduled).
        Database count: {census.projects} project{census.projects === 1 ? "" : "s"}, {census.soldLeads} sold lead{census.soldLeads === 1 ? "" : "s"}, {census.soldEstimates} sold estimate{census.soldEstimates === 1 ? "" : "s"}.
        {census.projects + census.soldLeads + census.soldEstimates > census.shown ? " A sold lead that is already a project is listed once." : ""}
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <Swatch className="bg-emerald-200 text-emerald-950 border-emerald-400" label="Install" />
        {tracks.distribution && <Swatch className="bg-amber-200 text-amber-950 border-amber-400" label="Distribution" />}
        <span className="text-slate-500">Darker means further along. Drag a card onto a day to move it. Clearing the date in the report below takes it off the calendar.</span>
      </div>

      {view === "week" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {days.map((day) => (
              <DayColumn key={day.toISOString()} day={day} items={byDay(day)} hot={over === format(day, "yyyy-MM-dd")} readOnly={readOnly} onDragOver={() => setOver(format(day, "yyyy-MM-dd"))} onDrop={dropOn(day)} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-7 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <div key={label} className="px-2 py-2">{label}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                onDragOver={(event) => { event.preventDefault(); setOver(format(day, "yyyy-MM-dd")); }}
                onDrop={dropOn(day)}
                className={cn("min-h-[108px] border-b border-r border-slate-100 p-1", !isSameMonth(day, cursor) && "bg-slate-50", over === format(day, "yyyy-MM-dd") && "bg-amber-50")}
              >
                <div className={cn("px-1 text-xs font-semibold", isSameMonth(day, cursor) ? "text-slate-700" : "text-slate-300")}>{format(day, "d")}</div>
                <div className="space-y-1">
                  {byDay(day).slice(0, 3).map((item) => <Chip key={item.id} item={item} readOnly={readOnly} onOpen={onOpen} />)}
                  {byDay(day).length > 3 && <div className="px-1 text-[11px] text-slate-400">+{byDay(day).length - 3}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Unscheduled</h2>
            <p className="text-sm text-slate-500">Every {companyName} {tracks.distribution ? "install and distribution order" : "job"} with no date. Edit a row here. A date moves it onto the calendar.</p>
          </div>
          <Filter label="Group" value={group} onChange={setGroup} options={[["track", "Install / distribution"], ["customer", "Customer"], ["none", "One list"]]} />
        </div>
        {undated.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500">Nothing in this filter is waiting on a date.</p>
        ) : sections.map((section) => (
          <div key={section.key}>
            {group !== "none" && <h3 className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{section.label}</h3>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-2 py-2 font-medium">Customer</th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">{section.key === "distribution" ? "Driver" : "Crew"}</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Next action</th>
                    <th className="px-2 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <UnscheduledRow key={item.id} item={item} readOnly={readOnly} onPatch={onPatch} onOpen={onOpen} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function DayColumn({ day, items, hot, readOnly, onDragOver, onDrop, onOpen }) {
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      className={cn("min-h-[220px] rounded-2xl border bg-white p-2", hot ? "border-amber-400 bg-amber-50" : "border-slate-200")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{format(day, "EEE")}</p>
      <p className="mb-2 text-sm font-semibold text-slate-800">{format(day, "MMM d")}</p>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-[11px] text-slate-400">Drop here</p>}
        {items.map((item) => <Chip key={item.id} item={item} readOnly={readOnly} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function Chip({ item, readOnly, onOpen }) {
  return (
    <button
      type="button"
      draggable={!readOnly}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen?.(item)}
      className={cn("block w-full cursor-grab rounded-md border px-2 py-1 text-left active:cursor-grabbing", entryClass(item))}
    >
      <div className="truncate text-xs font-semibold">{item.title}</div>
      <div className="truncate text-[11px] opacity-80">{item.statusLabel}{item.crew ? ` · ${item.crew}` : ""}</div>
    </button>
  );
}

function UnscheduledRow({ item, readOnly, onPatch, onOpen }) {
  const stages = STAGE_FILTERS.filter((choice) => choice.track === item.track || choice.track === "both");
  return (
    <tr className="border-b border-slate-50 align-top">
      <td className="px-4 py-2">
        <button type="button" className="text-left font-medium text-slate-900 hover:underline" onClick={() => onOpen?.(item)}>{item.title}</button>
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.track === "install" ? "Install" : "Distribution"}</div>
      </td>
      <td className="px-2 py-2 text-slate-600">{item.customer}</td>
      <td className="px-2 py-2">
        <input aria-label={`Date for ${item.title}`} type="date" disabled={readOnly} className={inputClass} defaultValue="" onChange={(event) => onPatch(item, { date: event.target.value || null })} />
      </td>
      <td className="px-2 py-2">
        <input aria-label={`Crew for ${item.title}`} disabled={readOnly} className={inputClass} defaultValue={item.crew} onBlur={(event) => { if (event.target.value !== item.crew) onPatch(item, { crew: event.target.value }); }} />
      </td>
      <td className="px-2 py-2">
        <select aria-label={`Status for ${item.title}`} disabled={readOnly} className={inputClass} value={item.status} onChange={(event) => onPatch(item, { status: event.target.value })}>
          {stages.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input aria-label={`Next action for ${item.title}`} disabled={readOnly} className={inputClass} defaultValue={item.nextAction} onBlur={(event) => { if (event.target.value !== item.nextAction) onPatch(item, { nextAction: event.target.value }); }} />
      </td>
      <td className="px-2 py-2">
        <input aria-label={`Notes for ${item.title}`} disabled={readOnly} className={inputClass} defaultValue={item.notes} onBlur={(event) => { if (event.target.value !== item.notes) onPatch(item, { notes: event.target.value }); }} />
      </td>
    </tr>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-normal normal-case tracking-normal text-slate-900">
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function Swatch({ className, label }) {
  return <span className={cn("rounded-full border px-2 py-1 font-semibold", className)}>{label}</span>;
}
