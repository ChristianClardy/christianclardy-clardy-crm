import * as XLSX from "xlsx";

// Parses a completed copy of Christian's pool-estimate workbook (built
// outside the CRM) into the shape src/pages/EstimateDetail.jsx already
// saves. Deterministic parser — not a general-purpose document reader —
// verified against real files, which come in **two known column layouts**
// for the same template:
//
//   6-column: Item | Qty | Unit Cost | Cost | Margin | Sell Price  (B-G)
//   4-column: Item | Cost |  Margin  | Sell Price                 (B-E)
//     (no Qty/Unit Cost split — "Cost" is the item's flat total cost,
//     equivalent to Qty=1 x Unit Cost=Cost)
//
// Rather than hardcode column letters, each category block's own header
// row ("Item", "Qty", "Cost", ...) is read to map columns for that block —
// this also means a file could mix layouts between categories and still
// parse correctly.
//
// Common to both layouts:
//   Sheet "Estimate Worksheet", column A always blank.
//   Header fields, value in column C: C6 Client Name, C7 Phone,
//   C8 Property Address, C9 Estimate Date, C10 Estimator, C11 Project Type.
//   C13 = Target Gross Margin, a fraction (0.3 = 30%).
//   Repeating category blocks: a title row ("  SITE PREP & PERMITTING", 2
//   leading spaces, all caps) -> a column-header row -> item rows -> a row
//   whose Item cell contains "Subtotal". Detected structurally, not by
//   fixed row numbers, since each category is a real Excel Table that can
//   grow/shrink.
//   A "Total Sell Price" row (exact match, not substring — the
//   instructional footnote near the bottom of the sheet mentions the same
//   phrase in a sentence) holds the workbook's own computed grand total.
//
// Per-row math already matches this app's own formula exactly:
//   Sell Price = Cost / (1 - margin)  (EstimateDetail.jsx's
//   sellFromCost/MARGIN constant, where Cost = Qty x Unit Cost) — so a
//   flat Cost and a Qty x Unit Cost pair are equivalent inputs; sell
//   price/margin_percent are read straight from the workbook rather than
//   recomputed.

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
const COLUMN_LETTERS = ["C", "D", "E", "F", "G", "H", "I", "J"];

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

// Reads a column-header row ("Item | Qty | Unit Cost | Cost | Margin |
// Sell Price", in whatever columns this block actually uses) and returns
// which column holds Qty / Unit Cost / (flat) Cost.
function detectColumns(sheet, row) {
  const cols = {};
  for (const col of COLUMN_LETTERS) {
    const label = cellText(sheet, `${col}${row}`).toLowerCase();
    if (!label) continue;
    if (label === "qty") cols.qty = col;
    else if (label === "unit cost") cols.unitCost = col;
    else if (label === "cost") cols.cost = col;
  }
  return cols;
}

// The grand-total row's value can sit in different columns depending on
// layout (G for 6-column files, E for 4-column) — take the first numeric
// value found scanning left to right instead of assuming a column.
function firstNumberInRow(sheet, row) {
  for (const col of COLUMN_LETTERS) {
    const n = cellNumber(sheet, `${col}${row}`);
    if (n != null) return n;
  }
  return null;
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
  let currentColumns = null;
  let totalSellPrice = null;

  for (let r = 15; r <= lastRow; r++) {
    const bText = cellText(sheet, `B${r}`);
    if (!bText) continue;

    const lower = bText.toLowerCase();
    if (lower === TOTAL_SELL_LABEL) {
      totalSellPrice = firstNumberInRow(sheet, r);
      continue;
    }
    if (lower.includes("subtotal")) {
      currentCategory = null; // block closed
      currentColumns = null;
      continue;
    }
    // Category title rows are all-caps (after trimming leading spaces the
    // template uses for indentation) and contain no lowercase letters.
    const trimmed = bText.trim();
    if (trimmed && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !/[a-z]/.test(bText)) {
      currentCategory = titleCase(trimmed);
      currentColumns = null;
      continue;
    }
    if (bText === "Item") {
      currentColumns = detectColumns(sheet, r);
      continue;
    }

    if (!currentCategory || !currentColumns) continue; // outside any category block (notes, etc.)

    let qty = null;
    let unitCost = null;
    if (currentColumns.qty && currentColumns.unitCost) {
      qty = cellNumber(sheet, `${currentColumns.qty}${r}`);
      unitCost = cellNumber(sheet, `${currentColumns.unitCost}${r}`);
    } else if (currentColumns.cost) {
      const cost = cellNumber(sheet, `${currentColumns.cost}${r}`);
      if (cost != null) { qty = 1; unitCost = cost; }
    }
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
