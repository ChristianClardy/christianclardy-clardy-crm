import { useState } from "react";
import { Workflow } from "lucide-react";
import WorkflowBadge from "@/components/prospects/WorkflowBadge";
import WorkflowDrawer from "@/components/prospects/WorkflowDrawer";
import { cn } from "@/lib/utils";

export default function ClientWorkflowControl({ client, onUpdated, className = "" }) {
  const [open, setOpen] = useState(false);

  if (!client?.id) return null;

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 hover:border-amber-300 hover:bg-amber-50 transition-colors",
          className
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Workflow className="h-3.5 w-3.5 text-amber-600" />
        <WorkflowBadge stage={client.workflow_stage || "new_lead"} />
      </button>

      {open && (
        <WorkflowDrawer
          prospect={client}
          onClose={() => setOpen(false)}
          onUpdated={() => {
            setOpen(false);
            onUpdated?.();
          }}
        />
      )}
    </>
  );
}