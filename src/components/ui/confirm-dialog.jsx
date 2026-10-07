import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// In-app replacement for window.confirm(). The browser's confirm() freezes
// the page until it's answered, which shows up as multi-second INP
// ("event handlers blocked UI updates") on every delete button. This one
// returns a promise instead: `if (!(await confirmAction("Delete this?"))) return;`
// <ConfirmDialogHost /> is mounted once in App.jsx.

let openDialog = null;

export function confirmAction(message, { title = "Are you sure?", confirmLabel = "OK", cancelLabel = "Cancel" } = {}) {
  // Host not mounted (shouldn't happen) — fall back so the action still works.
  if (!openDialog) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => openDialog({ message, title, confirmLabel, cancelLabel, resolve }));
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    openDialog = (next) => setRequest((prev) => {
      prev?.resolve(false);
      return next;
    });
    return () => { openDialog = null; };
  }, []);

  const finish = (answer) => {
    request?.resolve(answer);
    setRequest(null);
  };

  return (
    <AlertDialog open={!!request} onOpenChange={(open) => { if (!open) finish(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{request?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>{request?.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)}>{request?.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
