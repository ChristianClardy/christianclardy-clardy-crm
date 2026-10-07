import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Mail, MessageSquare, Plus, Square, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { STATUS_STYLE, messagingApi, triggerSummary } from "@/lib/messaging";
import ComposeDialog from "./ComposeDialog";

const byId = (list) => Array.from(new Map(list.map((x) => [x.id, x])).values());

// Lead / client page: every email and text with this person, their drips,
// and buttons to message them or add them to a drip.
export default function MessagesPanel({ leadId, clientId, name, email, phone, stage }) {
  const { can, readOnly } = useRolePermissions();
  const [messages, setMessages] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const canSend = can("automations") && !readOnly;

  const load = async () => {
    const q = (entity, field, id, sort) => (id ? entity.filter({ [field]: id }, sort, 300).catch(() => []) : Promise.resolve([]));
    const [ml, mc, el, ec, seqs] = await Promise.all([
      q(base44.entities.Message, "lead_id", leadId, "-created_date"),
      q(base44.entities.Message, "client_id", clientId, "-created_date"),
      q(base44.entities.MessageEnrollment, "lead_id", leadId, "-enrolled_at"),
      q(base44.entities.MessageEnrollment, "client_id", clientId, "-enrolled_at"),
      base44.entities.MessageSequence.list("name", 500).catch(() => []),
    ]);
    const msgs = byId([...ml, ...mc]).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    setMessages(msgs);
    setEnrollments(byId([...el, ...ec]));
    setSequences(seqs);
    setLoading(false);
    const unread = msgs.filter((m) => m.direction === "inbound" && !m.read_at).map((m) => m.id);
    if (unread.length && !readOnly) {
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread).then(() => {});
    }
  };
  useEffect(() => { if (leadId || clientId) load(); }, [leadId, clientId]);

  const seqName = useMemo(() => Object.fromEntries(sequences.map((s) => [s.id, s.name])), [sequences]);
  const enrollable = sequences.filter((s) => s.trigger_type !== "broadcast" && s.active);
  const running = enrollments.filter((e) => e.status === "active");

  const enroll = async (seq) => {
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("enroll_in_sequence", {
      p_sequence_id: seq.id, p_lead_id: leadId || null, p_client_id: clientId || null,
      p_project_id: null, p_stage: stage || null, p_by: (await supabase.auth.getUser()).data.user?.email || "staff", p_force: true,
    });
    if (error) setNotice(error.message);
    else if (!data) setNotice(`Already in "${seq.name}".`);
    else {
      setNotice(`Added to "${seq.name}".`);
      messagingApi.runQueue().catch(() => {});
    }
    await load();
    setBusy(false);
  };

  const stop = async (e) => {
    await base44.entities.MessageEnrollment.update(e.id, { status: "stopped", stop_reason: "Stopped by staff", finished_at: new Date().toISOString() });
    load();
  };

  const target = { lead_id: leadId || undefined, client_id: clientId || undefined, name, email, phone };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
        {canSend && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!email} title={email ? "" : "No email on file"} onClick={() => setCompose("email")}><Mail className="mr-1.5 h-4 w-4" /> Email</Button>
            <Button size="sm" variant="outline" disabled={!phone} title={phone ? "" : "No phone on file"} onClick={() => setCompose("sms")}><MessageSquare className="mr-1.5 h-4 w-4" /> Text</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={busy}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Add to drip</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Drips that are on</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!enrollable.length && <DropdownMenuItem disabled>None yet: create one under Automations</DropdownMenuItem>}
                {enrollable.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => enroll(s)}>
                    <div><p>{s.name}</p><p className="text-[11px] text-slate-500">{triggerSummary(s)}</p></div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {notice && <p className="mt-2 text-sm text-slate-600">{notice}</p>}

      {running.length > 0 && (
        <div className="mt-4 space-y-2">
          {running.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <Zap className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-slate-900">{seqName[e.sequence_id] || "Drip"}</span>
              <span className="text-xs text-slate-600">next send {e.next_run_at ? format(new Date(e.next_run_at), "MMM d, h:mm a") : "—"}</span>
              {e.last_error && <span className="text-xs text-rose-600">{e.last_error}</span>}
              {canSend && <Button size="sm" variant="ghost" className="ml-auto h-7 text-rose-600" onClick={() => stop(e)}><Square className="mr-1 h-3 w-3" /> Stop</Button>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : !messages.length ? (
          <p className="text-sm text-slate-500">No emails or texts yet.</p>
        ) : messages.map((m) => {
          const inbound = m.direction === "inbound";
          return (
            <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${inbound ? "bg-slate-100 text-slate-800" : m.channel === "email" ? "bg-blue-50 text-slate-800" : "bg-emerald-50 text-slate-800"}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {m.channel === "email" ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                  <span>{inbound ? "From them" : m.sent_by === "automation" ? `Drip: ${seqName[m.sequence_id] || "automation"}` : m.sent_by}</span>
                  <span>· {m.created_at ? format(new Date(m.created_at), "MMM d, h:mm a") : ""}</span>
                  <Badge className={`h-4 px-1.5 text-[10px] ${STATUS_STYLE[m.status] || ""}`}>{m.status}</Badge>
                </div>
                {m.subject && <p className="font-semibold">{m.subject}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.error && <p className="mt-1 text-[11px] text-rose-600">{m.error}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <ComposeDialog open={!!compose} onOpenChange={(o) => !o && setCompose(null)} channel={compose || "email"} target={target} onSent={load} />
    </div>
  );
}
