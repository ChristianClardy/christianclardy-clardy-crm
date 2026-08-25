import { useState, useMemo } from "react";
import { Copy, Check, FileSignature, ScrollText } from "lucide-react";
import { MERGE_SOURCES } from "@/lib/contractMergeSources";

// Read-only reference for every merge field a template can pull in. Contract
// Templates bind a literal anchor (e.g. {{client_name}}) to one of these
// fixed MERGE_SOURCES; Scope Templates use their own per-template tokens
// bound to cost codes, so those are documented rather than listed.

function CopyToken({ text }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — no-op
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy"
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors flex-shrink-0"
    >
      {text}
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
    </button>
  );
}

export default function MergeFieldsLibraryTab() {
  const grouped = useMemo(() => {
    const byGroup = new Map();
    for (const s of MERGE_SOURCES) {
      const g = s.group || "Other";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(s);
    }
    return [...byGroup.entries()];
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Merge Field Library</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Every value a template can pull in, in one place. Use this as a reference while building templates below.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileSignature className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900">Contract Templates</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          In a <span className="font-medium text-slate-600">Contract Template</span>, each of these is a merge source you map an anchor token to (e.g. anchor <code className="font-mono">{"{{client_name}}"}</code> → source "Client — Name").
          The value shown is filled in automatically when a deal's Contracts tab sends the package, resolved from that deal's linked client, company, and — where available — its most recent project and estimate.
        </p>
        <div className="space-y-5">
          {grouped.map(([group, sources]) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {sources.map((s) => (
                  <div key={s.value} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{s.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
                    </div>
                    <CopyToken text={s.value} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <ScrollText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900">Scope Templates</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Scope Templates don't use the fixed list above — each template defines its own merge fields, bound to a cost code on the estimate. Two token types are supported in the body text:
        </p>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-100 p-2.5">
            <CopyToken text="{{tag_key}}" />
            <p className="text-xs text-slate-500 mt-2">
              Filled in from a merge field defined on that template (Settings → Templates → Scope Templates → Add merge field). Each field binds a <code className="font-mono">tag_key</code> to a cost code and a format — dimensions, quantity, cost, count, or raw description — pulled from the first matching line item on the estimate.
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 p-2.5">
            <CopyToken text="{{#if COST_CODE}}shown{{else}}not shown{{/if}}" />
            <p className="text-xs text-slate-500 mt-2">
              Shows the first block if a line item with that cost code exists on the estimate, otherwise the <code className="font-mono">{"{{else}}"}</code> block (optional — omit for nothing).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
