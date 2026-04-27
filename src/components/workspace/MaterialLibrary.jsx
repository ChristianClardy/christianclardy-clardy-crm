import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Edit2, Trash2, Search, Package, Upload, Sparkles,
  ChevronDown, ChevronRight, History, AlertTriangle, TrendingUp,
  DollarSign, Archive, BarChart3, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import MaterialImportDialog from "./MaterialImportDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIAL_CATEGORIES = [
  "Concrete & Masonry", "Framing & Lumber", "Roofing", "Insulation",
  "Drywall", "Flooring", "Plumbing", "Electrical", "HVAC",
  "Windows & Doors", "Finish & Trim", "Landscaping", "Equipment", "Other",
];

const LABOR_CATEGORIES = [
  "Framing Labor", "Masonry Labor", "Roofing Labor", "Electrical Labor",
  "Plumbing Labor", "HVAC Labor", "Finish Labor", "Demo Labor",
  "General Labor", "Subcontractor", "Other Labor",
];

const LABOR_CATEGORY_SET = new Set(LABOR_CATEGORIES);

const UNITS = ["EA", "LF", "SF", "SY", "CY", "CF", "LB", "TON", "HR", "DAY", "GAL", "BAG", "ROLL", "SHEET", "LS", "BDL", "PC", "BOX", "PALLET"];

const MARKUP_TYPES = [
  { value: "markup_percent", label: "Markup %" },
  { value: "margin_percent", label: "Margin %" },
  { value: "overhead_profit", label: "Overhead / Profit Split" },
];

const COST_METHODS = [
  { value: "standard", label: "Standard Cost" },
  { value: "average", label: "Weighted Average" },
  { value: "fifo", label: "FIFO" },
  { value: "lifo", label: "LIFO" },
];

const TAX_CATEGORIES = [
  { value: "taxable", label: "Taxable" },
  { value: "exempt", label: "Tax Exempt" },
  { value: "services", label: "Services (Non-taxable)" },
  { value: "resale", label: "For Resale" },
];

const GL_ACCOUNTS = [
  "5000 - Cost of Goods Sold",
  "5100 - Materials & Supplies",
  "5200 - Direct Labor",
  "5300 - Subcontractor Costs",
  "5400 - Equipment & Rentals",
  "6000 - Overhead",
  "6100 - Indirect Materials",
  "1300 - Inventory Asset",
  "1310 - Raw Materials Inventory",
  "Custom…",
];

const WEIGHT_UNITS = ["lb", "kg", "ton", "oz"];

// ─── Auto-categorization rules ────────────────────────────────────────────────

const MATERIAL_RULES = [
  { category: "Framing & Lumber",   keywords: ["lumber","cedar","pine","oak","2x4","2x6","2x8","2x10","2x12","osb","plywood","sheathing","beam","joist","rafter","stud","lvl","fascia","ledger","blocking","header","ridge","purlin","board","t&g","tongue","groove","dimensional"] },
  { category: "Roofing",            keywords: ["shingle","roofing","underlayment","drip edge","flashing","soffit","felt","ice barrier","ridge cap","membrane","epdm","tpo","gutter","downspout"] },
  { category: "Concrete & Masonry", keywords: ["concrete","cement","brick","block","mortar","grout","masonry","stone","paver","rebar","wire mesh","aggregate","sand","cube of"] },
  { category: "Insulation",         keywords: ["insulation","batt","foam","spray foam","rigid","vapor barrier","r-","r13","r19","r38"] },
  { category: "Drywall",            keywords: ["drywall","gypsum","sheetrock","joint compound","mud","tape","corner bead"] },
  { category: "Flooring",           keywords: ["flooring","floor","tile","hardwood","laminate","vinyl","lvp","carpet","subfloor","underlayment pad"] },
  { category: "Plumbing",           keywords: ["pipe","pvc","cpvc","pex","copper","fitting","valve","faucet","fixture","toilet","sink","drain","trap","water heater","plumbing"] },
  { category: "Electrical",         keywords: ["wire","wiring","electrical","outlet","switch","breaker","panel","conduit","romex","receptacle","lighting","light","fan","recessed","junction"] },
  { category: "HVAC",               keywords: ["hvac","duct","ductwork","damper","register","air handler","furnace","ac","heat pump","mini split","thermostat"] },
  { category: "Windows & Doors",    keywords: ["window","door","entry","sliding","garage door","casing","jamb","threshold","weatherstrip","screen"] },
  { category: "Finish & Trim",      keywords: ["trim","molding","moulding","baseboard","crown","stain","paint","primer","caulk","sealant","gallon","finish","varnish","lacquer"] },
  { category: "Landscaping",        keywords: ["landscaping","sod","seed","mulch","topsoil","plant","shrub","tree","irrigation","sprinkler","gravel","rock","retaining wall"] },
  { category: "Equipment",          keywords: ["rental","equipment","scaffold","crane","lift","excavator","bobcat","compressor","generator","pump","tool"] },
];

