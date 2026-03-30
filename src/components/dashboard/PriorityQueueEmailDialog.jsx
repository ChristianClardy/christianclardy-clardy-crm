import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";

export default function PriorityQueueEmailDialog({
  open,
  onOpenChange,
  recipientEmail,
  setRecipientEmail,
  subject,
  setSubject,
  onSubmit,
  isSending,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-0 p-0 overflow-hidden" style={{ backgroundColor: "#fcfaf7" }}>
        <div className="border-b px-6 py-5" style={{ borderColor: "#e7ddd1", background: "linear-gradient(180deg, #f8f3ed 0%, #fcfaf7 100%)" }}>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#efe3d4", color: "#8a7040" }}>
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "#b5965a" }}>Share queue</p>
                <DialogTitle className="mt-1 text-xl" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Email Priority Queue</DialogTitle>
                <p className="mt-1 text-sm" style={{ color: "#7a6e66" }}>Open a polished email draft with your latest queue snapshot.</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "#e7ddd1", backgroundColor: "#fff" }}>
            The draft will open in your email app with a cleaner, styled text layout.
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "#8a7040" }}>Send to</Label>
            <Input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-2 h-11 border-0 shadow-sm"
              style={{ backgroundColor: "#fff" }}
            />
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "#8a7040" }}>Subject line</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-2 h-11 border-0 shadow-sm"
              style={{ backgroundColor: "#fff" }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>Cancel</Button>
            <Button onClick={onSubmit} disabled={isSending} style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>
              {isSending ? "Preparing..." : "Open Draft"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}