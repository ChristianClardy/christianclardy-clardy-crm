import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import OverdueAppointmentDialog from "./OverdueAppointmentDialog";

const POLL_INTERVAL_MS = 60000;
const RESOLVED_STATUSES = ["completed", "cancelled"];

export default function OverdueAppointmentGate() {
  const [activeEvent, setActiveEvent] = useState(null);
  // Mirrors activeEvent but readable synchronously inside refresh() — avoids
  // a background poll swapping out the appointment the user is mid-flow on.
  const activeEventRef = useRef(null);

  const refresh = async () => {
    let me;
    try {
      me = await base44.auth.me();
    } catch {
      return; // not authenticated
    }

    try {
      const [events, employees] = await Promise.all([
        base44.entities.CalendarEvent.list("-start_datetime", 300),
        base44.entities.Employee.list("full_name", 500),
      ]);
      const currentUserName = employees.find((e) => e.email === me.email)?.full_name || me.full_name || "";
      if (!currentUserName) return;

      const now = new Date();
      const overdue = (events || [])
        .filter((event) =>
          (event.assigned_users || []).includes(currentUserName) &&
          !RESOLVED_STATUSES.includes(event.status) &&
          new Date(event.end_datetime || event.start_datetime) < now
        )
        .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

      // Only claim a new active event if nothing is currently being resolved —
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

  const handleResolved = () => {
    activeEventRef.current = null;
    setActiveEvent(null);
    refresh();
  };

  if (!activeEvent) return null;

  return <OverdueAppointmentDialog event={activeEvent} onResolved={handleResolved} />;
}