const LABOR_RULES = [
  { category: "Framing Labor",      keywords: ["framing","frame","structural","carpentry","rough"] },
  { category: "Masonry Labor",      keywords: ["masonry","brick","stone","block","mortar","concrete labor","pour","flatwork"] },
  { category: "Roofing Labor",      keywords: ["roofing labor","roof labor","shingle labor","install roof"] },
  { category: "Electrical Labor",   keywords: ["electrical labor","electrical work","electric","wiring labor","panel labor"] },
  { category: "Plumbing Labor",     keywords: ["plumbing labor","plumbing work","pipe labor"] },
  { category: "HVAC Labor",         keywords: ["hvac labor","mechanical labor","duct labor"] },
  { category: "Finish Labor",       keywords: ["finish labor","stain labor","paint labor","trim labor","final stain","final paint"] },
  { category: "Demo Labor",         keywords: ["demo","demolition","tear","haul","removal","haul off"] },
  { category: "Subcontractor",      keywords: ["subcontractor","sub labor","sub contract"] },
];

function guessCategory(name, description, isLabor) {
  const text = `${name} ${description || ""}`.toLowerCase();
  const rules = isLabor ? LABOR_RULES : MATERIAL_RULES;
  for (const rule of rules) {
    if (rule.keywords.some(kw => text.includes(kw))) return rule.category;
  }
  return isLabor ? "General Labor" : "Other";
}

// ─── Sell price calculation ───────────────────────────────────────────────────

function calcSellPrice(m) {
  const base = (Number(m.material_cost) || 0) + (Number(m.labor_cost) || 0) + (Number(m.sub_cost) || 0) || Number(m.unit_cost) || 0;
  if (!base) return 0;
  if (m.markup_type === "margin_percent") {
    const margin = Math.min(Math.max(Number(m.markup_value) || 0, 0), 99.9) / 100;
    return margin > 0 ? base / (1 - margin) : base;
  }
  if (m.markup_type === "overhead_profit") {
    const oh = (Number(m.overhead_percent) || 0) / 100;
    const pr = (Number(m.profit_percent) || 0) / 100;
    return base * (1 + oh + pr);
  }
  return base * (1 + (Number(m.markup_value) || 0) / 100);
}

function totalBaseCost(m) {
  return (Number(m.material_cost) || 0) + (Number(m.labor_cost) || 0) + (Number(m.sub_cost) || 0) || Number(m.unit_cost) || 0;
}

// ─── Merge helper for dedup ───────────────────────────────────────────────────

function mergeMaterial(...mats) {
  const pick = (key, numeric = false) => {
    for (const m of mats) {
      const v = m[key];
      if (numeric ? (v && Number(v) > 0) : (v !== "" && v !== null && v !== undefined)) return v;
    }
    return numeric ? 0 : "";
  };
  const mc = pick("material_cost", true), lc = pick("labor_cost", true), sc = pick("sub_cost", true);
  return {
    name: pick("name"), description: pick("description"), category: pick("category"), unit: pick("unit"),
    material_cost: mc, labor_cost: lc, sub_cost: sc, unit_cost: mc + lc + sc || pick("unit_cost", true),
    markup_type: pick("markup_type"), markup_value: pick("markup_value", true),
    overhead_percent: pick("overhead_percent", true), profit_percent: pick("profit_percent", true),
    supplier: pick("supplier"), sku: pick("sku"), notes: pick("notes"),
    gl_account: pick("gl_account"), tax_category: pick("tax_category"),
    cost_method: pick("cost_method"), standard_cost: pick("standard_cost", true),
    waste_factor: pick("waste_factor", true), lead_time_days: pick("lead_time_days", true),
    min_stock_qty: pick("min_stock_qty", true), reorder_point: pick("reorder_point", true),
    on_hand_qty: pick("on_hand_qty", true),
  };
}

// ─── Empty forms ──────────────────────────────────────────────────────────────

const EMPTY_MATERIAL = {
  name: "", description: "", category: "Other", unit: "EA", is_active: true,
  manufacturer: "", manufacturer_part: "", item_code: "",
  material_cost: "", labor_cost: "", sub_cost: "",
  markup_type: "markup_percent", markup_value: "", overhead_percent: "", profit_percent: "",
  cost_method: "standard", standard_cost: "", average_cost: "", last_purchase_price: "",
  waste_factor: "", lead_time_days: "", min_stock_qty: "", reorder_point: "", on_hand_qty: "",
  location_code: "", weight_per_unit: "", weight_unit: "lb",
  supplier: "", sku: "", vendor_prices: [],
  gl_account: "5100 - Materials & Supplies", tax_category: "taxable", taxable: true,
  cost_center: "", notes: "", price_history: [],
};

