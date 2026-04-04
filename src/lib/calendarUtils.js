import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";

const WEEK_STARTS_ON = 0;

export function parseDateTime(value, isEnd = false) {
  if (!value) return null;
  const parsed = parseISO(value);
  if (!isValid(parsed)) return null;
  const raw = String(value);
  if (raw.length <= 10) {
    return isEnd ? endOfDay(parsed) : startOfDay(parsed);
  }
  return parsed;
}

export function entryRange(entry) {
  const startValue = entry.start_datetime || entry.start_date;
  const endValue = entry.end_datetime || entry.end_date || startValue;
  return {
    start: parseDateTime(startValue, false),
    end: parseDateTime(endValue, true),
  };
}

export function entryOverlapsDay(entry, day) {
  const { start, end } = entryRange(entry);
  if (!start || !end) return false;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return start <= dayEnd && end >= dayStart;
}

export function buildWeekDays(currentDate) {
  const start = startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
  return eachDayOfInterval({ start, end });
}

export function buildMonthWeeks(currentDate) {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON });
  const days = eachDayOfInterval({ start, end });
  const weeks = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

export function shiftCalendarDate(currentDate, viewMode, direction) {
  if (viewMode === "month") {
    return direction === "next" ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
  }

  if (viewMode === "day") {
    return direction === "next" ? addDays(currentDate, 1) : addDays(currentDate, -1);
  }

  if (viewMode === "agenda") {
    return direction === "next" ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1);
  }

  return direction === "next" ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1);
}

export function getRangeLabel(currentDate, viewMode) {
  if (viewMode === "month") {
    return format(currentDate, "MMMM yyyy");
  }

  if (viewMode === "day") {
    return format(currentDate, "EEEE, MMMM d, yyyy");
  }

  if (viewMode === "agenda") {
    return `${format(currentDate, "MMM d")} – ${format(addDays(currentDate, 30), "MMM d, yyyy")}`;
  }

  const days = buildWeekDays(currentDate);
  return `${format(days[0], "MMM d")} – ${format(days[days.length - 1], "MMM d, yyyy")}`;
}

export function isOutsideCurrentMonth(day, currentDate) {
  return !isSameMonth(day, currentDate);
}

export function sortEntries(entries) {
  return [...entries].sort((left, right) => String(left.start_datetime || left.start_date || "").localeCompare(String(right.start_datetime || right.start_date || "")));
}

function formatUtcStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDateOnly(value) {
  return format(new Date(value), "yyyyMMdd");
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildIcsFile(name, entries) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Base44//Project Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  entries.forEach((entry, index) => {
    const startValue = entry.start_datetime || entry.start_date;
    const endValue = entry.end_datetime || entry.end_date || startValue;
    if (!startValue || !endValue) return;

    const isAllDay = String(startValue).length <= 10 && String(endValue).length <= 10;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcs(entry.id || `${name}-${index}`)}@base44`);
    lines.push(`SUMMARY:${escapeIcs(entry.title || entry.task || "Calendar Item")}`);

    if (entry.description) lines.push(`DESCRIPTION:${escapeIcs(entry.description)}`);
    if (entry.location) lines.push(`LOCATION:${escapeIcs(entry.location)}`);

    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(startValue)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(addDays(new Date(endValue), 1))}`);
    } else {
      lines.push(`DTSTART:${formatUtcStamp(startValue)}`);
      lines.push(`DTEND:${formatUtcStamp(endValue)}`);
    }

    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcsFile(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}