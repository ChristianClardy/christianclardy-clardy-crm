// Drip workflow trees for the visual builder (src/components/messaging/
// Workflow*.jsx). Stored on message_sequences.workflow; the sender's copy of
// these rules is api/_lib/workflow.js — keep the two in step.
import { LEAD_STAGES } from "@/lib/leadStages";
import { splitDelay } from "@/lib/messaging";

export const newNodeId = () => `n_${Math.random().toString(36).slice(2, 10)}`;

export const CONDITION_KINDS = [
  { key: "email_opened",  label: "Opened an email" },
  { key: "email_clicked", label: "Clicked a link in an email" },
  { key: "replied",       label: "Replied (text or logged reply)" },
  { key: "lead_stage",    label: "Lead is in stage" },
  { key: "field",         label: "A field matches" },
];

export const CONDITION_FIELDS = [
  { key: "lead_source",        label: "Lead source" },
  { key: "project_type",       label: "Project type" },
  { key: "assigned_sales_rep", label: "Sales rep" },
  { key: "estimated_budget",   label: "Estimated budget" },
  { key: "email",              label: "Email" },
  { key: "phone",              label: "Phone" },
  { key: "address",            label: "Address" },
  { key: "client_status",      label: "Client status" },
  { key: "project_status",     label: "Project status" },
];

export const FIELD_OPS = [
  { key: "equals",       label: "is",                 needsValue: true },
  { key: "not_equals",   label: "is not",             needsValue: true },
  { key: "contains",     label: "contains",           needsValue: true },
  { key: "not_contains", label: "doesn't contain",    needsValue: true },
  { key: "is_empty",     label: "is empty",           needsValue: false },
  { key: "is_not_empty", label: "is filled in",       needsValue: false },
  { key: "greater_than", label: "is more than",       needsValue: true },
  { key: "less_than",    label: "is less than",       needsValue: true },
];

export const ACTION_KINDS = [
  { key: "set_stage",   label: "Change lead stage" },
  { key: "create_task", label: "Create a to-do" },
  { key: "notify",      label: "Notify someone" },
  { key: "enroll",      label: "Add to another drip" },
];

// What the "+" menu offers.
export const NODE_MENU = [
  { group: "Messages", items: [
    { key: "email", label: "Send email" },
    { key: "sms",   label: "Send text" },
  ]},
  { group: "Timing & logic", items: [
    { key: "wait",      label: "Wait" },
    { key: "condition", label: "If / else" },
  ]},
  { group: "Actions", items: [
    { key: "action:set_stage",   label: "Change lead stage" },
    { key: "action:create_task", label: "Create a to-do" },
    { key: "action:notify",      label: "Notify someone" },
    { key: "action:enroll",      label: "Add to another drip" },
    { key: "end",                label: "End drip" },
  ]},
];

export function makeNode(key) {
  const id = newNodeId();
  if (key === "email") return { id, type: "email", subject: "", body: "" };
  if (key === "sms") return { id, type: "sms", body: "" };
  if (key === "wait") return { id, type: "wait", minutes: 1440 };
  if (key === "condition") return { id, type: "condition", condition: { kind: "email_opened", scope: "last" }, yes: [], no: [] };
  if (key === "end") return { id, type: "end" };
  const kind = key.split(":")[1];
  const defaults = {
    set_stage: { value: LEAD_STAGES[2] },
    create_task: { title: "Call {{full_name}}", notes: "", due_days: 0, assign: "rep", priority: "medium" },
    notify: { to: "rep", title: "{{full_name}} needs attention", message: "" },
    enroll: { sequence_id: "" },
  };
  return { id, type: "action", action: { kind, ...(defaults[kind] || {}) } };
}

// Drips saved before workflows. Matches the sender's legacyToWorkflow, so
// people part-way through stay on the same send.
export function legacyToWorkflow(steps) {
  const nodes = [];
  steps.forEach((s, i) => {
    if (s.delay_minutes > 0 && i > 0) nodes.push({ id: `w-${s.id}`, type: "wait", minutes: s.delay_minutes });
    nodes.push({ id: s.id, type: s.channel, subject: s.subject || "", body: s.body || "" });
  });
  return { nodes };
}

// `steps` = this drip's message_sequence_steps, in order.
export const workflowOf = (seq, steps = []) => (seq?.workflow?.nodes?.length ? seq.workflow : legacyToWorkflow(steps));

// ─── Tree edits (all return a new workflow) ─────────────────────────────────
// A list is addressed by key: "root", or "<conditionId>:yes" / ":no".

function mapLists(nodes, listKey, fn, key = "root") {
  const here = key === listKey ? fn(nodes) : nodes;
  return here.map((n) => (n.type === "condition"
    ? { ...n, yes: mapLists(n.yes || [], listKey, fn, `${n.id}:yes`), no: mapLists(n.no || [], listKey, fn, `${n.id}:no`) }
    : n));
}

export function insertNode(flow, listKey, index, node) {
  return { ...flow, nodes: mapLists(flow.nodes, listKey, (list) => [...list.slice(0, index), node, ...list.slice(index)]) };
}

function mapNodes(nodes, fn) {
  return nodes.flatMap((n) => {
    const out = fn(n);
    if (!out) return [];
    return out.type === "condition" ? [{ ...out, yes: mapNodes(out.yes || [], fn), no: mapNodes(out.no || [], fn) }] : [out];
  });
}

export const updateNode = (flow, id, patch) => ({ ...flow, nodes: mapNodes(flow.nodes, (n) => (n.id === id ? { ...n, ...patch } : n)) });
export const removeNode = (flow, id) => ({ ...flow, nodes: mapNodes(flow.nodes, (n) => (n.id === id ? null : n)) });