const EMPTY_LABOR = {
  ...EMPTY_MATERIAL, category: "General Labor", unit: "HR",
  gl_account: "5200 - Direct Labor", tax_category: "services", taxable: false,
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-slate-800", icon: Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-start gap-3">
      {Icon && <div className="p-2 rounded-lg bg-amber-50"><Icon className="w-4 h-4 text-amber-600" /></div>}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</p>
        <p className={cn("text-xl font-bold mt-0.5", color)}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Vendor price row (inline table in dialog) ────────────────────────────────

function VendorPricesTable({ rows, onChange }) {
  const add = () => onChange([...rows, { id: Math.random().toString(36).slice(2), vendor_name: "", vendor_sku: "", price: "", lead_time_days: "", is_preferred: false, last_updated: new Date().toISOString().slice(0, 10) }]);
  const update = (id, field, val) => onChange(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  const remove = (id) => onChange(rows.filter(r => r.id !== id));
  const setPreferred = (id) => onChange(rows.map(r => ({ ...r, is_preferred: r.id === id })));

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-left text-slate-500 font-semibold">Vendor</th>
                <th className="px-2 py-1.5 text-left text-slate-500 font-semibold">Vendor SKU</th>
                <th className="px-2 py-1.5 text-right text-slate-500 font-semibold">Price</th>
                <th className="px-2 py-1.5 text-center text-slate-500 font-semibold">Lead Days</th>
                <th className="px-2 py-1.5 text-center text-slate-500 font-semibold">Preferred</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={cn("border-t border-slate-100", r.is_preferred && "bg-emerald-50/40")}>
                  <td className="px-2 py-1">
                    <input value={r.vendor_name} onChange={e => update(r.id, "vendor_name", e.target.value)} placeholder="Vendor name" className="w-full text-xs border-0 bg-transparent outline-none focus:bg-amber-50 rounded px-1" />
                  </td>
                  <td className="px-2 py-1">
                    <input value={r.vendor_sku} onChange={e => update(r.id, "vendor_sku", e.target.value)} placeholder="SKU" className="w-full text-xs border-0 bg-transparent outline-none focus:bg-amber-50 rounded px-1" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" value={r.price} onChange={e => update(r.id, "price", e.target.value)} placeholder="0.00" className="w-full text-xs border-0 bg-transparent outline-none focus:bg-amber-50 rounded px-1 text-right" />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input type="number" value={r.lead_time_days} onChange={e => update(r.id, "lead_time_days", e.target.value)} placeholder="—" className="w-12 text-xs border-0 bg-transparent outline-none focus:bg-amber-50 rounded px-1 text-center" />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button type="button" onClick={() => setPreferred(r.id)} className={cn("w-5 h-5 rounded-full border flex items-center justify-center mx-auto", r.is_preferred ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300")}>
                      {r.is_preferred && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    <button type="button" onClick={() => remove(r.id)} className="text-slate-300 hover:text-rose-400"><X className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1 text-xs h-7">
        <Plus className="w-3 h-3" /> Add Vendor
      </Button>
    </div>
  );
}

// ─── Price history panel ──────────────────────────────────────────────────────

