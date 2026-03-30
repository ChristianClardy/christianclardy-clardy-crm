import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Calendar, MessageSquare, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { WORKFLOW_STAGES } from "./WorkflowBadge";
import { cn } from "@/lib/utils";

export default function WorkflowDrawer({ prospect, onClose, onUpdated }) {
  const [stage, setStage] = useState(prospect.workflow_stage || "new_lead");
  const [followUpDate, setFollowUpDate] = useState(prospect.follow_up_date || "");
  const [notes, setNotes] = useState(prospect.follow_up_notes || "");
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      workflow_stage: stage,
      follow_up_date: followUpDate || null,
      follow_up_notes: notes,
      last_contact_date: today,
      sync_locked: true,
    };
    // If approved, also move status to active
    if (stage === "approved") updates.status = "active";
    // If dead lead, keep as prospect so it stays visible in prospects (just with dead stage)
    await base44.entities.Client.update(prospect.id, updates);
    setSaving(false);
    onUpdated();
  };

  const stageIdx = WORKFLOW_STAGES.findIndex(s => s.key === stage);
  const stageGroups = [
    { label: "Leads", keys: ["new_lead", "contacted"] },
    { label: "Prospects", keys: ["proposal_sent", "negotiating"] },
    { label: "Approved", keys: ["approved"] },
    { label: "Completed", keys: ["completed"] },
    { label: "Closed", keys: ["closed"] },
    { label: "Archived", keys: ["dead_lead"] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-600 font-semibold mb-0.5">Client Workflow</p>
            <h2 className="text-lg font-bold text-slate-800">{prospect.name}</h2>
            {prospect.company && <p className="text-sm text-slate-400">{prospect.company}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pipeline Progress */}
        <div className="px-6 py-5 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Pipeline Stage</p>
          <div className="space-y-4">
            {stageGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{group.label}</p>
                <div className="space-y-2">
                  {group.keys.map((key) => {
                    const s = WORKFLOW_STAGES.find((item) => item.key === key);
                    if (!s) return null;
                    const idx = WORKFLOW_STAGES.findIndex((item) => item.key === s.key);
                    const isActive = s.key === stage;
                    const isPast = idx < stageIdx && stage !== "dead_lead";
                    const isDead = s.key === "dead_lead";

                    return (
                      <button
                        key={s.key}
                        onClick={() => setStage(s.key)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                          isActive
                            ? isDead
                              ? "border-rose-300 bg-rose-50"
                              : "border-amber-400 bg-amber-50"
                            : "border-slate-100 bg-slate-50 hover:border-slate-300"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold",
                          isActive ? (isDead ? "bg-rose-500" : "bg-amber-500") : isPast ? "bg-emerald-400" : "bg-slate-200"
                        )}>
                          {isPast ? "✓" : idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className={cn(
                            "text-sm font-semibold",
                            isActive ? (isDead ? "text-rose-700" : "text-amber-700") : "text-slate-600"
                          )}>
                            {s.label}
                          </div>
                          <div className="text-xs text-slate-400">Shows in {group.label}</div>
                        </div>
                        {isActive && <ChevronRight className="w-4 h-4 ml-auto text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Follow-up Details */}
        <div className="px-6 py-5 space-y-4 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Follow-Up Details</p>

          <div>
            <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
              <Calendar className="w-3.5 h-3.5" /> Next Follow-Up Date
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={e => setFollowUpDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Follow-Up Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="What was discussed? What are next steps?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {prospect.last_contact_date && (
            <p className="text-xs text-slate-400">Last contacted: {prospect.last_contact_date}</p>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-5 border-t border-slate-100 space-y-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: "#3d3530" }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = "#b5965a"; }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.backgroundColor = "#3d3530"; }}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {saving ? "Saving…" : "Save Workflow Change"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}