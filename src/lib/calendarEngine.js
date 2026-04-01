import { addDays, addMonths, addWeeks, differenceInCalendarWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, getDay, isAfter, isBefore, isValid, max, min, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { entryRange } from "@/lib/calendarUtils";

const weekdayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toDate(value) {
  if (!value) return null;
  const parsed = parseISO(String(value));
  return isValid(parsed) ? parsed : null;
}

function toLocalString(date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function getVisibleRange(currentDate, viewMode) {
  if (viewMode === "day") {
    return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
  }

  if (viewMode === "month") {
    return {
      start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
    };
  }

  if (viewMode === "agenda") {
    return { start: startOfDay(currentDate), end: endOfDay(addDays(currentDate, 30)) };
  }

  return {
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  };
}

export function canUserSeeEvent(event, user, currentUserName) {
  if (!event) return false;
  const visibility = event.visibility || "team";
  const assignedUsers = event.assigned_users || [];
  const isOwner = event.created_by === user?.email;
  const isAssigned = currentUserName ? assignedUsers.includes(currentUserName) : false;
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  if (visibility === "company") return true;
  if (visibility === "team") return true; // team events visible to all authenticated users
  return isOwner || isAssigned || isAdmin; // private
}

function buildOccurrence(baseEvent, start, end) {
  return {
    ...baseEvent,
    id: `${baseEvent.id}-${start.getTime()}`,
    source_event_id: baseEvent.id,
    start_datetime: toLocalString(start),
    end_datetime: toLocalString(end),
  };
}

export function expandRecurringEvents(events, rangeStart, rangeEnd) {
  const expanded = [];

  events.forEach((event) => {
    const originalStart = toDate(event.start_datetime);
    const originalEnd = toDate(event.end_datetime);
    if (!originalStart || !originalEnd) return;

    const durationMs = Math.max(30 * 60 * 1000, originalEnd.getTime() - originalStart.getTime());
    const recurrenceType = event.recurrence_type || "none";
    const interval = Number(event.recurrence_interval || 1);
    const recurrenceUntil = toDate(event.recurrence_until) || addMonths(rangeEnd, 12);

    if (recurrenceType === "none") {
      const { start, end } = entryRange(event);
      if (start && end && start <= rangeEnd && end >= rangeStart) {
        expanded.push(buildOccurrence(event, originalStart, originalEnd));
      }
      return;
    }

    if (recurrenceType === "daily") {
      let cursor = originalStart;
      while (!isAfter(cursor, rangeEnd) && !isAfter(cursor, recurrenceUntil)) {
        const occurrenceEnd = new Date(cursor.getTime() + durationMs);
        if (occurrenceEnd >= rangeStart) expanded.push(buildOccurrence(event, cursor, occurrenceEnd));
        cursor = addDays(cursor, interval);
      }
      return;
    }

    if (recurrenceType === "weekly") {
      let cursor = originalStart;
      while (!isAfter(cursor, rangeEnd) && !isAfter(cursor, recurrenceUntil)) {
        const occurrenceEnd = new Date(cursor.getTime() + durationMs);
        if (occurrenceEnd >= rangeStart) expanded.push(buildOccurrence(event, cursor, occurrenceEnd));
        cursor = addWeeks(cursor, interval);
      }
      return;
    }

    if (recurrenceType === "monthly") {
      let cursor = originalStart;
      while (!isAfter(cursor, rangeEnd) && !isAfter(cursor, recurrenceUntil)) {
        const occurrenceEnd = new Date(cursor.getTime() + durationMs);
        if (occurrenceEnd >= rangeStart) expanded.push(buildOccurrence(event, cursor, occurrenceEnd));
        cursor = addMonths(cursor, interval);
      }
      return;
    }

    const allowedDays = (event.recurrence_days || []).length ? event.recurrence_days : [weekdayMap[getDay(originalStart)]];
    eachDayOfInterval({ start: rangeStart, end: min([rangeEnd, recurrenceUntil]) }).forEach((day) => {
      const weekday = weekdayMap[getDay(day)];
      if (!allowedDays.includes(weekday)) return;
      const weekDiff = differenceInCalendarWeeks(day, originalStart, { weekStartsOn: 1 });
      if (weekDiff < 0 || weekDiff % interval !== 0) return;
      const occurrenceStart = new Date(day);
      occurrenceStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
      expanded.push(buildOccurrence(event, occurrenceStart, occurrenceEnd));
    });
  });

  return expanded.sort((a, b) => String(a.start_datetime || "").localeCompare(String(b.start_datetime || "")));
}

export function groupAgendaEntries(entries) {
  const grouped = {};
  entries.forEach((entry) => {
    const key = format(toDate(entry.start_datetime || entry.start_date), "yyyy-MM-dd");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  });
  return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
}

export function filterBySearch(entries, search) {
  if (!search) return entries;
  const query = search.toLowerCase();
  return entries.filter((entry) => [entry.title, entry.description, entry.location, entry.project_name, entry.client_name, entry.assignee].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
}