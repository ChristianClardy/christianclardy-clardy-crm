import { useMemo, useState } from "react";
import { Search, PenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MERGE_SOURCES, SIGNATURE_FIELD, anchorForSource } from "@/lib/contractMergeSources";

// Searchable panel of insertable merge tokens for a 'text' mode Contract
// Template body. Each row is click-to-insert (onInsert) and draggable via
// plain HTML5 drag events — not @hello-pangea/dnd, which is built for
// sortable lists rather than dropping text into an arbitrary target.

export default function MergeFieldPicker({ onInsert }) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (s) => {
      if (words.length === 0) return true;
      const haystack = `${s.label} ${s.description} ${s.value}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    };

    const byGroup = new Map();
    if (matches(SIGNATURE_FIELD)) byGroup.set("Signature", [SIGNATURE_FIELD]);
    for (const s of MERGE_SOURCES) {
      if (!matches(s)) continue;
      const g = s.group || "Other";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(s);
    }
    return [...byGroup.entries()];
  }, [search]);

  const tokenFor = anchorForSource;

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-slate-50">
      <div className="p-2 border-b border-slate-200">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merge fields…"
            className="h-8 pl-7 text-xs bg-white"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {groups.length === 0 && (
          <p className="text-xs text-slate-400 italic text-center py-4">No matching fields.</p>
        )}
        {groups.map(([group, sources]) => (
          <div key={group}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 px-0.5">{group}</p>
            <div className="space-y-1">
              {sources.map((s) => {
                const token = tokenFor(s);
                return (
                  <button
                    key={s.value}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", token)}
                    onClick={() => onInsert(token)}
                    title={s.description}
                    className="w-full flex items-start gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    {s === SIGNATURE_FIELD && <PenLine className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-800 truncate">{s.label}</span>
                      <span className="block font-mono text-[10px] text-slate-400 truncate">{token}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
