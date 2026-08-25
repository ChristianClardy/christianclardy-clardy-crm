// Renders a scope_templates row against an estimate's current line items.
//
// Template body is free text containing two kinds of tokens:
//   {{tag_key}}                        — replaced via template.merge_fields
//   {{#if COST_CODE}}A{{else}}B{{/if}} — A if a line item with that cost
//                                        code exists on the estimate, else B
//                                        ({{else}}...{{/if}} optional)
//
// merge_fields: [{ key, cost_code_id, format }]
//   format: "dimensions" | "quantity" | "cost" | "count" | "raw"

function trimTrailingZero(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(num).replace(/0+$/, "").replace(/\.$/, "");
}

function formatCurrency(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatMatch(item, format) {
  if (!item) return "";
  switch (format) {
    case "dimensions":
      return item.length_ft && item.width_ft
        ? `${trimTrailingZero(item.length_ft)}' x ${trimTrailingZero(item.width_ft)}'`
        : "";
    case "quantity":
      return [item.quantity, item.unit].filter(Boolean).join(" ");
    case "cost":
      return formatCurrency((Number(item.quantity) || 0) * (Number(item.cost_per_unit) || 0));
    case "count":
      return item.quantity != null ? String(item.quantity) : "";
    case "raw":
    default:
      return item.description || "";
  }
}

const IF_BLOCK_RE = /\{\{#if\s+([\w.-]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

export function renderScopeTemplate(template, items, costCodes) {
  if (!template) return "";
  const codeToId = Object.fromEntries((costCodes || []).map((c) => [c.code, c.id]));
  const itemsByCostCodeId = {};
  for (const item of items || []) {
    if (!item.cost_code_id) continue;
    (itemsByCostCodeId[item.cost_code_id] ||= []).push(item);
  }

  let out = template.body || "";

  for (const field of template.merge_fields || []) {
    if (!field.key) continue;
    const match = itemsByCostCodeId[field.cost_code_id]?.[0];
    const token = new RegExp(`\\{\\{\\s*${field.key}\\s*\\}\\}`, "g");
    out = out.replace(token, formatMatch(match, field.format));
  }

  out = out.replace(IF_BLOCK_RE, (_m, code, presentBlock, absentBlock = "") => {
    const costCodeId = codeToId[code];
    const present = Boolean(costCodeId && itemsByCostCodeId[costCodeId]?.length);
    return (present ? presentBlock : absentBlock).trim();
  });

  return out;
}

// Which {{tag}} tokens and {{#if CODE}} conditionals appear in a body, for
// the template editor to flag merge fields that aren't mapped yet.
export function extractTemplateTokens(body) {
  const tags = new Set();
  const codes = new Set();
  for (const m of (body || "").matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (m[1] !== "else") tags.add(m[1]);
  }
  for (const m of (body || "").matchAll(/\{\{#if\s+([\w.-]+)\}\}/g)) {
    codes.add(m[1]);
  }
  return { tags: [...tags], codes: [...codes] };
}
