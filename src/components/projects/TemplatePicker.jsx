import { useState } from "react";
import { FileText, Check, ChevronDown, ChevronUp, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { STOCK_SCHEDULE_TEMPLATES } from "@/lib/stockScheduleTemplates";

/**
 * TemplatePicker
 * Props:
 *   savedTemplates: array of ProjectSheetTemplate records
 *   onSelect: ({ type: 'saved'|'stock', template }) => void
 *     - type 'saved': template = { id, name, rows }
 *     - type 'stock': template = { label, rows } (one of the built-in schedules)
 *   selectedLabel: string (display label of current selection)
 *   onClear: () => void
 */
export default function TemplatePicker({ savedTemplates, onSelect, selectedLabel, onClear }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("saved"); // 'saved' | 'stock'

  const handleSelectSaved = (t) => {
    onSelect({ type: "saved", template: t });
    setOpen(false);
  };

  const handleSelectStock = (t) => {
    onSelect({ type: "stock", template: { label: t.label, rows: t.rows } });
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full mt-1.5 flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors",
          selectedLabel
            ? "border-amber-400 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedLabel ? (
            <>
              <Check className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">{selectedLabel}</span>
            </>
          ) : (
            "Select a template (optional)"
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {selectedLabel && (
            <span
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-slate-400 hover:text-rose-500 transition-colors mr-1"
            >
              ✕
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setTab("saved")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                tab === "saved" ? "border-b-2 border-amber-500 text-amber-700 bg-amber-50" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Saved Templates
            </button>
            <button
              type="button"
              onClick={() => setTab("stock")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                tab === "stock" ? "border-b-2 border-indigo-500 text-indigo-700 bg-indigo-50" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <LayoutTemplate className="w-3.5 h-3.5" /> Stock Templates
            </button>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto p-2">
            {tab === "saved" ? (
              savedTemplates.length > 0 ? (
                <div className="space-y-1">
                  {savedTemplates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectSaved(t)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{t.name}</p>
                        {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">{t.rows?.length || 0} items</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 text-sm py-6">No saved templates yet. Create some in Workspace Items.</p>
              )
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {STOCK_SCHEDULE_TEMPLATES.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => handleSelectStock(t)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <span className="text-lg shrink-0">{t.emoji}</span>
                    <span className="text-xs font-medium text-slate-700 leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
