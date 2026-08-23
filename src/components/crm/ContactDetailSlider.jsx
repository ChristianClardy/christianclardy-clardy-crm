import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  X, Phone, Mail, Calendar, StickyNote, CheckSquare,
  MessageSquare, Edit2, Check, ChevronRight, User,
  MapPin, Briefcase, UserRound, ExternalLink, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { promoteLeadToProspect } from "@/lib/leadConversion";

// ─── Constants ────────────────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: "new",         label: "New",         match: ["New Lead", "Contact Attempted"] },
  { key: "contacted",   label: "Contacted",   match: ["Contacted"] },
  { key: "appointment", label: "Appointment", match: ["Appointment Scheduled", "Site Visit Complete", "Design Appointment Scheduled"] },
  { key: "design",      label: "Design/Estimate", match: ["In Design", "Estimate In Progress", "Quote Delivered/Price Locked", "Negotiating/Revising Scope"] },
  { key: "won",         label: "Won",         match: ["Contract Signed/Deposit Collected (Won)"] },
];

const STATUS_COLORS = {
  "New Lead":                                 "bg-slate-100 text-slate-700",
  "Contact Attempted":                        "bg-amber-100 text-amber-700",
  Contacted:                                  "bg-blue-100 text-blue-700",
  "Appointment Scheduled":                    "bg-purple-100 text-purple-700",
  "Site Visit Complete":                      "bg-violet-100 text-violet-700",
  "Design Appointment Scheduled":             "bg-fuchsia-50 text-fuchsia-600",
  "In Design":                                "bg-fuchsia-100 text-fuchsia-700",
  "Estimate In Progress":                     "bg-indigo-100 text-indigo-700",
  "Quote Delivered/Price Locked":              "bg-cyan-100 text-cyan-700",
  "Negotiating/Revising Scope":                "bg-yellow-100 text-yellow-700",
  "Contract Signed/Deposit Collected (Won)":   "bg-emerald-100 text-emerald-700",
  "Lost/No Decision":                          "bg-rose-100 text-rose-700",
};

const ACTIVITY_ICON = {
  call:    { Icon: Phone,         color: "text-blue-500",    bg: "bg-blue-100" },
  email:   { Icon: Mail,          color: "text-violet-500",  bg: "bg-violet-100" },
  meeting: { Icon: Calendar,      color: "text-amber-500",   bg: "bg-amber-100" },
  note:    { Icon: StickyNote,    color: "text-yellow-600",  bg: "bg-yellow-100" },
  task:    { Icon: CheckSquare,   color: "text-emerald-500", bg: "bg-emerald-100" },
  sms:     { Icon: MessageSquare, color: "text-pink-500",    bg: "bg-pink-100" },
};

const DEAL_STAGE_COLORS = {
  Prospecting: "text-slate-600 bg-slate-100",
  Qualified:   "text-blue-700 bg-blue-100",
  Proposal:    "text-indigo-700 bg-indigo-100",
  Negotiation: "text-amber-700 bg-amber-100",
  Won:         "text-emerald-700 bg-emerald-100",
  Lost:        "text-rose-700 bg-rose-100",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0] || "").join("").toUpperCase().slice(0, 2);
}

