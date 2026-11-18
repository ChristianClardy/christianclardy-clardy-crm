import { useMemo, useState } from "react";
import { INSTALL_STAGES } from "@/lib/turf/constants";
import { blankJob } from "@/lib/turf/fixtures";
import { formatMoney, sumPayments } from "@/lib/turf/money";
import { allScheduleItems, entryClass } from "@/lib/turf/schedule";
import { cn } from "@/lib/utils";

const inputClass = "mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm";

export default function InstallBoard({ model, readOnly, focusId, onSaveJob, onRecordPayment }) {
  const items = useMemo(() => allScheduleItems(model).filter((item) => item.track === "install"), [model]);
  const [selected, setSelected] = useState(focusId || null);
  const current = items.find((item) => item.recordId === selected || item.id === selected) || null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Leads and projects already filed under Turf&apos;n Texas show here. Saving one files an install job and does not change the lead, so it does not start a text or email.</p>
        <button type="button" disabled={readOnly} onClick={() => { const job = blankJob({ name: "New install" }); setSelected(job.id); onSaveJob(job); }} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50">Add install</button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-6 gap-2">
          {INSTALL_STAGES.map((stage) => {
            const cards = items.filter((item) => item.status === stage.key);
            return (
              <div key={stage.key} className="rounded-2xl bg-slate-100 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stage.label}</h3>
                  <span className="text-xs text-slate-400">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((item) => (
                    <button key={item.id} type="button" onClick={() => setSelected(item.recordId)} className={cn("block w-full rounded-xl border px-2 py-2 text-left", entryClass(item), selected === item.recordId && "ring-2 ring-slate-900")}>
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-[11px] opacity-80">{item.customer}</div>
                      <div className="mt-1 text-[11px]">{item.date || "No date"}{item.crew ? ` · ${item.crew}` : ""}</div>
                      <div className="mt-1 text-[11px]">{moneyLine(item, model.payments)}</div>
                      {item.nextAction && <div className="mt-1 text-[11px]">Next: {item.nextAction}</div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {current && (
        <JobEditor
          key={current.id}
          item={current}
          job={(model.jobs || []).find((job) => job.id === current.recordId)}
          orders={model.orders || []}
          payments={model.payments || []}
          readOnly={readOnly}
          onSaveJob={onSaveJob}
          onRecordPayment={onRecordPayment}
        />
      )}
    </div>
  );
}

function moneyLine(item, payments) {
  const collected = sumPayments(payments, (payment) => payment.turf_install_job_id === item.recordId || (item.projectId && payment.linked_job_id === item.projectId));
  const sell = item.sell == null ? "Sell —" : `Sell ${formatMoney(item.sell)}`;
  const cost = item.cost == null ? "Cost —" : `Cost ${formatMoney(item.cost)}`;
  return `${sell} · ${cost} · Collected ${formatMoney(collected)}`;
}

function JobEditor({ item, job, orders, payments, readOnly, onSaveJob, onRecordPayment }) {
  const source = job || {
    id: item.kind === "job" ? item.recordId : undefined,
    name: item.title,
    customer_name: item.customer,
    address: item.address,
    stage: item.status,
    crew: item.crew,
    scheduled_on: item.date,
    materials: item.materials,
    next_action: item.nextAction,
    notes: item.notes,
    sell_amount: item.sell,
    cost_amount: item.cost,
    lead_id: item.kind === "lead" ? item.recordId : null,
    project_id: item.kind === "project" ? item.recordId : item.projectId,
    distribution_order_id: item.orderId,
  };
  const [form, setForm] = useState(source);
  const [pay, setPay] = useState({ amount: "", date: "", reference: "" });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const collected = sumPayments(payments, (payment) => payment.turf_install_job_id === form.id || (form.project_id && payment.linked_job_id === form.project_id));

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSaveJob({
          ...form,
          id: form.id || crypto.randomUUID(),
          sell_amount: form.sell_amount === "" ? null : form.sell_amount,
          cost_amount: form.cost_amount === "" ? null : form.cost_amount,
          scheduled_on: form.scheduled_on || null,
          distribution_order_id: form.distribution_order_id || null,
        });
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{form.name || "Install"}</h3>
        <span className="text-sm text-slate-500">Collected {formatMoney(collected)} from payments</span>
      </div>
      {item.kind !== "job" && <p className="mb-3 text-sm text-amber-800">This is already in the CRM. Saving files a Turf&apos;n Texas install job linked to it. The lead or project itself is not edited.</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job<input className={inputClass} value={form.name || ""} onChange={set("name")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer<input className={inputClass} value={form.customer_name || ""} onChange={set("customer_name")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address<input className={inputClass} value={form.address || ""} onChange={set("address")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stage
          <select className={inputClass} value={form.stage || "lead"} onChange={set("stage")} disabled={readOnly}>
            {INSTALL_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Crew<input className={inputClass} value={form.crew || ""} onChange={set("crew")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Install date<input type="date" className={inputClass} value={form.scheduled_on || ""} onChange={set("scheduled_on")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sell<input type="number" step="0.01" className={inputClass} value={form.sell_amount ?? ""} onChange={set("sell_amount")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost<input type="number" step="0.01" className={inputClass} value={form.cost_amount ?? ""} onChange={set("cost_amount")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Material order
          <select className={inputClass} value={form.distribution_order_id || ""} onChange={set("distribution_order_id")} disabled={readOnly}>
            <option value="">None</option>
            {orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Materials<input className={inputClass} value={form.materials || ""} onChange={set("materials")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next action<input className={inputClass} value={form.next_action || ""} onChange={set("next_action")} disabled={readOnly} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-3">Notes<textarea className={`${inputClass} h-20 py-2`} value={form.notes || ""} onChange={set("notes")} disabled={readOnly} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <button type="submit" disabled={readOnly} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50">Save job</button>
        <input aria-label="Payment amount" type="number" step="0.01" placeholder="Check amount" disabled={readOnly || !form.id} className="h-9 w-32 rounded-md border border-slate-200 px-2 text-sm" value={pay.amount} onChange={(event) => setPay((current) => ({ ...current, amount: event.target.value }))} />
        <input aria-label="Payment date" type="date" disabled={readOnly || !form.id} className="h-9 rounded-md border border-slate-200 px-2 text-sm" value={pay.date} onChange={(event) => setPay((current) => ({ ...current, date: event.target.value }))} />
        <input aria-label="Check number" placeholder="Check #" disabled={readOnly || !form.id} className="h-9 w-28 rounded-md border border-slate-200 px-2 text-sm" value={pay.reference} onChange={(event) => setPay((current) => ({ ...current, reference: event.target.value }))} />
        <button
          type="button"
          disabled={readOnly || !form.id || !pay.amount}
          className="h-9 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50"
          onClick={() => {
            onRecordPayment({ amount: pay.amount, date: pay.date, method: "Check", reference: pay.reference, notes: "Install payment", installJobId: form.id, projectId: form.project_id || null });
            setPay({ amount: "", date: "", reference: "" });
          }}
        >Record check</button>
      </div>
    </form>
  );
}
