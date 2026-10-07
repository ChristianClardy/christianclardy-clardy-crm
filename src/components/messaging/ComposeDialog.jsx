import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { messagingApi } from "@/lib/messaging";
import MessageBodyEditor from "./MessageBodyEditor";

// One email or text to one contact, sent right away.
// target: { lead_id?, client_id?, project_id?, name, email, phone }
export default function ComposeDialog({ open, onOpenChange, channel, target, initial, onSent }) {
  const [msg, setMsg] = useState({ subject: "", body: "" });
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg({ subject: initial?.subject || "", body: initial?.body || "" });
    setTo(channel === "email" ? target?.email || "" : target?.phone || "");
    setError("");
  }, [open, channel, target, initial]);

  const first = (target?.name || "").trim().split(/\s+/)[0] || "";
  const previewFields = { first_name: first, full_name: target?.name || "" };

  const send = async () => {
    setSending(true); setError("");
    try {
      await messagingApi.send({
        lead_id: target?.lead_id, client_id: target?.client_id, project_id: target?.project_id,
        channel, subject: msg.subject, body: msg.body, to,
      });
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{channel === "email" ? "Email" : "Text"} {target?.name || ""}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">To</Label>
            <Input className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "email" ? "name@example.com" : "(555) 123-4567"} />
          </div>
          <MessageBodyEditor channel={channel} value={msg} onChange={setMsg} previewFields={previewFields} />
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending || !to.trim() || !msg.body.trim() || (channel === "email" && !msg.subject.trim())}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
