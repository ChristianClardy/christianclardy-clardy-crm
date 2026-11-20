import { useEffect, useState } from "react";
import { ORDER_STATUSES, PURCHASE_STATUSES } from "@/lib/turf/constants";
import { blankLine, blankOrder } from "@/lib/turf/fixtures";
import { lineFromProduct } from "@/lib/turf/model";
import { downloadInvoicePdf } from "@/lib/turf/invoicePdf";
import { formatMoney, formatTotal, orderTotals, paymentAppliesToOrder, sumPayments } from "@/lib/turf/money";
import InvoiceSheet from "./InvoiceSheet";
import StripeOrderBox from "./StripeOrderBox";

const inputClass = "mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm";

export default function DistributionPanel({ model, readOnly, focusId, onSaveOrder, onSavePurchase, onDeletePurchase, onRecordPayment, brand = "turf" }) {
  const [selected, setSelected] = useState(focusId || null);
  useEffect(() => { if (focusId) setSelected(focusId); }, [focusId]);
  const order = (model.orders || []).find((row) => row.id === selected);

  if (!order) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button type="button" disabled={readOnly} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => {
            const created = blankOrder(model.settings, { order_number: "New order" });
            onSaveOrder(created, []);
            setSelected(created.id);
          }}>New order</button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-2 py-3 font-medium">Customer</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-2 py-3 font-medium">Delivery</th>
                <th className="px-2 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {(model.orders || []).map((row) => {
                const lines = (model.lines || []).filter((line) => line.order_id === row.id);
                const totals = orderTotals(row, lines);
                const customer = (model.customers || []).find((item) => item.id === row.customer_id);
                return (
                  <tr key={row.id} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50" onClick={() => setSelected(row.id)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.order_number}</td>
                    <td className="px-2 py-3">{customer?.name || row.bill_to_name || "—"}</td>
                    <td className="px-2 py-3">{ORDER_STATUSES.find((item) => item.key === row.status)?.label || row.status}</td>
                    <td className="px-2 py-3">{row.schedule_date || "Unscheduled"}</td>
                    <td className="px-2 py-3 text-right">{formatTotal(totals.total, totals.pricingIncomplete)}</td>
                    <td className="px-4 py-3 text-right">{totals.margin == null ? <span className="text-[#ba4444]">Needs prices</span> : formatMoney(totals.margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <OrderEditor
      key={order.id}
      order={order}
      lines={(model.lines || []).filter((line) => line.order_id === order.id)}
      model={model}
      readOnly={readOnly}
      onBack={() => setSelected(null)}
      onSaveOrder={onSaveOrder}
      onSavePurchase={onSavePurchase}
      onDeletePurchase={onDeletePurchase}
      onRecordPayment={onRecordPayment}
      brand={brand}
    />
  );
}

function OrderEditor({ order, lines, model, readOnly, onBack, onSaveOrder, onSavePurchase, onDeletePurchase, onRecordPayment, brand = "turf" }) {
  const [form, setForm] = useState(order);
  const [rows, setRows] = useState(lines);
  const [pay, setPay] = useState({ amount: "", date: "", reference: "" });
  const totals = orderTotals(form, rows);
  const collected = sumPayments(model.payments, (payment) => paymentAppliesToOrder(payment, order.id));
  const turfBrand = brand !== "generic";
  const balance = Math.round((totals.total - collected) * 100) / 100;
  const purchases = (model.purchases || []).filter((purchase) => purchase.order_id === order.id);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = () => onSaveOrder(normalize(form), rows.map(normalizeLine));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="text-sm font-medium text-slate-500 hover:text-slate-900">All orders</button>
        <div className="flex flex-wrap gap-1">
          {ORDER_STATUSES.map((status) => (
            <button key={status.key} type="button" disabled={readOnly} onClick={() => setForm((current) => ({ ...current, status: status.key }))} className={`rounded-full px-3 py-1 text-xs font-semibold ${form.status === status.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{status.label}</button>
          ))}
        </div>
      </div>
      {form.status === "paid" && collected <= 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Status is Paid, and no check is recorded. The balance still shows as owed until a payment is entered.</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order #<input className={inputClass} value={form.order_number || ""} onChange={set("order_number")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer
              <select className={inputClass} value={form.customer_id || ""} disabled={readOnly} onChange={(event) => {
                const customer = (model.customers || []).find((item) => item.id === event.target.value);
                setForm((current) => ({
                  ...current,
                  customer_id: event.target.value || null,
                  bill_to_name: current.bill_to_name || customer?.name || "",
                  bill_to_address: current.bill_to_address || customer?.bill_to_address || "",
                  contact_name: current.contact_name || customer?.contact_name || "",
                }));
              }}>
                <option value="">Choose</option>
                {(model.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer name<input className={inputClass} value={form.contact_name || ""} onChange={set("contact_name")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to<input className={inputClass} value={form.bill_to_name || ""} onChange={set("bill_to_name")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Bill to address<textarea className={`${inputClass} h-20 py-2`} value={form.bill_to_address || ""} onChange={set("bill_to_address")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deliver to<input className={inputClass} value={form.deliver_to || ""} onChange={set("deliver_to")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery / pickup<input type="date" className={inputClass} value={form.schedule_date || ""} onChange={set("schedule_date")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Driver / crew<input className={inputClass} value={form.crew || ""} onChange={set("crew")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice date<input type="date" className={inputClass} value={form.invoice_date || ""} onChange={set("invoice_date")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery fee<input type="number" step="0.01" className={inputClass} value={form.delivery_fee ?? ""} onChange={set("delivery_fee")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax rate<input type="number" step="0.0001" className={inputClass} value={form.tax_rate ?? ""} onChange={set("tax_rate")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment<input className={inputClass} value={form.payment_method || ""} onChange={set("payment_method")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Next action<input className={inputClass} value={form.next_action || ""} onChange={set("next_action")} disabled={readOnly} /></label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-3">Notes<textarea className={`${inputClass} h-16 py-2`} value={form.notes || ""} onChange={set("notes")} disabled={readOnly} /></label>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Rate</th>
                  <th className="px-2 py-2 font-medium">Cost</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => (
                  <tr key={line.id} className="border-b border-slate-50">
                    <td className="px-3 py-2">
                      <input aria-label="Description" className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm" value={line.description || ""} disabled={readOnly} onChange={(event) => updateLine(setRows, line.id, { description: event.target.value })} />
                      <input aria-label="Detail" className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" value={line.detail || ""} disabled={readOnly} onChange={(event) => updateLine(setRows, line.id, { detail: event.target.value })} />
                    </td>
                    <td className="px-2 py-2"><input aria-label="Quantity" type="number" className="h-8 w-20 rounded-md border border-slate-200 px-2 text-sm" value={line.qty} disabled={readOnly} onChange={(event) => updateLine(setRows, line.id, { qty: event.target.value })} /></td>
                    <td className="px-2 py-2">
                      <input aria-label="Sell rate" type="number" step="0.01" placeholder="TBD" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-sm" value={line.rate ?? ""} disabled={readOnly} onChange={(event) => updateLine(setRows, line.id, { rate: event.target.value === "" ? null : event.target.value, rate_unknown: event.target.value === "" })} />
                      {line.rate_unknown && <div className="text-[11px] font-semibold text-[#ba4444]">No price</div>}
                    </td>
                    <td className="px-2 py-2">
                      <input aria-label="Unit cost" type="number" step="0.01" placeholder="Unknown" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-sm" value={line.unit_cost ?? ""} disabled={readOnly} onChange={(event) => updateLine(setRows, line.id, { unit_cost: event.target.value === "" ? null : event.target.value, cost_unknown: event.target.value === "" })} />
                    </td>
                    <td className="px-2 py-2"><button type="button" className="text-xs text-slate-400" disabled={readOnly} onClick={() => setRows((current) => current.filter((row) => row.id !== line.id))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2 p-3">
              <select aria-label="Add a catalog product" disabled={readOnly} className="h-9 rounded-md border border-slate-200 px-2 text-sm" value="" onChange={(event) => {
                const product = (model.products || []).find((item) => item.id === event.target.value);
                if (!product) return;
                setRows((current) => [...current, lineFromProduct(order.id, product, current.length + 1)]);
              }}>
                <option value="">Add a product</option>
                {(model.products || []).filter((product) => product.active !== false).map((product) => (
                  <option key={product.id} value={product.id}>{product.name}{product.sell_unknown || product.sell_price == null ? " (no sell price)" : ""}</option>
                ))}
              </select>
              <button type="button" disabled={readOnly} className="h-9 rounded-md border border-slate-300 px-3 text-sm" onClick={() => setRows((current) => [...current, blankLine(order.id, { sort_order: current.length + 1 })])}>Blank line</button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-semibold text-slate-900">Sell {formatTotal(totals.taxable, totals.pricingIncomplete)} before tax · Known cost {formatMoney(totals.knownCost)} · {totals.margin == null ? "Margin incomplete" : `Margin ${formatMoney(totals.margin)}`}</div>
            {totals.unknownCost.length > 0 && <p className="mt-1 text-[#ba4444]">Still needs a cost: {totals.unknownCost.map((line) => line.description).join(", ")}</p>}
            <p className="mt-1 text-slate-500">Collected {formatMoney(collected)} · Balance {formatTotal(balance, totals.pricingIncomplete)}. Payments are the record of money received.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={readOnly} onClick={save} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50">Save order</button>
              <button type="button" className="h-9 rounded-md border border-slate-300 px-3 text-sm" onClick={() => downloadInvoicePdf({ order: normalize(form), lines: rows.map(normalizeLine), settings: model.settings, includeLogo: turfBrand })}>Download PDF</button>
              <input aria-label="Check amount" type="number" step="0.01" placeholder="Check amount" className="h-9 w-32 rounded-md border border-slate-200 px-2 text-sm" value={pay.amount} disabled={readOnly} onChange={(event) => setPay((current) => ({ ...current, amount: event.target.value }))} />
              <input aria-label="Check date" type="date" className="h-9 rounded-md border border-slate-200 px-2 text-sm" value={pay.date} disabled={readOnly} onChange={(event) => setPay((current) => ({ ...current, date: event.target.value }))} />
              <input aria-label="Check number" placeholder="Check #" className="h-9 w-28 rounded-md border border-slate-200 px-2 text-sm" value={pay.reference} disabled={readOnly} onChange={(event) => setPay((current) => ({ ...current, reference: event.target.value }))} />
              <button type="button" disabled={readOnly || !pay.amount} className="h-9 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50" onClick={() => { onRecordPayment({ amount: pay.amount, date: pay.date, method: form.payment_method || "Check", reference: pay.reference, notes: form.order_number, orderId: order.id }); setPay({ amount: "", date: "", reference: "" }); }}>Record check</button>
            </div>
          </div>

          <StripeOrderBox orderId={order.id} brand={brand} readOnly={readOnly} />

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Supplier purchases</h3>
            <div className="mt-2 space-y-2">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="grid gap-2 md:grid-cols-5">
                  <input aria-label="Supplier" className="h-9 rounded-md border border-slate-200 px-2 text-sm" defaultValue={purchase.supplier_name} disabled={readOnly} onBlur={(event) => onSavePurchase({ ...purchase, supplier_name: event.target.value })} />
                  <input aria-label="PO number" placeholder="PO" className="h-9 rounded-md border border-slate-200 px-2 text-sm" defaultValue={purchase.po_number || ""} disabled={readOnly} onBlur={(event) => onSavePurchase({ ...purchase, po_number: event.target.value })} />
                  <select aria-label="Purchase status" className="h-9 rounded-md border border-slate-200 px-2 text-sm" value={purchase.status} disabled={readOnly} onChange={(event) => onSavePurchase({ ...purchase, status: event.target.value })}>
                    {PURCHASE_STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
                  </select>
                  <input aria-label="Amount owed" type="number" step="0.01" placeholder="Amount unknown" className="h-9 rounded-md border border-slate-200 px-2 text-sm" defaultValue={purchase.amount ?? ""} disabled={readOnly} onBlur={(event) => onSavePurchase({ ...purchase, amount: event.target.value === "" ? null : event.target.value })} />
                  <button type="button" className="text-xs text-slate-400" disabled={readOnly} onClick={() => onDeletePurchase(purchase.id)}>Remove</button>
                </div>
              ))}
              <button type="button" disabled={readOnly} className="text-sm font-medium text-amber-800" onClick={() => onSavePurchase({ order_id: order.id, supplier_name: turfBrand ? "Realturf Dallas" : "Supplier", status: "needed", amount: null, notes: "" })}>Add supplier bill</button>
            </div>
          </div>
        </div>
        <div className="xl:sticky xl:top-4 xl:self-start">
          <InvoiceSheet order={form} lines={rows} settings={model.settings} totals={totals} showLogo={turfBrand} />
        </div>
      </div>
    </div>
  );
}

function updateLine(setRows, id, patch) {
  setRows((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
}

function normalize(order) {
  return {
    ...order,
    customer_id: order.customer_id || null,
    schedule_date: order.schedule_date || null,
    invoice_date: order.invoice_date || null,
    delivery_fee: order.delivery_fee === "" ? null : order.delivery_fee,
    tax_rate: order.tax_rate === "" ? 0.0825 : order.tax_rate,
  };
}

function normalizeLine(line) {
  return {
    ...line,
    rate_unknown: line.rate == null || line.rate === "" || line.rate_unknown,
    cost_unknown: line.unit_cost == null || line.unit_cost === "" || line.cost_unknown,
  };
}
