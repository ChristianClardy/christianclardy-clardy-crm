import * as XLSX from "xlsx";

// Parses a completed copy of "Principle Outdoor Living Estimate MASTER.xlsx"
// (a fixed, hand-designed pool-estimate workbook Christian builds outside the
// CRM) into the shape src/pages/EstimateDetail.jsx already saves. This is a
// deterministic parser for exactly this one template's layout — not a
// general-purpose document reader — verified directly against the real file:
//
//   Sheet "Estimate Worksheet", column A always blank.
//   Header fields, value in column C: C6 Client Name, C7 Phone,
//   C8 Property Address, C9 Estimate Date, C10 Estimator, C11 Project Type.
//   C13 = Target Gross Margin, a fraction (0.3 = 30%).
//   Repeating category blocks: a title row ("  SITE PREP & PERMITTING", 2
//   leading spaces, all caps) -> a column-header row (Item|Qty|Unit Cost|
//   Cost|Margin|Sell Price, columns B-G) -> item rows -> a row whose Item
//   cell contains "Subtotal". Detected structurally, not by fixed row
//   numbers, since each category is a real Excel Table that can grow/shrink.
//
// Per-row math already matches this app's own formula exactly:
//   Sell Price = Unit Cost x Qty / (1 - margin)  (EstimateDetail.jsx's
//   sellFromCost/MARGIN constant) — so cost + qty are all that's needed;
//   sell price/margin_percent are read straight from the workbook rather
//   than recomputed.

const SHEET_NAME = "Estimate Worksheet";
const HEADER_CELLS = {
  clientName: "C6",
  phone: "C7",
  propertyAddress: "C8",
  estimateDate: "C9",
  estimator: "C10",
  projectType: "C11",
};
const MARGIN_CELL = "C13";
const TOTAL_SELL_LABEL = "total sell price";

function cellText(sheet, ref) {
  const cell = sheet[ref];
  if (!cell || cell.v == null) return "";
  return String(cell.v).trim();
}

function cellNumber(sheet, ref) {
  const cell = sheet[ref];
  if (!cell || cell.v == null || cell.v === "") return null;
  const n = Number(cell.v);
  return Number.isFinite(n) ? n : null;
}

function titleCase(text) {
  return text
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s*&\s*/g, " & ");
}

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  return isNaN(parsed) ? "" : parsed.toISOString().slice(0, 10);
}

export function parseMasterEstimateWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`This doesn't look like the Pool estimate template — no "${SHEET_NAME}" sheet found.`);
  }

  const ref = sheet["!ref"];
  const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0 }, e: { r: 200 } };
  const lastRow = range.e.r + 1; // 1-indexed

  const header = {
    clientName: cellText(sheet, HEADER_CELLS.clientName),
    phone: cellText(sheet, HEADER_CELLS.phone),
    propertyAddress: cellText(sheet, HEADER_CELLS.propertyAddress),
    estimateDate: formatDate(sheet[HEADER_CELLS.estimateDate]?.v),
    estimator: cellText(sheet, HEADER_CELLS.estimator),
    projectType: cellText(sheet, HEADER_CELLS.projectType),
  };
  const marginFraction = cellNumber(sheet, MARGIN_CELL);

  const lineItems = [];
  let currentCategory = null;
  let totalSellPrice = null;

  for (let r = 15; r <= lastRow; r++) {
    const bText = cellText(sheet, `B${r}`);
    if (!bText) continue;

    const lower = bText.toLowerCase();
    // Exact match, not .includes() — the instructional footnote near the
    // bottom of the sheet mentions "Total Sell Price" in a sentence, which
    // would otherwise match and clobber the real value with null.
    if (lower === TOTAL_SELL_LABEL) {
      totalSellPrice = cellNumber(sheet, `G${r}`);
      continue;
    }
    if (lower.includes("subtotal")) {
      currentCategory = null; // block closed
      continue;
    }
    // Category title rows are all-caps (after trimming leading spaces the
    // template uses for indentation) and contain no lowercase letters.
    const trimmed = bText.trim();
    if (trimmed && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !/[a-z]/.test(bText)) {
      currentCategory = titleCase(trimmed);
      continue;
    }
    if (bText === "Item") continue; // column-header row

    if (!currentCategory) continue; // outside any category block (notes, etc.)

    const qty = cellNumber(sheet, `C${r}`);
    const unitCost = cellNumber(sheet, `D${r}`);
    if (qty == null || unitCost == null) continue; // unused template placeholder row

    lineItems.push({
      trade: currentCategory,
      description: bText,
      unit: "",
      quantity: qty,
      cost_per_unit: unitCost,
    });
  }

  return {
    header,
    marginPercent: marginFraction != null ? marginFraction * 100 : null,
    totalSellPrice,
    lineItems,
  };
}