function PriceHistoryPanel({ history, currentCost, onAddEntry }) {
  const [newEntry, setNewEntry] = useState({ date: new Date().toISOString().slice(0, 10), price: "", vendor: "", note: "" });

  const handleAdd = () => {
    if (!newEntry.price) return;
    onAddEntry({ ...newEntry, price: parseFloat(newEntry.price), id: Math.random().toString(36).slice(2) });
    setNewEntry(e => ({ ...e, price: "", vendor: "", note: "" }));
  };

  const sorted = [...(history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-3">
      {/* Add entry */}
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-800">Record Price Change</p>
        <div className="grid grid-cols-3 gap-2">
          <div><Label className="text-xs">Date</Label><input type="date" value={newEntry.date} onChange={e => setNewEntry(n => ({ ...n, date: e.target.value }))} className="mt-1 w-full h-8 text-xs border border-slate-200 rounded px-2 outline-none bg-white" /></div>
          <div><Label className="text-xs">Price ($)</Label><input type="number" step="0.01" value={newEntry.price} onChange={e => setNewEntry(n => ({ ...n, price: e.target.value }))} placeholder="0.00" className="mt-1 w-full h-8 text-xs border border-slate-200 rounded px-2 outline-none bg-white" /></div>
          <div><Label className="text-xs">Vendor</Label><input value={newEntry.vendor} onChange={e => setNewEntry(n => ({ ...n, vendor: e.target.value }))} placeholder="Supplier" className="mt-1 w-full h-8 text-xs border border-slate-200 rounded px-2 outline-none bg-white" /></div>
        </div>
        <div className="flex gap-2">
          <input value={newEntry.note} onChange={e => setNewEntry(n => ({ ...n, note: e.target.value }))} placeholder="Note (optional)" className="flex-1 h-8 text-xs border border-slate-200 rounded px-2 outline-none bg-white" />
          <Button type="button" size="sm" onClick={handleAdd} className="bg-amber-500 text-white h-8 px-3 text-xs">Add</Button>
        </div>
      </div>

      {/* History list */}
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-4">No price history recorded yet.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-slate-500 font-semibold">Date</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Price</th>
                <th className="px-3 py-2 text-left text-slate-500 font-semibold">Vendor</th>
                <th className="px-3 py-2 text-left text-slate-500 font-semibold">Note</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">vs Current</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => {
                const diff = currentCost ? ((entry.price - currentCost) / currentCost * 100) : null;
                return (
                  <tr key={entry.id || i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-600">{entry.date}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">${Number(entry.price).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-slate-500">{entry.vendor || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-400">{entry.note || "—"}</td>
                    <td className={cn("px-3 py-1.5 text-right font-medium", diff == null ? "text-slate-400" : diff > 0 ? "text-rose-500" : diff < 0 ? "text-emerald-600" : "text-slate-400")}>
                      {diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MaterialLibrary() {
  const [libType, setLibType] = useState("material");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_MATERIAL);
  const [activeTab, setActiveTab] = useState("general");
  const [historyOpen, setHistoryOpen] = useState(null); // material id

  const isLabor = libType === "labor";
  const CATEGORIES = isLabor ? LABOR_CATEGORIES : MATERIAL_CATEGORIES;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Material.list("-created_date");
    setMaterials(data || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm(isLabor ? { ...EMPTY_LABOR } : { ...EMPTY_MATERIAL });
    setActiveTab("general");
    setDialogOpen(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      ...EMPTY_MATERIAL,
      ...m,
      material_cost: m.material_cost ?? "",
      labor_cost: m.labor_cost ?? "",
      sub_cost: m.sub_cost ?? "",
      markup_value: m.markup_value ?? "",
      overhead_percent: m.overhead_percent ?? "",
      profit_percent: m.profit_percent ?? "",
      waste_factor: m.waste_factor ?? "",
      standard_cost: m.standard_cost ?? "",
      average_cost: m.average_cost ?? "",
      last_purchase_price: m.last_purchase_price ?? "",
      lead_time_days: m.lead_time_days ?? "",
      min_stock_qty: m.min_stock_qty ?? "",
      reorder_point: m.reorder_point ?? "",
      on_hand_qty: m.on_hand_qty ?? "",
      weight_per_unit: m.weight_per_unit ?? "",
      vendor_prices: Array.isArray(m.vendor_prices) ? m.vendor_prices : [],
      price_history: Array.isArray(m.price_history) ? m.price_history : [],
      is_active: m.is_active !== false,
    });
    setActiveTab("general");
    setDialogOpen(true);
  };

  const n = (v) => v !== "" && v !== null && v !== undefined ? Number(v) : 0;

  const handleSave = async (e) => {
    e.preventDefault();
    const mc = n(form.material_cost), lc = n(form.labor_cost), sc = n(form.sub_cost);
    const defaultCat = isLabor ? "General Labor" : "Other";
    const category = form.category === defaultCat
      ? guessCategory(form.name, form.description, isLabor)
      : form.category;

    // Snapshot current price into history if it changed
    const currentBase = mc + lc + sc;
    const prevBase = editing ? totalBaseCost(editing) : 0;
    let priceHistory = Array.isArray(form.price_history) ? [...form.price_history] : [];
    if (editing && currentBase > 0 && currentBase !== prevBase) {
      priceHistory = [...priceHistory, {
        id: Math.random().toString(36).slice(2),
        date: new Date().toISOString().slice(0, 10),
        price: currentBase,
        vendor: form.supplier || "",
        note: "Updated via material library",
      }];
    } else if (!editing && currentBase > 0) {
      priceHistory = [{
        id: Math.random().toString(36).slice(2),
        date: new Date().toISOString().slice(0, 10),
        price: currentBase,
        vendor: form.supplier || "",
        note: "Initial cost",
      }];
    }

    const gl = form.gl_account === "Custom…" ? (form.gl_account_custom || "") : form.gl_account;

    const data = {
      name: form.name,
      description: form.description,
      category,
      unit: (form.unit || "EA").toUpperCase(),
      is_active: form.is_active !== false,
      item_code: form.item_code,
      manufacturer: form.manufacturer,
      manufacturer_part: form.manufacturer_part,
      material_cost: mc,
      labor_cost: lc,
      sub_cost: sc,
      unit_cost: mc + lc + sc,
      markup_type: form.markup_type,
      markup_value: n(form.markup_value),
      overhead_percent: n(form.overhead_percent),
      profit_percent: n(form.profit_percent),
      cost_method: form.cost_method || "standard",
      standard_cost: n(form.standard_cost),
      average_cost: n(form.average_cost),
      last_purchase_price: n(form.last_purchase_price),
      waste_factor: n(form.waste_factor),
      lead_time_days: n(form.lead_time_days),
      min_stock_qty: n(form.min_stock_qty),
      reorder_point: n(form.reorder_point),
      on_hand_qty: n(form.on_hand_qty),
      location_code: form.location_code,
      weight_per_unit: n(form.weight_per_unit),
      weight_unit: form.weight_unit || "lb",
      supplier: form.supplier,
      sku: form.sku,
      vendor_prices: form.vendor_prices,
      gl_account: gl,
      tax_category: form.tax_category,
      taxable: form.taxable !== false,
      cost_center: form.cost_center,
      notes: form.notes,
      price_history: priceHistory,
    };

    if (editing) {
      await base44.entities.Material.update(editing.id, data);
    } else {
      const existing = materials.find(m => m.name?.toLowerCase() === form.name?.trim().toLowerCase());
      if (existing) {
        await base44.entities.Material.update(existing.id, mergeMaterial(existing, data));
      } else {
        await base44.entities.Material.create(data);
      }
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this item?")) { await base44.entities.Material.delete(id); load(); }
  };

  const handleToggleActive = async (m) => {
    await base44.entities.Material.update(m.id, { is_active: !m.is_active });
    setMaterials(prev => prev.map(x => x.id === m.id ? { ...x, is_active: !m.is_active } : x));
  };

  const handleAutoCategorize = async () => {
    const scoped = materials.filter(m => isLabor ? LABOR_CATEGORY_SET.has(m.category) : !LABOR_CATEGORY_SET.has(m.category));
    const toUpdate = scoped.map(m => ({ ...m, category: guessCategory(m.name, m.description, isLabor) })).filter((m, i) => m.category !== scoped[i].category);
    if (!toUpdate.length) { alert("All items already have the best category."); return; }
    if (!confirm(`Re-categorize ${toUpdate.length} item(s)?`)) return;
    for (const m of toUpdate) await base44.entities.Material.update(m.id, { category: m.category });
    load();
  };

  // ── Dedup ──────────────────────────────────────────────────────────────────
  const dupCount = useMemo(() => {
    const scoped = materials.filter(m => isLabor ? LABOR_CATEGORY_SET.has(m.category) : !LABOR_CATEGORY_SET.has(m.category));
    const groups = {};
    for (const m of scoped) { const k = (m.name || "").trim().toLowerCase(); if (k) groups[k] = (groups[k] || 0) + 1; }
    return Object.values(groups).filter(c => c > 1).length;
  }, [materials, isLabor]);

  const handleDedup = async () => {
    if (!confirm(`Found ${dupCount} duplicate name(s). Merge them?`)) return;
    const scoped = materials.filter(m => isLabor ? LABOR_CATEGORY_SET.has(m.category) : !LABOR_CATEGORY_SET.has(m.category));
    const groups = {};
    for (const m of scoped) { const k = (m.name || "").trim().toLowerCase(); if (k) (groups[k] = groups[k] || []).push(m); }
    const score = (m) => ((totalBaseCost(m) > 0 ? 100 : 0) + [m.description, m.unit, m.supplier, m.sku, m.gl_account].filter(Boolean).length);
    let cleaned = 0;
    for (const group of Object.values(groups)) {
      if (group.length < 2) continue;
      group.sort((a, b) => score(b) - score(a));
      const [keep, ...dupes] = group;
      await base44.entities.Material.update(keep.id, mergeMaterial(keep, ...dupes));
      for (const d of dupes) await base44.entities.Material.delete(d.id);
      cleaned += dupes.length;
    }
    alert(`Removed ${cleaned} duplicate(s).`);
    load();
  };

  // ── Filtering ──────────────────────────────────────────────────────────────
  const scoped = materials.filter(m => isLabor ? LABOR_CATEGORY_SET.has(m.category) : !LABOR_CATEGORY_SET.has(m.category));
  const filtered = scoped.filter(m => {
    if (statusFilter === "active" && m.is_active === false) return false;
    if (statusFilter === "inactive" && m.is_active !== false) return false;
    if (statusFilter === "low_stock") {
      const oh = Number(m.on_hand_qty) || 0;
      const rp = Number(m.reorder_point) || Number(m.min_stock_qty) || 0;
      if (!rp || oh > rp) return false;
    }
    const q = search.toLowerCase();
    if (q && !(m.name || "").toLowerCase().includes(q) && !(m.supplier || "").toLowerCase().includes(q) && !(m.sku || "").toLowerCase().includes(q) && !(m.item_code || "").toLowerCase().includes(q)) return false;
    if (categoryFilter !== "All" && m.category !== categoryFilter) return false;
    return true;
  });

  // ── KPI metrics ────────────────────────────────────────────────────────────
  const totalOnHandValue = scoped.reduce((s, m) => s + totalBaseCost(m) * (Number(m.on_hand_qty) || 0), 0);
  const lowStockCount = scoped.filter(m => {
    const oh = Number(m.on_hand_qty) || 0;
    const rp = Number(m.reorder_point) || Number(m.min_stock_qty) || 0;
    return rp > 0 && oh <= rp;
  }).length;
  const inactiveCount = scoped.filter(m => m.is_active === false).length;

  const historyMaterial = materials.find(m => m.id === historyOpen);

  const DIALOG_TABS = [
    { id: "general", label: "General" },
    { id: "costing", label: "Costing" },
    { id: "inventory", label: "Inventory" },
    { id: "vendors", label: "Vendors" },
    { id: "accounting", label: "Accounting" },
    { id: "history", label: "Price History" },
  ];

  const ff = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div className="space-y-5">
      {/* Library switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[{ key: "material", label: "Material Library" }, { key: "labor", label: "Labor Library" }].map(t => (
          <button key={t.key} onClick={() => { setLibType(t.key); setCategoryFilter("All"); setSearch(""); }}
            className={cn("text-sm px-4 py-2 rounded-lg font-medium transition-all", libType === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Items" value={scoped.filter(m => m.is_active !== false).length} sub={`${inactiveCount} inactive`} icon={Package} />
        <StatCard label="Inventory Value" value={`$${totalOnHandValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="on-hand × cost" icon={DollarSign} />
        <StatCard label="Low / Out of Stock" value={lowStockCount} color={lowStockCount > 0 ? "text-rose-600" : "text-emerald-600"} sub="at or below reorder point" icon={AlertTriangle} />
        <StatCard label="Categories" value={[...new Set(scoped.map(m => m.category))].length} sub="in use" icon={BarChart3} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{isLabor ? "Labor Library" : "Material Library"}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoCategorize} className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50">
            <Sparkles className="w-4 h-4" /> Auto-categorize
          </Button>
          <Button variant="outline" size="sm" onClick={handleDedup} className="gap-1.5 relative text-slate-600">
            <Sparkles className="w-4 h-4" /> Clean Duplicates
            {dupCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{dupCount}</span>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-1">
            <Plus className="w-4 h-4" /> Add {isLabor ? "Labor Rate" : "Material"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, vendor…" className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex flex-wrap gap-1">
          {["active", "inactive", "low_stock"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? "active" : s)}
              className={cn("text-xs px-2.5 py-1 rounded-full border transition-all capitalize", statusFilter === s ? "bg-slate-700 text-white border-slate-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400")}>
              {s === "low_stock" ? "Low Stock" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {["All", ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={cn("text-xs px-2.5 py-1 rounded-full border transition-all", categoryFilter === cat ? "bg-amber-500 text-white border-amber-500" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300")}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No items found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Vendor / SKU</th>
                  <th className="px-4 py-3 text-center">Unit</th>
                  <th className="px-4 py-3 text-right">Base Cost</th>
                  <th className="px-4 py-3 text-right">Sell Price</th>
                  <th className="px-4 py-3 text-center">On Hand</th>
                  <th className="px-4 py-3 text-left">GL Account</th>
                  <th className="px-4 py-3 text-center">Tax</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const base = totalBaseCost(m);
                  const sell = calcSellPrice(m);
                  const oh = Number(m.on_hand_qty) || 0;
                  const rp = Number(m.reorder_point) || Number(m.min_stock_qty) || 0;
                  const isLow = rp > 0 && oh <= rp;
                  const preferred = (m.vendor_prices || []).find(v => v.is_preferred);
                  return (
                    <tr key={m.id} className={cn("border-b border-slate-100 hover:bg-amber-50/20 transition-colors", m.is_active === false && "opacity-50")}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{m.name}</p>
                        {m.item_code && <p className="text-xs text-slate-400 font-mono">{m.item_code}</p>}
                        {m.description && <p className="text-xs text-slate-400 truncate max-w-[200px]">{m.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{m.category}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {preferred ? (
                          <div><p className="font-medium text-slate-700">{preferred.vendor_name}</p><p className="text-slate-400">{preferred.vendor_sku || m.sku || "—"}</p></div>
                        ) : m.supplier ? (
                          <div><p>{m.supplier}</p>{m.sku && <p className="text-slate-400">{m.sku}</p>}</div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-slate-600">{(m.unit || "EA").toUpperCase()}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold text-slate-800">${base.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {m.waste_factor > 0 && <p className="text-xs text-slate-400">+{m.waste_factor}% waste</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold text-emerald-700">${sell.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {base > 0 && <p className="text-xs text-slate-400">{((sell - base) / base * 100).toFixed(0)}% margin</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.on_hand_qty != null && m.on_hand_qty !== "" ? (
                          <span className={cn("text-sm font-semibold", isLow ? "text-rose-600" : "text-slate-700")}>
                            {oh}
                            {isLow && <AlertTriangle className="w-3 h-3 inline ml-0.5 text-rose-500" />}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                        {rp > 0 && <p className="text-xs text-slate-400">min {rp}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{m.gl_account ? m.gl_account.split(" - ")[0] : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full", m.taxable !== false ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500")}>
                          {m.taxable !== false ? "Tax" : "Exempt"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full", m.is_active !== false ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {m.is_active !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-0.5">
                          <button onClick={() => openEdit(m)} title="Edit" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setHistoryOpen(m.id)} title="Price history" className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600"><History className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleToggleActive(m)} title={m.is_active !== false ? "Deactivate" : "Activate"} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Archive className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(m.id)} title="Delete" className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Price history modal */}
      <Dialog open={!!historyOpen} onOpenChange={() => setHistoryOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              Price History — {historyMaterial?.name}
            </DialogTitle>
          </DialogHeader>
          {historyMaterial && (
            <PriceHistoryPanel
              history={historyMaterial.price_history || []}
              currentCost={totalBaseCost(historyMaterial)}
              onAddEntry={async (entry) => {
                const updated = [...(historyMaterial.price_history || []), entry];
                await base44.entities.Material.update(historyMaterial.id, { price_history: updated });
                load();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${isLabor ? "Labor Rate" : "Material"}` : `Add ${isLabor ? "Labor Rate" : "Material"}`}</DialogTitle>
          </DialogHeader>

          {/* Dialog tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 mb-4">
            {DIALOG_TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                className={cn("flex-1 text-xs py-1.5 rounded-md font-medium transition-all", activeTab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSave} className="space-y-4">

            {/* GENERAL TAB */}
            {activeTab === "general" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Name *</Label>
                    <Input value={form.name} onChange={e => ff("name", e.target.value)} required className="mt-1 h-9 text-sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <button type="button" onClick={() => ff("is_active", !form.is_active)}
                      className={cn("text-xs px-3 py-1.5 rounded-full border font-medium transition-all", form.is_active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                      {form.is_active ? "Active" : "Inactive"}
                    </button>
                  </div>
                </div>
                <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => ff("description", e.target.value)} className="mt-1 text-sm" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <select value={form.category} onChange={e => ff("category", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Unit of Measure</Label>
                    <select value={form.unit} onChange={e => ff("unit", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">Item / Part Code</Label><Input value={form.item_code || ""} onChange={e => ff("item_code", e.target.value)} className="mt-1 h-9 text-sm" placeholder="INV-001" /></div>
                  <div><Label className="text-xs">Manufacturer</Label><Input value={form.manufacturer || ""} onChange={e => ff("manufacturer", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                  <div><Label className="text-xs">Mfr Part #</Label><Input value={form.manufacturer_part || ""} onChange={e => ff("manufacturer_part", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Primary Supplier</Label><Input value={form.supplier || ""} onChange={e => ff("supplier", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                  <div><Label className="text-xs">Primary SKU</Label><Input value={form.sku || ""} onChange={e => ff("sku", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                </div>
                <div><Label className="text-xs">Notes</Label><Textarea value={form.notes || ""} onChange={e => ff("notes", e.target.value)} className="mt-1 text-sm" rows={2} /></div>
              </div>
            )}

            {/* COSTING TAB */}
            {activeTab === "costing" && (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Base Costs (per unit)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">Material ($)</Label><Input type="number" step="0.01" value={form.material_cost} onChange={e => ff("material_cost", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                    <div><Label className="text-xs">Labor ($)</Label><Input type="number" step="0.01" value={form.labor_cost} onChange={e => ff("labor_cost", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                    <div><Label className="text-xs">Subcontractor ($)</Label><Input type="number" step="0.01" value={form.sub_cost} onChange={e => ff("sub_cost", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-200">
                    <span>Total base cost</span>
                    <span className="font-bold text-slate-800">${(n(form.material_cost) + n(form.labor_cost) + n(form.sub_cost)).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Markup / Sell Price</p>
                  <div>
                    <Label className="text-xs">Markup Method</Label>
                    <select value={form.markup_type} onChange={e => ff("markup_type", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                      {MARKUP_TYPES.map(mt => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
                    </select>
                  </div>
                  {form.markup_type !== "overhead_profit" ? (
                    <div>
                      <Label className="text-xs">{form.markup_type === "margin_percent" ? "Margin %" : "Markup %"}</Label>
                      <Input type="number" step="0.1" value={form.markup_value} onChange={e => ff("markup_value", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Overhead %</Label><Input type="number" step="0.1" value={form.overhead_percent} onChange={e => ff("overhead_percent", e.target.value)} className="mt-1 h-8 text-sm" /></div>
                      <div><Label className="text-xs">Profit %</Label><Input type="number" step="0.1" value={form.profit_percent} onChange={e => ff("profit_percent", e.target.value)} className="mt-1 h-8 text-sm" /></div>
                    </div>
                  )}
                  {(() => {
                    const base = n(form.material_cost) + n(form.labor_cost) + n(form.sub_cost);
                    const sell = base > 0 ? calcSellPrice(form) : 0;
                    return base > 0 ? (
                      <div className="flex justify-between text-xs pt-1 border-t border-slate-200">
                        <span className="text-slate-500">Calculated sell price</span>
                        <span className="font-bold text-emerald-700">${sell.toFixed(2)}</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Advanced Costing</p>
                  <div>
                    <Label className="text-xs">Cost Method</Label>
                    <select value={form.cost_method || "standard"} onChange={e => ff("cost_method", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                      {COST_METHODS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">Standard Cost ($)</Label><Input type="number" step="0.01" value={form.standard_cost} onChange={e => ff("standard_cost", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                    <div><Label className="text-xs">Avg Cost ($)</Label><Input type="number" step="0.01" value={form.average_cost} onChange={e => ff("average_cost", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                    <div><Label className="text-xs">Last Purchase ($)</Label><Input type="number" step="0.01" value={form.last_purchase_price} onChange={e => ff("last_purchase_price", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Waste Factor %</Label><Input type="number" step="0.1" value={form.waste_factor} onChange={e => ff("waste_factor", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                    <div className="flex items-end pb-1"><p className="text-xs text-slate-500">{n(form.waste_factor) > 0 ? `Adds ${n(form.waste_factor)}% to qty on estimates` : "No waste added"}</p></div>
                  </div>
                </div>
              </div>
            )}

            {/* INVENTORY TAB */}
            {activeTab === "inventory" && (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Stock Levels</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">On Hand Qty</Label><Input type="number" step="0.01" value={form.on_hand_qty} onChange={e => ff("on_hand_qty", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                    <div><Label className="text-xs">Min Stock</Label><Input type="number" step="0.01" value={form.min_stock_qty} onChange={e => ff("min_stock_qty", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                    <div><Label className="text-xs">Reorder Point</Label><Input type="number" step="0.01" value={form.reorder_point} onChange={e => ff("reorder_point", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                  </div>
                  {(() => {
                    const oh = n(form.on_hand_qty), rp = n(form.reorder_point) || n(form.min_stock_qty);
                    if (!rp) return null;
                    return (
                      <div className={cn("text-xs rounded px-2 py-1 font-medium", oh <= rp ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                        {oh <= rp ? `⚠ Low stock — ${oh} on hand, reorder at ${rp}` : `✓ Stock OK — ${oh} on hand (threshold ${rp})`}
                      </div>
                    );
                  })()}
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Procurement</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Lead Time (days)</Label><Input type="number" value={form.lead_time_days} onChange={e => ff("lead_time_days", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                    <div><Label className="text-xs">Warehouse / Bin Location</Label><Input value={form.location_code || ""} onChange={e => ff("location_code", e.target.value)} className="mt-1 h-8 text-sm" placeholder="e.g. BIN-A3" /></div>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Weight / Dimensions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Weight per Unit</Label><Input type="number" step="0.01" value={form.weight_per_unit} onChange={e => ff("weight_per_unit", e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                    <div>
                      <Label className="text-xs">Weight Unit</Label>
                      <select value={form.weight_unit || "lb"} onChange={e => ff("weight_unit", e.target.value)} className="mt-1 w-full h-8 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                        {WEIGHT_UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VENDORS TAB */}
            {activeTab === "vendors" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Add multiple vendors with their pricing. Mark one as Preferred to use as the default.</p>
                <VendorPricesTable
                  rows={form.vendor_prices || []}
                  onChange={rows => ff("vendor_prices", rows)}
                />
                {(form.vendor_prices || []).length > 0 && (() => {
                  const preferred = form.vendor_prices.find(v => v.is_preferred);
                  const cheapest = [...form.vendor_prices].sort((a, b) => n(a.price) - n(b.price))[0];
                  return (
                    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50 space-y-1 text-xs">
                      {preferred && <p className="text-slate-600">Preferred: <strong>{preferred.vendor_name}</strong> @ ${n(preferred.price).toFixed(2)}</p>}
                      {cheapest && <p className="text-slate-500">Lowest price: <strong>{cheapest.vendor_name}</strong> @ ${n(cheapest.price).toFixed(2)}</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ACCOUNTING TAB */}
            {activeTab === "accounting" && (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">General Ledger</p>
                  <div>
                    <Label className="text-xs">GL Account</Label>
                    <select value={GL_ACCOUNTS.includes(form.gl_account) ? form.gl_account : "Custom…"} onChange={e => { if (e.target.value !== "Custom…") ff("gl_account", e.target.value); else ff("gl_account", "Custom…"); }} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                      {GL_ACCOUNTS.map(a => <option key={a}>{a}</option>)}
                    </select>
                    {(!GL_ACCOUNTS.includes(form.gl_account) || form.gl_account === "Custom…") && (
                      <Input value={form.gl_account === "Custom…" ? "" : form.gl_account} onChange={e => ff("gl_account", e.target.value)} className="mt-2 h-9 text-sm" placeholder="e.g. 5150 - Direct Materials" />
                    )}
                  </div>
                  <div><Label className="text-xs">Cost Center</Label><Input value={form.cost_center || ""} onChange={e => ff("cost_center", e.target.value)} className="mt-1 h-9 text-sm" placeholder="e.g. Production, Admin" /></div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tax</p>
                  <div>
                    <Label className="text-xs">Tax Category</Label>
                    <select value={form.tax_category || "taxable"} onChange={e => { ff("tax_category", e.target.value); ff("taxable", e.target.value === "taxable" || e.target.value === "resale"); }} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                      {TAX_CATEGORIES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => ff("taxable", !form.taxable)} className={cn("w-9 h-5 rounded-full transition-colors relative", form.taxable !== false ? "bg-amber-500" : "bg-slate-200")}>
                      <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all", form.taxable !== false ? "left-4" : "left-0.5")} />
                    </button>
                    <Label className="text-xs cursor-pointer">{form.taxable !== false ? "Taxable" : "Tax Exempt"}</Label>
                  </div>
                </div>
              </div>
            )}

            {/* PRICE HISTORY TAB */}
            {activeTab === "history" && (
              <div>
                {editing ? (
                  <PriceHistoryPanel
                    history={form.price_history || []}
                    currentCost={n(form.material_cost) + n(form.labor_cost) + n(form.sub_cost)}
                    onAddEntry={entry => ff("price_history", [...(form.price_history || []), entry])}
                  />
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-6">Save the item first to record price history.</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                {editing ? "Update" : "Add"} {isLabor ? "Labor Rate" : "Material"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <MaterialImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { setImportOpen(false); load(); }} />
    </div>
  );
}
