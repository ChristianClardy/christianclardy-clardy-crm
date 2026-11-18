import { jsPDF } from "jspdf";
import { formatLongDate, formatMoney, formatQty, formatRate, formatTotal, orderTotals } from "./money.js";

const CREAM = [235, 231, 227];
const INK = [45, 42, 40];
const MUTED = [90, 84, 78];
const RED = [186, 68, 68];
const SAGE = [126, 138, 114];

function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function registerFonts(doc, assets) {
  doc.addFileToVFS("GildaDisplay-Regular.ttf", bytesToBase64(assets.gilda));
  doc.addFont("GildaDisplay-Regular.ttf", "Gilda", "normal");
  doc.addFileToVFS("Lato-Regular.ttf", bytesToBase64(assets.lato));
  doc.addFont("Lato-Regular.ttf", "Lato", "normal");
  doc.addFileToVFS("Lato-Bold.ttf", bytesToBase64(assets.latoBold));
  doc.addFont("Lato-Bold.ttf", "Lato", "bold");
  doc.addFileToVFS("MrsSaintDelafield-Regular.ttf", bytesToBase64(assets.script));
  doc.addFont("MrsSaintDelafield-Regular.ttf", "Script", "normal");
}

function paintPage(doc) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFillColor(...CREAM);
  doc.rect(0, 0, width, height, "F");
  doc.setFillColor(...SAGE);
  doc.rect(0, height - 28, width, 28, "F");
}

function unpricedNote(lines) {
  const names = (lines || []).filter((line) => line.rate_unknown || line.rate == null || line.rate === "").map((line) => line.description).filter(Boolean);
  if (!names.length) return "";
  return `${names.join(" and ")} ${names.length === 1 ? "price is" : "prices are"} pending. Totals will update.`;
}

