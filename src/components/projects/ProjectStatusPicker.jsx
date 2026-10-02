import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useRolePermissions } from "@/lib/useRolePermissions";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// A project's status badge that changes the status when clicked (project
// page header, project cards). Read-only for Viewers and roles without
// Projects, where it stays a plain badge.
export const PROJECT_STATUSES = [
  { key: "planning",    label: "Planning" },
  { key: "in_progress", label: "In Progress" },
  { key: "on_hold",     label: "On Hold" },
  { key: "completed",   label: "Completed" },
  { key: "cancelled",   label: "Cancelled" },
];

export default function ProjectStatusPicker({ project, onChange, className, style }) {
  const { can, readOnly } = useRolePermissions();
  const [saving, setSaving] = useState(false);
  const current = PROJECT_STATUSES.find((s) => s.key === project.status) || PROJECT_STATUSES[0];
  const editable = can("projects") && !readOnly;

  // Cards are links: keep a click on the badge from opening the project.
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  if (!editable) return <span className={className} style={style}>{current.label}</span>;

  const pick = async (key) => {
    if (key === project.status) return;
    setSaving(true);
    try {
      const updated = await base44.entities.Project.update(project.id, { status: key });
      onChange?.(updated || { ...project, status: key });
    } catch {
      // base44Client already alerted the reason
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClickCapture={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`${className || ""} inline-flex items-center gap-1 cursor-pointer hover:ring-1 hover:ring-current/30`}
          style={style}
          title="Change status"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {current.label}
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stop}>
        <DropdownMenuLabel className="text-xs text-slate-500">Move project to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PROJECT_STATUSES.map((s) => (
          <DropdownMenuItem key={s.key} onSelect={() => pick(s.key)} className="flex items-center justify-between gap-4">
            {s.label}
            {s.key === project.status && <Check className="w-3.5 h-3.5 text-emerald-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
