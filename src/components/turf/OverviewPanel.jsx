import { formatMoney, moneySnapshot } from "@/lib/turf/money";
import { splitSchedule } from "@/lib/turf/schedule";

export default function OverviewPanel({ model, onOpen, tracks = { install: true, distribution: true } }) {
  const { orders, receivable, partialFloor, partialOrders, payable, payablePartial } = moneySnapshot(model);
  const schedule = splitSchedule(model, {});
  const openInstall = tracks.install ? [...schedule.dated, ...schedule.undated].filter((item) => item.track === "install" && item.status !== "paid") : [];
  const openOrders = tracks.distribution ? orders.filter((row) => row.order.status !== "paid") : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tracks.install && <Stat label="Open install jobs" value={openInstall.length} detail={`${schedule.dated.filter((item) => item.track === "install").length} dated`} onClick={() => onOpen("install")} />}
        {tracks.distribution && <Stat label="Open distribution orders" value={openOrders.length} detail={`${schedule.undated.filter((item) => item.track === "distribution").length} with no delivery date`} onClick={() => onOpen("distribution")} />}
        {tracks.distribution && <Stat label="Customers owe" value={formatMoney(receivable)} detail={partialOrders ? `${partialOrders} more still have a blank price (known portion ${formatMoney(partialFloor)})` : "Priced orders, after payments"} onClick={() => onOpen("distribution")} />}
        {tracks.distribution && <Stat label="Owed to suppliers" value={formatMoney(payable)} detail={payablePartial ? `${payablePartial} supplier bills have no amount yet` : "Purchases that are not marked paid"} onClick={() => onOpen("distribution")} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {tracks.install && <ListCard title="Open install jobs" action="Schedule" onAction={() => onOpen("schedule")} empty="No open install jobs.">
          {openInstall.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-900">{item.title}</div>
                <div className="text-slate-500">{item.statusLabel}{item.nextAction ? ` · ${item.nextAction}` : ""}</div>
              </div>
              <div className="text-right text-slate-500">{item.date || "No date"}</div>
            </li>
          ))}
        </ListCard>}
        {tracks.distribution && <ListCard title="Open distribution orders" action="Orders" onAction={() => onOpen("distribution")} empty="No open material orders.">
          {openOrders.map(({ order, totals, balance }) => (
            <li key={order.id} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-900">{order.order_number}</div>
                <div className="text-slate-500">{order.bill_to_name || "No customer"} · {order.status}{totals.pricingIncomplete ? " · price missing" : totals.margin != null ? ` · margin ${formatMoney(totals.margin)}` : ""}</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-slate-900">{formatMoney(balance.amount)} due</div>
                <div className="text-slate-500">{order.schedule_date || "No date"}</div>
              </div>
            </li>
          ))}
        </ListCard>}
      </div>
    </div>
  );
}

function Stat({ label, value, detail, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-amber-300">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </button>
  );
}

function ListCard({ title, action, onAction, empty, children }) {
  const items = Array.isArray(children) ? children : [children];
  const filled = items.some(Boolean);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onAction} className="text-sm font-medium text-amber-800 hover:underline">{action}</button>
      </div>
      {filled ? <ul>{children}</ul> : <p className="py-6 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}
