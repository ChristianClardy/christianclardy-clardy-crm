import { useState, useRef, useEffect } from "react";
import { Type, ChevronDown, Palette, Baseline } from "lucide-react";
import { cn } from "@/lib/utils";

const FONTS = [
  { label: "Default (System)", value: "system-ui, sans-serif" },
  { label: "Georgia (Serif)", value: "'Georgia', serif" },
  { label: "Arial", value: "'Arial', sans-serif" },
  { label: "Helvetica", value: "'Helvetica Neue', sans-serif" },
  { label: "Courier New (Mono)", value: "'Courier New', monospace" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana", value: "'Verdana', sans-serif" },
  { label: "Tahoma", value: "'Tahoma', sans-serif" },
];

const FONT_SIZES = ["11", "12", "13", "14", "15", "16", "18", "20", "22"];

const ROW_HEIGHTS = [
  { label: "Compact", value: 24 },
  { label: "Default", value: 32 },
  { label: "Comfortable", value: 42 },
  { label: "Spacious", value: 56 },
];

const HEADER_COLORS = [
  { label: "Charcoal", bg: "#3d3530", text: "#ffffff" },
  { label: "Slate", bg: "#475569", text: "#ffffff" },
  { label: "Navy", bg: "#1e3a5f", text: "#ffffff" },
  { label: "Forest", bg: "#1a4d2e", text: "#ffffff" },
  { label: "Burgundy", bg: "#6b1f1f", text: "#ffffff" },
  { label: "Purple", bg: "#4c1d95", text: "#ffffff" },
  { label: "Amber", bg: "#b5965a", text: "#ffffff" },
  { label: "Light", bg: "#f1f5f9", text: "#334155" },
];

const ROW_STRIPE_COLORS = [
  { label: "None", even: "#ffffff", odd: "#ffffff" },
  { label: "Subtle Gray", even: "#ffffff", odd: "#f8fafc" },
  { label: "Warm Cream", even: "#ffffff", odd: "#fdf8f3" },
  { label: "Light Blue", even: "#ffffff", odd: "#f0f7ff" },
  { label: "Light Green", even: "#ffffff", odd: "#f0fdf4" },
  { label: "Light Amber", even: "#ffffff", odd: "#fffbeb" },
];

const CELL_TEXT_COLORS = [
  { label: "Default", value: "#374151" },
  { label: "Dark", value: "#111827" },
  { label: "Slate", value: "#475569" },
  { label: "Brown", value: "#78350f" },
  { label: "Navy", value: "#1e3a5f" },
  { label: "Forest", value: "#14532d" },
];

export const DEFAULT_SHEET_STYLE = {
  fontFamily: "system-ui, sans-serif",
  fontSize: "13",
  rowHeight: 32,
  headerBg: "#3d3530",
  headerText: "#ffffff",
  stripeEven: "#ffffff",
  stripeOdd: "#f8fafc",
  cellTextColor: "#374151",
};

function Dropdown({ label, icon: IconComp, children, active }) {
  const Icon = IconComp;
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
          active
            ? "bg-amber-50 border-amber-300 text-amber-700"
            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
        )}
      >
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[180px] py-1"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ColorSwatch({ color, label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-slate-50 text-left transition-colors",
        selected && "bg-amber-50 font-semibold text-amber-700"
      )}
    >
      <span className="w-4 h-4 rounded border border-slate-200 flex-shrink-0" style={{ backgroundColor: color }} />
      {label}
    </button>
  );
}

