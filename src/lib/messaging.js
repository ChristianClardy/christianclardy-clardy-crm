// Shared bits for Messaging & Automations (src/pages/Automations.jsx,
// src/components/messaging/*). The server side is api/_lib/messaging.js;
// merge fields must match its loadContext().fields.
import { apiFetch } from "@/lib/apiFetch";
import { supabase } from "@/lib/supabase";
import { LEAD_STAGES } from "@/lib/leadStages";
import { PROJECT_STATUSES } from "@/components/projects/ProjectStatusPicker";

export const MERGE_FIELDS = [
  { key: "first_name",      label: "First name",      sample: "Jordan" },
  { key: "last_name",       label: "Last name",       sample: "Rivera" },
  { key: "full_name",       label: "Full name",       sample: "Jordan Rivera" },
  { key: "address",         label: "Address",         sample: "1428 Elm St" },
  { key: "stage",           label: "Lead stage",      sample: "Quote Delivered/Price Locked" },
  { key: "project_type",    label: "Project type",    sample: "Pool & patio" },
  { key: "rep_name",        label: "Sales rep / PM",  sample: "Chris" },
  { key: "project_name",    label: "Project name",    sample: "Rivera Backyard" },
  { key: "project_status",  label: "Project status",  sample: "in progress" },
  { key: "company_name",    label: "Company name",    sample: "Principle Outdoor Living" },
  { key: "company_phone",   label: "Company phone",   sample: "(555) 010-2030" },
  { key: "company_email",   label: "Company email",   sample: "hello@example.com" },
  { key: "company_website", label: "Company website", sample: "example.com" },
  { key: "today",           label: "Today's date",    sample: "October 5, 2026" },
];
const SAMPLE = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample]));

export function renderPreview(text, fields = SAMPLE) {
  return String(text || "").replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, key, fallback) => {
    const v = fields[key.toLowerCase()];
    return v != null && String(v).trim() !== "" ? String(v) : (fallback || "").trim();
  });
}

// GSM-7 texts are 160 characters per segment (153 when split); anything with
// emoji/curly quotes drops to 70 (67). Twilio bills per segment.
export function smsSegments(text) {
  const t = String(text || "");
  if (!t) return { chars: 0, segments: 0 };
  const unicode = /[^\n\r !-~£¥èéùìòÇØøÅå_ÆæßÉ¡ÄÖÑÜ§¿äöñüà€]/.test(t);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { chars: t.length, segments: t.length <= single ? 1 : Math.ceil(t.length / multi), unicode };
}

export const TRIGGERS = [
  { key: "lead_created",   label: "New lead created",      hint: "Starts the moment a lead is added: the app, the website form, imports." },
  { key: "lead_stage",     label: "Lead enters a stage",   hint: "Starts when a lead moves into the stage you pick." },
  { key: "project_status", label: "Project status changes", hint: "Starts when a project is set to the status you pick (new projects too)." },
  { key: "manual",         label: "Manual only",           hint: "Only people you add by hand from a lead or client page." },
];
export const TRIGGER_LABEL = Object.fromEntries(TRIGGERS.map((t) => [t.key, t.label]));
export const TRIGGER_VALUES = {
  lead_stage: LEAD_STAGES.map((s) => ({ value: s, label: s })),
  project_status: PROJECT_STATUSES.map((s) => ({ value: s.key, label: s.label })),
};
export const triggerSummary = (seq) => {
  const label = TRIGGER_LABEL[seq.trigger_type] || seq.trigger_type;
  if (seq.trigger_type === "project_status") {
    return `${label}: ${PROJECT_STATUSES.find((s) => s.key === seq.trigger_value)?.label || seq.trigger_value || "—"}`;
  }
  return seq.trigger_type === "lead_stage" ? `${label}: ${seq.trigger_value || "—"}` : label;
};

export const DELAY_UNITS = [
  { key: "minutes", label: "minutes", mins: 1 },
  { key: "hours",   label: "hours",   mins: 60 },
  { key: "days",    label: "days",    mins: 1440 },
];
export function splitDelay(minutes = 0) {
  if (minutes && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes || 0, unit: "minutes" };
}
export const toMinutes = (amount, unit) => Math.max(0, Math.round(Number(amount || 0) * (DELAY_UNITS.find((u) => u.key === unit)?.mins || 1)));
export function describeDelay(minutes, first) {
  if (!minutes) return first ? "Immediately" : "Right after the previous step";
  const { amount, unit } = splitDelay(minutes);
  const u = amount === 1 ? unit.slice(0, -1) : unit;
  return `${amount} ${u} ${first ? "after enrolling" : "later"}`;
}

export const STATUS_STYLE = {
  sent:       "bg-slate-100 text-slate-700",
  delivered:  "bg-emerald-100 text-emerald-700",
  opened:     "bg-blue-100 text-blue-700",
  clicked:    "bg-indigo-100 text-indigo-700",
  received:   "bg-amber-100 text-amber-800",
  bounced:    "bg-rose-100 text-rose-700",
  complained: "bg-rose-100 text-rose-700",
  failed:     "bg-rose-100 text-rose-700",
  skipped:    "bg-slate-100 text-slate-500",
};

async function call(action, { method = "GET", body } = {}) {
  const res = await apiFetch(`/api/cron?action=${action}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const messagingApi = {
  status: () => call("messaging-status"),
  send: (body) => call("messaging-send", { method: "POST", body }),
  broadcast: (body) => call("messaging-broadcast", { method: "POST", body }),
  runQueue: () => call("messaging-tick"),
};

// Every row of a table (Supabase caps one request at 1,000), for audiences
// that must not silently stop at the first page.
export async function fetchAll(table, columns = "*", orderBy = "id") {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(orderBy).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}
