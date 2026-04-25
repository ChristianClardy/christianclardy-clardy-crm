import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft, Save, Download, Plus, Trash2, ChevronDown, ChevronRight,
  Package, FileText, Loader2, Check, GripVertical, Eye, Mail, X,
  Lock, LockOpen, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import { getSelectedCompanyScope } from "@/lib/companyScope";
import { useAuth } from "@/lib/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MARGIN = 0.40; // 40% margin → sell = cost / (1 - 0.40) = cost / 0.60

const UNITS = ["SF", "LF", "SY", "EA", "LS", "HR", "CY"];

const TRADE_GROUPS = {
  "Pool": [
    "Excavation", "Steel/Rebar", "Gunite/Shotcrete", "Plumbing",
    "Electrical", "Coping & Tile", "Plaster/Finish", "Equipment", "Decking",
  ],
  "GC / Outdoor Living": [
    "Excavation", "Concrete/Flatwork", "Framing/Carpentry", "Roofing",
    "Electrical", "Plumbing", "Drainage", "Masonry", "Demo/Site Prep",
    "Painting", "Insulation", "Permits & Fees",
  ],
  "Labor": [
    "Framing", "Electrician", "Plumber", "Masonry", "Concrete/Foundation",
    "Roofing", "Flooring", "Wall Tile", "Sheetrock", "Cleanup",
    "Finish Carpentry",
  ],
};

const ALL_TRADES = Array.from(new Set([
  ...TRADE_GROUPS["Pool"],
  ...TRADE_GROUPS["GC / Outdoor Living"],
  ...TRADE_GROUPS["Labor"],
]));

const DEFAULT_MATERIAL_CATEGORIES = [
  "Lumber & Framing",
  "Concrete & Masonry",
  "Roofing Materials",
  "Flooring Materials",
  "Plumbing Supplies",
  "Electrical Supplies",
  "Insulation",
  "Drywall & Sheetrock",
  "Paint & Finishes",
  "Hardware & Fasteners",
  "Windows & Doors",
  "Tile & Stone",
  "Cabinets & Millwork",
  "Landscaping Materials",
  "Equipment & Rentals",
];

// ─── Templates ────────────────────────────────────────────────────────────────

function blankItem(sectionName, description = "", unit = "SF", qty = 1, sectionType = "trade") {
  return {
    id: Math.random().toString(36).slice(2, 10),
    trade: sectionName,
    sectionType,
    description,
    notes: "",
    unit,
    quantity: qty,
    cost_per_unit: "",
  };
}

const TEMPLATES = [
  {
    key: "patio_cover",
    label: "20×20 Patio Cover",
    group: "GC / Outdoor Living",
    items: [
      blankItem("Demo/Site Prep",      "Site preparation and layout",            "LS",  1),
      blankItem("Concrete/Flatwork",   "Concrete footings",                       "EA",  4),
      blankItem("Framing/Carpentry",   "2×6 roof framing & ledger attachment",    "SF",  400),
      blankItem("Roofing",             "Metal or shingle roofing w/ underlayment","SF",  400),
      blankItem("Framing/Carpentry",   "Fascia, trim & finish carpentry",         "LF",  80),
      blankItem("Electrical",          "Recessed lighting (4 cans)",              "EA",  4),
      blankItem("Painting",            "Paint – prime & finish coat",             "SF",  400),
      blankItem("Permits & Fees",      "Building permit & inspection fees",        "LS",  1),
    ],
  },
  {
    key: "pergola",
    label: "15×25 Pergola w/ Polycarbonate Roof",
    group: "GC / Outdoor Living",
    items: [
      blankItem("Demo/Site Prep",      "Site preparation and layout",             "LS",  1),
      blankItem("Concrete/Flatwork",   "Concrete footings / post bases",          "EA",  6),
      blankItem("Framing/Carpentry",   "Cedar/pine post & beam structure",        "SF",  375),
      blankItem("Roofing",             "Polycarbonate panels & framing",          "SF",  375),
      blankItem("Framing/Carpentry",   "Decorative rafter tails & trim",          "LF",  80),
      blankItem("Electrical",          "Ceiling fan rough-in & fixture",          "EA",  2),
      blankItem("Permits & Fees",      "Building permit",                          "LS",  1),
    ],
  },
  {
    key: "outdoor_kitchen",
    label: "15 ft Outdoor Kitchen",
    group: "GC / Outdoor Living",
    items: [
      blankItem("Demo/Site Prep",      "Demo & site prep",                        "LS",  1),
      blankItem("Concrete/Flatwork",   "Concrete slab / pad",                     "SF",  120),
      blankItem("Masonry",             "CMU block structure",                     "SF",  45),
      blankItem("Masonry",             "Stone or tile veneer",                    "SF",  45),
      blankItem("Plumbing",            "Gas line – black iron / CSST",            "LF",  25),
      blankItem("Electrical",          "Dedicated circuit & GFCI outlets",        "EA",  3),
      blankItem("Framing/Carpentry",   "Countertop – granite / concrete",         "LF",  15),
      blankItem("Electrical",          "Under-counter refrigerator rough-in",     "EA",  1),
      blankItem("Permits & Fees",      "Permits",                                  "LS",  1),
    ],
  },
  {
    key: "cabana",
    label: "25×20 Cabana",
    group: "GC / Outdoor Living",
    items: [
      blankItem("Demo/Site Prep",      "Site prep & layout",                      "LS",  1),
      blankItem("Concrete/Flatwork",   "Concrete slab floor",                     "SF",  500),
      blankItem("Concrete/Flatwork",   "Footings",                                "EA",  6),
      blankItem("Framing/Carpentry",   "Wall & roof framing",                     "SF",  500),
      blankItem("Roofing",             "Shingle roof w/ underlayment",            "SF",  500),
      blankItem("Electrical",          "Panel sub-feed & wiring",                 "LS",  1),
      blankItem("Electrical",          "Lighting & fans",                         "EA",  4),
      blankItem("Plumbing",            "Sink rough-in & fixture",                 "EA",  1),
      blankItem("Painting",            "Interior & exterior paint",               "SF",  800),
      blankItem("Insulation",          "Spray foam / batt insulation",            "SF",  500),
      blankItem("Permits & Fees",      "Building permit",                          "LS",  1),
    ],
  },
  {
    key: "gunite_pool",
    label: "13×30 Gunite Pool",
    group: "Pool",
    items: [
      blankItem("Excavation",          "Pool excavation & haul-off",              "CY",  120),
      blankItem("Steel/Rebar",         "#3 rebar grid 12″ o.c.",                  "SF",  390),
      blankItem("Plumbing",            "Main drain, returns, skimmer rough-in",   "LS",  1),
      blankItem("Electrical",          "Bonding, GFCI, light niche rough-in",     "LS",  1),
      blankItem("Gunite/Shotcrete",    "Gunite shell – 4″ walls / 6″ floor",      "SF",  390),
      blankItem("Coping & Tile",       "Bullnose coping – travertine or concrete","LF",  86),
      blankItem("Coping & Tile",       "Waterline tile – 6″ band",               "LF",  86),
      blankItem("Plaster/Finish",      "Pebble-tec or white plaster finish",      "SF",  390),
      blankItem("Equipment",           "Pump, filter, heater & automation pkg",   "LS",  1),
      blankItem("Decking",             "Concrete or travertine decking",           "SF",  600),
      blankItem("Electrical",          "Equipment pad wiring & final connections","LS",  1),
    ],
  },
];

// ─── Pricing helpers ──────────────────────────────────────────────────────────

function sellFromCost(cost, marginPct) {
  const pct = marginPct != null ? Number(marginPct) : 40;
  const m = Math.min(Math.max(pct, 0), 99.9) / 100;
  return cost > 0 ? cost / (1 - m) : 0;
}

function itemTotals(item, marginPct = 40) {
  const qty  = Number(item.quantity)     || 0;
  const cost = Number(item.cost_per_unit) || 0;
  const hasSellOverride   = item.sell_override   != null && item.sell_override   !== "";
  const hasMarginOverride = item.margin_override != null && item.margin_override !== "";
  const effectiveMargin   = hasMarginOverride ? Number(item.margin_override) : marginPct;
  const sell = hasSellOverride ? Number(item.sell_override) : sellFromCost(cost, effectiveMargin);
  return {
    sell_per_unit:       sell,
    has_sell_override:   hasSellOverride,
    has_margin_override: hasMarginOverride,
    effective_margin:    effectiveMargin,
    total_cost:          qty * cost,
    total_sell:          qty * sell,
    profit:              qty * (sell - cost),
  };
}

