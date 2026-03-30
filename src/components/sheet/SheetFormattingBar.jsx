import { useState, useRef, useEffect } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FILL_COLORS = [
  "#ffffff", "#f1f5f9", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3",
  "#fee2e2", "#ede9fe", "#ffedd5", "#f0fdf4", "#e0f2fe", "#fdf4ff",
  "#475569", "#b45309", "#15803d", "#1d4ed8", "#be185d", "#dc2626",
  "#7c3aed", "#c2410c", "#065f46", "#1e40af", "#9d174d", "#991b1b",
];

const TEXT_COLORS = [
  "#111827", "#374151", "#6b7280", "#1d4ed8", "#15803d", "#dc2626",
  "#b45309", "#7c3aed", "#be185d", "#0891b2", "#ffffff", "#92400e",
];

function ColorPicker({ value, onChange, colors, label }) {
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
        className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded hover:bg-slate-100 transition-colors group"
        title={label}
      >
        <span className="text-xs font-bold text-slate-700 leading-none" style={{ color: label === "Text" ? value : undefined }}>A</span>
        <span className="w-4 h-1.5 rounded-sm border border-slate-300" style={{ backgroundColor: value }} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-[168px]">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">{label} Color</div>
          <div className="grid grid-cols-6 gap-1">
            {colors.map(c => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false); }}
                className={cn(
                  "w-6 h-6 rounded border-2 transition-transform hover:scale-110",
                  value === c ? "border-amber-500 scale-110" : "border-transparent hover:border-slate-300"
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <button
            className="mt-2 w-full text-xs text-slate-500 hover:text-slate-700 text-left px-1 hover:bg-slate-50 rounded py-1"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            Clear / Default
          </button>
        </div>
      )}
    </div>
  );
}

export default function SheetFormattingBar({ selectedRowIds, selectedColKeys, selectedCellCount = 0, rows, onApplyRowFormat, onApplyCellFormat, onClearSelection }) {
  const count = selectedRowIds.size + selectedColKeys.size + selectedCellCount;
  if (count === 0) return null;

  // Get current style from first selected row
  const firstRowId = [...selectedRowIds][0];
  const firstRow = rows.find(r => r.id === firstRowId);
  const fmt = firstRow?._fmt || {};

  const applyFmt = (key, value) => {
    if (selectedRowIds.size > 0) onApplyRowFormat([...selectedRowIds], key, value);
    if ((selectedColKeys.size > 0 || selectedCellCount > 0) && onApplyCellFormat) onApplyCellFormat(key, value);
  };

  const toggleBold = () => applyFmt("bold", !fmt.bold);
  const toggleItalic = () => applyFmt("italic", !fmt.italic);
  const toggleUnderline = () => applyFmt("underline", !fmt.underline);
  const setAlign = (v) => applyFmt("align", fmt.align === v ? null : v);

  const label = selectedCellCount > 0 && selectedRowIds.size === 0 && selectedColKeys.size === 0
    ? `${selectedCellCount} cell${selectedCellCount > 1 ? "s" : ""} selected`
    : selectedRowIds.size > 0 && selectedColKeys.size === 0 && selectedCellCount === 0
    ? `${selectedRowIds.size} row${selectedRowIds.size > 1 ? "s" : ""} selected`
    : selectedColKeys.size > 0 && selectedRowIds.size === 0 && selectedCellCount === 0
    ? `${selectedColKeys.size} column${selectedColKeys.size > 1 ? "s" : ""} selected`
    : `${selectedRowIds.size} rows, ${selectedColKeys.size} cols${selectedCellCount > 0 ? `, ${selectedCellCount} cells` : ""} selected`;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm flex-wrap">
      <span className="text-xs text-slate-500 font-medium mr-1">{label}</span>
      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* Bold */}
      <button
        onClick={toggleBold}
        className={cn("p-1.5 rounded hover:bg-slate-100 transition-colors", fmt.bold && "bg-amber-100 text-amber-700")}
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>

      {/* Italic */}
      <button
        onClick={toggleItalic}
        className={cn("p-1.5 rounded hover:bg-slate-100 transition-colors", fmt.italic && "bg-amber-100 text-amber-700")}
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      {/* Underline */}
      <button
        onClick={toggleUnderline}
        className={cn("p-1.5 rounded hover:bg-slate-100 transition-colors", fmt.underline && "bg-amber-100 text-amber-700")}
        title="Underline"
      >
        <Underline className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* Alignment */}
      <button
        onClick={() => setAlign("left")}
        className={cn("p-1.5 rounded hover:bg-slate-100 transition-colors", (fmt.align === "left" || !fmt.align) && "bg-amber-100 text-amber-700")}
        title="Align Left"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setAlign("center")}
        className={cn("p-1.5 rounded hover:bg-slate-100 transition-colors", fmt.align === "center" && "bg-amber-100 text-amber-700")}
        title="Align Center"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setAlign("right")}
        className={cn("p-1.5 rounded hover:bg-slate-100 transition-colors", fmt.align === "right" && "bg-amber-100 text-amber-700")}
        title="Align Right"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* Fill Color */}
      <ColorPicker
        value={fmt.bg || "#ffffff"}
        onChange={(v) => applyFmt("bg", v)}
        colors={FILL_COLORS}
        label="Fill"
      />

      {/* Text Color */}
      <ColorPicker
        value={fmt.color || "#374151"}
        onChange={(v) => applyFmt("color", v)}
        colors={TEXT_COLORS}
        label="Text"
      />

      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* Clear formatting */}
      <button
        onClick={() => {
          if (selectedRowIds.size > 0) [...selectedRowIds].forEach(id => onApplyRowFormat([id], "_clear", true));
          if ((selectedColKeys.size > 0 || selectedCellCount > 0) && onApplyCellFormat) onApplyCellFormat("_clear", true);
        }}
        className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
        title="Clear formatting"
      >
        Clear
      </button>

      {/* Deselect */}
      <button
        onClick={onClearSelection}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 ml-1"
        title="Clear selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}