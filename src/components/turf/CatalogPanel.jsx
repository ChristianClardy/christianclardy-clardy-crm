import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/turf/money";

const inputClass = "h-8 w-full rounded-md border border-slate-200 px-2 text-sm";

export default function CatalogPanel({ model, readOnly, onSaveProduct, onSaveCustomer, onSaveSettings }) {
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(model.settings || {});
  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (model.products || []).filter((product) => !needle || `${product.name} ${product.category} ${product.supplier_name}`.toLowerCase().includes(needle));
  }, [model.products, query]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-slate-900">Products</h2>
            <p className="text-sm text-slate-500">A blank cost or sell price stays blank. Rows where the sell price is under the cost are marked.</p>
          </div>
          <input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-56 rounded-md border border-slate-200 px-2 text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium">Unit</th>
                <th className="px-2 py-2 font-medium">Supplier</th>
                <th className="px-2 py-2 font-medium">Cost</th>
                <th className="px-2 py-2 font-medium">Sell</th>
                <th className="px-4 py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const below = product.cost != null && product.sell_price != null && Number(product.sell_price) < Number(product.cost);
                return (
                  <tr key={product.id} className="border-b border-slate-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{product.name}</div>
                      <div className="text-xs text-slate-400">{product.category}</div>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{product.unit}</td>
                    <td className="px-2 py-2 text-slate-600">{product.supplier_name}</td>
                    <td className="px-2 py-2"><PriceCell product={product} field="cost" unknown={product.cost_unknown || product.cost == null} readOnly={readOnly} onSave={onSaveProduct} /></td>
                    <td className="px-2 py-2"><PriceCell product={product} field="sell_price" unknown={product.sell_unknown || product.sell_price == null} readOnly={readOnly} onSave={onSaveProduct} /></td>
                    <td className="px-4 py-2 text-xs font-semibold text-[#ba4444]">
                      {(product.sell_unknown || product.sell_price == null) && <div>No sell price</div>}
                      {(product.cost_unknown || product.cost == null) && <div>No cost</div>}
                      {below && <div>Sell is under cost ({formatMoney(product.sell_price)} vs {formatMoney(product.cost)})</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3">
          <button type="button" disabled={readOnly} className="text-sm font-medium text-amber-800 disabled:opacity-50" onClick={() => onSaveProduct({ name: "New product", unit: "SF", cost: null, sell_price: null, cost_unknown: true, sell_unknown: true, sort_order: (model.products || []).length })}>Add product</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Customers</h2>
        <div className="mt-3 space-y-3">
          {(model.customers || []).map((customer) => (
            <CustomerRow key={customer.id} customer={customer} readOnly={readOnly} onSave={onSaveCustomer} />
          ))}
          <button type="button" disabled={readOnly} className="text-sm font-medium text-amber-800 disabled:opacity-50" onClick={() => onSaveCustomer({ name: "New customer" })}>Add customer</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Invoice details</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company name<input className={`${inputClass} mt-1`} value={settings.company_name || ""} disabled={readOnly} onChange={(event) => setSettings((current) => ({ ...current, company_name: event.target.value }))} /></label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Make payment to<input className={`${inputClass} mt-1`} value={settings.remit_name || ""} disabled={readOnly} onChange={(event) => setSettings((current) => ({ ...current, remit_name: event.target.value }))} /></label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Address<textarea className={`${inputClass} mt-1 h-20 py-2`} value={settings.remit_address || ""} disabled={readOnly} onChange={(event) => setSettings((current) => ({ ...current, remit_address: event.target.value }))} /></label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signature<input className={`${inputClass} mt-1`} value={settings.signature_name || ""} disabled={readOnly} onChange={(event) => setSettings((current) => ({ ...current, signature_name: event.target.value }))} /></label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Thank-you line<textarea className={`${inputClass} mt-1 h-16 py-2`} value={settings.thank_you || ""} disabled={readOnly} onChange={(event) => setSettings((current) => ({ ...current, thank_you: event.target.value }))} /></label>
        </div>
        <button type="button" disabled={readOnly} className="mt-3 h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => onSaveSettings(settings)}>Save invoice details</button>
      </section>
    </div>
  );
}

function PriceCell({ product, field, unknown, readOnly, onSave }) {
  return (
    <input
      aria-label={`${field} for ${product.name}`}
      type="number"
      step="0.01"
      disabled={readOnly}
      placeholder={unknown ? "Unknown" : ""}
      defaultValue={product[field] ?? ""}
      className={inputClass}
      onBlur={(event) => {
        const value = event.target.value === "" ? null : Number(event.target.value);
        const flag = field === "cost" ? "cost_unknown" : "sell_unknown";
        if (value === (product[field] ?? null)) return;
        onSave({ ...product, [field]: value, [flag]: value == null });
      }}
    />
  );
}

function CustomerRow({ customer, readOnly, onSave }) {
  const [form, setForm] = useState(customer);
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <input aria-label="Customer name" className={inputClass} value={form.name || ""} disabled={readOnly} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
      <input aria-label="Contact" className={inputClass} value={form.contact_name || ""} disabled={readOnly} placeholder="Contact" onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))} />
      <input aria-label="Phone" className={inputClass} value={form.phone || ""} disabled={readOnly} placeholder="Phone" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
      <button type="button" disabled={readOnly} className="h-8 rounded-md border border-slate-300 text-sm disabled:opacity-50" onClick={() => onSave(form)}>Save</button>
    </div>
  );
}
