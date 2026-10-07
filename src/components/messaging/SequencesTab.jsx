import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Clock, Copy, GitBranch, Loader2, Mail, MessageSquare, Pencil, Plus, Square, Trash2, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { triggerSummary } from "@/lib/messaging";
import { computeNodeStats, findNode, flattenNodes, workflowOf } from "@/lib/workflow";
import WorkflowCanvas from "./WorkflowCanvas";
import { STARTER_DRIPS } from "./starterDrips";
import { confirmAction } from "@/components/ui/confirm-dialog";

const fmt = (v) => (v ? format(new Date(v), "MMM d, h:mm a") : "—");
const NODE_ICON = { email: Mail, sms: MessageSquare, wait: Clock, condition: GitBranch, action: Zap };
const NODE_LABEL = { email: "Email", sms: "Text", wait: "Wait", condition: "If / else", action: "Action", end: "End" };

async function namesFor(enrollments) {
  const ids = (key) => [...new Set(enrollments.map((e) => e[key]).filter(Boolean))];
  const fetchIn = async (table, cols, list) => {
    const out = [];
    for (let i = 0; i < list.length; i += 100) {
      const { data } = await supabase.from(table).select(cols).in("id", list.slice(i, i + 100));
      out.push(...(data || []));
    }
    return out;
  };
  const [leads, clients, projects] = await Promise.all([
    fetchIn("leads", "id,full_name", ids("lead_id")),
    fetchIn("clients", "*", ids("client_id")),
    fetchIn("projects", "id,name", ids("project_id")),
  ]);
  const n = {};
  leads.forEach((l) => { n[l.id] = l.full_name; });
  clients.forEach((c) => { n[c.id] = c.name || [c.first_name, c.last_name].filter(Boolean).join(" "); });
  projects.forEach((p) => { n[p.id] = p.name; });
  return n;
}

