// The built-in change order document, used when no contract template is
// picked in the Send dialog. It's a 'text' mode body like any in-app contract
// template: {{change_order.*}} and the other merge fields are filled in by
// renderContractTemplate(), and "**signature**" is where DocuSign places the
// owner's signature. Sections with nothing to show (no line items) are left
// out rather than printed empty.
export function defaultChangeOrderBody(changeOrder, { alwaysShowItems = false } = {}) {
  const hasItems = alwaysShowItems || (changeOrder?.line_items || []).some((li) => (li.description || "").trim() || Number(li.amount));
  return [
    "CHANGE ORDER {{change_order.number}}",
    "{{company.name}}",
    "{{company.address}}",
    "{{company.phone}}",
    "",
    "Date: {{change_order.date}}",
    "Project: {{project.name}}",
    "Project address: {{project.address}}",
    "Owner: {{client.name}}",
    "",
    "{{change_order.title}}",
    "",
    "Description of change:",
    "{{change_order.description}}",
    "",
    ...(hasItems ? ["Line items:", "{{change_order.line_items}}", ""] : []),
    "Change order amount: {{change_order.amount}}",
    "Schedule impact: {{change_order.schedule_days}}",
    "",
    "Contract total before this change order: {{change_order.previous_contract_total}}",
    "New contract total: {{change_order.new_contract_total}}",
    "",
    "By signing below, the Owner authorizes {{company.name}} to perform the work described above. The contract price and schedule are adjusted as shown. All other terms of the original contract remain in effect.",
    "",
    "",
    "Owner signature: **signature**",
  ].join("\n");
}

// Starting text for a new template in Settings → Templates → Change Order
// Templates: the same document, with the line items section always present.
export const STANDARD_CHANGE_ORDER_TEMPLATE = defaultChangeOrderBody(null, { alwaysShowItems: true });
