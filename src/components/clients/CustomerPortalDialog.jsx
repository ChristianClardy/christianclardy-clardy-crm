import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, MessageSquare, UserX, UserCheck, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendInvite, createTextInviteLink } from "@/lib/sendInvite";
import { TextLinkPanel } from "@/components/builder/SubAccessDialog";
import { confirmAction } from "@/components/ui/confirm-dialog";

// Customer Portal access for one client, opened from Client Detail. A
// customer login sees only this client's projects: overall progress and a
// phase checklist, contract total / payments / payment schedule, and signed
// contracts (041_customer_portal.sql). Logins are never deleted, only
// turned off. A client can have more than one (e.g. both homeowners).
export default function CustomerPortalDialog({ client, onClose }) {
  const [logins, setLogins] = useState(null);
  const [form, setForm] = useState({ full_name: client.contact_person || client.name || "", email: client.email || "", phone: client.phone || "" });
  const [busy, setBusy] = useState(null); // "email" | "text" | user_id
  const [message, setMessage] = useState(null);
  const [textLink, setTextLink] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from("customer_portal_users").select("*").eq("client_id", client.id).order("created_at");
    if (error) {
      setLogins([]);
      setMessage({ ok: false, text: /customer_portal_users/.test(error.message) ? "Customer Portal isn't set up in the database yet (run migration 041)." : error.message });
      return;
    }
    setLogins(data || []);
  };
  useEffect(() => { load(); }, [client.id]);

  const invite = async (e) => {
    e.preventDefault();
    const how = e.nativeEvent.submitter?.value === "email" ? "email" : "text";
    setBusy(how); setMessage(null); setTextLink(null);
    try {
      const args = { email: form.email.trim(), fullName: form.full_name.trim(), customer: { client_id: client.id } };
      if (how === "email") {
        const r = await sendInvite(args);
        setMessage({ ok: true, text: r.existing ? `Access restored for ${args.email}.${r.emailed === false ? " Couldn't email a sign-in link; use Text link instead." : " We emailed them a sign-in link."}` : `Invite emailed to ${args.email}.` });
      } else {
        const { url, days } = await createTextInviteLink(args);
        setTextLink({ url, days, name: args.fullName, phone: form.phone.trim(), portal: "customer" });
      }
      load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const resend = async (login) => {
    setBusy(login.user_id); setMessage(null); setTextLink(null);
    try {
      const { url, days } = await createTextInviteLink({ userId: login.user_id });
      setTextLink({ url, days, name: login.full_name || "", phone: client.phone || "", portal: "customer" });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  // Keyed by user_id (no `id` column), so this goes straight to Supabase.
  const setActive = async (login, active) => {
    const { error } = await supabase.from("customer_portal_users").update({ active }).eq("user_id", login.user_id);
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    setLogins((prev) => prev.map((l) => (l.user_id === login.user_id ? { ...l, active } : l)));
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Home className="w-5 h-5 text-amber-600" /> Customer Portal: {client.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">
          The customer signs in to see their project's progress checklist, payments made and upcoming, and the contracts they signed.
          They see only this client's projects, and never costs, internal notes, crews or subcontractors.
        </p>

        <div className="space-y-2">
          {!logins ? (
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          ) : logins.length > 0 && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {logins.map((l) => (
                <div key={l.user_id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{l.full_name || l.email}</p>
                    <p className="text-xs text-slate-500 truncate">{l.email}{l.active ? "" : " · access off"}</p>
                  </div>
                  {l.active && (
                    <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => resend(l)}>
                      {busy === l.user_id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text link
                    </Button>
                  )}
                  {l.active ? (
                    <Button size="sm" variant="outline" className="h-8" onClick={async () => { if (await confirmAction(`Turn off Customer Portal access for ${l.full_name || l.email}?`)) setActive(l, false); }}>
                      <UserX className="w-4 h-4 mr-1" /> Turn off
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setActive(l, true)}><UserCheck className="w-4 h-4 mr-1" /> Turn on</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={invite} className="rounded-xl bg-slate-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-slate-800">{logins?.length ? "Add another login" : "Invite this customer"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1 h-9 text-sm bg-white" />
            </div>
            <div>
              <Label className="text-xs">Email (their login)</Label>
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-9 text-sm bg-white" />
            </div>
            <div>
              <Label className="text-xs">Mobile (for text)</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-9 text-sm bg-white" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" value="text" size="sm" disabled={!!busy} className="bg-slate-900 text-white">
              {busy === "text" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text invite
            </Button>
            <Button type="submit" value="email" size="sm" variant="outline" disabled={!!busy}>
              {busy === "email" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Email invite
            </Button>
          </div>
        </form>

        {message && <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-rose-600"}>{message.text}</p>}
        {textLink && <TextLinkPanel link={textLink} onClose={() => setTextLink(null)} />}
      </DialogContent>
    </Dialog>
  );
}
