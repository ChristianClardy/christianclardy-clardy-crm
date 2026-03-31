import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIES = [
  "Concrete & Masonry", "Framing & Lumber", "Roofing", "Insulation",
  "Drywall", "Flooring", "Plumbing", "Electrical", "HVAC",
  "Windows & Doors", "Finish & Trim", "Landscaping", "Equipment", "Other"
];
const UNITS = ["EA", "LF", "SF", "CY", "CF", "LB", "TON", "HR", "DAY", "GAL", "BAG", "ROLL", "SHEET"];
const MARKUP_TYPES = ["markup_percent", "margin_percent", "overhead_profit"];

const TEMPLATE_ROWS = [
  ["Name*", "Description", "Category", "Unit", "Material Cost", "Labor Cost", "Sub Cost", "Markup Type", "Markup Value %", "Overhead %", "Profit %", "Supplier", "SKU", "Notes"],
  ["2x4 Stud 8ft", "Standard framing stud", "Framing & Lumber", "EA", "3.50", "0", "0", "markup_percent", "20", "", "", "Home Depot", "SKU-001", ""],
  ["Concrete 4000psi", "Ready-mix concrete", "Concrete & Masonry", "CY", "120", "80", "0", "margin_percent", "15", "", "", "Local Ready-Mix", "RM-4000", ""],
  ["Electrician Labor", "Licensed electrician", "Electrical", "HR", "0", "95", "0", "overhead_profit", "", "10", "12", "Self-perform", "", ""],
];

