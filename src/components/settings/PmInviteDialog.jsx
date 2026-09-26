import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, MessageSquare, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendInvite, createTextInviteLink } from "@/lib/sendInvite";
import { TextLinkPanel } from "@/components/builder/SubAccessDialog";

// Builder Portal access for one employee, opened from their row in
// Team & Subcontractors → Employees (like a sub's Invite button). Shows their
// existing Builder Portal login, or invites them by text or email.
// See PmLoginsSection for the full list and 040_pm_portal_logins.sql.
export default function PmInviteDialog({ employee, login, onClose, onChanged }) {
  const [email, setEmail] = useState(employee.email || "");
  const [phone, setPhone] = useState(employee.phone || "");
  const [allJobs, setAllJobs] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [textLink, setTextLink] = useState(null);

  const link = (url, days) => setTextLink({ url, days, name: employee.full_name || "", phone, portal: "pm" });

  const invite = async (e) => {
    e.preventDefault();
    const how = e.nativeEvent.submitter?.value === "email" ? "email" : "text";
    setBusy(how); setMessage(null); setTextLink(null);
    try {
      const args = { email: email.trim(), fullName: employee.full_name, pm: { employee_id: employee.id, all_jobs: allJobs } };
      if (how === "email") {
        await sendInvite(args);
        setMessage({ ok: true, text: `Invite emailed to ${args.email}.` });
      } else {
        const { url, days } = await createTextInviteLink(args);
        link(url, days);
      }
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy("resend"); setMessage(null); setTextLink(null);
    try {
      const { url, days } = await createTextInviteLink({ userId: login.user_id });
      link(url, days);
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const patch = async (change) => {
    const { error } = await supabase.from("pm_portal_users").update(change).eq("user_id", login.user_id);
    if (error) setMessage({ ok: false, text: error.message });
    else onChanged();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{employee.full_name}: Builder Portal</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">
          A Builder Portal login runs their jobs (schedule, daily logs, punch list, inspections) with no CRM or dollar amounts.
          Their jobs are the ones where they're set as project manager.
        </p>

        {login ? (
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{login.email}</p>
              <p className="text-xs text-slate-500">{login.active ? "Has a Builder Portal login" : "Access turned off"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={login.all_jobs ? "all" : "mine"} onChange={(e) => patch({ all_jobs: e.target.value === "all" })} disabled={!login.active}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
                <option value="mine">Jobs they manage</option>
                <option value="all">All jobs</option>
              </select>
              {login.active && (
                <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={resend}>
                  {busy === "resend" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text sign-in link
                </Button>
              )}
              {login.active ? (
                <Button size="sm" variant="outline" className="h-8" onClick={() => { if (confirm(`Turn off Builder Portal access for ${employee.full_name}?`)) patch({ active: false }); }}>
                  <UserX className="w-4 h-4 mr-1" /> Turn off
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8" onClick={() => patch({ active: true })}><UserCheck className="w-4 h-4 mr-1" /> Turn on</Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={invite} className="rounded-xl bg-slate-50 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Email (their login)</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9 text-sm bg-white" />
              </div>
              <div>
                <Label className="text-xs">Mobile (for text)</Label>
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-9 text-sm bg-white" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={allJobs} onChange={(e) => setAllJobs(e.target.checked)} /> Can see all jobs, not just ones they manage
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" value="text" size="sm" disabled={!!busy} className="bg-slate-900 text-white">
                {busy === "text" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text invite
              </Button>
              <Button type="submit" value="email" size="sm" variant="outline" disabled={!!busy}>
                {busy === "email" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Email invite
              </Button>
            </div>
          </form>
        )}

        {message && <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-rose-600"}>{message.text}</p>}
        {textLink && <TextLinkPanel link={textLink} onClose={() => setTextLink(null)} />}
      </DialogContent>
    </Dialog>
  );
}