// One drip, expanded: its flow with live counts, and who's in it.
function DripDetail({ seq, steps, enrollments, readOnly, onChanged }) {
  const [view, setView] = useState("flow");
  const [messages, setMessages] = useState([]);
  const [names, setNames] = useState({});
  const flow = useMemo(() => workflowOf(seq, steps), [seq, steps]);
  const stats = useMemo(() => computeNodeStats(enrollments, messages, steps), [enrollments, messages, steps]);

  useEffect(() => {
    base44.entities.Message.filter({ sequence_id: seq.id }, "-created_date", 1000).then(setMessages).catch(() => setMessages([]));
    namesFor(enrollments.slice(0, 200)).then(setNames);
  }, [seq.id, enrollments]);

  const stop = async (e) => {
    await base44.entities.MessageEnrollment.update(e.id, { status: "stopped", stop_reason: "Stopped by staff", finished_at: new Date().toISOString() });
    onChanged();
  };

  const position = (e) => {
    if (e.status !== "active") return "—";
    const n = findNode(flow, e.current_node || steps[e.next_step]?.id);
    if (!n) return "Starting";
    return `${NODE_LABEL[n.type] || "Step"}${n.type === "email" && n.subject ? `: ${n.subject}` : ""}`;
  };

  return (
    <div className="border-t border-slate-100">
      <div className="flex gap-2 px-5 pt-4">
        {[["flow", "Flow"], ["people", `People (${enrollments.length})`]].map(([k, label]) => (
          <Button key={k} size="sm" variant={view === k ? "default" : "outline"} onClick={() => setView(k)}>{label}</Button>
        ))}
      </div>
      {seq.description && <p className="px-5 pt-3 text-sm text-slate-600">{seq.description}</p>}
      {view === "flow" ? (
        <div className="m-5 max-h-[640px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50"
          style={{ backgroundImage: "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
          <WorkflowCanvas flow={flow} trigger={{ title: triggerSummary(seq) }} stats={stats} zoom={0.85} />
        </div>
      ) : !enrollments.length ? (
        <p className="p-5 text-sm text-slate-500">No one has been in this drip yet.</p>
      ) : (
        <div className="overflow-x-auto p-5">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr><th className="py-2 pr-3">Who</th><th className="pr-3">Status</th><th className="pr-3">At</th><th className="pr-3">Next</th><th className="pr-3">Enrolled</th><th /></tr>
            </thead>
            <tbody>
              {enrollments.slice(0, 200).map((e) => {
                const id = e.lead_id || e.client_id || e.project_id;
                const href = e.lead_id ? `/LeadDetail?id=${e.lead_id}` : e.client_id ? `/ClientDetail?id=${e.client_id}` : `/ProjectDetail?id=${e.project_id}`;
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3"><a href={href} className="font-medium text-slate-900 hover:underline">{names[id] || "…"}</a></td>
                    <td className="pr-3">
                      <span className="capitalize">{e.status}</span>
                      {e.stop_reason && <span className="block text-[11px] text-slate-500">{e.stop_reason}</span>}
                      {e.last_error && <span className="block text-[11px] text-rose-600">{e.last_error}</span>}
                    </td>
                    <td className="max-w-[16rem] truncate pr-3">{position(e)}</td>
                    <td className="pr-3">{e.status === "active" ? fmt(e.next_run_at) : "—"}</td>
                    <td className="pr-3">{fmt(e.enrolled_at)}</td>
                    <td className="text-right">
                      {e.status === "active" && !readOnly && (
                        <Button size="sm" variant="ghost" className="h-7 text-rose-600" onClick={() => stop(e)}><Square className="mr-1 h-3 w-3" /> Stop</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {enrollments.length > 200 && <p className="mt-2 text-xs text-slate-500">Showing the latest 200 of {enrollments.length}.</p>}
        </div>
      )}
    </div>
  );
}

export default function SequencesTab({ onOpen }) {
  const scope = useCompanyScope();
  const { readOnly } = useRolePermissions();
  const [sequences, setSequences] = useState([]);
  const [steps, setSteps] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    const [seqs, st, en] = await Promise.all([
      base44.entities.MessageSequence.list("-created_date", 500),
      base44.entities.MessageSequenceStep.list("step_order", 5000),
      base44.entities.MessageEnrollment.list("-enrolled_at", 5000),
    ]);
    setSequences(seqs.filter((s) => s.trigger_type !== "broadcast"));
    setSteps(st);
    setEnrollments(en);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => scopeFilter(sequences, scope), [sequences, scope]);
  const stepsBySeq = useMemo(() => steps.reduce((m, s) => ((m[s.sequence_id] ||= []).push(s), m), {}), [steps]);
  const enrBySeq = useMemo(() => enrollments.reduce((m, e) => ((m[e.sequence_id] ||= []).push(e), m), {}), [enrollments]);

  const toggle = async (seq) => {
    setBusy(seq.id);
    await base44.entities.MessageSequence.update(seq.id, { active: !seq.active });
    await load();
    setBusy(null);
  };

  const duplicate = async (seq) => {
    setBusy(seq.id);
    await base44.entities.MessageSequence.create({
      name: `${seq.name} (copy)`, description: seq.description, trigger_type: seq.trigger_type, trigger_value: seq.trigger_value,
      stop_on_reply: seq.stop_on_reply, stop_on_stage_change: seq.stop_on_stage_change, company_id: seq.company_id, active: false,
      workflow: { version: 1, nodes: workflowOf(seq, stepsBySeq[seq.id] || []).nodes },
    });
    await load();
    setBusy(null);
  };

  const remove = async (seq) => {
    const running = (enrBySeq[seq.id] || []).filter((e) => e.status === "active").length;
    if (!await confirmAction(`Delete "${seq.name}"?${running ? ` ${running} people in it will get nothing more.` : ""} Sent messages stay in the log.`)) return;
    await base44.entities.MessageSequence.delete(seq.id);
    load();
  };

  const addStarters = async () => {
    setBusy("starters");
    for (const d of STARTER_DRIPS) await base44.entities.MessageSequence.create({ ...d, active: false });
    await load();
    setBusy(null);
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Drips are workflows of emails, texts, waits, if/else splits and actions that run on their own.</p>
        {!readOnly && (
          <div className="flex gap-2">
            {!sequences.length && (
              <Button variant="outline" onClick={addStarters} disabled={busy === "starters"}>
                {busy === "starters" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />} Add starter drips
              </Button>
            )}
            <Button onClick={() => onOpen("new")}><Plus className="mr-2 h-4 w-4" /> New drip</Button>
          </div>
        )}
      </div>

      {!visible.length && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No drips yet. Start with the starter drips (new lead, quote follow-up with an opened/not-opened split, project complete) and edit them to sound like you.
        </div>
      )}

      {visible.map((seq) => {
        const seqSteps = stepsBySeq[seq.id] || [];
        const nodes = flattenNodes(workflowOf(seq, seqSteps));
        const enr = enrBySeq[seq.id] || [];
        const isOpen = expanded === seq.id;
        return (
          <div key={seq.id} className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-4 p-5">
              <button type="button" onClick={() => setExpanded(isOpen ? null : seq.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                {isOpen ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{seq.name}</p>
                    <Badge className={seq.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>{seq.active ? "On" : "Off"}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{triggerSummary(seq)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {nodes.slice(0, 14).map((n) => {
                      const Icon = NODE_ICON[n.type] || Square;
                      return <span key={n.id} title={NODE_LABEL[n.type]} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icon className="h-3 w-3" /></span>;
                    })}
                    {nodes.length > 14 && <span className="text-[11px] text-slate-500">+{nodes.length - 14}</span>}
                    {!nodes.length && <span className="text-[11px] text-rose-600">No steps</span>}
                  </div>
                </div>
              </button>
              <div className="flex gap-6 text-center">
                <div><p className="text-lg font-semibold text-slate-900">{enr.filter((e) => e.status === "active").length}</p><p className="text-[11px] text-slate-500">In drip</p></div>
                <div><p className="text-lg font-semibold text-slate-900">{enr.filter((e) => e.status === "completed").length}</p><p className="text-[11px] text-slate-500">Finished</p></div>
              </div>
              <div className="flex items-center gap-1">
                {!readOnly && <Switch checked={seq.active} disabled={busy === seq.id} onCheckedChange={() => toggle(seq)} aria-label="On / off" />}
                <Button size="sm" variant="outline" onClick={() => onOpen(seq.id)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> {readOnly ? "View" : "Edit flow"}</Button>
                {!readOnly && (
                  <>
                    <Button size="icon" variant="ghost" onClick={() => duplicate(seq)} disabled={busy === seq.id} title="Duplicate"><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-rose-600" onClick={() => remove(seq)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
            </div>
            {isOpen && <DripDetail seq={seq} steps={seqSteps} enrollments={enr} readOnly={readOnly} onChanged={load} />}
          </div>
        );
      })}
    </div>
  );
}