export function moveNode(flow, id, dir) {
  const move = (list) => {
    const i = list.findIndex((n) => n.id === id);
    if (i < 0) return list.map((n) => (n.type === "condition" ? { ...n, yes: move(n.yes || []), no: move(n.no || []) } : n));
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  return { ...flow, nodes: move(flow.nodes) };
}

// Copies a node (and a condition's branches) with fresh ids, placed after it.
export function duplicateNode(flow, id) {
  const clone = (n) => ({ ...n, id: newNodeId(), ...(n.type === "condition" ? { yes: (n.yes || []).map(clone), no: (n.no || []).map(clone) } : {}) });
  const dup = (list) => list.flatMap((n) => {
    const kept = n.type === "condition" ? { ...n, yes: dup(n.yes || []), no: dup(n.no || []) } : n;
    return n.id === id ? [kept, clone(n)] : [kept];
  });
  return { ...flow, nodes: dup(flow.nodes) };
}

export function findNode(flow, id) {
  let found = null;
  const walk = (list) => list.forEach((n) => {
    if (n.id === id) found = n;
    if (n.type === "condition") { walk(n.yes || []); walk(n.no || []); }
  });
  walk(flow?.nodes || []);
  return found;
}

export function flattenNodes(flow) {
  const out = [];
  const walk = (list) => list.forEach((n) => { out.push(n); if (n.type === "condition") { walk(n.yes || []); walk(n.no || []); } });
  walk(flow?.nodes || []);
  return out;
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export function describeWait(minutes) {
  if (!minutes) return "No wait";
  const { amount, unit } = splitDelay(minutes);
  return `Wait ${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

export function describeCondition(c = {}) {
  if (c.kind === "email_opened") return `Opened ${c.scope === "any" ? "any email" : "the last email"}?`;
  if (c.kind === "email_clicked") return `Clicked ${c.scope === "any" ? "any email" : "the last email"}?`;
  if (c.kind === "replied") return "Have they replied?";
  if (c.kind === "lead_stage") return (c.values || []).length ? `Lead stage is ${(c.values || []).join(" or ")}?` : "Lead stage is…?";
  if (c.kind === "field") {
    const field = CONDITION_FIELDS.find((f) => f.key === c.field)?.label || "Field";
    const op = FIELD_OPS.find((o) => o.key === c.op);
    return `${field} ${op?.label || "…"}${op?.needsValue ? ` "${c.value || ""}"` : ""}?`;
  }
  return "Condition";
}

export function describeAction(a = {}, sequences = []) {
  if (a.kind === "set_stage") return `Move lead to "${a.value || "…"}"`;
  if (a.kind === "create_task") return `To-do: ${a.title || "…"}${a.due_days ? ` (due in ${a.due_days}d)` : ""}`;
  if (a.kind === "notify") return `Notify ${a.to === "rep" ? "the sales rep" : a.to || "…"}`;
  if (a.kind === "enroll") return `Add to "${sequences.find((s) => s.id === a.sequence_id)?.name || "…"}"`;
  return "Action";
}

// Problems that block saving, as [{ id, message }].
export function validateWorkflow(flow) {
  const problems = [];
  for (const n of flattenNodes(flow)) {
    if (n.type === "email" && (!n.subject?.trim() || !n.body?.trim())) problems.push({ id: n.id, message: "Email needs a subject and a message." });
    if (n.type === "sms" && !n.body?.trim()) problems.push({ id: n.id, message: "Text needs a message." });
    if (n.type === "condition") {
      const c = n.condition || {};
      if (c.kind === "lead_stage" && !(c.values || []).length) problems.push({ id: n.id, message: "Pick at least one stage." });
      if (c.kind === "field" && (!c.field || !c.op || (FIELD_OPS.find((o) => o.key === c.op)?.needsValue && !String(c.value ?? "").trim()))) {
        problems.push({ id: n.id, message: "Finish the field condition." });
      }
    }
    if (n.type === "action") {
      const a = n.action || {};
      if (a.kind === "set_stage" && !a.value) problems.push({ id: n.id, message: "Pick a stage." });
      if (a.kind === "create_task" && !a.title?.trim()) problems.push({ id: n.id, message: "The to-do needs a title." });
      if (a.kind === "notify" && !a.to) problems.push({ id: n.id, message: "Pick who to notify." });
      if (a.kind === "enroll" && !a.sequence_id) problems.push({ id: n.id, message: "Pick a drip." });
    }
  }
  if (!flattenNodes(flow).some((n) => n.type === "email" || n.type === "sms" || n.type === "action")) {
    problems.push({ id: null, message: "Add at least one email, text or action." });
  }
  return problems;
}

// Live numbers for the canvas: people sitting at each node, and sends /
// opens / clicks per message node. Older enrollments and messages are placed
// by step (legacy node ids are step ids).
export function computeNodeStats(enrollments, messages, steps = []) {
  const stats = { enrolled: enrollments.length, completed: 0 };
  const bump = (id, key) => {
    if (!id) return;
    stats[id] ||= {};
    stats[id][key] = (stats[id][key] || 0) + 1;
  };
  for (const e of enrollments) {
    if (e.status === "completed") stats.completed++;
    if (e.status !== "active") continue;
    bump(e.current_node || steps[e.next_step]?.id, "here");
  }
  for (const m of messages) {
    if (m.direction !== "outbound") continue;
    const id = m.node_id || m.step_id;
    if (m.status === "skipped") continue;
    if (m.status === "failed" || m.status === "bounced") { bump(id, "failed"); continue; }
    bump(id, "sent");
    if (m.status === "opened" || m.status === "clicked" || m.opened_at) bump(id, "opened");
    if (m.status === "clicked") bump(id, "clicked");
  }
  return stats;
}
