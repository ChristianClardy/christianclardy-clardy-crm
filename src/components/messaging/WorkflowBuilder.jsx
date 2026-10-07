import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Minus, Plus, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { triggerSummary, TRIGGER_VALUES } from "@/lib/messaging";
import {
  computeNodeStats, duplicateNode, findNode, insertNode, makeNode, moveNode, removeNode, updateNode, validateWorkflow, workflowOf,
} from "@/lib/workflow";
import WorkflowCanvas from "./WorkflowCanvas";
import NodeEditorPanel, { TriggerEditor } from "./NodeEditorPanel";

const NEW_META = {
  name: "", description: "", trigger_type: "lead_created", trigger_value: "",
  stop_on_reply: true, stop_on_stage_change: true, active: false,
};

// Full-screen visual editor for one drip. sequenceId null = new drip.
export default function WorkflowBuilder({ sequenceId, onClose }) {
  const { readOnly } = useRolePermissions();
  const [meta, setMeta] = useState(NEW_META);
  const [flow, setFlow] = useState({ nodes: [] });
  const [selected, setSelected] = useState("trigger");
  const [stats, setStats] = useState({});
  const [sequences, setSequences] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [id, setId] = useState(sequenceId);

  useEffect(() => {
    (async () => {
      const [seqs, emps] = await Promise.all([
        base44.entities.MessageSequence.list("name", 500).catch(() => []),
        base44.entities.Employee.list("full_name", 500).catch(() => []),
      ]);
      setSequences(seqs);
      setEmployees(emps);
      if (sequenceId) {
        const seq = seqs.find((s) => s.id === sequenceId) || await base44.entities.MessageSequence.get(sequenceId);
        const [steps, enrollments, messages] = await Promise.all([
          base44.entities.MessageSequenceStep.filter({ sequence_id: sequenceId }, "step_order", 200),
          base44.entities.MessageEnrollment.filter({ sequence_id: sequenceId }, "-enrolled_at", 1000),
          base44.entities.Message.filter({ sequence_id: sequenceId }, "-created_date", 1000),
        ]);
        setMeta({
          name: seq.name || "", description: seq.description || "", trigger_type: seq.trigger_type, trigger_value: seq.trigger_value || "",
          stop_on_reply: seq.stop_on_reply, stop_on_stage_change: seq.stop_on_stage_change, active: seq.active,
        });
        setFlow(workflowOf(seq, steps));
        setStats(computeNodeStats(enrollments, messages, steps));
      } else {
        setFlow({ nodes: [makeNode("email")] });
      }
      setLoading(false);
    })();
  }, [sequenceId]);

  // Leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const problems = useMemo(() => validateWorkflow(flow), [flow]);
  const problemIds = useMemo(() => new Set(problems.map((p) => p.id).filter(Boolean)), [problems]);
  const node = selected && selected !== "trigger" ? findNode(flow, selected) : null;

  const edit = (next) => { setFlow(next); setDirty(true); };
  const editMeta = (next) => { setMeta(next); setDirty(true); };

  const insert = (listKey, index, key) => {
    const n = makeNode(key);
    edit(insertNode(flow, listKey, index, n));
    setSelected(n.id);
  };

  const remove = () => {
    if (node.type === "condition" && ((node.yes || []).length || (node.no || []).length)
      && !window.confirm("Delete this split and everything in its Yes and No branches?")) return;
    edit(removeNode(flow, node.id));
    setSelected("trigger");
  };

  const close = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    onClose(id);
  };

  const save = async (activate) => {
    setError("");
    if (!meta.name.trim()) { setSelected("trigger"); return setError("Give the drip a name."); }
    if (TRIGGER_VALUES[meta.trigger_type] && !meta.trigger_value) { setSelected("trigger"); return setError("Pick which stage / status starts it."); }
    if (problems.length) {
      if (problems[0].id) setSelected(problems[0].id);
      return setError(problems.length === 1 ? problems[0].message : `${problems.length} steps need finishing (outlined in red).`);
    }
    setSaving(true);
    try {
      const payload = {
        ...meta,
        active: activate ?? meta.active,
        trigger_value: TRIGGER_VALUES[meta.trigger_type] ? meta.trigger_value : null,
        workflow: { version: 1, nodes: flow.nodes },
      };
      const saved = id ? await base44.entities.MessageSequence.update(id, payload) : await base44.entities.MessageSequence.create(payload);
      if (!id) {
        const url = new URL(window.location.href);
        url.searchParams.set("drip", saved.id);
        window.history.replaceState(null, "", url);
      }
      setId(saved.id);
      setMeta((m) => ({ ...m, active: payload.active }));
      setDirty(false);
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const editable = !readOnly;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[600px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-6rem)]">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={close}><ArrowLeft className="mr-1.5 h-4 w-4" /> Drips</Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{meta.name || "Untitled drip"}</p>
          <p className="truncate text-xs text-slate-500">{triggerSummary(meta)}</p>
        </div>
        {dirty && <Badge className="bg-amber-100 text-amber-800">Unsaved</Badge>}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(1)))}><Minus className="h-3.5 w-3.5" /></Button>
          <button type="button" className="w-10 text-xs text-slate-600" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {editable && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={meta.active} onCheckedChange={(v) => (dirty || !id ? editMeta({ ...meta, active: v }) : save(v))} />
              {meta.active ? "On" : "Off"}
            </label>
            <Button onClick={() => save()} disabled={saving || (!dirty && !!id)}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
            </Button>
          </>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Canvas */}
        <div
          className="min-h-[320px] flex-1 overflow-auto bg-slate-50 dark:bg-slate-950"
          style={{ backgroundImage: "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected("trigger"); }}
        >
          <WorkflowCanvas
            flow={flow}
            trigger={{ title: triggerSummary(meta), subtitle: [meta.stop_on_reply && "stops on reply", meta.stop_on_stage_change && "stops on stage change"].filter(Boolean).join(" · ") }}
            selectedId={selected}
            onSelect={setSelected}
            onInsert={insert}
            stats={stats}
            problems={problemIds}
            sequences={sequences}
            editable={editable}
            zoom={zoom}
          />
        </div>

        {/* Inspector */}
        <div className="max-h-[50vh] w-full shrink-0 overflow-y-auto border-t border-slate-200 p-5 lg:max-h-none lg:w-[420px] lg:border-l lg:border-t-0">
          <fieldset disabled={!editable} className="contents">
            {selected === "trigger" || !node ? (
              <>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Trigger & settings</h3>
                <TriggerEditor meta={meta} onChange={editMeta} />
                <p className="mt-6 text-xs text-slate-500">Click a step in the flow to edit it, or a <b>+</b> to add one: emails, texts, waits, if/else splits and actions.</p>
              </>
            ) : (
              <NodeEditorPanel
                node={node}
                onChange={(patch) => edit(updateNode(flow, node.id, patch))}
                onMove={(dir) => edit(moveNode(flow, node.id, dir))}
                onDuplicate={() => edit(duplicateNode(flow, node.id))}
                onDelete={remove}
                employees={employees}
                sequences={sequences}
                currentId={id}
                problem={problems.find((p) => p.id === node.id)?.message}
                hereCount={stats[node.id]?.here || 0}
              />
            )}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
