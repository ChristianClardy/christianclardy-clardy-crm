import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlarmClock, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCompanyScope } from "@/lib/companyScope";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { LEAD_STAGES } from "@/lib/leadStages";
import { MERGE_FIELDS, STATUS_STYLE, messagingApi, renderPreview } from "@/lib/messaging";
import MessageBodyEditor from "./MessageBodyEditor";
import { confirmAction } from "@/components/ui/confirm-dialog";

const ARCHIVED_ID = "a7c41e00-0000-4000-8000-000000000325";
const archived = (c) => c.is_active === false || /^\s*archived\b/i.test(c.name || "") || c.id === ARCHIVED_ID;

const MODES = [
  { key: "off", label: "Off", hint: "The checker skips this brand. Nothing is logged or sent." },
  { key: "dry_run", label: "Dry run", hint: "Writes a log line on the lead and does not email or text anyone." },
  { key: "live", label: "Live", hint: "Sends for rules that are turned on. Only the schedule can send, not the button on this page." },
];

const CHANNEL_LABEL = {
  email: "Email customer", sms: "Text customer", todo: "To-do for the rep",
  rep_email: "Email the rep", rep_sms: "Text the rep",
};

function timingSummary(rule) {
  if (rule.kind === "appointment") {
    const mins = Number(rule.minutes_before) || 0;
    const label = mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? "" : "s"} before` : `${mins} minutes before`;
    return `Appointment · ${label}`;
  }
  const n = Number(rule.idle_amount) || 0;
  const unit = n === 1 ? (rule.idle_unit || "days").replace(/s$/, "") : (rule.idle_unit || "days");
  return `${rule.lead_stage} · ${n} ${unit} with no activity`;
}

function outcomeLabel(match) {
  if (match.disposition === "skip") return "Would skip";
  if (match.reason && /^Quiet hours/.test(match.reason) && !/after the appointment/.test(match.reason)) return "Would wait";
  return "Would send";
}

const emptyStage = (companyId) => ({
  company_id: companyId, name: "New stage follow-up", kind: "stage_idle", enabled: false, catch_up: false,
  lead_stage: "New Lead", idle_amount: 24, idle_unit: "hours", minutes_before: null,
  send_email: false, send_sms: false, create_todo: true, notify_rep: false, notify_rep_channel: "email",
  todo_title: "Follow up with {{full_name}}", todo_notes: "Still in {{stage}} with no new activity.",
});

const emptyAppointment = (companyId) => ({
  company_id: companyId, name: "Appointment reminder", kind: "appointment", enabled: false, catch_up: false,
  lead_stage: null, idle_amount: null, idle_unit: null, minutes_before: 1440,
  send_email: true, send_sms: false, create_todo: false, notify_rep: false, notify_rep_channel: "email",
  email_subject: "Reminder: {{appointment_title|your appointment}} {{appointment_date}}",
  email_body: "Hi {{first_name|there}},\n\nReminder from {{company_name}}: {{appointment_title|your appointment}} is {{appointment_date}} at {{appointment_time}}.\n\nCall {{company_phone|us}} to reschedule.",
});

export default function FollowupsTab() {
  const scope = useCompanyScope();
  const { readOnly } = useRolePermissions();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [mode, setMode] = useState("off");
  const [rules, setRules] = useState([]);
  const [log, setLog] = useState([]);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCompanies = async () => {
    const { data, error: err } = await supabase.from("company_profiles").select("id,name,is_active,phone,email").order("name");
    if (err) { setError(err.message); setLoading(false); return; }
    const list = (data || []).filter((c) => !archived(c));
    setCompanies(list);
    setCompanyId((current) => {
      if (current && list.some((c) => c.id === current)) return current;
      if (scope !== "all" && list.some((c) => c.id === scope)) return scope;
      return list[0]?.id || "";
    });
    setLoading(false);
  };

  const loadRules = async (id) => {
    if (!id) { setRules([]); setMode("off"); setLog([]); return; }
    const [settings, ruleRows, logRows] = await Promise.all([
      supabase.from("followup_settings").select("mode").eq("company_id", id).maybeSingle(),
      supabase.from("followup_rules").select("*").eq("company_id", id).order("name"),
      supabase.from("followup_log").select("id,created_at,channel,status,reason,subject,rule_id,lead_id").eq("company_id", id).order("created_at", { ascending: false }).limit(30),
    ]);
    if (settings.error || ruleRows.error) {
      setError((settings.error || ruleRows.error).message);
      return;
    }
    setMode(settings.data?.mode || "off");
    setRules(ruleRows.data || []);
    setLog(logRows.error ? [] : (logRows.data || []));
  };

  useEffect(() => { loadCompanies(); }, []);
  useEffect(() => { if (companyId) loadRules(companyId); }, [companyId]);

  const company = companies.find((c) => c.id === companyId);
  const previewFields = useMemo(() => ({
    ...Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample])),
    company_name: (company?.name || "Principle Outdoor Living").trim(),
    brand_name: (company?.name || "Principle Outdoor Living").trim(),
    company_phone: company?.phone || "(555) 010-2030",
    brand_phone: company?.phone || "(555) 010-2030",
  }), [company]);

  const saveMode = async (next) => {
    if (readOnly || !companyId) return;
    if (next === "live") {
      const ok = await confirmAction(
        "Live sends real emails and texts to customers the next time the schedule runs, for every rule that is turned on. Dry run is the safe setting until a test message to yourself works.",
        { title: "Turn live sending on?", confirmLabel: "Turn on live" }
      );
      if (!ok) return;
    }
    setBusy(true); setNotice(""); setError("");
    const { error: err } = await supabase.from("followup_settings").upsert({ company_id: companyId, mode: next }, { onConflict: "company_id" });
    setBusy(false);
    if (err) setError(err.message);
    else { setMode(next); setNotice(MODES.find((m) => m.key === next)?.hint || "Saved."); }
  };

  const saveRule = async (rule) => {
    setBusy(true); setNotice(""); setError("");
    const payload = { ...rule, company_id: companyId };
    const id = payload.id;
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.enabled_at;
    const write = id
      ? supabase.from("followup_rules").update(payload).eq("id", id)
      : supabase.from("followup_rules").insert(payload).select().single();
    const { data, error: err } = await write;
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice("Saved. Still off for customers until this rule is on and the brand is Live.");
    setEditing(data?.id ? data : { ...payload, id });
    loadRules(companyId);
  };

  const toggleRule = async (rule, enabled) => {
    if (readOnly) return;
    if (enabled && mode === "live") {
      const ok = await confirmAction(
        "This brand is set to Live. The next scheduled check will email or text people for this rule. Use Dry run if you have not sent a test to yourself yet.",
        { title: "Turn this rule on?", confirmLabel: "Turn rule on" }
      );
      if (!ok) return;
    }
    const { error: err } = await supabase.from("followup_rules").update({ enabled }).eq("id", rule.id);
    if (err) setError(err.message);
    else setRules((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
  };

  const removeRule = async (rule) => {
    if (!await confirmAction(`Delete “${rule.name}”? Past log lines stay on the lead.`)) return;
    const { error: err } = await supabase.from("followup_rules").delete().eq("id", rule.id);
    if (err) setError(err.message);
    else { if (editing?.id === rule.id) setEditing(null); loadRules(companyId); }
  };

  const runPreview = async (rule) => {
    setBusy(true); setPreview(null); setError("");
    try {
      const data = await messagingApi.previewFollowups({ company_id: companyId, rule_id: rule.id });
      setPreview({ rule, ...data });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const runDry = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await messagingApi.dryRunFollowups({ company_id: companyId });
      const n = (data.dry_run || 0) + (data.skipped || 0) + (data.queued || 0);
      setNotice(n ? `Dry run recorded ${n} line${n === 1 ? "" : "s"}. Nothing was emailed or texted.` : "Dry run found nothing due. Rules that are off are skipped, and leads already past the timer are left alone.");
      loadRules(companyId);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  if (!companies.length) {
    return <p className="text-sm text-slate-600">No active companies you can edit. The archived lead-import company is not included.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Follow-ups for {company?.name?.trim()}</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              A new lead with no contact, a lead sitting in a stage, or a reminder before an appointment.
              You only see brands you're assigned to. The archived March 2026 import is excluded.
              Sender name, From email, Twilio number, and texting hours are under Settings.
            </p>
          </div>
          <Select value={companyId} onValueChange={(id) => { setCompanyId(id); setEditing(null); setPreview(null); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name.trim()}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={readOnly || busy}
              onClick={() => saveMode(m.key)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium ${mode === m.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}
            >{m.label}</button>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">{MODES.find((m) => m.key === mode)?.hint}</p>
        {!readOnly && (
          <Button variant="outline" className="mt-3" disabled={busy} onClick={runDry}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlarmClock className="mr-2 h-4 w-4" />}
            Dry-run check
          </Button>
        )}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <>
            <Button variant="outline" onClick={() => { setEditing(emptyStage(companyId)); setPreview(null); }}><Plus className="mr-1.5 h-4 w-4" /> Stage rule</Button>
            <Button variant="outline" onClick={() => { setEditing(emptyAppointment(companyId)); setPreview(null); }}><Plus className="mr-1.5 h-4 w-4" /> Appointment reminder</Button>
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{rule.name}</p>
                  <p className="text-xs text-slate-500">{timingSummary(rule)}{rule.catch_up ? " · includes leads already waiting" : ""}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[rule.send_email && "Email", rule.send_sms && "Text", rule.create_todo && "To-do", rule.notify_rep && "Notify rep"].filter(Boolean).join(" · ") || "No action"}
                  </p>
                </div>
                <Switch checked={!!rule.enabled} disabled={readOnly} onCheckedChange={(v) => toggleRule(rule, v)} aria-label={`Turn ${rule.name} on`} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(rule); setPreview(null); }}>Edit</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runPreview(rule)}>Preview who matches</Button>
                {!readOnly && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => removeRule(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>
          ))}
          {!rules.length && <p className="text-sm text-slate-500">No rules for this brand yet.</p>}
        </div>

        <div className="space-y-4">
          {editing && (
            <RuleEditor
              rule={editing}
              readOnly={readOnly}
              busy={busy}
              previewFields={previewFields}
              onChange={setEditing}
              onSave={() => saveRule(editing)}
            />
          )}
          {preview && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">Preview · {preview.rule.name}</h3>
              <p className="mt-1 text-xs text-slate-500">Nothing was sent. Brand mode right now: {preview.mode}. Leads already past the timer when the rule was turned on: {preview.already_past}. They are skipped unless “Include leads already waiting” is on.</p>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {!preview.matches?.length && <p className="text-sm text-slate-500">Nobody is due for this rule right now.</p>}
                {preview.matches?.map((m, i) => (
                  <div key={`${m.lead_id}-${m.channel}-${i}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-medium text-slate-900">{m.name} <span className="font-normal text-slate-500">· {CHANNEL_LABEL[m.channel] || m.channel} · {outcomeLabel(m)}</span></p>
                    {m.reason && <p className="text-xs text-slate-500">{m.reason}</p>}
                    {m.subject && <p className="text-xs text-slate-700">{m.subject}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900">Recent activity</h3>
            <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
              {!log.length && <p className="text-slate-500">Nothing logged yet.</p>}
              {log.map((row) => (
                <div key={row.id} className="flex items-start gap-2 py-2">
                  <Badge className={`mt-0.5 h-5 px-1.5 text-[10px] ${STATUS_STYLE[row.status] || ""}`}>{(row.status || "").replace("_", " ")}</Badge>
                  <div className="min-w-0">
                    <p className="text-slate-800">{CHANNEL_LABEL[row.channel] || row.channel}{row.subject ? ` · ${row.subject}` : ""}</p>
                    <p className="text-xs text-slate-500">{row.created_at ? format(new Date(row.created_at), "MMM d, h:mm a") : ""}{row.reason ? ` · ${row.reason}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({ rule, readOnly, busy, previewFields, onChange, onSave }) {
  const set = (patch) => onChange({ ...rule, ...patch });
  const minutes = Number(rule.minutes_before) || 0;
  const apptAmount = minutes % 60 === 0 ? minutes / 60 : minutes;
  const apptUnit = minutes % 60 === 0 ? "hours" : "minutes";
  const actions = [
    ["send_email", "Email the customer"],
    ["send_sms", "Text the customer"],
    ["create_todo", "Create a to-do for the rep"],
  ];
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-slate-900">{rule.id ? "Edit rule" : "New rule"}</h3>
      <div>
        <Label className="text-xs">Name</Label>
        <Input className="mt-1" value={rule.name || ""} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} />
      </div>
      {rule.kind === "stage_idle" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label className="text-xs">Stage</Label>
            <Select value={rule.lead_stage || ""} onValueChange={(v) => set({ lead_stage: v })} disabled={readOnly}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Wait</Label>
            <Input className="mt-1" type="number" min="1" value={rule.idle_amount || ""} disabled={readOnly} onChange={(e) => set({ idle_amount: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <Select value={rule.idle_unit || "hours"} onValueChange={(v) => set({ idle_unit: v })} disabled={readOnly}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">hours</SelectItem>
                <SelectItem value="days">days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">How long before</Label>
            <Input className="mt-1" type="number" min="1" value={apptAmount || ""} disabled={readOnly} onChange={(e) => {
              const n = Number(e.target.value);
              set({ minutes_before: apptUnit === "hours" ? n * 60 : n });
            }} />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <Select value={apptUnit} disabled={readOnly} onValueChange={(unit) => set({ minutes_before: unit === "hours" ? (apptUnit === "hours" ? minutes : apptAmount * 60) : (apptUnit === "minutes" ? minutes : apptAmount) })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">hours</SelectItem>
                <SelectItem value="minutes">minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {rule.kind === "stage_idle" && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <Checkbox checked={!!rule.catch_up} disabled={readOnly} onCheckedChange={(v) => set({ catch_up: !!v })} className="mt-0.5" />
          <span>Include leads already waiting. Off by default, so turning this on does not message everyone who has been sitting in the stage.</span>
        </label>
      )}

      <div className="space-y-2">
        {actions.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={!!rule[key]} disabled={readOnly} onCheckedChange={(v) => set({ [key]: !!v })} /> {label}
          </label>
        ))}
        {rule.kind === "appointment" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={!!rule.notify_rep} disabled={readOnly} onCheckedChange={(v) => set({ notify_rep: !!v })} /> Also notify the assigned rep
          </label>
        )}
      </div>
      {rule.notify_rep && (
        <Select value={rule.notify_rep_channel || "email"} disabled={readOnly} onValueChange={(v) => set({ notify_rep_channel: v })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email the rep</SelectItem>
            <SelectItem value="sms">Text the rep</SelectItem>
            <SelectItem value="both">Email and text the rep</SelectItem>
          </SelectContent>
        </Select>
      )}

      {rule.send_email && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Customer email</p>
          <MessageBodyEditor channel="email" value={{ subject: rule.email_subject || "", body: rule.email_body || "" }} previewFields={previewFields} showTemplates={false} onChange={(v) => set({ email_subject: v.subject, email_body: v.body })} />
        </div>
      )}
      {rule.send_sms && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Customer text</p>
          <MessageBodyEditor channel="sms" value={{ subject: "", body: rule.sms_body || "" }} previewFields={previewFields} showTemplates={false} onChange={(v) => set({ sms_body: v.body })} />
        </div>
      )}
      {rule.create_todo && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">To-do</p>
          <Input value={rule.todo_title || ""} disabled={readOnly} onChange={(e) => set({ todo_title: e.target.value })} placeholder="Title" />
          <Textarea rows={2} value={rule.todo_notes || ""} disabled={readOnly} onChange={(e) => set({ todo_notes: e.target.value })} placeholder="Notes" />
          <p className="text-xs text-slate-500">Preview: {renderPreview(rule.todo_title || "", previewFields)}</p>
        </div>
      )}
      {rule.notify_rep && (rule.notify_rep_channel === "email" || rule.notify_rep_channel === "both") && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Rep email</p>
          <MessageBodyEditor channel="email" value={{ subject: rule.rep_email_subject || "", body: rule.rep_email_body || "" }} previewFields={previewFields} showTemplates={false} onChange={(v) => set({ rep_email_subject: v.subject, rep_email_body: v.body })} />
        </div>
      )}
      {rule.notify_rep && (rule.notify_rep_channel === "sms" || rule.notify_rep_channel === "both") && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Rep text</p>
          <MessageBodyEditor channel="sms" value={{ subject: "", body: rule.rep_sms_body || "" }} previewFields={previewFields} showTemplates={false} onChange={(v) => set({ rep_sms_body: v.body })} />
        </div>
      )}

      {!readOnly && <Button onClick={onSave} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save rule</Button>}
    </div>
  );
}
