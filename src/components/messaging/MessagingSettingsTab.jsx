import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, Send, Trash2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyScope } from "@/lib/companyScope";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { messagingApi } from "@/lib/messaging";

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" }) }));
const EMPTY = { from_name: "", from_email: "", reply_to: "", sms_from: "", timezone: "America/Chicago", quiet_start: 20, quiet_end: 8, email_footer: "" };

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 shrink-0 text-xs text-slate-500">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">{value}</code>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

const Check = ({ ok, children }) => (
  <li className="flex items-start gap-2 text-sm">
    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
    <span className={ok ? "text-slate-700" : "text-slate-600"}>{children}</span>
  </li>
);

export default function MessagingSettingsTab() {
  const scope = useCompanyScope();
  const { readOnly } = useRolePermissions();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState({ email: "", phone: "" });
  const [testResult, setTestResult] = useState(null);
  const [optOuts, setOptOuts] = useState([]);
  const [newOptOut, setNewOptOut] = useState("");

  useEffect(() => {
    base44.entities.CompanyProfile.list("created_date", 50).then((list) => {
      setCompanies(list);
      setCompanyId((scope !== "all" && list.some((c) => c.id === scope)) ? scope : list[0]?.id || "");
    });
    messagingApi.status().then(setStatus).catch(() => setStatus({ email: false, sms: false, app_url: window.location.origin }));
    loadOptOuts();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setSaved(false);
    supabase.from("message_settings").select("*").eq("company_id", companyId).maybeSingle().then(({ data }) => {
      const company = companies.find((c) => c.id === companyId);
      setForm({ ...EMPTY, from_name: company?.name || "", reply_to: company?.email || "", ...(data || {}) });
    });
  }, [companyId, companies]);

  const loadOptOuts = () => supabase.from("message_opt_outs").select("*").order("created_at", { ascending: false }).limit(500).then(({ data }) => setOptOuts(data || []));
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };

  const save = async () => {
    setSaving(true);
    const row = {
      company_id: companyId, from_name: form.from_name, from_email: form.from_email?.trim(), reply_to: form.reply_to?.trim(),
      sms_from: form.sms_from?.trim(), timezone: form.timezone, email_footer: form.email_footer,
      quiet_start: Number(form.quiet_start), quiet_end: Number(form.quiet_end),
    };
    const { error } = await supabase.from("message_settings").upsert(row, { onConflict: "company_id" });
    setSaving(false);
    if (error) alert(error.message); else setSaved(true);
  };

  const sendTest = async (channel) => {
    setTestResult(null);
    try {
      await messagingApi.send({
        company_id: companyId, channel, to: channel === "email" ? test.email : test.phone,
        subject: "Test from {{company_name}}",
        body: channel === "email" ? "This is a test email from your CRM. If you're reading this, email is working." : "Test text from {{company_name}}'s CRM. Texting works!",
      });
      setTestResult({ ok: true, text: `Test ${channel === "email" ? "email" : "text"} sent.` });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    }
  };

  const addOptOut = async () => {
    const v = newOptOut.trim();
    if (!v) return;
    const isEmail = v.includes("@");
    const d = v.replace(/\D/g, "");
    const address = isEmail ? v.toLowerCase() : d.length === 10 ? `+1${d}` : `+${d}`;
    await supabase.from("message_opt_outs").upsert({ channel: isEmail ? "email" : "sms", address, reason: "manual" });
    setNewOptOut("");
    loadOptOuts();
  };
  const removeOptOut = async (o) => {
    if (!window.confirm(`Allow messages to ${o.address} again? Only do this if they asked to be added back.`)) return;
    await supabase.from("message_opt_outs").delete().eq("channel", o.channel).eq("address", o.address);
    loadOptOuts();
  };

  const base = status?.app_url || window.location.origin;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Sender settings</h3>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">From name</Label><Input className="mt-1" value={form.from_name || ""} onChange={(e) => set({ from_name: e.target.value })} /></div>
          <div><Label className="text-xs">From email (on your verified domain)</Label><Input className="mt-1" value={form.from_email || ""} onChange={(e) => set({ from_email: e.target.value })} placeholder="hello@yourcompany.com" /></div>
          <div><Label className="text-xs">Replies go to</Label><Input className="mt-1" value={form.reply_to || ""} onChange={(e) => set({ reply_to: e.target.value })} placeholder="you@yourcompany.com" /></div>
          <div><Label className="text-xs">Twilio number or Messaging Service SID</Label><Input className="mt-1" value={form.sms_from || ""} onChange={(e) => set({ sms_from: e.target.value })} placeholder="+15551234567 or MG…" /></div>
          <div>
            <Label className="text-xs">Time zone</Label>
            <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t.replace("America/", "").replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Texts only between</Label>
            <div className="mt-1 flex items-center gap-2">
              <Select value={String(form.quiet_end)} onValueChange={(v) => set({ quiet_end: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs text-slate-500">and</span>
              <Select value={String(form.quiet_start)} onValueChange={(v) => set({ quiet_start: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Email footer (your mailing address is required by law)</Label>
            <Textarea className="mt-1" rows={2} value={form.email_footer || ""} onChange={(e) => set({ email_footer: e.target.value })} placeholder="123 Main St, Your City, ST 12345" />
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || !companyId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
            {saved && <span className="text-sm text-emerald-700">Saved</span>}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Send a test</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2">
              <Input placeholder="you@email.com" value={test.email} onChange={(e) => setTest({ ...test, email: e.target.value })} />
              <Button variant="outline" disabled={!test.email || readOnly} onClick={() => sendTest("email")}><Send className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Your cell" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} />
              <Button variant="outline" disabled={!test.phone || readOnly} onClick={() => sendTest("sms")}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Save first: tests use the settings above.</p>
          {testResult && <p className={`mt-2 text-sm ${testResult.ok ? "text-emerald-700" : "text-rose-600"}`}>{testResult.text}</p>}
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Setup checklist</h3>
          <ul className="space-y-2">
            <Check ok={status?.email}>Email: <b>RESEND_API_KEY</b> added in Vercel (Resend → API Keys), and your domain verified in Resend → Domains.</Check>
            <Check ok={!!form.from_email}>A From email on that domain, saved above.</Check>
            <Check ok={status?.sms}>Texting: <b>TWILIO_ACCOUNT_SID</b> and <b>TWILIO_AUTH_TOKEN</b> added in Vercel.</Check>
            <Check ok={!!form.sms_from}>A Twilio number with approved A2P 10DLC registration, saved above.</Check>
          </ul>
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Paste these into Twilio / Resend</p>
            <CopyRow label="Twilio: incoming texts" value={`${base}/api/cron?action=twilio-inbound`} />
            <CopyRow label="Resend: webhook" value={`${base}/api/cron?action=resend-webhook`} />
          </div>
          <p className="text-[11px] text-slate-500">
            Twilio: Phone Numbers → your number → Messaging → "A message comes in" → Webhook, HTTP POST.
            Resend: Webhooks → add endpoint, events email.delivered, opened, clicked, bounced, complained.
          </p>
        </div>

        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Opted out ({optOuts.length})</h3>
          <p className="text-xs text-slate-500">People who unsubscribed, texted STOP, bounced or marked you as spam. Nothing is sent to them, from any drip or broadcast.</p>
          {!readOnly && (
            <div className="flex gap-2">
              <Input placeholder="Add an email or phone" value={newOptOut} onChange={(e) => setNewOptOut(e.target.value)} />
              <Button variant="outline" onClick={addOptOut}>Add</Button>
            </div>
          )}
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
            {optOuts.map((o) => (
              <div key={`${o.channel}:${o.address}`} className="flex items-center gap-2 py-2">
                <span className="w-12 text-xs text-slate-400">{o.channel === "sms" ? "Text" : "Email"}</span>
                <span className="flex-1 truncate">{o.address}</span>
                <span className="text-xs text-slate-500">{o.reason}</span>
                {!readOnly && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeOptOut(o)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