export function buildInvoicePdf({ order, lines, settings, assets, draft }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  registerFonts(doc, assets);
  paintPage(doc);
  const totals = orderTotals(order, lines);
  const showDraft = draft ?? (totals.pricingIncomplete || order.status === "quote");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  if (showDraft) {
    doc.setFont("Lato", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...RED);
    doc.text("D R A F T", 48, 32);
  }

  doc.setTextColor(...INK);
  doc.setFont("Gilda", "normal");
  doc.setFontSize(32);
  doc.text("Invoice", 48, 78);

  if (assets.logo) {
    doc.addImage(bytesToBase64(assets.logo), "PNG", 400, 46, 160, 58);
  }

  doc.setFont("Lato", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const who = order.contact_name || order.bill_to_name || "";
  doc.text(`Customer name: ${who}`, 48, 108);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(48, 114, 210, 114);

  let y = 148;
  const label = (text) => {
    doc.setFont("Lato", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(text, 48, y);
    y += 13;
  };
  const value = (text) => {
    doc.setFont("Lato", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    const parts = String(text || "").split("\n").flatMap((part) => doc.splitTextToSize(part || " ", 145));
    for (const part of parts) {
      doc.text(part, 48, y);
      y += 11;
    }
  };

  label("Invoice Date");
  value(formatLongDate(order.invoice_date) || "—");
  y += 8;
  label("Bill To");
  value([order.bill_to_name, order.bill_to_address].filter(Boolean).join("\n") || "—");
  if (order.deliver_to && order.deliver_to.trim() && order.deliver_to.trim() !== (order.bill_to_address || "").trim()) {
    y += 8;
    label("Deliver To");
    value(order.deliver_to);
  }
  y += 8;
  label("Company Data");
  label("And Contact");
  label("Company Name");
  value(settings?.company_name || "Turf'N Texas");
  y += 6;
  label("Make Payment To");
  value([settings?.remit_name || "Christian Clardy", settings?.remit_address].filter(Boolean).join("\n"));
  y += 6;
  label("Payment Method");
  value(order.payment_method || "Check");

  const tableTop = 156;
  const descX = 220;
  const qtyX = 430;
  const rateX = 490;
  const amountX = 560;
  doc.setDrawColor(70, 64, 58);
  doc.setLineWidth(0.8);
  doc.line(descX, tableTop, amountX, tableTop);
  doc.setFont("Lato", "bold");
  doc.setFontSize(9);
  doc.text("Description", descX, tableTop + 16);
  doc.text("Qty", qtyX, tableTop + 16, { align: "right" });
  doc.text("Rate", rateX, tableTop + 16, { align: "right" });
  doc.text("Amount", amountX, tableTop + 16, { align: "right" });
  doc.line(descX, tableTop + 22, amountX, tableTop + 22);

  let rowY = tableTop + 40;
  const sorted = [...(lines || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const line of sorted) {
    if (rowY > pageHeight - 160) {
      doc.addPage();
      paintPage(doc);
      rowY = 56;
    }
    const unknown = line.rate_unknown || line.rate == null || line.rate === "";
    doc.setFont("Lato", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(String(line.description || "Item"), descX, rowY);
    doc.setFont("Lato", "normal");
    doc.text(formatQty(line.qty), qtyX, rowY, { align: "right" });
    if (unknown) {
      doc.setTextColor(...RED);
      doc.setFont("Lato", "bold");
      doc.text("TBD", rateX, rowY, { align: "right" });
      doc.text("TBD", amountX, rowY, { align: "right" });
    } else {
      doc.setTextColor(...INK);
      doc.text(formatRate(line.rate), rateX, rowY, { align: "right" });
      doc.text(formatMoney(Number(line.qty) * Number(line.rate)), amountX, rowY, { align: "right" });
    }
    if (line.detail) {
      doc.setFont("Lato", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(String(line.detail), descX, rowY + 11);
      rowY += 12;
    }
    rowY += 16;
    doc.setDrawColor(190, 184, 176);
    doc.setLineWidth(0.4);
    doc.line(descX, rowY - 6, amountX, rowY - 6);
    rowY += 10;
  }

  const totalsX = 360;
  const writeTotal = (name, value, bold) => {
    doc.setFont("Lato", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(name, totalsX, rowY);
    doc.text(value, amountX, rowY, { align: "right" });
    rowY += 16;
  };
  doc.setDrawColor(70, 64, 58);
  doc.setLineWidth(0.6);
  doc.line(totalsX, rowY - 8, amountX, rowY - 8);
  writeTotal("Material Delivery", formatMoney(totals.delivery ?? 0));
  writeTotal("Sub-total", formatTotal(totals.taxable, totals.pricingIncomplete));
  const taxPct = (Number(totals.taxRate) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  writeTotal(`Tax (${taxPct}%)`, formatTotal(totals.tax, totals.pricingIncomplete));
  doc.setLineWidth(0.8);
  doc.line(totalsX, rowY - 10, amountX, rowY - 10);
  writeTotal("Total", formatTotal(totals.total, totals.pricingIncomplete), true);

  const note = unpricedNote(lines);
  if (note) {
    doc.setFont("Lato", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...RED);
    doc.text(note, descX, rowY + 4);
    rowY += 18;
  }

  rowY += 16;
  doc.setFont("Lato", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const thanks = settings?.thank_you || "We appreciate your business. Please find your invoice details here. Feel free to contact us if you have any questions.";
  const thankLines = doc.splitTextToSize(thanks, 340);
  for (const part of thankLines) {
    doc.text(part, descX, rowY);
    rowY += 12;
  }
  rowY += 22;
  doc.setFont("Script", "normal");
  doc.setFontSize(32);
  doc.text(settings?.signature_name || "Christian Clardy", descX + 80, Math.min(rowY + 10, pageHeight - 48));

  return doc;
}

export async function loadInvoiceAssets({ includeLogo = true } = {}) {
  const load = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  return {
    logo: includeLogo ? await load("/turf/logo.png") : null,
    gilda: await load("/turf/fonts/GildaDisplay-Regular.ttf"),
    lato: await load("/turf/fonts/Lato-Regular.ttf"),
    latoBold: await load("/turf/fonts/Lato-Bold.ttf"),
    script: await load("/turf/fonts/MrsSaintDelafield-Regular.ttf"),
  };
}

export async function downloadInvoicePdf(args) {
  const includeLogo = args.includeLogo !== false;
  const assets = args.assets || await loadInvoiceAssets({ includeLogo });
  const doc = buildInvoicePdf({ ...args, assets });
  const name = `${args.order?.order_number || "invoice"}.pdf`.replace(/[^\w.-]+/g, "-");
  doc.save(name);
}