export default function SheetStyleToolbar({ style, onChange }) {
  const s = { ...DEFAULT_SHEET_STYLE, ...style };

  const update = (key, value) => onChange({ ...s, [key]: value });

  const currentFont = FONTS.find(f => f.value === s.fontFamily)?.label || "Font";
  const currentHeader = HEADER_COLORS.find(h => h.bg === s.headerBg)?.label || "Header Color";
  const currentStripe = ROW_STRIPE_COLORS.find(r => r.even === s.stripeEven && r.odd === s.stripeOdd)?.label || "Row Color";
  const currentTextColor = CELL_TEXT_COLORS.find(c => c.value === s.cellTextColor)?.label || "Text Color";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Font Family */}
      <Dropdown label={currentFont} icon={Type} active={s.fontFamily !== DEFAULT_SHEET_STYLE.fontFamily}>
        {FONTS.map(f => (
          <button
            key={f.value}
            onClick={() => update("fontFamily", f.value)}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition-colors",
              s.fontFamily === f.value && "font-semibold text-amber-700 bg-amber-50"
            )}
            style={{ fontFamily: f.value }}
          >
            {f.label}
          </button>
        ))}
      </Dropdown>

      {/* Font Size */}
      <Dropdown label={`${s.fontSize}px`} icon={null} active={s.fontSize !== DEFAULT_SHEET_STYLE.fontSize}>
        <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">Font Size</div>
        {FONT_SIZES.map(sz => (
          <button
            key={sz}
            onClick={() => update("fontSize", sz)}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition-colors",
              s.fontSize === sz && "font-semibold text-amber-700 bg-amber-50"
            )}
          >
            {sz}px
          </button>
        ))}
      </Dropdown>

      {/* Row Height */}
      <Dropdown label="Row Height" active={s.rowHeight !== DEFAULT_SHEET_STYLE.rowHeight}>
        {ROW_HEIGHTS.map(rh => (
          <button
            key={rh.value}
            onClick={() => update("rowHeight", rh.value)}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition-colors",
              s.rowHeight === rh.value && "font-semibold text-amber-700 bg-amber-50"
            )}
          >
            {rh.label} ({rh.value}px)
          </button>
        ))}
      </Dropdown>

      <div className="w-px h-5 bg-slate-200" />

      {/* Header Color */}
      <Dropdown label={currentHeader} icon={Palette} active={s.headerBg !== DEFAULT_SHEET_STYLE.headerBg}>
        <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">Header Color</div>
        {HEADER_COLORS.map(h => (
          <ColorSwatch
            key={h.bg}
            color={h.bg}
            label={h.label}
            selected={s.headerBg === h.bg}
            onClick={() => onChange({ ...s, headerBg: h.bg, headerText: h.text })}
          />
        ))}
      </Dropdown>

      {/* Row Stripe Color */}
      <Dropdown label={currentStripe} icon={null} active={s.stripeOdd !== DEFAULT_SHEET_STYLE.stripeOdd}>
        <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">Row Stripe</div>
        {ROW_STRIPE_COLORS.map(r => (
          <button
            key={r.label}
            onClick={() => onChange({ ...s, stripeEven: r.even, stripeOdd: r.odd })}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-slate-50 text-left transition-colors",
              s.stripeOdd === r.odd && "font-semibold text-amber-700 bg-amber-50"
            )}
          >
            <span className="flex gap-0.5">
              <span className="w-3 h-4 rounded-sm border border-slate-200" style={{ backgroundColor: r.even }} />
              <span className="w-3 h-4 rounded-sm border border-slate-200" style={{ backgroundColor: r.odd }} />
            </span>
            {r.label}
          </button>
        ))}
      </Dropdown>

      {/* Cell Text Color */}
      <Dropdown label={currentTextColor} icon={Baseline} active={s.cellTextColor !== DEFAULT_SHEET_STYLE.cellTextColor}>
        <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">Cell Text Color</div>
        {CELL_TEXT_COLORS.map(c => (
          <ColorSwatch
            key={c.value}
            color={c.value}
            label={c.label}
            selected={s.cellTextColor === c.value}
            onClick={() => update("cellTextColor", c.value)}
          />
        ))}
      </Dropdown>

      {/* Reset */}
      <button
        onClick={() => onChange(DEFAULT_SHEET_STYLE)}
        className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
      >
        Reset
      </button>
    </div>
  );
}