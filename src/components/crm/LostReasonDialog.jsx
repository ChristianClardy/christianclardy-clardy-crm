import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LOST_REASON_CODES } from "@/lib/leadStages";

export default function LostReasonDialog({ lead, saving, onCancel, onSave }) {
  const [reason, setReason] = useState(lead?.lost_reason || "");
  const [notes, setNotes] = useState(lead?.lost_reason_notes || "");

  useEffect(() => {
    setReason(lead?.lost_reason || "");
    setNotes(lead?.lost_reason_notes || "");
  }, [lead]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Why was this lead lost?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">{lead?.full_name} — Lost/No Decision</p>
        <div>
          <Label>Reason *</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a reason" /></SelectTrigger>
            <SelectContent>
              {LOST_REASON_CODES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1.5"
            rows={3}
            placeholder="Any extra detail…"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ reason, notes })} disabled={saving || !reason}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
