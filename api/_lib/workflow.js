// Drip workflows: a tree of nodes stored on message_sequences.workflow
// (058_messaging_workflows.sql). The editor's copy of these rules is
// src/lib/workflow.js — keep the two in step.
//
//   { nodes: [ node, … ] }
//   email     { id, type: 'email', subject, body }
//   sms       { id, type: 'sms', body }
//   wait      { id, type: 'wait', minutes }
//   condition { id, type: 'condition', condition: {…}, yes: [nodes], no: [nodes] }
//             — after either branch, the flow carries on below the condition
//   action    { id, type: 'action', action: { kind, … } }
//   end       { id, type: 'end' }

// Drips saved before workflows (message_sequence_steps): each step becomes an
// optional wait + a send. Send nodes keep the step's id, so an enrollment
// part-way through (next_step) can be placed on its node.
function legacyToWorkflow(steps) {
  const nodes = [];
  steps.forEach((s, i) => {
    if (s.delay_minutes > 0 && i > 0) nodes.push({ id: `w-${s.id}`, type: 'wait', minutes: s.delay_minutes });
    nodes.push({ id: s.id, type: s.channel, subject: s.subject || '', body: s.body || '', legacy: true });
  });
  return { nodes };
}

// id → { node, next } where next is the id that runs after it (null = end).
function buildIndex(workflow) {
  const index = new Map();
  const walk = (list, after) => {
    (list || []).forEach((node, i) => {
      const next = list[i + 1]?.id ?? after;
      index.set(node.id, { node, next });
      if (node.type === 'condition') {
        walk(node.yes, next);
        walk(node.no, next);
      }
    });
  };
  walk(workflow?.nodes, null);
  return index;
}

const firstId = (list, fallback) => (list && list.length ? list[0].id : fallback);

function workflowFor(seq, steps) {
  return seq?.workflow?.nodes?.length ? { flow: seq.workflow, legacy: false } : { flow: legacyToWorkflow(steps), legacy: true };
}

// Where an enrollment is. Older enrollments only have next_step.
// null = nothing left (finished, or the node they were on was deleted).
function startNode(e, flow, index, steps) {
  if (e.current_node) return index.has(e.current_node) ? e.current_node : null;
  // Pre-workflow enrollment: its step's send node (the step's delay was
  // already waited out before it came due).
  const stepId = steps[e.next_step]?.id;
  if (stepId && index.has(stepId)) return stepId;
  return e.next_step === 0 ? firstId(flow.nodes, null) : null;
}

function fieldValue(ctx, field) {
  const { lead, client, project } = ctx;
  const map = {
    lead_source: lead?.lead_source,
    project_type: lead?.project_type,
    assigned_sales_rep: lead?.assigned_sales_rep,
    email: lead?.email || client?.email,
    phone: lead?.phone || client?.phone,
    address: lead?.property_address || lead?.address || client?.address,
    estimated_budget: lead?.estimated_budget,
    client_status: client?.status,
    project_status: project?.status,
  };
  return map[field];
}

function compare(actual, op, expected) {
  const a = actual == null ? '' : String(actual).trim().toLowerCase();
  const b = expected == null ? '' : String(expected).trim().toLowerCase();
  switch (op) {
    case 'is_empty': return !a;
    case 'is_not_empty': return !!a;
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    case 'contains': return !!b && a.includes(b);
    case 'not_contains': return !b || !a.includes(b);
    case 'greater_than': return Number(actual) > Number(expected);
    case 'less_than': return Number(actual) < Number(expected);
    default: return false;
  }
}

module.exports = { legacyToWorkflow, buildIndex, firstId, workflowFor, startNode, fieldValue, compare };
