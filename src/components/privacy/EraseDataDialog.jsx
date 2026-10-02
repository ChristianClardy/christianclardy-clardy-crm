import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiFetch";

// "Delete personal data" for a privacy request (our Privacy Policy promises a
// reply within 30 days). Anonymizes the person across the app and keeps the
// records the business must hold (api/_lib/privacy.js). Can't be undone, so
// the name has to be typed to confirm.
const COPY = {
  client: {
    erased: [
      "Name, contact person, email, phone, address and notes on the client and its leads",
      "Communication history, follow-ups, CRM activities and comments",
      "Appointments not tied to a project (project appointments keep only their date)",
      "Their Customer Portal logins",
    ],
    kept: "Projects, estimates, contracts and signed documents, invoices, payments and draws stay for legal and tax records, along with the QuickBooks customer.",
  },
  subcontractor: {
    erased: [
      "Contact person, email, phone, address, notes, license number and insurance file link",
      "Their Subcontractor Portal logins",
      "Comments about them",
    ],
    kept: "The company name, AP invoices, signed Subcontractor Agreements, daily logs and job assignments stay as business records. The subcontractor is marked inactive.",
  },
};

export default function EraseDataDialog({ entityType, entity, open, onClose, onDone }) {
  const name = entity?.name || "";
  const copy = COPY[entityType];
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const run = async () => {
    setBusy(true); setError("");
    try {
      const res = await apiFetch("/api/invite?action=erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: entity.id, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete the personal data.");
      setDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => { if (done) onDone?.(done); onClose(); setTyped(""); setReason(""); setDone(null); setError(""); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-rose-600" /> Delete personal data</DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="text-emerald-700">Done. {entityType === "client" ? <>The client now shows as <strong>{done.label}</strong>.</> : <>{done.label}'s personal details were removed.</>}</p>
            <p className="text-slate-500">This was recorded in the data deletion log. Let the person know their request was completed.</p>
            <div className="flex justify-end"><Button onClick={close}>Close</Button></div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">For a request from <strong>{name}</strong> to delete their information. This can't be undone.</p>
            <div>
              <p className="font-medium text-slate-800">Removed</p>
              <ul className="list-disc pl-5 text-slate-600 space-y-0.5">{copy.erased.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium text-slate-800">Kept</p>
              <p className="text-slate-600">{copy.kept}</p>
            </div>
            <div>
              <Label className="text-xs">Reason / request (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Emailed request 10/2" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Type <strong>{name}</strong> to confirm</Label>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 h-9" />
            </div>
            {error && <p className="text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={run} disabled={busy || typed.trim() !== name.trim() || !name} className="bg-rose-600 hover:bg-rose-700 text-white">
                {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Delete personal data
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
