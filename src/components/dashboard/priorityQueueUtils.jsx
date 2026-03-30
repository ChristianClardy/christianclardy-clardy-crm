import { addDays, format, isPast, isToday, isTomorrow, parseISO } from "date-fns";

const priorityRank = { high: 0, medium: 1, low: 2 };
const groupOrder = ["overdue", "today", "upcoming", "later", "no_date"];

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

const parseDate = (value) => value ? parseISO(`${value}T00:00:00`) : null;

export function getQueueGroupKey(item) {
  const dueDate = parseDate(item.due_date);
  if (!dueDate) return "no_date";
  if (!isToday(dueDate) && isPast(dueDate)) return "overdue";
  if (isToday(dueDate)) return "today";
  if (dueDate <= addDays(new Date(), 7)) return "upcoming";
  return "later";
}

export function formatDueLabel(value) {
  const dueDate = parseDate(value);
  if (!dueDate) return "No due date";
  if (!isToday(dueDate) && isPast(dueDate)) return `Overdue · ${format(dueDate, "MMM d")}`;
  if (isToday(dueDate)) return `Today · ${format(dueDate, "MMM d")}`;
  if (isTomorrow(dueDate)) return `Tomorrow · ${format(dueDate, "MMM d")}`;
  return format(dueDate, "EEE, MMM d");
}

export function sortQueueItems(items = []) {
  return [...items].sort((a, b) => {
    if (Boolean(a.completed) !== Boolean(b.completed)) return Number(a.completed) - Number(b.completed);

    const groupDiff = groupOrder.indexOf(getQueueGroupKey(a)) - groupOrder.indexOf(getQueueGroupKey(b));
    if (groupDiff !== 0) return groupDiff;

    const aDate = parseDate(a.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDate = parseDate(b.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDate !== bDate) return aDate - bDate;

    const priorityDiff = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
    if (priorityDiff !== 0) return priorityDiff;

    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

export function groupQueueItems(items = []) {
  const labels = {
    overdue: "Overdue",
    today: "Today",
    upcoming: "Next 7 Days",
    later: "Later",
    no_date: "No Due Date",
  };

  return groupOrder
    .map((key) => ({ key, label: labels[key], items: items.filter((item) => getQueueGroupKey(item) === key) }))
    .filter((group) => group.items.length > 0);
}

export function buildPriorityQueueEmailBody({ items = [], ownerName = "Your" }) {
  const groups = groupQueueItems(items);
  const openCount = items.filter((item) => !item.completed).length;

  return [
    `${ownerName} Priority Queue`,
    format(new Date(), "EEEE, MMMM d, yyyy · h:mm a"),
    "",
    `Open items: ${openCount}`,
    "Here’s your current queue snapshot:",
    "",
    ...groups.flatMap((group) => [
      `━━━━━━━━━━━━━━━━━━━━`,
      `${group.label.toUpperCase()} (${group.items.length})`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ...group.items.flatMap((item) => {
        const lines = [
          `• ${item.title || "Untitled task"}`,
          `  Due: ${formatDueLabel(item.due_date)}`,
          `  Priority: ${(item.priority || "medium").toUpperCase()}`,
        ];
        if (item.assigned_to) lines.push(`  Assigned to: ${item.assigned_to}`);
        if (item.notes) lines.push(`  Notes: ${item.notes}`);
        return [...lines, ""];
      }),
    ]),
    "Stay focused on the next best move.",
  ].join("\n");
}

export function buildPriorityQueuePrintHtml({ items = [], ownerName = "Your" }) {
  const groups = groupQueueItems(items);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Priority Queue</title>
    <style>
      body { font-family: Georgia, serif; background: #f5f0eb; color: #3d3530; margin: 0; padding: 32px; }
      .sheet { max-width: 900px; margin: 0 auto; background: white; border: 1px solid #ddd5c8; border-radius: 16px; padding: 32px; }
      .header { display: flex; justify-content: space-between; align-items: end; gap: 16px; border-bottom: 1px solid #ddd5c8; padding-bottom: 20px; margin-bottom: 24px; }
      .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #b5965a; margin-bottom: 8px; }
      h1 { margin: 0; font-size: 32px; }
      .meta { color: #7a6e66; font-size: 14px; }
      .group { margin-top: 24px; }
      .group h2 { font-size: 18px; margin: 0 0 12px; }
      .item { border: 1px solid #ddd5c8; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
      .row { display: flex; justify-content: space-between; gap: 12px; }
      .title { font-size: 16px; font-weight: 700; }
      .notes { margin-top: 6px; color: #5a4f48; font-size: 14px; }
      .badges { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
      .badge { border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
      .priority-high { background: #ffe4e6; color: #be123c; }
      .priority-medium { background: #fef3c7; color: #b45309; }
      .priority-low { background: #e2e8f0; color: #475569; }
      .badge-muted { background: #f5f0eb; color: #5a4f48; }
      @media print { body { background: white; padding: 0; } .sheet { border: none; border-radius: 0; padding: 0; } }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <div class="eyebrow">Agenda + To Do</div>
          <h1>Priority Queue</h1>
          <div class="meta">${escapeHtml(ownerName)} task summary</div>
        </div>
        <div class="meta">Printed ${format(new Date(), "MMM d, yyyy h:mm a")}</div>
      </div>
      ${groups.map((group) => `
        <section class="group">
          <h2>${escapeHtml(group.label)}</h2>
          ${group.items.map((item) => `
            <div class="item">
              <div class="row">
                <div class="title">${escapeHtml(item.title || "Untitled task")}</div>
                <div class="meta">${item.completed ? "Completed" : "Open"}</div>
              </div>
              ${item.notes ? `<div class="notes">${escapeHtml(item.notes)}</div>` : ""}
              <div class="badges">
                <span class="badge priority-${escapeHtml(item.priority || "medium")}">${escapeHtml((item.priority || "medium").toUpperCase())}</span>
                <span class="badge badge-muted">${escapeHtml(formatDueLabel(item.due_date))}</span>
                ${item.assigned_to ? `<span class="badge badge-muted">${escapeHtml(item.assigned_to)}</span>` : ""}
              </div>
            </div>
          `).join("")}
        </section>
      `).join("")}
    </div>
    <script>
      window.onload = () => window.print();
    </script>
  </body>
</html>`;
}