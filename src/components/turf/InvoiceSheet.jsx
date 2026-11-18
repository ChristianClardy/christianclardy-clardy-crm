import "./invoiceFonts.css";
import { formatLongDate, formatMoney, formatQty, formatRate, formatTotal, lineSell } from "@/lib/turf/money";

function unpricedNote(lines) {
  const names = (lines || []).filter((line) => lineSell(line) == null).map((line) => line.description).filter(Boolean);
  if (!names.length) return "";
  return `${names.join(" and ")} ${names.length === 1 ? "price is" : "prices are"} pending. Totals will update.`;
}

export default function InvoiceSheet({ order, lines, settings, totals, showLogo = true }) {
  const sorted = [...(lines || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const draft = totals.pricingIncomplete || order.status === "quote";
  const taxPct = (Number(totals.taxRate) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const deliver = (order.deliver_to || "").trim();
  const bill = (order.bill_to_address || "").trim();
  const note = unpricedNote(sorted);
  const remit = (settings?.remit_address || "").split("\n");

  return (
    <article id="turf-invoice" className="relative mx-auto w-full max-w-[760px] overflow-hidden text-[#2d2a28] shadow-sm" style={{ background: "#ebe7e3", fontFamily: "Lato, sans-serif" }}>
      <div className="px-8 pb-16 pt-6 sm:px-10">
        {draft && <p className="text-[11px] font-bold tracking-[0.35em] text-[#ba4444]">DRAFT</p>}
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-4xl text-[#2d2a28]" style={{ fontFamily: '"Gilda Display", Georgia, serif' }}>Invoice</h2>
            <p className="mt-3 border-b border-[#2d2a28] pb-1 text-sm">Customer name: {order.contact_name || order.bill_to_name || "—"}</p>
          </div>
          {showLogo && <img src="/turf/logo.png" alt={settings?.company_name || "Turf'n Texas"} className="h-14 w-auto object-contain" />}
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-[180px_1fr]">
          <div className="space-y-3 text-sm">
            <Block label="Invoice Date">{formatLongDate(order.invoice_date) || "—"}</Block>
            <Block label="Bill To">
              <div className="whitespace-pre-line">{[order.bill_to_name, order.bill_to_address].filter(Boolean).join("\n") || "—"}</div>
            </Block>
            {deliver && deliver !== bill && <Block label="Deliver To"><div className="whitespace-pre-line">{deliver}</div></Block>}
            <Block label={"Company Data\nAnd Contact"} />
            <Block label="Company Name">{settings?.company_name || "Turf'N Texas"}</Block>
            <Block label="Make Payment To">
              <div>{settings?.remit_name || "Christian Clardy"}</div>
              {remit.map((line) => <div key={line}>{line}</div>)}
            </Block>
            <Block label="Payment Method">{order.payment_method || "Check"}</Block>
          </div>
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[#2d2a28] text-left">
                  <th className="py-2 font-bold">Description</th>
                  <th className="py-2 text-right font-bold">Qty</th>
                  <th className="py-2 text-right font-bold">Rate</th>
                  <th className="py-2 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((line) => {
                  const unknown = lineSell(line) == null;
                  return (
                    <tr key={line.id} className="border-b border-[#d5cfc6] align-top">
                      <td className="py-2 pr-2">
                        <div className="font-bold">{line.description}</div>
                        {line.detail && <div className="text-xs text-[#5a544e]">{line.detail}</div>}
                      </td>
                      <td className="py-2 text-right">{formatQty(line.qty)}</td>
                      <td className={`py-2 text-right ${unknown ? "font-bold text-[#ba4444]" : ""}`}>{unknown ? "TBD" : formatRate(line.rate)}</td>
                      <td className={`py-2 text-right ${unknown ? "font-bold text-[#ba4444]" : ""}`}>{unknown ? "TBD" : formatMoney(lineSell(line))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
              <Row label="Material Delivery" value={formatMoney(totals.delivery ?? 0)} />
              <Row label="Sub-total" value={formatTotal(totals.taxable, totals.pricingIncomplete)} />
              <Row label={`Tax (${taxPct}%)`} value={formatTotal(totals.tax, totals.pricingIncomplete)} />
              <Row label="Total" value={formatTotal(totals.total, totals.pricingIncomplete)} bold />
            </div>
            {note && <p className="mt-3 text-xs text-[#ba4444]">{note}</p>}
            <p className="mt-6 text-sm font-bold">{settings?.thank_you}</p>
            <p className="mt-4 text-4xl" style={{ fontFamily: '"Mrs Saint Delafield", cursive' }}>{settings?.signature_name || "Christian Clardy"}</p>
          </div>
        </div>
      </div>
      <div className="h-8" style={{ background: "#7e8a72" }} />
    </article>
  );
}

function Block({ label, children }) {
  return (
    <div>
      <div className="whitespace-pre-line text-xs font-bold">{label}</div>
      {children && <div className="text-[13px] leading-5">{children}</div>}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between gap-4 border-t border-[#2d2a28] py-1 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
