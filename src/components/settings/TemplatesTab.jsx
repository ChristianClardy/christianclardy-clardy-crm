import { useState } from "react";
import { cn } from "@/lib/utils";
import ScopeTemplatesTab from "@/components/settings/ScopeTemplatesTab";
import ContractTemplatesTab from "@/components/settings/ContractTemplatesTab";
import MergeFieldsLibraryTab from "@/components/settings/MergeFieldsLibraryTab";

const SUB_TABS = [
  { key: "scope",    label: "Scope Templates" },
  { key: "contract", label: "Contract Templates" },
  { key: "merge",    label: "Merge Fields" },
];

export default function TemplatesTab() {
  const [sub, setSub] = useState("scope");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              sub === key ? "border-amber-500 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "scope" ? <ScopeTemplatesTab /> : sub === "contract" ? <ContractTemplatesTab /> : <MergeFieldsLibraryTab />}
    </div>
  );
}
