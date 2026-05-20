import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Phone, Mail, Calendar, StickyNote, CheckSquare, MessageSquare,
  Plus, Check, Clock, Filter, ChevronDown, X, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = [
  { value: "call",    label: "Call",    Icon: Phone,         color: "bg-blue-100 text-blue-600" },
  { value: "email",   label: "Email",   Icon: Mail,          color: "bg-violet-100 text-violet-600" },
  { value: "meeting", label: "Meeting", Icon: Calendar,      color: "bg-amber-100 text-amber-600" },
  { value: "note",    label: "Note",    Icon: StickyNote,    color: "bg-yellow-100 text-yellow-700" },
  { value: "task",    label: "Task",    Icon: CheckSquare,   color: "bg-emerald-100 text-emerald-600" },
  { value: "sms",     label: "SMS",     Icon: MessageSquare, color: "bg-pink-100 text-pink-600" },
];

const CALL_OUTCOMES = ["Connected", "No Answer", "Left Voicemail", "Wrong Number"];

const DATE_FILTERS = [
  { key: "all",   label: "All Time" },
  { key: "today", label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function getTypeConfig(type) {
  return ACTIVITY_TYPES.find((t) => t.value === type) || ACTIVITY_TYPES[3];
}

// ─── Log Activity Dialog ──────────────────────────────────────────────────────

function LogActivityDialog({ open, onOpenChange, leads, deals, defaultLeadId, onSaved }) {
  const empty = {
    type: "call", subject: "", body: "", outcome: "",
    duration_min: "", lead_id: defaultLeadId || "", deal_id: "",
    scheduled_at: "", assigned_to: "",
  };
  const [form, setForm] = useState(empty);
  const [leadSearch, setLeadSearch] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...empty, lead_id: defaultLeadId || "" });
  }, [open, defaultLeadId]);

  const filteredLeads = useMemo(() =>
    leads.filter((l) =>
      !leadSearch || (l.full_name || "").toLowerCase().includes(leadSearch.toLowerCase())
    ).slice(0, 6),
    [leads, leadSearch]
  );

  const filteredDeals = useMemo(() =>
    deals.filter((d) =>
      !dealSearch || (d.title || "").toLowerCase().includes(dealSearch.toLowerCase())
    ).slice(0, 6),
    [deals, dealSearch]
  );

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_min: form.duration_min ? parseInt(form.duration_min) : undefined,
        lead_id: form.lead_id || undefined,
        deal_id: form.deal_id || undefined,
        scheduled_at: form.scheduled_at || undefined,
      };
      await base44.entities.CRMActivity.create(payload);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to log activity:", err?.message);
    } finally {
      setSaving(false);
    }
  };

  const showOutcome = form.type === "call";
  const showDuration = form.type === "call" || form.type === "meeting";
  const showScheduled = form.type === "task" || form.type === "meeting";

  const selectedLead = leads.find((l) => l.id === form.lead_id);
  const selectedDeal = deals.find((d) => d.id === form.deal_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <div>
            <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Type</Label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map(({ value, label, Icon, color }) => (
                <button
                  key={value}
                  onClick={() => set("type", value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    form.type === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <Label className="text-xs font-medium text-slate-600 mb-1 block">Subject *</Label>
            <Input
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="Activity subject..."
            />
          </div>

          {/* Body */}
          <div>
            <Label className="text-xs font-medium text-slate-600 mb-1 block">Notes</Label>
            <Textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Add notes..."
              rows={3}
            />
          </div>

          {/* Outcome (calls only) */}
          {showOutcome && (
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-1 block">Outcome</Label>
              <Select value={form.outcome} onValueChange={(v) => set("outcome", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  {CALL_OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Duration */}
          {showDuration && (
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-1 block">Duration (minutes)</Label>
              <Input
                type="number"
                min={0}
                value={form.duration_min}
                onChange={(e) => set("duration_min", e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
          )}

          {/* Scheduled at */}
          {showScheduled && (
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-1 block">
                {form.type === "task" ? "Due Date/Time" : "Meeting Date/Time"}
              </Label>
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => set("scheduled_at", e.target.value)}
              />
            </div>
          )}

          {/* Lead search */}
          <div>
            <Label className="text-xs font-medium text-slate-600 mb-1 block">Link to Lead (optional)</Label>
            {selectedLead ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">{selectedLead.full_name}</span>
                <button onClick={() => { set("lead_id", ""); setLeadSearch(""); }}>
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-700" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search leads..."
                  className="pl-8"
                />
                {leadSearch && filteredLeads.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filteredLeads.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => { set("lead_id", l.id); setLeadSearch(""); }}
                        className="flex w-full items-center px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {l.full_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deal search */}
          <div>
            <Label className="text-xs font-medium text-slate-600 mb-1 block">Link to Deal (optional)</Label>
            {selectedDeal ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">{selectedDeal.title}</span>
                <button onClick={() => { set("deal_id", ""); setDealSearch(""); }}>
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-700" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={dealSearch}
                  onChange={(e) => setDealSearch(e.target.value)}
                  placeholder="Search deals..."
                  className="pl-8"
                />
                {dealSearch && filteredDeals.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filteredDeals.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { set("deal_id", d.id); setDealSearch(""); }}
                        className="flex w-full items-center px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {d.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assigned to */}
          <div>
            <Label className="text-xs font-medium text-slate-600 mb-1 block">Assigned To</Label>
            <Input
              value={form.assigned_to}
              onChange={(e) => set("assigned_to", e.target.value)}
              placeholder="Name or email..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.subject.trim() || saving}>
            {saving ? "Saving..." : "Log Activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Activity Item (Feed) ─────────────────────────────────────────────────────

function ActivityItem({ activity, leadMap, dealMap }) {
  const { Icon, color } = getTypeConfig(activity.type);
  const leadName = activity.lead_id ? (leadMap[activity.lead_id]?.full_name || "Unknown Lead") : null;
  const dealTitle = activity.deal_id ? (dealMap[activity.deal_id]?.title || "Unknown Deal") : null;

  return (
    <div className="flex gap-4">
      {/* Timeline line + icon */}
      <div className="flex flex-col items-center">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-1 w-px flex-1 bg-slate-200" />
      </div>

      {/* Card */}
      <div className="mb-4 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-snug">{activity.subject}</p>
            {activity.body && (
              <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{activity.body}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {activity.is_completed && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-3 w-3 text-emerald-600" />
              </div>
            )}
            <span className="text-[10px] text-slate-400 whitespace-nowrap">
              {relativeTime(activity.created_at)}
            </span>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {leadName && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium">
              {leadName}
            </span>
          )}
          {dealTitle && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 font-medium">
              {dealTitle}
            </span>
          )}
          {activity.assigned_to && (
            <span className="text-slate-400">→ {activity.assigned_to}</span>
          )}
          {activity.outcome && (
            <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
              {activity.outcome}
            </Badge>
          )}
          {activity.duration_min && (
            <span className="flex items-center gap-0.5 text-slate-400">
              <Clock className="h-3 w-3" /> {activity.duration_min}m
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Row (Task Queue) ────────────────────────────────────────────────────

function TaskRow({ task, leadMap, dealMap, onComplete }) {
  const overdue = isOverdue(task.scheduled_at);
  const leadName = task.lead_id ? (leadMap[task.lead_id]?.full_name || "Unknown Lead") : null;
  const dealTitle = task.deal_id ? (dealMap[task.deal_id]?.title || "Unknown Deal") : null;

  return (
    <div className={cn(
      "flex items-start gap-4 rounded-2xl border p-4 bg-white shadow-sm",
      overdue ? "border-rose-200 bg-rose-50" : "border-slate-200"
    )}>
      <CheckSquare className={cn("mt-0.5 h-4 w-4 shrink-0", overdue ? "text-rose-500" : "text-emerald-500")} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{task.subject}</p>
        {task.body && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{task.body}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
          {task.scheduled_at && (
            <span className={cn(
              "flex items-center gap-1 font-medium",
              overdue ? "text-rose-600" : "text-slate-500"
            )}>
              <Clock className="h-3 w-3" />
              {overdue ? "Overdue · " : "Due · "}
              {new Date(task.scheduled_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
          )}
          {leadName && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 font-medium">{leadName}</span>
          )}
          {dealTitle && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 font-medium">{dealTitle}</span>
          )}
          {task.assigned_to && (
            <span className="text-slate-400">→ {task.assigned_to}</span>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 text-xs"
        onClick={() => onComplete(task)}
      >
        <Check className="mr-1 h-3 w-3" /> Complete
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActivitiesView() {
  const [activities, setActivities] = useState([]);
  const [leads, setLeads] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const loadAll = async () => {
    try {
      const [acts, lds, dls] = await Promise.all([
        base44.entities.CRMActivity.list("-created_at", 500),
        base44.entities.Lead.list("-created_date", 500),
        base44.entities.Deal.list("-created_at", 500),
      ]);
      setActivities(acts || []);
      setLeads(lds || []);
      setDeals(dls || []);
    } catch (err) {
      console.error("Failed to load activities:", err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const leadMap = useMemo(() =>
    Object.fromEntries((leads || []).map((l) => [l.id, l])),
    [leads]
  );
  const dealMap = useMemo(() =>
    Object.fromEntries((deals || []).map((d) => [d.id, d])),
    [deals]
  );

  const filterByDate = (list, dateField) => {
    if (dateFilter === "all") return list;
    const field = dateField || "created_at";
    if (dateFilter === "today") return list.filter((a) => isToday(a[field]));
    if (dateFilter === "week") return list.filter((a) => isThisWeek(a[field]));
    if (dateFilter === "month") return list.filter((a) => isThisMonth(a[field]));
    return list;
  };

  const feedActivities = useMemo(() => {
    let list = activities;
    if (typeFilter !== "all") list = list.filter((a) => a.type === typeFilter);
    return filterByDate(list, "created_at");
  }, [activities, typeFilter, dateFilter]);

  const taskQueue = useMemo(() => {
    const tasks = activities
      .filter((a) => a.type === "task" && !a.is_completed)
      .sort((a, b) => {
        if (!a.scheduled_at) return 1;
        if (!b.scheduled_at) return -1;
        return new Date(a.scheduled_at) - new Date(b.scheduled_at);
      });
    return filterByDate(tasks, "scheduled_at");
  }, [activities, dateFilter]);

  const handleCompleteTask = async (task) => {
    try {
      await base44.entities.CRMActivity.update(task.id, {
        is_completed: true,
        completed_at: new Date().toISOString(),
      });
      setActivities((prev) =>
        prev.map((a) =>
          a.id === task.id
            ? { ...a, is_completed: true, completed_at: new Date().toISOString() }
            : a
        )
      );
    } catch (err) {
      console.error("Failed to complete task:", err?.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-6 pb-6 lg:px-8 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between rounded-3xl bg-slate-900 px-6 py-5 shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-white">Activities</h2>
          <p className="mt-0.5 text-sm text-slate-400">{activities.length} total · {taskQueue.length} open tasks</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-white text-slate-900 hover:bg-slate-100 font-semibold"
        >
          <Plus className="mr-2 h-4 w-4" /> Log Activity
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type filters */}
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => setTypeFilter("all")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              typeFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            All
          </button>
          {ACTIVITY_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                typeFilter === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {label}s
            </button>
          ))}
        </div>

        {/* Date filters */}
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm ml-auto">
          {DATE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                dateFilter === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="feed">
        <TabsList className="mb-4">
          <TabsTrigger value="feed">Activity Feed</TabsTrigger>
          <TabsTrigger value="tasks">
            Task Queue
            {taskQueue.length > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {taskQueue.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Activity Feed */}
        <TabsContent value="feed">
          {feedActivities.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              No activities found.
            </div>
          ) : (
            <div className="relative pl-1">
              {feedActivities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  leadMap={leadMap}
                  dealMap={dealMap}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Task Queue */}
        <TabsContent value="tasks">
          {taskQueue.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              No open tasks.
            </div>
          ) : (
            <div className="space-y-3">
              {taskQueue.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  leadMap={leadMap}
                  dealMap={dealMap}
                  onComplete={handleCompleteTask}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <LogActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leads={leads}
        deals={deals}
        onSaved={loadAll}
      />
    </div>
  );
}
