import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, MessageSquare, UserX, UserCheck, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendInvite, createTextInviteLink } from "@/lib/sendInvite";
import { TextLinkPanel } from "@/components/builder/SubAccessDialog";

// Builder Portal-only logins for project managers (040_pm_portal_logins.sql).
// A PM login runs its jobs (schedule, logs, punch list, inspections, sub
// bookings) and sees nothing else: no CRM, estimates, payments or money.
// Its jobs are the ones where the project manager is its employee, unless
// "All jobs" is on. Logins are never deleted, only turned off.
export default function PmLoginsSection() {
  const [employees, setEmployees] = useState([]);
  const [logins, setLogins] = useState(null);
  const [form, setForm] = useState({ employee_id: "", full_name: "", email: "", phone: "", all_jobs: false });
  const [busy, setBusy] = useState(null); // "email" | "text" | user_id
  const [message, setMessage] = useState(null);
  const [textLink, setTextLink] = useState(null);

  const load = async () => {
    const [e, l] = await Promise.all([
      base44.entities.Employee.list("full_name", 500).catch(() => []),
      base44.entities.PmPortalUser.list("email").catch(() => []),
    ]);
    setEmployees(e.filter((x) => x.status !== "inactive"));
    setLogins(l);
  };
  useEffect(() => { load(); }, []);

  const pickEmployee = (id) => {
    const e = employees.find((x) => x.id === id);
    setForm((f) => ({ ...f, employee_id: id, full_name: e?.full_name || f.full_name, email: e?.email || f.email, phone: e?.phone || f.phone }));
  };

  // The login is matched to jobs by its employee's name, so make sure one exists.
  const ensureEmployee = async () => {
    if (form.employee_id) return form.employee_id;
    const existing = employees.find((e) => e.email && e.email.toLowerCase() === form.email.trim().toLowerCase());
    if (existing) return existing.id;
    const created = await base44.entities.Employee.create({
      full_name: form.full_name.trim() || form.email.split("@")[0], email: form.email.trim(), phone: form.phone.trim(),
      role: "project_manager", status: "active",
    });
    return created.id;
  };

  const invite = async (e) => {
    e.preventDefault();
    const how = e.nativeEvent.submitter?.value === "email" ? "email" : "text";
    if (!form.email.trim()) return;
    setBusy(how); setMessage(null); setTextLink(null);
    try {
      const employee_id = await ensureEmployee();
      const name = form.full_name.trim() || employees.find((x) => x.id === employee_id)?.full_name || "";
      const args = { email: form.email.trim(), fullName: name, pm: { employee_id, all_jobs: form.all_jobs } };
      if (how === "email") {
        await sendInvite(args);
        setMessage({ ok: true, text: `Invite emailed to ${args.email}.` });
      } else {
        const { url, days } = await createTextInviteLink(args);
        setTextLink({ url, days, name, phone: form.phone.trim(), portal: "pm" });
      }
      setForm({ employee_id: "", full_name: "", email: "", phone: "", all_jobs: false });
      load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  // Keyed by user_id (no `id` column), so these go straight to Supabase.
  const patch = async (login, change) => {
    const { error } = await supabase.from("pm_portal_users").update(change).eq("user_id", login.user_id);
    if (error) { alert(`Could not update: ${error.message}`); return; }
    setLogins((prev) => prev.map((l) => (l.user_id === login.user_id ? { ...l, ...change } : l)));
  };

  const resend = async (login) => {
    setBusy(login.user_id); setMessage(null); setTextLink(null);
    try {
      const { url, days } = await createTextInviteLink({ userId: login.user_id });
      const emp = employees.find((e) => e.id === login.employee_id);
      setTextLink({ url, days, name: login.full_name || "", phone: emp?.phone || "", portal: "pm" });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const employeeName = (l) => employees.find((e) => e.id === l.employee_id)?.full_name || l.full_name;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-1">
        <p className="font-semibold text-slate-800 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> What a Builder Portal login can do</p>
        <p>Run their jobs: schedules, daily logs, punch lists, inspections, booking subs, and job status and dates.</p>
        <p>They can't see the CRM, clients' other info, estimates, payments, contract values, costs, or sub pay rates. The database enforces this, not just the screens.</p>
      </div>

      <form onSubmit={invite} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <p className="font-semibold text-slate-900">New Builder Portal login</p>
        <div>
          <Label className="text-xs">Employee</Label>
          <select value={form.employee_id} onChange={(e) => pickEmployee(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
            <option value="">New person (adds them as a Project Manager employee)</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.email ? ` · ${e.email}` : ""}</option>)}
          </select>
          <p className="text-xs text-slate-500 mt-1">They see the jobs where this employee is set as project manager.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={!!form.employee_id} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Email (their login)</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Mobile (for text)</Label>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-9 text-sm" />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={form.all_jobs} onChange={(e) => setForm({ ...form, all_jobs: e.target.checked })} />
          <span>Can see all jobs<span className="block text-xs text-slate-500">Leave off to limit them to jobs they manage.</span></span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" value="text" size="sm" disabled={!!busy} className="bg-slate-900 text-white">
            {busy === "text" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text invite
          </Button>
          <Button type="submit" value="email" size="sm" variant="outline" disabled={!!busy}>
            {busy === "email" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Email invite
          </Button>
        </div>
        {message && <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-rose-600"}>{message.text}</p>}
      </form>

      {textLink && <TextLinkPanel link={textLink} onClose={() => setTextLink(null)} />}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Builder Portal logins</h3>
        {!logins ? (
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
        ) : !logins.length ? (
          <p className="text-sm text-slate-400">None yet.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {logins.map((l) => (
              <div key={l.user_id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{employeeName(l) || l.email}</p>
                  <p className="text-xs text-slate-500 truncate">{l.email}{l.active ? "" : " · access off"}</p>
                </div>
                <select
                  value={l.all_jobs ? "all" : "mine"}
                  onChange={(e) => patch(l, { all_jobs: e.target.value === "all" })}
                  disabled={!l.active}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="mine">Jobs they manage</option>
                  <option value="all">All jobs</option>
                </select>
                {l.active && (
                  <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => resend(l)}>
                    {busy === l.user_id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-1" />} Text link
                  </Button>
                )}
                {l.active ? (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { if (confirm(`Turn off Builder Portal access for ${employeeName(l) || l.email}?`)) patch(l, { active: false }); }}>
                    <UserX className="w-4 h-4 mr-1" /> Turn off
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => patch(l, { active: true })}><UserCheck className="w-4 h-4 mr-1" /> Turn on</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
