import { useState } from "react";
import { Loader2, Send, ClipboardList, Link2, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendInvite, createStaffInviteLink } from "@/lib/sendInvite";
import { ROLES } from "@/lib/permissions";

// Clardy login for one employee, opened from their row in Employees. Their
// role (Bookkeeper, Office Manager, Viewer…) decides what they can open, per
// Roles & Permissions. A Project Manager can get a Builder Portal-only login
// instead (onPickBuilderPortal → PmInviteDialog). Someone who already has a
// Builder Portal-only login is switched to a full login (api/invite.js).
export default function StaffInviteDialog({ employee, pmLogin, onClose, onPickBuilderPortal, onChanged }) {
  const [email, setEmail] = useState(employee.email || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const role = ROLES.find((r) => r.key === employee.role) || ROLES.find((r) => r.key === "other");

  const copyLink = async (url = link) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers block copying after a network wait; the link is shown to copy by hand.
    }
  };

  // Same set-password link the invite email holds, to text them yourself
  // (works even when Supabase can't send email).
  const makeLink = async () => {
    setBusy(true); setMessage(null); setLink("");
    try {
      const r = await createStaffInviteLink({ email: email.trim(), fullName: employee.full_name });
      setLink(r.url);
      await copyLink(r.url);
      setMessage({
        ok: true,
        text: r.existing
          ? `${email.trim()} now has a ${role.label} login. Text them this link. It works for 7 days, until they sign in with it.`
          : `Text ${employee.full_name} this link. It works for 7 days, until they sign in with it. They'll set a password, then get steps to put Clardy on their phone or computer.`,
      });
      onChanged?.();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage(null); setLink("");
    try {
      const r = await sendInvite({ email: email.trim(), fullName: employee.full_name });
      setMessage({
        ok: true,
        text: r.existing
          ? `${email.trim()} now has a ${role.label} login.${r.emailed === false ? " We couldn't email a sign-in link; they can sign in with their password." : " We emailed them a sign-in link."}`
          : `Invite emailed to ${email.trim()}. They'll set a password, then get steps to put Clardy on their phone or computer.`,
      });
      onChanged?.();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Invite {employee.full_name}</DialogTitle></DialogHeader>
        <form onSubmit={invite} className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${role.color}`}>{role.label}</span>
            </p>
            <p className="text-xs text-slate-500 mt-1.5">{role.blurb} What they can open follows Roles &amp; Permissions. To change it, edit their role first.</p>
          </div>

          {pmLogin && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              They have a Builder Portal-only login now. Sending this switches it to a full {role.label} login, same email and password.
            </p>
          )}

          <div>
            <Label className="text-xs">Email (their login)</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9" />
          </div>

          {message && <p className={message.ok ? "text-emerald-700" : "text-rose-600"}>{message.text}</p>}

          {link && (
            <div className="flex items-center gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} className="h-9 text-xs" />
              <Button type="button" variant="outline" size="sm" onClick={() => copyLink()}>
                {copied ? <><CheckCheck className="w-3.5 h-3.5 mr-1" /> Copied</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {employee.role === "project_manager" && !pmLogin ? (
              <button type="button" onClick={onPickBuilderPortal} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:underline">
                <ClipboardList className="w-3.5 h-3.5" /> Builder Portal only instead
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Close</Button>
              <Button type="button" variant="outline" disabled={busy || !email.trim()} onClick={makeLink}>
                <Link2 className="w-4 h-4 mr-1" /> Copy invite link
              </Button>
              <Button type="submit" disabled={busy || !email.trim()} className="bg-slate-900 hover:bg-slate-800 text-white">
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Email invite
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
