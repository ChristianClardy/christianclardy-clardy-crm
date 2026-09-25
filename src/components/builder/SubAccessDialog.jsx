import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, UserX, UserCheck, MessageSquare, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendInvite, createTextInviteLink } from "@/lib/sendInvite";
import { Textarea } from "@/components/ui/textarea";

// Staff-only: who from a subcontractor has an app login, and inviting more.
// Job assignments live in Settings → Job Assignments. Portal logins are never
// deleted through the app (the database blocks it, see
// 034_subcontractor_portal.sql), only turned off.
export default function SubAccessDialog({ sub, onOpenChange, assignments, portalUsers, onPortalUsersChange }) {
  const [invite, setInvite] = useState({ full_name: "", email: "", phone: sub?.phone || "" });
  const [inviting, setInviting] = useState(null); // "email" | "text" | a login's user_id
  const [inviteMsg, setInviteMsg] = useState(null);
  const [textLink, setTextLink] = useState(null); // { url, name, phone, days }

  if (!sub) return null;

  const subAssignments = assignments.filter((a) => a.subcontractor_id === sub.id);
  const logins = portalUsers.filter((u) => u.subcontractor_id === sub.id);

  const handleInvite = async (e) => {
    e.preventDefault();
    const how = e.nativeEvent.submitter?.value === "email" ? "email" : "text";
    if (!invite.email.trim()) return;
    setInviting(how);
    setInviteMsg(null);
    setTextLink(null);
    try {
      const args = { email: invite.email.trim(), fullName: invite.full_name.trim(), subcontractorId: sub.id };
      if (how === "email") {
        await sendInvite(args);
        setInviteMsg({ ok: true, text: `Invite sent to ${invite.email.trim()}. They'll get an email to set a password, then can install the app.` });
      } else {
        const { url, days } = await createTextInviteLink(args);
        setTextLink({ url, days, name: invite.full_name.trim(), phone: invite.phone.trim() });
      }
      const fresh = await base44.entities.SubcontractorPortalUser.list("email");
      onPortalUsersChange(fresh);
      setInvite({ full_name: "", email: "", phone: sub.phone || "" });
    } catch (err) {
      setInviteMsg({ ok: false, text: err.message });
    } finally {
      setInviting(null);
    }
  };

  // Fresh texted sign-in link for someone who already has a login.
  const textExisting = async (login) => {
    setInviting(login.user_id);
    setInviteMsg(null);
    setTextLink(null);
    try {
      const { url, days } = await createTextInviteLink({ userId: login.user_id });
      setTextLink({ url, days, name: login.full_name || "", phone: sub.phone || "" });
    } catch (err) {
      setInviteMsg({ ok: false, text: err.message });
    } finally {
      setInviting(null);
    }
  };

  const setLoginActive = async (login, active) => {
    if (!active && !confirm(`Turn off app access for ${login.full_name || login.email}? They'll be signed out of everything.`)) return;
    // Keyed by user_id (no `id` column), so this can't go through base44's update(id).
    const { error } = await supabase.from("subcontractor_portal_users").update({ active }).eq("user_id", login.user_id);
    if (error) { alert(`Could not update access: ${error.message}`); return; }
    onPortalUsersChange(portalUsers.map((u) => (u.user_id === login.user_id ? { ...u, active } : u)));
  };

  return (
    <Dialog open={!!sub} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub.name}: jobs & app access</DialogTitle>
        </DialogHeader>

        <section className="rounded-xl bg-slate-50 px-3 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            {subAssignments.length} job{subAssignments.length !== 1 ? "s" : ""} assigned
          </p>
          <a href="/Settings?tab=jobAssignments" className="text-sm font-medium text-amber-700 hover:underline shrink-0">
            Manage in Settings → Job Assignments
          </a>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">App logins</h3>
          {logins.length === 0 && <p className="text-sm text-slate-400">No one from {sub.name} has an app login yet.</p>}
          {logins.map((u) => (
            <div key={u.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate">{u.full_name || u.email}</p>
                <p className="text-xs text-slate-500 truncate">{u.email}{u.active ? "" : " · access off"}</p>
              </div>
              {u.active ? (
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" disabled={!!inviting} onClick={() => textExisting(u)} title="Text them a sign-in link">
                    {inviting === u.user_id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLoginActive(u, false)}><UserX className="w-4 h-4 mr-1" /> Turn off</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setLoginActive(u, true)}><UserCheck className="w-4 h-4 mr-1" /> Turn on</Button>
              )}
            </div>
          ))}

          {textLink && <TextLinkPanel link={textLink} onClose={() => setTextLink(null)} />}

          <form onSubmit={handleInvite} className="rounded-xl bg-slate-50 p-3 space-y-2">
            <p className="text-xs text-slate-600">Invite someone from {sub.name}. They'll only see their assigned jobs, never clients, pricing, or other jobs. A text invite signs them in from the link and walks them through adding the app to their phone.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder="Crew lead name" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder={sub.email || "name@company.com"} />
              </div>
              <div>
                <Label className="text-xs">Mobile (for text)</Label>
                <Input type="tel" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} placeholder="(555) 555-5555" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" value="text" size="sm" disabled={!!inviting} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
                {inviting === "text" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />}
                Text invite
              </Button>
              <Button type="submit" value="email" size="sm" variant="outline" disabled={!!inviting}>
                {inviting === "email" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Email invite
              </Button>
            </div>
            {inviteMsg && <p className={inviteMsg.ok ? "text-xs text-emerald-700" : "text-xs text-red-600"}>{inviteMsg.text}</p>}
          </form>
        </section>
      </DialogContent>
    </Dialog>
  );
}

// The texted invite: an editable message with the link, sent from staff's own
// phone (sms: opens Messages on iPhone, Android and Mac) or copied to paste
// anywhere else.
function TextLinkPanel({ link, onClose }) {
  const first = link.name.split(" ")[0];
  const [phone, setPhone] = useState(link.phone);
  const [message, setMessage] = useState(
    `Hi${first ? ` ${first}` : ""}, this is Principle Outdoor Living. Here's your link to the Builder Portal for your jobs. ` +
    `Tap it to sign in, set a password, and add the app to your phone: ${link.url}`
  );
  const [copied, setCopied] = useState(null);

  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("Copy this:", text);
    }
  };

  const digits = phone.replace(/[^\d+]/g, "");
  // "?&body=" is the form both iOS and Android Messages accept.
  const smsHref = `sms:${digits}?&body=${encodeURIComponent(message)}`;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Text this sign-in link</p>
        <button onClick={onClose} className="text-xs text-slate-500 hover:underline">Close</button>
      </div>
      <div>
        <Label className="text-xs">Send to</Label>
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" />
      </div>
      <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
          <a href={smsHref}><MessageSquare className="w-4 h-4 mr-1" /> Open in Messages</a>
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy("message", message)}>
          {copied === "message" ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy message
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy("link", link.url)}>
          {copied === "link" ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy link
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        The link works for {link.days} days and signs in only this person. Don't post it in a group chat. If it expires, click "Text link" next to their name for a new one.
      </p>
    </div>
  );
}
