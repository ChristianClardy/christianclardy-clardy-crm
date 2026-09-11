import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { MERGE_SOURCES, SIGNATURE_FIELD, anchorForSource } from "@/lib/contractMergeSources";

const INTRO =
  "Anchor text goes literally into an uploaded Word/PDF contract template (or is inserted automatically into an in-app template body). " +
  "Merge field is the underlying data source it resolves to when a contract is sent.";

function allRows() {
  return [...MERGE_SOURCES, SIGNATURE_FIELD].map((s) => ({
    group: s.group || "Other",
    label: s.label,
    description: s.description,
    field: s.value,
    anchor: anchorForSource(s),
  }));
}

function groupedRows() {
  const byGroup = new Map();
  for (const r of allRows()) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  return [...byGroup.entries()];
}

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────
export function downloadMergeFieldPdf() {
  const doc = new jsPDF("p", "mm", "letter");
  const marginX = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const textWidth = pageWidth - marginX * 2;
  const maxY = pageHeight - 15;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Merge Field Library", marginX, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  for (const line of doc.splitTextToSize(INTRO, textWidth)) {
    doc.text(line, marginX, y);
    y += 3.8;
  }
  doc.setTextColor(0);
  y += 4;

  for (const [group, rows] of groupedRows()) {
    if (y > maxY - 16) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(group, marginX, y);
    y += 5.5;

    for (const r of rows) {
      if (y > maxY - 10) {
        doc.addPage();
        y = 18;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(r.label, marginX, y);
      y += 4.2;

      doc.setFont("courier", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(70);
      doc.text(`Field: ${r.field}    Anchor: ${r.anchor}`, marginX, y);
      doc.setTextColor(0);
      y += 4.2;

      if (r.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(130);
        for (const line of doc.splitTextToSize(r.description, textWidth)) {
          if (y > maxY) {
            doc.addPage();
            y = 18;
          }
          doc.text(line, marginX, y);
          y += 3.8;
        }
        doc.setTextColor(0);
      }
      y += 3;
    }
    y += 3;
  }

  triggerDownload(doc.output("blob"), "merge-field-library.pdf");
}

// ─── Excel (also opens fine as CSV data via Excel/Sheets) ───────────────────
export function downloadMergeFieldExcel() {
  const rows = allRows().map((r) => ({
    Group: r.group,
    "Merge Field": r.label,
    Description: r.description,
    "Field Key": r.field,
    Anchor: r.anchor,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 16 }, { wch: 34 }, { wch: 65 }, { wch: 30 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Merge Fields");
  XLSX.writeFile(wb, "merge-field-library.xlsx");
}

// ─── Word ────────────────────────────────────────────────────────────────────
// No docx-writing library in this project, so this uses the standard
// "HTML saved with a .doc extension + application/msword MIME type" trick —
// Word opens it as a real document with tables/formatting intact. Avoids
// adding a new dependency just for this one reference document.
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function downloadMergeFieldWord() {
  const sections = groupedRows()
    .map(([group, rows]) => {
      const body = rows
        .map(
          (r) => `
        <tr>
          <td><b>${escapeHtml(r.label)}</b><br/><span style="color:#777;font-size:9pt;">${escapeHtml(r.description)}</span></td>
          <td><code>${escapeHtml(r.field)}</code></td>
          <td><code>${escapeHtml(r.anchor)}</code></td>
        </tr>`
        )
        .join("");
      return `
      <h2>${escapeHtml(group)}</h2>
      <table>
        <tr><th>Merge Field</th><th>Field Key</th><th>Anchor</th></tr>
        ${body}
      </table>`;
    })
    .join("");

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Merge Field Library</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  h1 { font-size: 18pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; margin-top: 22px; margin-bottom: 6px; border-bottom: 1px solid #bbb; padding-bottom: 3px; }
  p.intro { color: #555; font-size: 10pt; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; font-size: 9.5pt; vertical-align: top; text-align: left; }
  th { background: #f2f2f2; }
  code { font-family: Consolas, "Courier New", monospace; }
</style>
</head>
<body>
  <h1>Merge Field Library</h1>
  <p class="intro">${escapeHtml(INTRO)}</p>
  ${sections}
</body>
</html>`;

  const blob = new Blob(["﻿", html], { type: "application/msword" });
  triggerDownload(blob, "merge-field-library.doc");
}