function funnelStageIndex(status) {
  for (let i = 0; i < FUNNEL_STAGES.length; i++) {
    if (FUNNEL_STAGES[i].match.includes(status)) return i;
  }
  return 0;
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diffMs = Date.now() - d;
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const fmt = (n) => {
  if (!n) return "$0";
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${Number(n).toFixed(0)}`;
};

// ─── Inline Editable Field ────────────────────────────────────────────────────

function EditableField({ label, value, icon: Icon, onSave, type = "text", placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className="h-7 text-sm px-2"
            placeholder={placeholder}
          />
          <button onClick={handleSave} className="rounded-md bg-slate-900 p-1 text-white hover:bg-slate-700">
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(value || ""); setEditing(true); }}
          className="group flex w-full items-center gap-1.5 rounded-md px-0 py-0.5 text-left text-sm text-slate-800 hover:text-slate-600"
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className={cn("flex-1", !value && "text-slate-300 italic")}>{value || placeholder || "—"}</span>
          <Edit2 className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  );
}

// ─── Inline Log Activity Form ─────────────────────────────────────────────────

function QuickLogForm({ leadId, defaultType, onSaved, onClose }) {
  const [form, setForm] = useState({ type: defaultType || "note", subject: "", body: "", outcome: "", scheduled_at: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      await base44.entities.CRMActivity.create({
        ...form,
        lead_id: leadId,
        scheduled_at: form.scheduled_at || undefined,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Failed to log:", err?.message);
    } finally {
      setSaving(false);
    }
  };

  const isCall = form.type === "call";
  const isScheduled = form.type === "task" || form.type === "meeting";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Log Activity</p>
        <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { v: "call", label: "Call", Icon: Phone },
          { v: "email", label: "Email", Icon: Mail },
          { v: "meeting", label: "Meeting", Icon: Calendar },
          { v: "note", label: "Note", Icon: StickyNote },
          { v: "task", label: "Task", Icon: CheckSquare },
          { v: "sms", label: "SMS", Icon: MessageSquare },
        ].map(({ v, label, Icon }) => (
          <button
            key={v}
            onClick={() => set("type", v)}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
              form.type === v
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            )}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      <Input
        value={form.subject}
        onChange={(e) => set("subject", e.target.value)}
        placeholder="Subject..."
        className="text-sm"
      />
      <Textarea
        value={form.body}
        onChange={(e) => set("body", e.target.value)}
        placeholder="Notes..."
        rows={2}
        className="text-sm"
      />

      {isCall && (
        <select
          value={form.outcome}
          onChange={(e) => set("outcome", e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          <option value="">Outcome (optional)</option>
          {["Connected", "No Answer", "Left Voicemail", "Wrong Number"].map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}

      {isScheduled && (
        <Input
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(e) => set("scheduled_at", e.target.value)}
          className="text-sm"
        />
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!form.subject.trim() || saving}>
          {saving ? "Saving..." : "Log"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactDetailSlider({ lead, onClose, onUpdate }) {
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [contactHistories, setContactHistories] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(false);

  // Local editable copies
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [quickLogType, setQuickLogType] = useState(null); // null | "call" | "email" | "note" | "meeting"
  const [converting, setConverting] = useState(false);

  const nameInputRef = useRef(null);

  // Load data when lead changes
  useEffect(() => {
    if (!lead) return;
    setNotesDraft(lead.notes || "");
    setFollowUpDate(lead.follow_up_date || "");
    setNameDraft(lead.full_name || "");
    setLoading(true);

    const loadRelated = async () => {
      try {
        const [dls, acts, ch, fu] = await Promise.all([
          base44.entities.Deal.list("-created_at", 200),
          base44.entities.CRMActivity.list("-created_at", 200),
          base44.entities.ContactHistory.list("-created_at", 200),
          base44.entities.LeadFollowUp.list("-created_at", 200),
        ]);
        setDeals((dls || []).filter((d) => d.lead_id === lead.id));
        setActivities((acts || []).filter((a) => a.lead_id === lead.id));
        setContactHistories((ch || []).filter((c) => c.linked_lead_id === lead.id));
        setFollowUps((fu || []).filter((f) => f.lead_id === lead.id));
      } catch (err) {
        console.error("ContactDetailSlider load error:", err?.message);
      } finally {
        setLoading(false);
      }
    };
    loadRelated();
  }, [lead?.id]);

  const isProspect = Boolean(lead?.is_prospect);

  const handleConvertToProspect = async () => {
    if (!lead) return;
    setConverting(true);
    try {
      await promoteLeadToProspect(lead);
      onUpdate?.({ ...lead, is_prospect: true });
    } catch (err) {
      console.error("Failed to promote lead to prospect:", err?.message);
    } finally {
      setConverting(false);
    }
  };

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Combined timeline
  const timeline = useMemo(() => {
    const items = [
      ...activities.map((a) => ({ ...a, _kind: "activity", _date: a.created_at })),
      ...contactHistories.map((c) => ({ ...c, _kind: "contact_history", _date: c.created_at })),
      ...followUps.map((f) => ({ ...f, _kind: "follow_up", _date: f.created_at })),
    ];
    return items
      .sort((a, b) => new Date(b._date) - new Date(a._date))
      .slice(0, 20);
  }, [activities, contactHistories, followUps]);

  const funnelIdx = lead ? funnelStageIndex(lead.status) : 0;

  const handleFieldSave = async (field, value) => {
    if (!lead) return;
    try {
      await base44.entities.Lead.update(lead.id, { [field]: value });
      onUpdate?.({ ...lead, [field]: value });
    } catch (err) {
      console.error("Failed to update:", err?.message);
    }
  };

  const handleNameSave = async () => {
    setEditingName(false);
    if (nameDraft !== lead.full_name) {
      await handleFieldSave("full_name", nameDraft);
    }
  };

  const handleNotesSave = async () => {
    await handleFieldSave("notes", notesDraft);
  };

  const handleFollowUpSave = async (e) => {
    const val = e.target.value;
    setFollowUpDate(val);
    await handleFieldSave("follow_up_date", val);
  };

  const reloadActivities = async () => {
    if (!lead) return;
    try {
      const [acts, ch, fu] = await Promise.all([
        base44.entities.CRMActivity.list("-created_at", 200),
        base44.entities.ContactHistory.list("-created_at", 200),
        base44.entities.LeadFollowUp.list("-created_at", 200),
      ]);
      setActivities((acts || []).filter((a) => a.lead_id === lead.id));
      setContactHistories((ch || []).filter((c) => c.linked_lead_id === lead.id));
      setFollowUps((fu || []).filter((f) => f.lead_id === lead.id));
    } catch (err) {
      console.error("Reload error:", err?.message);
    }
  };

  // Render nothing if no lead
  const isOpen = !!lead;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-screen w-full max-w-[480px] flex flex-col bg-white shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {!lead ? null : (
          <>
            {/* Sticky header */}
            <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-4 flex items-center gap-3 shadow-sm z-10">
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {initials(lead.full_name)}
              </div>

              {/* Name (editable) */}
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={nameInputRef}
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditingName(false); }}
                      className="w-full rounded border border-slate-300 px-2 py-0.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button onClick={handleNameSave} className="rounded bg-slate-900 p-1 text-white">
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameDraft(lead.full_name || ""); setEditingName(true); }}
                    className="group flex items-center gap-1.5 text-left"
                  >
                    <span className="text-sm font-bold text-slate-900 truncate">{lead.full_name}</span>
                    <Edit2 className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}
                <Badge className={cn("mt-0.5 text-[10px]", STATUS_COLORS[lead.status] || "bg-slate-100 text-slate-700")}>
                  {lead.status || "New Lead"}
                </Badge>
              </div>

              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Convert to prospect */}
              <div className="border-b border-slate-100 px-5 py-3">
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleConvertToProspect}
                  disabled={converting || isProspect}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  {converting ? "Promoting..." : isProspect ? "Prospect" : "Promote to Prospect"}
                </Button>
              </div>

              {/* Quick actions */}
              <div className="border-b border-slate-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  {[
                    { type: "call",    Icon: Phone,         label: "Call" },
                    { type: "email",   Icon: Mail,          label: "Email" },
                    { type: "note",    Icon: StickyNote,    label: "Note" },
                    { type: "meeting", Icon: Calendar,      label: "Meeting" },
                  ].map(({ type, Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => setQuickLogType(quickLogType === type ? null : type)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 text-xs font-medium transition-all",
                        quickLogType === type
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {quickLogType && (
                  <div className="mt-3">
                    <QuickLogForm
                      leadId={lead.id}
                      defaultType={quickLogType}
                      onSaved={reloadActivities}
                      onClose={() => setQuickLogType(null)}
                    />
                  </div>
                )}
              </div>

              {/* Contact info */}
              <div className="border-b border-slate-100 px-5 py-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Contact Info</p>
                <EditableField
                  label="Phone"
                  value={lead.phone}
                  icon={Phone}
                  placeholder="Add phone..."
                  type="tel"
                  onSave={(v) => handleFieldSave("phone", v)}
                />
                <EditableField
                  label="Email"
                  value={lead.email}
                  icon={Mail}
                  placeholder="Add email..."
                  type="email"
                  onSave={(v) => handleFieldSave("email", v)}
                />
                <EditableField
                  label="Lead Source"
                  value={lead.lead_source}
                  icon={ExternalLink}
                  placeholder="e.g. Google, Referral..."
                  onSave={(v) => handleFieldSave("lead_source", v)}
                />
                <EditableField
                  label="Assigned Rep"
                  value={lead.assigned_sales_rep}
                  icon={UserRound}
                  placeholder="Assign a rep..."
                  onSave={(v) => handleFieldSave("assigned_sales_rep", v)}
                />
                <EditableField
                  label="Project Type"
                  value={lead.project_type}
                  icon={Briefcase}
                  placeholder="e.g. Lawn, Hardscape..."
                  onSave={(v) => handleFieldSave("project_type", v)}
                />
              </div>

              {/* Funnel progress */}
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Stage Progress</p>
                <div className="flex items-center gap-0">
                  {FUNNEL_STAGES.map((stage, idx) => {
                    const active = idx === funnelIdx;
                    const done = idx < funnelIdx;
                    return (
                      <div key={stage.key} className="flex flex-1 flex-col items-center">
                        <div className="flex w-full items-center">
                          {idx > 0 && (
                            <div className={cn("h-0.5 flex-1", done || active ? "bg-amber-400" : "bg-slate-200")} />
                          )}
                          <div className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold border-2",
                            active
                              ? "border-amber-500 bg-amber-500 text-white"
                              : done
                              ? "border-amber-300 bg-amber-100 text-amber-700"
                              : "border-slate-200 bg-white text-slate-400"
                          )}>
                            {done ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                          </div>
                          {idx < FUNNEL_STAGES.length - 1 && (
                            <div className={cn("h-0.5 flex-1", done ? "bg-amber-400" : "bg-slate-200")} />
                          )}
                        </div>
                        <p className={cn(
                          "mt-1 text-center text-[9px] font-semibold leading-tight",
                          active ? "text-amber-600" : done ? "text-slate-500" : "text-slate-300"
                        )}>
                          {stage.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Open Deals */}
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Open Deals ({deals.length})
                </p>
                {deals.length === 0 ? (
                  <p className="text-xs text-slate-400">No deals linked.</p>
                ) : (
                  <div className="space-y-2">
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{deal.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {deal.close_date ? `Closes ${deal.close_date}` : ""}
                            {deal.assigned_to ? ` · ${deal.assigned_to}` : ""}
                          </p>
                        </div>
                        <div className="ml-3 shrink-0 text-right">
                          <p className="text-sm font-bold text-slate-900">{fmt(deal.value)}</p>
                          <span className={cn(
                            "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                            DEAL_STAGE_COLORS[deal.stage] || "bg-slate-100 text-slate-600"
                          )}>
                            {deal.stage || "Unknown"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Timeline */}
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Activity Timeline ({timeline.length})
                </p>
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                  </div>
                ) : timeline.length === 0 ? (
                  <p className="text-xs text-slate-400">No activity yet.</p>
                ) : (
                  <div className="relative">
                    {timeline.map((item, i) => {
                      if (item._kind === "activity") {
                        const { Icon, color, bg } = ACTIVITY_ICON[item.type] || ACTIVITY_ICON.note;
                        return (
                          <div key={item.id + "-act"} className="flex gap-3 pb-4">
                            <div className="flex flex-col items-center">
                              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", bg)}>
                                <Icon className={cn("h-3.5 w-3.5", color)} />
                              </div>
                              {i < timeline.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-100" />}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-slate-800">{item.subject}</p>
                                <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(item._date)}</span>
                              </div>
                              {item.body && (
                                <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{item.body}</p>
                              )}
                              {item.outcome && (
                                <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  {item.outcome}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      if (item._kind === "contact_history") {
                        return (
                          <div key={item.id + "-ch"} className="flex gap-3 pb-4">
                            <div className="flex flex-col items-center">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100">
                                <User className="h-3.5 w-3.5 text-slate-500" />
                              </div>
                              {i < timeline.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-100" />}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-slate-700">Contact History</p>
                                <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(item._date)}</span>
                              </div>
                              {item.notes && (
                                <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{item.notes}</p>
                              )}
                            </div>
                          </div>
                        );
                      }

                      if (item._kind === "follow_up") {
                        return (
                          <div key={item.id + "-fu"} className="flex gap-3 pb-4">
                            <div className="flex flex-col items-center">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
                                <Calendar className="h-3.5 w-3.5 text-amber-600" />
                              </div>
                              {i < timeline.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-100" />}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-slate-700">
                                  Follow-up ·{" "}
                                  <span className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                    item.status === "Completed"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700"
                                  )}>
                                    {item.status || "Pending"}
                                  </span>
                                </p>
                                <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(item._date)}</span>
                              </div>
                              {item.notes && (
                                <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{item.notes}</p>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Notes</p>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add notes about this contact..."
                  rows={4}
                  className="text-sm resize-none"
                />
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={handleNotesSave}
                  disabled={notesDraft === (lead.notes || "")}
                >
                  Save Notes
                </Button>
              </div>

              {/* Follow-up date */}
              <div className="px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Follow-up Date</p>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={handleFollowUpSave}
                  className="text-sm max-w-[200px]"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
