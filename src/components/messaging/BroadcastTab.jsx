import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { LEAD_STAGES } from "@/lib/leadStages";
import { fetchAll, messagingApi } from "@/lib/messaging";
import MessageBodyEditor from "./MessageBodyEditor";

const normEmail = (v) => (v ? String(v).trim().toLowerCase() : "");
const normPhone = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : "";
};
const clientName = (c) => c.name || [c.first_name, c.last_name].filter(Boolean).join(" ");

export default function BroadcastTab() {
  const scope = useCompanyScope();
  const { readOnly } = useRolePermissions();
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [optOuts, setOptOuts] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState("leads");
  const [stages, setStages] = useState(() => new Set(LEAD_STAGES.filter((s) => s !== "Lost/No Decision")));
  const [clientStatuses, setClientStatuses] = useState(null);
  const [channel, setChannel] = useState("email");
  const [msg, setMsg] = useState({ subject: "", body: "" });
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const load = async () => {
    const [l, c, o, seqs, msgs] = await Promise.all([
      fetchAll("leads"),
      fetchAll("clients"),
      fetchAll("message_opt_outs", "channel,address", "address").catch(() => []),
      base44.entities.MessageSequence.filter({ trigger_type: "broadcast" }, "-created_date", 50),
      base44.entities.Message.filter({ direction: "outbound" }, "-created_date", 5000),
    ]);
    setLeads(l); setClients(c);
    setOptOuts(new Set(o.map((x) => `${x.channel}:${x.address}`)));
    setHistory(seqs);
    const s = {};
    for (const m of msgs) {
      if (!m.sequence_id) continue;
      const row = (s[m.sequence_id] ||= { total: 0 });
      row.total++;
      row[m.status] = (row[m.status] || 0) + 1;
    }
    setStats(s);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const statusOptions = useMemo(() => [...new Set(clients.map((c) => c.status || "(none)"))].sort(), [clients]);
  useEffect(() => { if (!clientStatuses && statusOptions.length) setClientStatuses(new Set(statusOptions)); }, [statusOptions, clientStatuses]);

  // Matching people with a usable address, minus opt-outs and duplicates.
  const recipients = useMemo(() => {
    const pool = audience === "leads"
      ? scopeFilter(leads, scope).filter((l) => stages.has(l.status || "New Lead")).map((l) => ({ id: l.id, kind: "lead", name: l.full_name, email: l.email, phone: l.phone }))
      : scopeFilter(clients, scope).filter((c) => clientStatuses?.has(c.status || "(none)")).map((c) => ({ id: c.id, kind: "client", name: clientName(c), email: c.email, phone: c.phone }));
    const seen = new Set();
    let noAddress = 0, optedOut = 0, dupes = 0;
    const list = [];
    for (const p of pool) {
      const addr = channel === "email" ? normEmail(p.email) : normPhone(p.phone);
      if (!addr) { noAddress++; continue; }
      if (optOuts.has(`${channel}:${addr}`)) { optedOut++; continue; }
      if (seen.has(addr)) { dupes++; continue; }
      seen.add(addr);
      list.push(p);
    }
    return { list, total: pool.length, noAddress, optedOut, dupes };
  }, [audience, leads, clients, scope, stages, clientStatuses, channel, optOuts]);

  const toggleIn = (set, setter, value) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  };

  const send = async () => {
    const n = recipients.list.length;
    if (!n || !msg.body.trim() || (channel === "email" && !msg.subject.trim())) return;
    if (!window.confirm(`Send this ${channel === "email" ? "email" : "text"} to ${n} ${n === 1 ? "person" : "people"}? This can't be undone.`)) return;
    setSending(true); setResult(null);
    try {
      const r = await messagingApi.broadcast({
        name: name.trim() || undefined, channel, subject: msg.subject, body: msg.body,
        company_id: scope !== "all" ? scope : undefined,
        lead_ids: recipients.list.filter((p) => p.kind === "lead").map((p) => p.id),
        client_ids: recipients.list.filter((p) => p.kind === "client").map((p) => p.id),
      });
      messagingApi.runQueue().catch(() => {});
      setResult({ ok: true, text: `Queued ${r.queued}. Sending now at about 2 per second; the rest go out over the next few minutes.` });
      setMsg({ subject: "", body: "" }); setName("");
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[["email", "Email", Mail], ["sms", "Text", MessageSquare]].map(([k, label, Icon]) => (
            <Button key={k} type="button" variant={channel === k ? "default" : "outline"} onClick={() => setChannel(k)}><Icon className="mr-2 h-4 w-4" /> {label}</Button>
          ))}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">Who gets it</p>
          <div className="mt-2 flex gap-2">
            {[["leads", "Leads"], ["clients", "Clients"]].map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={audience === k ? "default" : "outline"} onClick={() => setAudience(k)}>{label}</Button>
            ))}
          </div>
          <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {(audience === "leads" ? LEAD_STAGES : statusOptions).map((s) => {
              const set = audience === "leads" ? stages : clientStatuses || new Set();
              return (
                <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={set.has(s)} onCheckedChange={() => toggleIn(set, audience === "leads" ? setStages : setClientStatuses, s)} />
                  <span className="capitalize">{s}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <b>{recipients.list.length}</b> will get it
            <span className="text-slate-500"> · {recipients.total} matched, {recipients.noAddress} without {channel === "email" ? "an email" : "a mobile number"}, {recipients.optedOut} opted out, {recipients.dupes} duplicates</span>
          </p>
        </div>

        <div>
          <Label>Name (for your records)</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring promo 2027" />
        </div>
        <MessageBodyEditor channel={channel} value={msg} onChange={setMsg} />

        {result && <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-600"}`}>{result.text}</p>}
        {!readOnly && (
          <Button onClick={send} disabled={sending || !recipients.list.length || !msg.body.trim() || (channel === "email" && !msg.subject.trim())}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send to {recipients.list.length}
          </Button>
        )}
        {channel === "sms" && <p className="text-[11px] text-slate-500">Only text people who agreed to texts from you. Mass texts to people who didn't opt in can bring carrier blocks and TCPA fines.</p>}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">Past broadcasts</p>
        {!history.length && <p className="text-sm text-slate-500">None yet.</p>}
        {scopeFilter(history, scope).map((h) => {
          const s = stats[h.id] || { total: 0 };
          return (
            <div key={h.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <p className="font-semibold text-slate-900">{h.name}</p>
              <p className="text-xs text-slate-500">{h.created_at ? format(new Date(h.created_at), "MMM d, yyyy h:mm a") : ""} · {h.created_by}</p>
              <p className="mt-2 text-xs text-slate-600">
                {s.total} processed · {(s.sent || 0) + (s.delivered || 0) + (s.opened || 0) + (s.clicked || 0)} sent
                {s.opened || s.clicked ? ` · ${(s.opened || 0) + (s.clicked || 0)} opened` : ""}
                {s.failed || s.bounced ? ` · ${(s.failed || 0) + (s.bounced || 0)} failed` : ""}
                {s.skipped ? ` · ${s.skipped} skipped` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
