import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import OverdueAppointmentDialog from "./OverdueAppointmentDialog";

const POLL_INTERVAL_MS = 60000;
const RESOLVED_STATUSES = ["completed", "cancelled"];
const DISMISSED_KEY = "overdueAppointmentGate.dismissedIds";

// sessionStorage, not localStorage — dismissals should only last the current
// browser session, not follow the user across logins/days.
function loadDismissedIds() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveDismissedIds(ids) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // sessionStorage unavailable — dismissals just won't persist across nav
  }
}

export default function OverdueAppointmentGate() {
  const [activeEvent, setActiveEvent] = useState(null);
  // Mirrors activeEvent but readable synchronously inside refresh() — avoids
  // a background poll swapping out the appointment the user is mid-flow on.
  const activeEventRef = useRef(null);
  const dismissedIdsRef = useRef(loadDismissedIds());

  const refresh = async () => {
    let me;
    try {
      me = await base44.auth.me();
    } catch {
      return; // not authenticated
    }

    try {
      // Ascending (oldest first) so that if the fetch limit is ever hit, it's
      // the newest events that get left out — not old, still-unresolved
      // appointments from months ago, which is exactly what must not happen.
      const [events, employees] = await Promise.all([
        base44.entities.CalendarEvent.list("start_datetime", 500),
        base44.entities.Employee.list("full_name", 500),
      ]);
      const currentUserName = employees.find((e) => e.email === me.email)?.full_name || me.full_name || "";
      if (!currentUserName) return;

      const now = new Date();
      const overdue = (events || [])
        .filter((event) =>
          (event.assigned_users || []).includes(currentUserName) &&
          !RESOLVED_STATUSES.includes(event.status) &&
          !dismissedIdsRef.current.has(event.id) &&
          new Date(event.end_datetime || event.start_datetime) < now
        )
        .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

      // Only claim a new active event if nothing is currently being shown —
      // this is what keeps the modal from being yanked away by the next poll
      // mid-flow (e.g. while the user is on the lead-stage step).
      if (!activeEventRef.current) {
        const next = overdue[0] || null;
        activeEventRef.current = next;
        setActiveEvent(next);
      }
    } catch (err) {
      console.error("Failed to check for overdue appointments:", err?.message);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const advance = () => {
    activeEventRef.current = null;
    setActiveEvent(null);
    refresh();
  };

  // Resolved (Completed/Cancelled/Rescheduled) never needs to come back, so
  // it doesn't need to go in the dismissed set — the overdue query itself
  // won't match it again.
  const handleResolved = () => advance();

  // Dismissed just means "not this session" — it's still genuinely overdue,
  // so it has to be excluded explicitly or the next poll would reclaim it.
  const handleDismiss = () => {
    if (activeEventRef.current) {
      dismissedIdsRef.current.add(activeEventRef.current.id);
      saveDismissedIds(dismissedIdsRef.current);
    }
    advance();
  };

  if (!activeEvent) return null;

  return <OverdueAppointmentDialog event={activeEvent} onResolved={handleResolved} onDismiss={handleDismiss} />;
}