function summaryTotals(items, marginPct = 40, sectionMargins = {}) {
  let totalCost = 0, totalSell = 0;
  for (const it of items) {
    const secOverride = sectionMargins[it.trade];
    const effectiveMargin = secOverride != null ? Number(secOverride) : marginPct;
    const t = itemTotals(it, effectiveMargin);
    totalCost += t.total_cost;
    totalSell += t.total_sell;
  }
  const profit = totalSell - totalCost;
  const margin = totalSell > 0 ? (profit / totalSell) * 100 : 0;
  return { totalCost, totalSell, profit, margin };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmt  = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtp = (n) => `${Number(n || 0).toFixed(1)}%`;

// ─── Template Selector Modal ──────────────────────────────────────────────────

function TemplatePicker({ onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Start New Estimate</h2>
            <p className="text-sm text-slate-500 mt-0.5">Choose a template or start from scratch.</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onSelect(null)}
            className="text-left p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-amber-400 hover:bg-amber-50/40 transition-all group"
          >
            <FileText className="w-6 h-6 text-slate-400 group-hover:text-amber-500 mb-2" />
            <p className="font-semibold text-slate-700">Blank Estimate</p>
            <p className="text-xs text-slate-400 mt-0.5">Start with no pre-filled items</p>
          </button>
          {TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={() => onSelect(t)}
              className="text-left p-4 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all group"
            >
              <div className="flex items-start justify-between">
                <p className="font-semibold text-slate-800">{t.label}</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-2 flex-shrink-0">{t.group}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{t.items.length} line items pre-loaded · costs blank</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Description Autocomplete Cell ───────────────────────────────────────────

function DescriptionCell({ item, onChange, materials, onAddToLibrary }) {
  const [open, setOpen]     = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef(null);

  const query = item.description || "";
  const matches = query.trim().length >= 1
    ? materials.filter(m => m.name?.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (mat) => {
    const unitCost = (mat.material_cost || 0) + (mat.labor_cost || 0) + (mat.sub_cost || 0) || mat.unit_cost || 0;
    onChange({
      ...item,
      description:   mat.name,
      notes:         mat.description || item.notes || "",
      unit:          mat.unit || item.unit,
      cost_per_unit: unitCost > 0 ? String(unitCost) : item.cost_per_unit,
    });
    setOpen(false);
  };

  const handleAddNew = async () => {
    setAdding(true);
    try {
      await onAddToLibrary({
        name:      query,
        unit:      item.unit || "EA",
        unit_cost: Number(item.cost_per_unit) || 0,
        material_cost: Number(item.cost_per_unit) || 0,
      });
    } finally {
      setAdding(false);
      setOpen(false);
    }
  };

  const showDropdown = open && (matches.length > 0 || query.trim().length >= 1);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { onChange({ ...item, description: e.target.value }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Description…"
        className="w-full bg-transparent text-sm text-slate-800 border-b border-transparent focus:border-amber-400 outline-none py-0.5 placeholder:text-slate-300"
      />
      <input
        type="text"
        value={item.notes || ""}
        onChange={e => onChange({ ...item, notes: e.target.value })}
        placeholder="Notes / details…"
        className="w-full bg-transparent text-xs italic text-slate-400 border-b border-transparent focus:border-amber-300 outline-none py-0.5 placeholder:text-slate-200"
      />
      {showDropdown && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-xl border border-slate-200 w-72 max-h-60 overflow-y-auto">
          {matches.map(mat => {
            const cost = (mat.material_cost || 0) + (mat.labor_cost || 0) + (mat.sub_cost || 0) || mat.unit_cost || 0;
            return (
              <button
                key={mat.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(mat); }}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-50 text-sm"
              >
                <span className="text-slate-800 truncate">{mat.name}</span>
                <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                  {mat.unit} · {cost > 0 ? `$${cost.toFixed(2)}` : "—"}
                </span>
              </button>
            );
          })}
          {matches.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-slate-400 italic">No matches in library</div>
          )}
          {query.trim().length >= 1 && (
            <button
              onMouseDown={e => { e.preventDefault(); handleAddNew(); }}
              disabled={adding}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border-t border-slate-100"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              {adding ? "Saving…" : `Add "${query}" to library`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Line Item Row ────────────────────────────────────────────────────────────

function LineItemRow({ item, onChange, onDelete, materials, onAddToLibrary, marginPct = 40, locked = false }) {
  const { sell_per_unit, has_sell_override, has_margin_override, effective_margin, total_cost, total_sell } = itemTotals(item, marginPct);
  const hasCost = Number(item.cost_per_unit) > 0;
  const calcSell = sellFromCost(Number(item.cost_per_unit) || 0, marginPct);

  return (
    <tr className={cn("border-b border-slate-100 group", locked ? "bg-slate-50/50" : "hover:bg-amber-50/20")}>
      <td className="pl-3 pr-1 py-2 w-6 text-slate-300"><GripVertical className="w-3.5 h-3.5" /></td>
      <td className="px-2 py-1.5 min-w-[200px]">
        <DescriptionCell
          item={item}
          onChange={locked ? () => {} : onChange}
          materials={materials}
          onAddToLibrary={onAddToLibrary}
        />
      </td>
      <td className="px-2 py-1.5 w-32">
        <select
          value={item.unit}
          onChange={e => onChange({ ...item, unit: e.target.value })}
          disabled={locked}
          className="w-full text-xs text-slate-600 bg-transparent border-b border-transparent focus:border-amber-400 outline-none py-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5 w-24">
        <input
          type="number"
          min="0"
          value={item.quantity}
          onChange={e => onChange({ ...item, quantity: e.target.value })}
          disabled={locked}
          className="w-full text-xs text-right text-slate-700 bg-transparent border-b border-transparent focus:border-amber-400 outline-none py-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-2 py-1.5 w-28">
        <div className="relative">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.cost_per_unit}
            onChange={e => onChange({ ...item, cost_per_unit: e.target.value })}
            disabled={locked}
            placeholder="0.00"
            className="w-full pl-3 text-xs text-right text-slate-700 bg-transparent border-b border-transparent focus:border-amber-400 outline-none py-0.5 placeholder:text-slate-300 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </td>
      {/* Margin % — per-item override; disabled when sell_override is set */}
      <td className="px-2 py-1.5 w-20">
        <div className="relative">
          <input
            type="number"
            min="0"
            max="95"
            step="1"
            disabled={has_sell_override || locked}
            value={item.margin_override ?? ""}
            onChange={e => {
              const v = e.target.value;
              onChange({ ...item, margin_override: v === "" ? null : Number(v) });
            }}
            placeholder={String(marginPct)}
            title={has_sell_override ? "Sell price override active — clear sell override to use margin" : has_margin_override ? "Per-item margin override" : "Override margin % for this item"}
            className={cn(
              "w-full text-xs text-right bg-transparent border-b outline-none py-0.5 placeholder:text-slate-300",
              (has_sell_override || locked)
                ? "border-transparent text-slate-300 cursor-not-allowed"
                : has_margin_override
                  ? "border-amber-400 text-amber-700 font-semibold focus:border-amber-500"
                  : "border-transparent text-slate-500 focus:border-amber-400"
            )}
          />
          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
        </div>
      </td>
      {/* Sell/Unit — editable override; placeholder shows margin-calculated value */}
      <td className="px-2 py-1.5 w-28">
        <div className="relative">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
          {hasCost ? (
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.sell_override ?? ""}
              onChange={e => {
                const v = e.target.value;
                onChange({ ...item, sell_override: v === "" ? null : Number(v) });
              }}
              placeholder={calcSell > 0 ? Number(calcSell.toFixed(2)).toString() : "0.00"}
              title={has_sell_override ? "Manual override — clear to use margin" : "Override sell price (optional)"}
              className={cn(
                "w-full pl-3 text-xs text-right bg-transparent border-b outline-none py-0.5 placeholder:text-slate-300",
                has_sell_override
                  ? "border-amber-400 text-amber-700 font-semibold focus:border-amber-500"
                  : "border-transparent text-slate-500 focus:border-amber-400"
              )}
            />
          ) : <span className="text-slate-300 pl-3">—</span>}
        </div>
      </td>
      <td className="px-2 py-1.5 w-28 text-right text-xs text-slate-600">
        {hasCost ? fmt(total_cost) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-2 py-1.5 w-28 text-right text-xs font-medium text-slate-800">
        {hasCost ? fmt(total_sell) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-2 py-1.5 w-16 text-center">
        {!locked && (
          <div className="flex items-center gap-1">
            <button
              title="Link to material library"
              className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-amber-500 transition-colors"
              onClick={() => {/* placeholder for material library hook */}}
            >
              <Package className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Trade / Material Section ─────────────────────────────────────────────────

function TradeSection({ trade, items, onChangeItem, onDeleteItem, onAddItem, onDeleteSection, materials, onAddToLibrary, sectionType = "trade", marginPct = 40, sectionMarginOverride, onSectionMarginChange, locked = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const effectiveSectionMargin = sectionMarginOverride != null ? Number(sectionMarginOverride) : marginPct;
  const tradeItems = items.filter(it => it.trade === trade);
  const { totalCost, totalSell } = summaryTotals(tradeItems, effectiveSectionMargin);
  const hasValues = totalSell > 0;
  const isMaterial = sectionType === "material";
  const isEmpty = tradeItems.length === 0;
  const hasSectionMarginOverride = sectionMarginOverride != null && sectionMarginOverride !== "";

  return (
    <div className={cn("bg-white rounded-xl border overflow-hidden mb-3", isMaterial ? "border-sky-200" : "border-slate-200")}>
      {/* Section header */}
      <div
        className={cn("flex items-center justify-between px-4 py-3 select-none border-b transition-colors",
          isMaterial
            ? "bg-sky-50 border-sky-200 hover:bg-sky-100"
            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
        )}
      >
        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? <ChevronRight className={cn("w-4 h-4", isMaterial ? "text-sky-400" : "text-slate-400")} /> : <ChevronDown className={cn("w-4 h-4", isMaterial ? "text-sky-400" : "text-slate-400")} />}
          <span className={cn("text-sm font-semibold", isMaterial ? "text-sky-800" : "text-slate-800")}>{trade}</span>
          {isMaterial && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-200 text-sky-700">Material</span>}
          <span className="text-xs text-slate-400">({tradeItems.length} item{tradeItems.length !== 1 ? "s" : ""})</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Section-level margin override */}
          {onSectionMarginChange && !locked && (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Margin</span>
              <div className="relative w-16">
                <input
                  type="number"
                  min="0"
                  max="95"
                  step="1"
                  value={sectionMarginOverride ?? ""}
                  onChange={e => {
                    const v = e.target.value;
                    onSectionMarginChange(trade, v === "" ? null : Number(v));
                  }}
                  placeholder={String(marginPct)}
                  title={hasSectionMarginOverride ? "Section margin override — clear to use global margin" : "Override margin % for this section"}
                  className={cn(
                    "w-full text-xs text-right bg-transparent border rounded px-1.5 py-0.5 outline-none placeholder:text-slate-300",
                    hasSectionMarginOverride
                      ? "border-amber-400 text-amber-700 font-semibold"
                      : "border-slate-200 text-slate-500 focus:border-amber-400"
                  )}
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">%</span>
              </div>
            </div>
          )}
          {hasValues && (
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Cost: <strong className="text-slate-700">{fmt(totalCost)}</strong></span>
              <span>Sell: <strong className={isMaterial ? "text-sky-700" : "text-amber-700"}>{fmt(totalSell)}</strong></span>
            </div>
          )}
          {isEmpty && !locked && (
            <button
              onClick={() => onDeleteSection(trade, sectionType)}
              title="Delete section"
              className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="w-6"></th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left w-32">Unit</th>
                  <th className="px-2 py-2 text-right w-24">Qty</th>
                  <th className="px-2 py-2 text-right w-28">Cost/Unit</th>
                  <th className="px-2 py-2 text-right w-20">Margin % ✎</th>
                  <th className="px-2 py-2 text-right w-28">Sell/Unit ✎</th>
                  <th className="px-2 py-2 text-right w-28">Total Cost</th>
                  <th className="px-2 py-2 text-right w-28">Total Sell</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {tradeItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-300">No items yet</td>
                  </tr>
                ) : (
                  tradeItems.map(item => (
                    <LineItemRow
                      key={item.id}
                      item={item}
                      onChange={onChangeItem}
                      onDelete={onDeleteItem}
                      materials={materials}
                      onAddToLibrary={onAddToLibrary}
                      marginPct={effectiveSectionMargin}
                      locked={locked}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!locked && (
            <div className="px-4 py-2 border-t border-slate-100">
              <button
                onClick={() => onAddItem(trade, sectionType)}
                className={cn("flex items-center gap-1.5 text-xs font-medium", isMaterial ? "text-sky-600 hover:text-sky-700" : "text-amber-600 hover:text-amber-700")}
              >
                <Plus className="w-3.5 h-3.5" /> Add line item
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Summary Panel ────────────────────────────────────────────────────────────

function SummaryPanel({ items, estimate, onEstimateChange, sectionMargins = {}, onClearAllOverrides }) {
  const marginPct = estimate.margin_override != null ? Number(estimate.margin_override) : 40;

  // Compute totals inline.
  // calcTotal uses MARGIN only (ignores sell_override) so the slider always reacts.
  // sell_override is a per-line pricing tool; the summary reflects the margin picture.
  let totalCost = 0;
  let calcTotal = 0;
  for (const it of (items || [])) {
    const cost = Number(it.cost_per_unit) || 0;
    const qty  = Number(it.quantity)      || 0;
    totalCost += qty * cost;
    if (!cost) continue;
    const secM  = sectionMargins[it.trade];
    const itemM = it.margin_override != null && it.margin_override !== ""
      ? Number(it.margin_override)
      : (secM != null ? Number(secM) : marginPct);
    const m     = Math.min(Math.max(Number(itemM) || 0, 0), 99.9) / 100;
    calcTotal  += qty * cost / (1 - m);
  }

  // Final display total (manual override wins)
  const hasOverride   = estimate.total_override != null && estimate.total_override !== "";
  const displayTotal  = hasOverride ? Number(estimate.total_override) : calcTotal;
  const displayProfit = calcTotal - totalCost;
  const displayMargin = calcTotal > 0 ? (displayProfit / calcTotal) * 100 : 0;

  const setMargin = (val) => {
    const clamped = Math.min(95, Math.max(0, Number(val) || 0));
    onEstimateChange({ margin_override: clamped, total_override: null });
    // Global margin overrides everything — clear all per-item and per-section overrides
    onClearAllOverrides?.();
  };
  const setTotal = (val) => {
    onEstimateChange({ total_override: val === "" ? null : Number(val), margin_override: null });
  };
  const resetOverride = () => onEstimateChange({ total_override: null, margin_override: null });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 sticky top-6">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Summary</h3>

      {/* Cost */}
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Total Cost</span>
        <span className="font-medium text-slate-700">{fmt(totalCost)}</span>
      </div>

      {/* Margin control */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Margin</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMargin(marginPct - 1)}
              className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center"
            >−</button>
            <div className="relative">
              <input
                type="number"
                min={0} max={95}
                value={marginPct}
                onChange={e => setMargin(e.target.value)}
                className="w-14 text-center text-sm font-bold border border-slate-200 rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-amber-300"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
            </div>
            <button
              onClick={() => setMargin(marginPct + 1)}
              className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center"
            >+</button>
          </div>
        </div>
        <input
          type="range" min={0} max={80} step={1}
          value={Math.min(marginPct, 80)}
          onChange={e => setMargin(e.target.value)}
          className="w-full accent-amber-500"
        />
      </div>

      {/* Manual total override */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Final Price</span>
          {hasOverride && (
            <button onClick={resetOverride} className="text-[10px] text-slate-400 hover:text-rose-500 underline">Reset</button>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
          <input
            type="number"
            min={0}
            step={100}
            value={hasOverride ? estimate.total_override : ""}
            onChange={e => setTotal(e.target.value)}
            placeholder={calcTotal > 0 ? Number(calcTotal.toFixed(2)).toString() : "0.00"}
            className={cn(
              "w-full pl-6 pr-2 py-1.5 text-sm font-semibold border rounded-lg outline-none focus:ring-2 focus:ring-amber-300",
              hasOverride ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-700"
            )}
          />
        </div>
        {hasOverride && (
          <p className="text-[10px] text-amber-600">Manual override active</p>
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Total Sell</span>
          <span className="font-bold text-slate-900">{fmt(calcTotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Gross Profit</span>
          <span className={cn("font-semibold", displayProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmt(displayProfit)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Effective Margin</span>
          <span className={cn("font-bold text-base", displayMargin >= 38 ? "text-emerald-600" : displayMargin >= 30 ? "text-amber-600" : "text-rose-600")}>
            {fmtp(displayMargin)}
          </span>
        </div>
      </div>

      {/* Per-section breakdown */}
      {items.length > 0 && (() => {
        const bySection = {};
        for (const it of items) {
          const t = itemTotals(it, marginPct);
          bySection[it.trade] = (bySection[it.trade] || 0) + t.total_sell;
        }
        const sorted = Object.entries(bySection).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
        if (!sorted.length) return null;
        return (
          <div className="border-t border-slate-100 pt-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">By Section</p>
            {sorted.map(([sec, sell]) => (
              <div key={sec} className="flex justify-between text-xs">
                <span className="text-slate-500 truncate max-w-[120px]">{sec}</span>
                <span className="font-medium text-slate-700">{fmt(sell)}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

async function loadImageAsDataUrl(src) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function exportPDF(estimate, clientName, items, company, marginPct = 40, sectionMargins = {}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, ML = 50, MR = 562, TW = MR - ML;
  let y = 50;

  // Load logo
  const logoDataUrl = await loadImageAsDataUrl("/company-logo.png");

  // Header
  doc.setFillColor(61, 53, 48); // #3d3530
  doc.rect(0, 0, W, 90, "F");

  if (logoDataUrl) {
    // Draw logo on left, constrained to 70pt tall
    doc.addImage(logoDataUrl, "PNG", ML, 10, 0, 70);
  }

  // Company name — use the profile matched to the client's company, or fallback
  const pdfCompanyName = company?.invoice_company_name || company?.name || "Construction Estimate";

  // Company name + label to the right of the logo
  const textX = logoDataUrl ? ML + 120 : ML;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(245, 240, 235);
  doc.text(pdfCompanyName, textX, 40);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(181, 150, 90); // gold
  doc.text("Construction Estimate", textX, 58);

  // Estimate meta
  y = 110;
  doc.setTextColor(61, 53, 48);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(estimate.title || "Estimate", ML, y);
  y += 18;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  if (clientName) { doc.text(`Client: ${clientName}`, ML, y); y += 13; }
  if (estimate.issue_date) { doc.text(`Date: ${estimate.issue_date}`, ML, y); y += 13; }
  doc.text(`Status: ${(estimate.status || "draft").toUpperCase()}`, ML, y);

  // Section header helper
  const sectionHeader = (title, yy) => {
    doc.setFillColor(245, 245, 245);
    doc.rect(ML, yy, TW, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(61, 53, 48);
    doc.text(title.toUpperCase(), ML + 4, yy + 11);
    return yy + 16;
  };

  // Column headers
  const colHeaders = (yy) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text("Description",   ML,      yy);
    doc.text("Unit",          ML+200,  yy);
    doc.text("Qty",           ML+240,  yy);
    doc.text("Cost/Unit",     ML+275,  yy);
    doc.text("Sell/Unit",     ML+325,  yy);
    doc.text("Total Cost",    ML+375,  yy);
    doc.text("Total Sell",    ML+430,  yy);
    doc.setDrawColor(200);
    doc.line(ML, yy + 3, MR, yy + 3);
    return yy + 8;
  };

  // Group by trade
  const trades = [...new Set(items.map(i => i.trade))];
  const rawTotals = summaryTotals(items, marginPct, sectionMargins);
  // Honor total_override if set
  const hasOverride = estimate.total_override != null && estimate.total_override !== "";
  const totalCost   = rawTotals.totalCost;
  const totalSell   = hasOverride ? Number(estimate.total_override) : rawTotals.totalSell;
  const profit      = totalSell - totalCost;
  const margin      = totalSell > 0 ? (profit / totalSell) * 100 : 0;

  y += 20;

  for (const trade of trades) {
    const tradeItems = items.filter(i => i.trade === trade);
    if (!tradeItems.length) continue;

    if (y > 680) { doc.addPage(); y = 50; }
    y = sectionHeader(trade, y);
    y = colHeaders(y + 4) + 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(50);

    for (const item of tradeItems) {
      if (y > 700) { doc.addPage(); y = 50; y = colHeaders(y); }
      const { sell_per_unit, total_cost, total_sell } = itemTotals(item, marginPct);
      const hasCost = Number(item.cost_per_unit) > 0;
      doc.text(String(item.description || "").substring(0, 38), ML, y);
      doc.text(item.unit || "",                                  ML+200, y);
      doc.text(String(item.quantity || ""),                      ML+240, y);
      doc.text(hasCost ? fmt(item.cost_per_unit) : "—",          ML+275, y);
      doc.text(hasCost ? fmt(sell_per_unit) : "—",               ML+325, y);
      doc.text(hasCost ? fmt(total_cost) : "—",                  ML+375, y);
      doc.text(hasCost ? fmt(total_sell) : "—",                  ML+430, y);
      y += 12;
    }
    y += 6;
  }

  // Totals
  if (y > 650) { doc.addPage(); y = 50; }
  y += 8;
  doc.setDrawColor(61, 53, 48);
  doc.line(ML, y, MR, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(61, 53, 48);
  const totRows = [
    ["Total Cost",   fmt(totalCost)],
    ["Total Sell",   fmt(totalSell)],
    ["Gross Profit", fmt(profit)],
    ["Margin",       fmtp(margin)],
  ];
  for (const [label, val] of totRows) {
    doc.text(label, MR - 130, y);
    doc.text(val,   MR,       y, { align: "right" });
    y += 13;
  }

  // Notes
  if (estimate.notes) {
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Notes", ML, y);
    y += 11;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    const lines = doc.splitTextToSize(estimate.notes, TW);
    doc.text(lines, ML, y);
  }

  doc.save(`Estimate - ${estimate.title || "draft"}.pdf`);
}

// ─── Client Estimate Preview ──────────────────────────────────────────────────

const DEFAULT_PREVIEW_OPTS = {
  showLineItems:    true,
  showItemNotes:    true,
  showQty:          true,
  showUnitPrice:    false,
  showTradeHeaders: true,
  showNotes:        true,
  showExpiry:       true,
};

function PreviewToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none py-0.5">
      <button
        type="button"
        onClick={onChange}
        className={cn("w-8 h-4 rounded-full relative transition-colors flex-shrink-0",
          checked ? "bg-amber-500" : "bg-slate-200"
        )}
      >
        <span className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )} />
      </button>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function ClientEstimateModal({ estimate, client, items, company, onClose, sectionMargins = {} }) {
  const [opts, setOpts] = useState(DEFAULT_PREVIEW_OPTS);
  const tog = (key) => setOpts(o => ({ ...o, [key]: !o[key] }));

  // Inject print CSS so only the preview prints
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "__est_print__";
    style.textContent = `
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
        body > * { display: none !important; }
        #est-client-root {
          display: block !important;
          position: static !important;
          width: 100% !important;
          background: white !important;
        }
        #est-client-root * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .print-sidebar { display: none !important; }
        #est-client-scroll {
          display: block !important;
          overflow: visible !important;
          height: auto !important;
          background: white !important;
          padding: 0 !important;
          width: 100% !important;
        }
        #est-client-paper {
          display: block !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          max-width: none !important;
          width: 100% !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("__est_print__")?.remove(); };
  }, []);

  const handleEmail = () => {
    const subject = `Estimate: ${estimate.title || "Your Estimate"}`;
    const em = estimate.margin_override != null ? Number(estimate.margin_override) : 40;
    const { totalSell: ecSell } = summaryTotals(items, em, sectionMargins);
    const et = estimate.total_override != null ? Number(estimate.total_override) : ecSell;
    const total = fmt(et);
    const body = [
      `Hi ${client?.name || ""},`,
      "",
      `Please find your estimate for "${estimate.title}" attached.`,
      "",
      `Estimate Total: ${total}`,
      estimate.issue_date ? `Date: ${estimate.issue_date}` : "",
      opts.showExpiry && estimate.expiry_date ? `Valid Until: ${estimate.expiry_date}` : "",
      "",
      "Thank you for your business!",
    ].filter(l => l !== null).join("\n");
    window.open(`mailto:${client?.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const previewMarginPct = estimate.margin_override != null ? Number(estimate.margin_override) : 40;
  const { totalCost: previewCost, totalSell: previewCalcTotal } = summaryTotals(items, previewMarginPct, sectionMargins);
  const totalSell = estimate.total_override != null ? Number(estimate.total_override) : previewCalcTotal;
  const trades = [...new Set(items.map(i => i.trade).filter(Boolean))];
  const companyName = company?.invoice_company_name || company?.name || "Clardy.io";
  const accentHex = company?.invoice_accent_color || company?.color || "#b5965a";

  const colSpanTotal = 1 + (opts.showQty ? 1 : 0) + (opts.showUnitPrice ? 1 : 0);

  const ItemsTable = ({ tradeItems }) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <th className="px-4 py-2 text-left">Description</th>
          {opts.showQty && <th className="px-4 py-2 text-center w-28">Qty / Unit</th>}
          {opts.showUnitPrice && <th className="px-4 py-2 text-right w-28">Unit Price</th>}
          <th className="px-4 py-2 text-right w-28">Amount</th>
        </tr>
      </thead>
      <tbody>
        {tradeItems.map(item => {
          const { sell_per_unit, total_sell } = itemTotals(item, previewMarginPct);
          const hasCost = Number(item.cost_per_unit) > 0;
          return (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="px-4 py-2.5">
                <p className="text-slate-800 font-medium">{item.description || <span className="italic text-slate-300">—</span>}</p>
                {opts.showItemNotes && item.notes && (
                  <p className="text-xs text-slate-400 mt-0.5 italic">{item.notes}</p>
                )}
              </td>
              {opts.showQty && <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{item.quantity} {item.unit}</td>}
              {opts.showUnitPrice && <td className="px-4 py-2.5 text-right text-slate-600">{hasCost ? fmt(sell_per_unit) : "—"}</td>}
              <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{hasCost ? fmt(total_sell) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return createPortal(
    <div id="est-client-root" className="fixed inset-0 z-50 flex bg-black/60">
      {/* Settings sidebar */}
      <div className="print-sidebar w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Client Preview</h3>
            <p className="text-xs text-slate-400 mt-0.5">What the client will see</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 pb-1">Display Options</p>
          <PreviewToggle label="Show line items"    checked={opts.showLineItems}    onChange={() => tog("showLineItems")} />
          <PreviewToggle label="Show item notes"    checked={opts.showItemNotes}    onChange={() => tog("showItemNotes")} />
          <PreviewToggle label="Show quantities"    checked={opts.showQty}          onChange={() => tog("showQty")} />
          <PreviewToggle label="Show unit prices"   checked={opts.showUnitPrice}    onChange={() => tog("showUnitPrice")} />
          <PreviewToggle label="Show trade headers" checked={opts.showTradeHeaders} onChange={() => tog("showTradeHeaders")} />
          <PreviewToggle label="Show notes section" checked={opts.showNotes}        onChange={() => tog("showNotes")} />
          <PreviewToggle label="Show expiry date"   checked={opts.showExpiry}       onChange={() => tog("showExpiry")} />
        </div>
        <div className="p-4 border-t border-slate-100 space-y-2">
          <button
            onClick={handleEmail}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Mail className="w-4 h-4" /> Email Client
          </button>
          <button
            onClick={() => window.print()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-white font-medium transition-colors"
            style={{ background: "linear-gradient(to right, #f59e0b, #f97316)" }}
          >
            <Download className="w-4 h-4" /> Save as PDF
          </button>
        </div>
      </div>

      {/* Preview scroll area */}
      <div id="est-client-scroll" className="flex-1 overflow-y-auto bg-slate-300 p-8">
        <div id="est-client-paper" className="bg-white max-w-3xl mx-auto shadow-2xl rounded overflow-hidden">

          {/* Header */}
          <div className="p-8" style={{ backgroundColor: "#3d3530" }}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <img
                  src="/company-logo.png"
                  alt="Company Logo"
                  className="h-16 w-auto object-contain"
                  onError={e => { e.target.style.display = "none"; }}
                />
                <div>
                  <h1 className="text-2xl font-bold tracking-wide" style={{ color: accentHex }}>{companyName}</h1>
                  <p className="text-slate-400 text-sm mt-1 uppercase tracking-widest">Construction Estimate</p>
                </div>
              </div>
              <div className="text-right text-sm text-slate-300 space-y-1">
                {estimate.estimate_number && (
                  <p className="font-mono font-bold text-white text-base">{estimate.estimate_number}</p>
                )}
                {estimate.issue_date && <p>Date: {estimate.issue_date}</p>}
                {opts.showExpiry && estimate.expiry_date && <p>Expires: {estimate.expiry_date}</p>}
              </div>
            </div>
          </div>

          {/* Client + project info */}
          <div className="px-8 py-6 border-b border-slate-200 flex gap-8 justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Prepared For</p>
              {client ? (
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-900">{client.name}</p>
                  {client.email   && <p className="text-sm text-slate-500">{client.email}</p>}
                  {client.phone   && <p className="text-sm text-slate-500">{client.phone}</p>}
                  {client.address && <p className="text-sm text-slate-500">{client.address}</p>}
                </div>
              ) : (
                <p className="text-slate-400 italic text-sm">No client selected</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Project</p>
              <p className="font-semibold text-slate-900">{estimate.title || "Estimate"}</p>
              <p className="text-sm text-slate-500 capitalize mt-0.5">{estimate.status || "draft"}</p>
            </div>
          </div>

          {/* Line items */}
          <div className="px-8 py-6 space-y-5">
            {opts.showTradeHeaders ? (
              trades.map(trade => {
                const tradeItems = items.filter(i => i.trade === trade);
                const tradeSell = tradeItems.reduce((s, it) => s + itemTotals(it, previewMarginPct).total_sell, 0);
                return (
                  <div key={trade} className="rounded overflow-hidden border border-slate-200">
                    <div className="px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white" style={{ backgroundColor: "#3d3530" }}>
                      {trade}
                    </div>
                    {opts.showLineItems ? (
                      <>
                        <ItemsTable tradeItems={tradeItems} />
                        <div className="border-t-2 border-slate-200 bg-slate-50 px-4 py-2 flex justify-between text-sm">
                          <span className="font-semibold text-slate-500 uppercase tracking-wide text-xs">Subtotal</span>
                          <span className="font-bold text-slate-800">{fmt(tradeSell)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="px-4 py-3 flex justify-between text-sm">
                        <span className="text-slate-600">{trade}</span>
                        <span className="font-semibold text-slate-800">{fmt(tradeSell)}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded overflow-hidden border border-slate-200">
                <ItemsTable tradeItems={items} />
              </div>
            )}

            {/* Total */}
            <div className="flex justify-end pt-2">
              <div className="rounded-lg overflow-hidden border-2 border-slate-800 min-w-[220px]">
                <div className="px-5 py-3 flex items-center justify-between gap-6" style={{ backgroundColor: "#3d3530" }}>
                  <span className="text-sm font-bold uppercase tracking-wide text-slate-300">Estimate Total</span>
                  <span className="text-xl font-bold" style={{ color: accentHex }}>{fmt(totalSell)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {opts.showNotes && estimate.notes && (
            <div className="px-8 py-6 border-t border-slate-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Notes & Scope</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{estimate.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-200">
            <p className="text-xs text-slate-400 text-center">
              {opts.showExpiry && estimate.expiry_date
                ? `This estimate is valid until ${estimate.expiry_date}`
                : "This estimate is valid for 30 days from the issue date"}
              {" · "}{companyName}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Add Material Section Dialog ─────────────────────────────────────────────

function AddMaterialSectionDialog({ activeSections, onAdd, onClose, customCategories, onAddCustomCategory }) {
  const [newName, setNewName] = useState("");
  const allCategories = [...DEFAULT_MATERIAL_CATEGORIES, ...customCategories];
  const available = allCategories.filter(c => !activeSections.includes(c));

  const handleAddCustom = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddCustomCategory(trimmed);
    onAdd(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Add Material Section</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-2">All categories already added.</p>
          ) : (
            <div className="space-y-1">
              {available.map(cat => (
                <button key={cat} onClick={() => { onAdd(cat); onClose(); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sky-50 hover:text-sky-700 text-slate-700 transition-colors">
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add Custom Category</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddCustom()}
              placeholder="e.g. Pool Equipment, Millwork…"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-sky-300"
            />
            <button
              onClick={handleAddCustom}
              disabled={!newName.trim()}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-sky-600 transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Custom categories are saved for future estimates.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Add Trade Dialog ─────────────────────────────────────────────────────────

function AddTradeDialog({ activeTrades, onAdd, onClose, customCategories = [], onAddCustomCategory }) {
  const [group, setGroup] = useState("GC / Outdoor Living");
  const [newName, setNewName] = useState("");

  const allInGroup = group === "Custom"
    ? customCategories
    : (TRADE_GROUPS[group] || []);
  const available = allInGroup.filter(t => !activeTrades.includes(t));

  const groups = [...Object.keys(TRADE_GROUPS), "Custom"];

  const handleAddCustom = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddCustomCategory(trimmed);
    onAdd(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Add Trade Section</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><span className="text-xl leading-none">×</span></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {groups.map(g => (
              <button key={g} onClick={() => setGroup(g)}
                className={cn("text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all",
                  group === g ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-600 hover:border-amber-300"
                )}>{g}</button>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {available.length === 0 && group !== "Custom" ? (
              <p className="text-sm text-slate-400 text-center py-4">All trades in this group are already added.</p>
            ) : (
              available.map(t => (
                <button key={t} onClick={() => { onAdd(t); onClose(); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-amber-50 hover:text-amber-700 text-slate-700 transition-colors">
                  {t}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add Custom Category</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddCustom()}
              placeholder="e.g. Waterproofing, Stucco…"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              onClick={handleAddCustom}
              disabled={!newName.trim()}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-amber-600 transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Custom categories are saved for future estimates.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EstimateDetail() {
  const navigate = useNavigate();
  const params   = new URLSearchParams(window.location.search);
  const existingId = params.get("id");
  const isNew    = params.get("new") === "true" || !existingId;

  const [showPicker, setShowPicker]           = useState(isNew);
  const [showAddTrade, setShowAddTrade]       = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showPreview, setShowPreview]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [saveError, setSaveError]       = useState("");
  const [showLockDialog, setShowLockDialog]   = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockInput, setUnlockInput]   = useState("");
  const { user } = useAuth();

  // Track the live ID — starts as existingId, updated after first create
  const currentIdRef = useRef(existingId);
  const [clients, setClients]           = useState([]);
  const [materials, setMaterials]       = useState([]);
  const [company, setCompany]           = useState(null);
  const [allCompanyProfiles, setAllCompanyProfiles] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const [estimate, setEstimate] = useState({
    title: "",
    client_id: "",
    status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    notes: "",
    margin_override: null,
    total_override: null,
  });
  const [sectionMargins, setSectionMargins] = useState({});
  const [items, setItems]                         = useState([]);
  const [activeTrades, setActiveTrades]           = useState([]);
  const [activeMaterialSections, setActiveMaterialSections] = useState([]);
  const [customMaterialCategories, setCustomMaterialCategories] = useState([]);
  const [customTradeCategories, setCustomTradeCategories]     = useState([]);

  // Sync sections from items
  useEffect(() => {
    const trades   = [...new Set(items.filter(i => i.sectionType !== "material").map(i => i.trade))];
    const matSecs  = [...new Set(items.filter(i => i.sectionType === "material").map(i => i.trade))];
    setActiveTrades(prev => [...new Set([...prev, ...trades])]);
    setActiveMaterialSections(prev => [...new Set([...prev, ...matSecs])]);
  }, [items]);

  // Load clients + leads, materials, company profile + custom material categories
  useEffect(() => {
    Promise.all([
      base44.entities.Client.list("name"),
      base44.entities.Lead.list("full_name"),
    ]).then(([clientData, leadData]) => {
      // Merge leads into clients list with a type tag so the dropdown can group them
      const leadsAsClients = leadData.map(l => ({
        id:    l.id,
        name:  l.full_name || l.name || l.email || "Unnamed Lead",
        email: l.email,
        phone: l.phone,
        _isLead: true,
      }));
      setClients([...clientData, ...leadsAsClients]);
    });
    base44.entities.Material.list("name").then(setMaterials);
    base44.entities.CompanyProfile.list().then(rows => {
      setAllCompanyProfiles(rows || []);
      if (rows.length) {
        setCompany(rows[0]);
        setCustomMaterialCategories(rows[0]?.settings?.custom_material_categories || []);
        setCustomTradeCategories(rows[0]?.settings?.custom_trade_categories || []);
        // Default to the active company scope if set, otherwise first profile
        const scopeId = getSelectedCompanyScope();
        const scopeMatch = scopeId !== "all" ? rows.find(r => r.id === scopeId) : null;
        setSelectedCompanyId((scopeMatch || rows[0]).id);
      }
    });
  }, []);

  const handleAddToLibrary = useCallback(async (matData) => {
    setMaterials(prev => {
      const existing = prev.find(m => m.name?.toLowerCase() === matData.name?.trim().toLowerCase());
      if (existing) {
        // Update existing record with better data (non-zero cost, non-empty unit)
        const merged = {
          ...existing,
          description: existing.description || matData.description || "",
          unit:         existing.unit        || matData.unit        || "EA",
          unit_cost:    existing.unit_cost > 0 ? existing.unit_cost : (matData.unit_cost || 0),
          material_cost: existing.material_cost > 0 ? existing.material_cost : (matData.material_cost || 0),
        };
        base44.entities.Material.update(existing.id, merged).catch(console.error);
        return prev.map(m => m.id === existing.id ? merged : m);
      }
      // Create new
      base44.entities.Material.create(matData).then(created => {
        setMaterials(all => [...all.filter(m => m.id !== created.id), created]
          .sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      }).catch(console.error);
      return prev;
    });
  }, []);

  // Load existing estimate
  useEffect(() => {
    if (!existingId) return;
    (async () => {
      const est = await base44.entities.Estimate.get(existingId);
      if (!est) return;
      setEstimate({
        title:           est.title      || "",
        client_id:       est.client_id  || "",
        status:          est.status     || "draft",
        issue_date:      est.issue_date || new Date().toISOString().slice(0, 10),
        notes:           est.notes      || "",
        margin_override: est.margin_override ?? null,
        total_override:  est.total_override  ?? null,
      });
      if (est.section_margins && typeof est.section_margins === "object") {
        setSectionMargins(est.section_margins);
      }
      const savedItems = Array.isArray(est.line_items) ? est.line_items : [];
      setItems(savedItems);
      setActiveTrades([...new Set(savedItems.filter(i => i.sectionType !== "material").map(i => i.trade))]);
      setActiveMaterialSections([...new Set(savedItems.filter(i => i.sectionType === "material").map(i => i.trade))]);
      setShowPicker(false);
    })();
  }, [existingId]);

  const handleTemplatePick = (template) => {
    if (template) {
      setItems(template.items.map(i => ({ ...i, id: Math.random().toString(36).slice(2, 10) })));
      setActiveTrades([...new Set(template.items.map(i => i.trade))]);
      setEstimate(e => ({ ...e, title: template.label }));
    }
    setShowPicker(false);
  };

  const handleChangeItem = useCallback((updated) => {
    setItems(prev => prev.map(it => it.id === updated.id ? updated : it));
    // If item margin changed, clear any manual total override so computed total is shown
    setEstimate(e => e.total_override != null ? { ...e, total_override: null } : e);
    setSaved(false);
  }, []);

  const handleDeleteItem = useCallback((id) => {
    setItems(prev => prev.filter(it => it.id !== id));
    setSaved(false);
  }, []);

  const handleAddItem = useCallback((sectionName, sectionType = "trade") => {
    setItems(prev => [...prev, blankItem(sectionName, "", "SF", 1, sectionType)]);
    setSaved(false);
  }, []);

  const handleEstimateChange = useCallback((patch) => {
    setEstimate(e => ({ ...e, ...patch }));
    setSaved(false);
  }, []);

  const handleClearAllOverrides = useCallback(() => {
    setItems(prev => prev.map(it => ({ ...it, sell_override: null, margin_override: null })));
    setSectionMargins({});
  }, []);

  const handleSectionMarginChange = useCallback((sectionName, value) => {
    setSectionMargins(prev => {
      if (value === null) {
        const { [sectionName]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [sectionName]: value };
    });
    // Clear any manual total override so computed total is shown
    setEstimate(e => e.total_override != null ? { ...e, total_override: null } : e);
    setSaved(false);
  }, []);

  const handleAddTrade = (trade) => {
    setActiveTrades(prev => [...prev, trade]);
    setSaved(false);
  };

  const handleAddMaterialSection = (name) => {
    setActiveMaterialSections(prev => [...prev, name]);
    setSaved(false);
  };

  const handleDeleteSection = (name, sectionType) => {
    if (sectionType === "material") {
      setActiveMaterialSections(prev => prev.filter(s => s !== name));
    } else {
      setActiveTrades(prev => prev.filter(t => t !== name));
    }
    setItems(prev => prev.filter(it => it.trade !== name));
    setSaved(false);
  };

  const handleAddCustomCategory = async (name) => {
    const updated = [...customMaterialCategories, name];
    setCustomMaterialCategories(updated);
    if (company?.id) {
      const newSettings = { ...(company.settings || {}), custom_material_categories: updated };
      await base44.entities.CompanyProfile.update(company.id, { settings: newSettings });
      setCompany(c => ({ ...c, settings: newSettings }));
    }
  };

  const handleAddCustomTradeCategory = async (name) => {
    const updated = [...customTradeCategories, name];
    setCustomTradeCategories(updated);
    if (company?.id) {
      const newSettings = { ...(company.settings || {}), custom_trade_categories: updated };
      await base44.entities.CompanyProfile.update(company.id, { settings: newSettings });
      setCompany(c => ({ ...c, settings: newSettings }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const marginPct = estimate.margin_override != null ? Number(estimate.margin_override) : 40;
      const { totalCost, totalSell: calcTotal } = summaryTotals(items, marginPct, sectionMargins);
      const effectiveTotal  = estimate.total_override != null ? Number(estimate.total_override) : calcTotal;
      const effectiveMargin = effectiveTotal > 0 ? ((effectiveTotal - totalCost) / effectiveTotal) * 100 : marginPct;
      const { client_name: _cn, ...estimateForSave } = estimate;

      // Auto-assign estimate number on first create
      let estimateNumber = estimate.estimate_number;
      if (!estimateNumber && !currentIdRef.current) {
        const allEstimates = await base44.entities.Estimate.list().catch(() => []);
        const maxNum = allEstimates.reduce((max, e) => {
          const m = (e.estimate_number || "").match(/(\d+)$/);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        estimateNumber = `EST-${String(maxNum + 1).padStart(3, "0")}`;
        setEstimate(e => ({ ...e, estimate_number: estimateNumber }));
      }

      const payload = {
        ...estimateForSave,
        // Convert empty strings to null for FK / nullable fields
        client_id:       estimate.client_id  || null,
        project_id:      estimate.project_id || null,
        line_items:      items,
        section_margins: sectionMargins,
        total:           effectiveTotal,
        margin_percent:  effectiveMargin,
        ...(estimateNumber ? { estimate_number: estimateNumber } : {}),
      };
      if (currentIdRef.current) {
        await base44.entities.Estimate.update(currentIdRef.current, payload);
      } else {
        const created = await base44.entities.Estimate.create(payload);
        currentIdRef.current = created.id;
        window.history.replaceState({}, "", createPageUrl(`EstimateDetail?id=${created.id}`));
      }

      // Auto-save new items to the material/labor library.
      // Fetch fresh list first to avoid stale-state duplicates from rapid auto-saves.
      const freshMaterials = await base44.entities.Material.list("name").catch(() => []);
      // Deduplicate the library: for same-name entries keep the richest, delete the rest.
      const byNameKey = {};
      for (const m of freshMaterials) {
        const key = (m.name || "").trim().toLowerCase();
        if (!key) continue;
        if (!byNameKey[key]) { byNameKey[key] = []; }
        byNameKey[key].push(m);
      }
      const richness = m =>
        (m.name?.trim().length || 0) +
        (m.description?.trim().length || 0) +
        ((m.material_cost || 0) + (m.labor_cost || 0) + (m.sub_cost || 0)) * 100;
      for (const group of Object.values(byNameKey)) {
        if (group.length < 2) continue;
        group.sort((a, b) => richness(b) - richness(a));
        for (const dupe of group.slice(1)) {
          await base44.entities.Material.delete(dupe.id).catch(() => {});
        }
      }

      const LABOR_TRADES = new Set(["Framing Labor","Masonry Labor","Roofing Labor","Electrical Labor","Plumbing Labor","HVAC Labor","Finish Labor","Demo Labor","General Labor","Subcontractor","Other Labor","Labor"]);
      // Rebuild deduped index
      const libIndex = {};
      for (const m of freshMaterials) {
        const key = (m.name || "").trim().toLowerCase();
        if (!key) continue;
        if (!libIndex[key] || richness(m) > richness(libIndex[key])) libIndex[key] = m;
      }
      for (const item of items) {
        const name = (item.description || "").trim();
        const cost = Number(item.cost_per_unit) || 0;
        if (!name || cost === 0) continue; // skip blank or zero-cost items
        const key = name.toLowerCase();
        const existing = libIndex[key];
        const isLaborItem = item.sectionType === "labor" || LABOR_TRADES.has(item.trade);
        const matData = {
          name,
          unit: item.unit || "EA",
          ...(isLaborItem
            ? { labor_cost: cost, material_cost: 0 }
            : { material_cost: cost, labor_cost: 0 }),
        };
        if (existing) {
          // Only update if the library entry has no pricing yet
          const hasCost = (existing.material_cost || 0) + (existing.labor_cost || 0) + (existing.sub_cost || 0) > 0;
          if (!hasCost) {
            await base44.entities.Material.update(existing.id, matData).catch(() => {});
          }
        } else {
          await base44.entities.Material.create(matData).catch(() => {});
        }
      }
      // Refresh materials list in state
      base44.entities.Material.list("name").then(setMaterials).catch(() => {});

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveError(err?.message || "Save failed. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  const isLocked = !!estimate.is_locked;

  const handleLock = async () => {
    const payload = {
      is_locked: true,
      locked_at: new Date().toISOString(),
      locked_by: user?.email || user?.full_name || "user",
    };
    setEstimate(e => ({ ...e, ...payload }));
    setShowLockDialog(false);
    await base44.entities.Estimate.update(currentIdRef.current, payload).catch(console.error);
  };

  const handleUnlock = async () => {
    if (unlockInput !== "UNLOCK") return;
    const payload = { is_locked: false, locked_at: null, locked_by: null };
    setEstimate(e => ({ ...e, ...payload }));
    setShowUnlockDialog(false);
    setUnlockInput("");
    await base44.entities.Estimate.update(currentIdRef.current, payload).catch(console.error);
  };

  // Auto-save: 4 seconds after the last change, if there is something to save.
  // Direct closure call — each effect render captures the latest handleSave.
  useEffect(() => {
    if (!estimate.title && items.length === 0) return; // nothing to save yet
    if (isLocked) return; // never auto-save a locked estimate
    const timerId = setTimeout(() => handleSave(), 4000);
    return () => clearTimeout(timerId);
  // handleSave is intentionally excluded — it's recreated each render so
  // the closure already has the latest estimate/items values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate, items]);

  const clientObj  = clients.find(c => c.id === estimate.client_id) || null;
  const clientName = clientObj?.name || "";
  const previewClient = clientObj || null;

  // The company whose name/logo appears on the estimate header.
  // Driven by the explicit selector; falls back to first profile.
  const effectiveCompany = (selectedCompanyId
    ? allCompanyProfiles.find(p => p.id === selectedCompanyId)
    : null) || company;
  const effectiveMarginPct = estimate.margin_override != null ? Number(estimate.margin_override) : 40;
  const { totalCost, totalSell } = summaryTotals(items, effectiveMarginPct, sectionMargins);

  return (
    <div className="min-h-screen bg-slate-50">
      {showPreview && (
        <ClientEstimateModal
          estimate={estimate}
          client={previewClient}
          items={items}
          company={effectiveCompany}
          onClose={() => setShowPreview(false)}
          sectionMargins={sectionMargins}
        />
      )}
      {showPicker && <TemplatePicker onSelect={handleTemplatePick} onClose={() => navigate(createPageUrl("Estimates"))} />}
      {showAddTrade && (
        <AddTradeDialog
          activeTrades={activeTrades}
          onAdd={handleAddTrade}
          onClose={() => setShowAddTrade(false)}
          customCategories={customTradeCategories}
          onAddCustomCategory={handleAddCustomTradeCategory}
        />
      )}
      {showAddMaterial && (
        <AddMaterialSectionDialog
          activeSections={activeMaterialSections}
          onAdd={handleAddMaterialSection}
          onClose={() => setShowAddMaterial(false)}
          customCategories={customMaterialCategories}
          onAddCustomCategory={handleAddCustomCategory}
        />
      )}

      {/* Lock confirmation dialog */}
      {showLockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Lock This Estimate?</p>
                <p className="text-sm text-slate-500">Mark as signed and agreed upon</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">This action cannot easily be undone.</p>
              <p className="text-xs">Once locked, all line items and pricing are frozen. The estimate becomes the contract of record. Only an admin can unlock it by typing <strong>UNLOCK</strong>.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setShowLockDialog(false)}>Cancel</Button>
              <Button size="sm" onClick={handleLock} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                <Lock className="w-4 h-4" /> Lock & Sign Off
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock confirmation dialog */}
      {showUnlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Admin Unlock</p>
                <p className="text-sm text-slate-500">This estimate is signed and locked</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">Unlocking allows the estimate to be edited again. This should only be done if the contract needs to be revised and a new sign-off is obtained.</p>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Type UNLOCK to confirm</label>
              <input
                autoFocus
                value={unlockInput}
                onChange={e => setUnlockInput(e.target.value)}
                placeholder="UNLOCK"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => { setShowUnlockDialog(false); setUnlockInput(""); }}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleUnlock}
                disabled={unlockInput !== "UNLOCK"}
                className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 disabled:opacity-40"
              >
                <LockOpen className="w-4 h-4" /> Unlock Estimate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky top bar */}
      <div className={cn("sticky top-0 z-30 border-b shadow-sm", isLocked ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200")}>
        <div className="max-w-screen-xl mx-auto px-4 lg:px-6 py-3 flex items-center gap-3">
          <button onClick={() => navigate(createPageUrl("Estimates"))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={estimate.title}
            onChange={e => { if (isLocked) return; setEstimate(est => ({ ...est, title: e.target.value })); setSaved(false); }}
            placeholder="Estimate title…"
            readOnly={isLocked}
            className={cn("flex-1 min-w-0 text-lg font-bold text-slate-900 bg-transparent outline-none border-b border-transparent py-0.5", !isLocked && "focus:border-amber-400")}
          />

          {isLocked && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap border border-emerald-200">
              <Lock className="w-3.5 h-3.5" /> Signed & Locked
              {estimate.locked_by && <span className="text-emerald-500 font-normal">· {estimate.locked_by}</span>}
            </span>
          )}

          <select
            value={estimate.client_id}
            disabled={isLocked}
            onChange={e => {
              const selected = clients.find(c => c.id === e.target.value);
              setEstimate(est => ({ ...est, client_id: e.target.value }));
              if (selected?.company && allCompanyProfiles.length) {
                const match = allCompanyProfiles.find(p => p.name === selected.company);
                if (match) setSelectedCompanyId(match.id);
              }
              setSaved(false);
            }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-300 min-w-[180px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="">— Select client —</option>
            {[...clients].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {allCompanyProfiles.length > 1 && (
            <select
              value={selectedCompanyId || ""}
              disabled={isLocked}
              onChange={e => { setSelectedCompanyId(e.target.value); setSaved(false); }}
              className="text-sm border border-amber-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-300 min-w-[160px] disabled:opacity-60"
            >
              {allCompanyProfiles.map(cp => (
                <option key={cp.id} value={cp.id}>{cp.invoice_company_name || cp.name}</option>
              ))}
            </select>
          )}

          <select
            value={estimate.status}
            disabled={isLocked}
            onChange={e => { setEstimate(est => ({ ...est, status: e.target.value })); setSaved(false); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="revised">Revised</option>
          </select>

          <input
            type="date"
            value={estimate.issue_date}
            readOnly={isLocked}
            onChange={e => { if (isLocked) return; setEstimate(est => ({ ...est, issue_date: e.target.value })); setSaved(false); }}
            className={cn("text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none", !isLocked && "focus:ring-2 focus:ring-amber-300", isLocked && "opacity-60 cursor-not-allowed")}
          />

          <Button
            variant="outline" size="sm"
            onClick={() => setShowPreview(true)}
            className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
          >
            <Eye className="w-4 h-4" /> Preview / Send
          </Button>

          <Button
            variant="outline" size="sm"
            onClick={() => exportPDF(estimate, clientName, items, effectiveCompany, effectiveMarginPct, sectionMargins).catch(console.error)}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" /> PDF
          </Button>

          {isLocked ? (
            <Button
              size="sm"
              onClick={() => setShowUnlockDialog(true)}
              variant="outline"
              className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 whitespace-nowrap"
            >
              <LockOpen className="w-4 h-4" /> Unlock
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowLockDialog(true)}
                className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                title="Lock estimate once signed by client"
              >
                <Lock className="w-4 h-4" /> Lock
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className={cn("gap-1.5 min-w-[100px]", saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-to-r from-amber-500 to-orange-500")}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>
      {saveError && (
        <div className="max-w-screen-xl mx-auto px-4 lg:px-6 mt-2">
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-2">
            {saveError}
          </div>
        </div>
      )}
      {isLocked && (
        <div className="max-w-screen-xl mx-auto px-4 lg:px-6 mt-3">
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-semibold">This estimate is locked.</span>
              {" "}Line items and pricing are frozen as the signed contract of record.
              {estimate.locked_at && <span className="text-emerald-600 ml-2 text-xs">Locked {new Date(estimate.locked_at).toLocaleDateString()}{estimate.locked_by ? ` by ${estimate.locked_by}` : ""}.</span>}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-screen-xl mx-auto px-4 lg:px-6 py-6 flex gap-6 items-start">
        {/* Left — trade + material sections */}
        <div className="flex-1 min-w-0 space-y-1">
          {activeTrades.length === 0 && activeMaterialSections.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
              <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No sections yet</p>
              <p className="text-slate-400 text-sm mt-1">Add a trade or material section, or start from a template.</p>
            </div>
          )}

          {/* Material sections — top */}
          {activeMaterialSections.map(sec => (
            <TradeSection
              key={sec}
              trade={sec}
              items={items}
              onChangeItem={handleChangeItem}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem}
              onDeleteSection={handleDeleteSection}
              materials={materials}
              onAddToLibrary={handleAddToLibrary}
              sectionType="material"
              marginPct={effectiveMarginPct}
              sectionMarginOverride={sectionMargins[sec] ?? null}
              onSectionMarginChange={handleSectionMarginChange}
              locked={isLocked}
            />
          ))}

          {/* Non-labor trade sections — middle */}
          {activeTrades.filter(t => !TRADE_GROUPS["Labor"]?.includes(t)).map(trade => (
            <TradeSection
              key={trade}
              trade={trade}
              items={items}
              onChangeItem={handleChangeItem}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem}
              onDeleteSection={handleDeleteSection}
              materials={materials}
              onAddToLibrary={handleAddToLibrary}
              sectionType="trade"
              marginPct={effectiveMarginPct}
              sectionMarginOverride={sectionMargins[trade] ?? null}
              onSectionMarginChange={handleSectionMarginChange}
              locked={isLocked}
            />
          ))}

          {/* Labor sections — bottom */}
          {activeTrades.filter(t => TRADE_GROUPS["Labor"]?.includes(t)).map(trade => (
            <TradeSection
              key={trade}
              trade={trade}
              items={items}
              onChangeItem={handleChangeItem}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem}
              onDeleteSection={handleDeleteSection}
              materials={materials}
              onAddToLibrary={handleAddToLibrary}
              sectionType="trade"
              marginPct={effectiveMarginPct}
              sectionMarginOverride={sectionMargins[trade] ?? null}
              onSectionMarginChange={handleSectionMarginChange}
              locked={isLocked}
            />
          ))}

          {!isLocked && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => setShowAddTrade(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Trade Section
              </button>
              <button
                onClick={() => setShowAddMaterial(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-sky-200 text-sm text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Material Section
              </button>
              <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
              >
                <FileText className="w-4 h-4" /> Load Template
              </button>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes / Scope Summary</Label>
            <textarea
              value={estimate.notes}
              onChange={e => { setEstimate(est => ({ ...est, notes: e.target.value })); setSaved(false); }}
              placeholder="Add scope notes, exclusions, payment terms…"
              rows={4}
              className="mt-2 w-full text-sm text-slate-700 bg-transparent outline-none resize-none placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Right — summary */}
        <div className="w-64 flex-shrink-0">
          <SummaryPanel items={items} estimate={estimate} onEstimateChange={handleEstimateChange} sectionMargins={sectionMargins} onClearAllOverrides={handleClearAllOverrides} />
        </div>
      </div>
    </div>
  );
}