function toCsv(rows) {
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadTemplate() {
  const csv = toCsv(TEMPLATE_ROWS);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "material_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseNumber(val) {
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function normalizeMarkupType(val) {
  const v = (val || "").toLowerCase().trim();
  if (v.includes("margin")) return "margin_percent";
  if (v.includes("overhead") || v.includes("profit")) return "overhead_profit";
  return "markup_percent";
}

function normalizeUnit(val) {
  const v = (val || "").toUpperCase().trim();
  return UNITS.includes(v) ? v : v || "EA";
}

function normalizeCategory(val) {
  const v = (val || "").trim();
  return CATEGORIES.find(c => c.toLowerCase() === v.toLowerCase()) || v || "Other";
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cells.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_"));
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = parseCsvLine(lines[i]);
          if (!vals[0]) continue;
          const row = {};
          headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
          rows.push(row);
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function rawToMaterial(row) {
  // flexible header matching
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(h => h.includes(k));
      if (found !== undefined) return row[found] || "";
    }
    return "";
  };

  const matCost = parseNumber(get("material_cost", "material"));
  const labCost = parseNumber(get("labor_cost", "labor"));
  const subCost = parseNumber(get("sub_cost", "sub"));
  const markupType = normalizeMarkupType(get("markup_type", "markup"));
  const markupValue = parseNumber(get("markup_value", "markup_value", "markup_%", "margin"));
  const overhead = parseNumber(get("overhead", "overhead_"));
  const profit = parseNumber(get("profit", "profit_"));

  return {
    name: get("name"),
    description: get("description"),
    category: normalizeCategory(get("category")),
    unit: normalizeUnit(get("unit")),
    material_cost: matCost,
    labor_cost: labCost,
    sub_cost: subCost,
    unit_cost: matCost + labCost + subCost,
    markup_type: markupType,
    markup_value: markupValue,
    overhead_percent: overhead,
    profit_percent: profit,
    supplier: get("supplier", "vendor"),
    sku: get("sku"),
    notes: get("notes"),
  };
}

export default function MaterialImportDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef();

  const reset = () => { setFile(null); setPreview(null); setErrors([]); setDone(false); };

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setErrors([]);
    setPreview(null);
    setDone(false);
    try {
      const rows = await parseFile(f);
      const materials = rows.map(rawToMaterial);
      const errs = [];
      materials.forEach((m, i) => {
        if (!m.name) errs.push(`Row ${i + 2}: Name is required`);
      });
      setErrors(errs);
      setPreview(materials);
    } catch (err) {
      setErrors([`Failed to parse file: ${err.message}`]);
    }
  };

  const handleImport = async () => {
    if (!preview || errors.length > 0) return;
    setImporting(true);

    // 1. Load existing materials to avoid duplicates
    const existing = await base44.entities.Material.list();
    const existingByName = {};
    for (const m of existing) {
      const key = (m.name || "").trim().toLowerCase();
      if (key) existingByName[key] = m;
    }

    // 2. Deduplicate within the import file itself (keep last occurrence per name)
    const dedupedMap = {};
    for (const m of preview) {
      const key = (m.name || "").trim().toLowerCase();
      if (key) dedupedMap[key] = m;
    }
    const deduped = Object.values(dedupedMap);

    // 3. For each row: update if exists, create if new
    for (const m of deduped) {
      const key = (m.name || "").trim().toLowerCase();
      const match = existingByName[key];
      if (match) {
        // Merge: keep best of each field
        const merged = {
          name:          m.name || match.name,
          description:   m.description || match.description || "",
          category:      m.category    || match.category    || "Other",
          unit:          m.unit        || match.unit        || "EA",
          material_cost: m.material_cost > 0 ? m.material_cost : (match.material_cost || 0),
          labor_cost:    m.labor_cost   > 0 ? m.labor_cost   : (match.labor_cost   || 0),
          sub_cost:      m.sub_cost     > 0 ? m.sub_cost     : (match.sub_cost     || 0),
          unit_cost:     m.unit_cost    > 0 ? m.unit_cost    : (match.unit_cost    || 0),
          supplier:      m.supplier    || match.supplier    || "",
          sku:           m.sku         || match.sku         || "",
          notes:         m.notes       || match.notes       || "",
        };
        await base44.entities.Material.update(match.id, merged);
      } else {
        await base44.entities.Material.create(m);
      }
    }

    setImporting(false);
    setDone(true);
    onImported();
  };

  const handleClose = () => { reset(); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Materials from File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">File format: CSV or Excel (exported as CSV)</p>
            <p className="text-xs text-amber-700">
              Required column: <strong>Name</strong>. Optional: Description, Category, Unit, Material Cost, Labor Cost, Sub Cost, Markup Type, Markup Value %, Overhead %, Profit %, Supplier, SKU, Notes.
            </p>
            <p className="text-xs mt-1 text-amber-700">
              Markup Type values: <code>markup_percent</code>, <code>margin_percent</code>, <code>overhead_profit</code>
            </p>
          </div>

          {/* Download template */}
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50">
            <Download className="w-4 h-4" /> Download CSV Template
          </Button>

          {/* File picker */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-all"
          >
            <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">{file ? file.name : "Click to select a CSV file"}</p>
            <p className="text-xs text-slate-400 mt-1">Supports .csv files (export from Excel as CSV)</p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-rose-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{e}</p>
              ))}
            </div>
          )}

          {/* Preview */}
          {preview && errors.length === 0 && !done && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">{preview.length} materials ready to import:</p>
              <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-52">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Category</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500">Mat $</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500">Labor $</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500">Sub $</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Markup</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((m, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-3 py-1.5 font-medium text-slate-800">{m.name}</td>
                        <td className="px-3 py-1.5 text-slate-500">{m.category}</td>
                        <td className="px-3 py-1.5 text-slate-500">{m.unit}</td>
                        <td className="px-3 py-1.5 text-right">${m.material_cost.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">${m.labor_cost.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">${m.sub_cost.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {m.markup_type === "overhead_profit"
                            ? `O ${m.overhead_percent}% / P ${m.profit_percent}%`
                            : `${m.markup_type === "margin_percent" ? "Margin" : "Markup"} ${m.markup_value}%`}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{m.supplier || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">{preview.length} materials imported successfully!</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {done ? "Close" : "Cancel"}
            </Button>
            {preview && errors.length === 0 && !done && (
              <Button size="sm" onClick={handleImport} disabled={importing} className="bg-gradient-to-r from-amber-500 to-orange-500 gap-2">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import {preview.length} Materials</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}