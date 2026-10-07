import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES } from "@/lib/leadStages";
import { DELAY_UNITS, TRIGGERS, TRIGGER_VALUES, splitDelay, toMinutes } from "@/lib/messaging";
import { ACTION_KINDS, CONDITION_FIELDS, CONDITION_KINDS, FIELD_OPS } from "@/lib/workflow";
import MessageBodyEditor from "./MessageBodyEditor";

const Pick = ({ value, onChange, options, placeholder }) => (
  <Select value={value ?? ""} onValueChange={onChange}>
    <SelectTrigger className="mt-1"><SelectValue placeholder={placeholder || "Pick one"} /></SelectTrigger>
    <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
  </Select>
);

const Field = ({ label, hint, children }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
  </div>
);

// Drip name, what starts it, stop rules, on/off.
export function TriggerEditor({ meta, onChange }) {
  const set = (patch) => onChange({ ...meta, ...patch });
  const values = TRIGGER_VALUES[meta.trigger_type];
  return (
    <div className="space-y-4">
      <Field label="Drip name"><Input className="mt-1" value={meta.name} onChange={(e) => set({ name: e.target.value })} placeholder="New lead welcome" /></Field>
      <Field label="Starts when" hint={TRIGGERS.find((t) => t.key === meta.trigger_type)?.hint}>
        <Pick value={meta.trigger_type} onChange={(v) => set({ trigger_type: v, trigger_value: "" })} options={TRIGGERS.map((t) => ({ value: t.key, label: t.label }))} />
      </Field>
      {values && (
        <Field label={meta.trigger_type === "lead_stage" ? "Stage" : "Status"}>
          <Pick value={meta.trigger_value} onChange={(v) => set({ trigger_value: v })} options={values} />
        </Field>
      )}
      <Field label="Notes"><Textarea className="mt-1" rows={2} value={meta.description || ""} onChange={(e) => set({ description: e.target.value })} placeholder="What this drip is for" /></Field>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
        <Switch checked={meta.stop_on_reply} onCheckedChange={(v) => set({ stop_on_reply: v })} />
        <span className="text-sm"><span className="font-medium">Stop when they reply</span><br /><span className="text-xs text-slate-500">A text back ends the drip. Turn off to branch on "Have they replied?" instead.</span></span>
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
        <Switch checked={meta.stop_on_stage_change} onCheckedChange={(v) => set({ stop_on_stage_change: v })} />
        <span className="text-sm"><span className="font-medium">Stop when the stage changes</span><br /><span className="text-xs text-slate-500">Moving the lead (or project status) by hand ends it. "Change lead stage" steps in this drip don't.</span></span>
      </label>
    </div>
  );
}

function ConditionEditor({ node, onChange }) {
  const c = node.condition || {};
  const set = (patch) => onChange({ condition: { ...c, ...patch } });
  const op = FIELD_OPS.find((o) => o.key === c.op);
  return (
    <div className="space-y-4">
      <Field label="Check whether they…">
        <Pick value={c.kind} onChange={(v) => onChange({ condition: { kind: v, scope: "last", values: [], op: "equals" } })} options={CONDITION_KINDS.map((k) => ({ value: k.key, label: k.label }))} />
      </Field>
      {(c.kind === "email_opened" || c.kind === "email_clicked") && (
        <Field label="Which email" hint="Opens need open tracking turned on for your domain in Resend. Apple Mail can report opens that didn't happen, so clicks are the stronger signal.">
          <Pick value={c.scope || "last"} onChange={(v) => set({ scope: v })} options={[{ value: "last", label: "The last email this drip sent" }, { value: "any", label: "Any email from this drip" }]} />
        </Field>
      )}
      {c.kind === "replied" && <p className="text-xs text-slate-500">Yes if they've texted back since joining this drip. Turn off "Stop when they reply" (click the trigger) or a reply will end the drip before this check runs.</p>}
      {c.kind === "lead_stage" && (
        <Field label="Any of these stages">
          <div className="mt-2 space-y-1.5">
            {LEAD_STAGES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={(c.values || []).includes(s)}
                  onCheckedChange={(on) => set({ values: on ? [...(c.values || []), s] : (c.values || []).filter((x) => x !== s) })}
                />
                {s}
              </label>
            ))}
          </div>
        </Field>
      )}
      {c.kind === "field" && (
        <>
          <Field label="Field"><Pick value={c.field} onChange={(v) => set({ field: v })} options={CONDITION_FIELDS.map((f) => ({ value: f.key, label: f.label }))} /></Field>
          <Field label="Rule"><Pick value={c.op} onChange={(v) => set({ op: v })} options={FIELD_OPS.map((o) => ({ value: o.key, label: o.label }))} /></Field>
          {op?.needsValue && <Field label="Value" hint="Not case-sensitive."><Input className="mt-1" value={c.value || ""} onChange={(e) => set({ value: e.target.value })} /></Field>}
        </>
      )}
      <p className="rounded-xl bg-violet-50 p-3 text-xs text-violet-800">
        People go down <b>Yes</b> or <b>No</b>, then carry on with whatever comes after this split. Add an <b>End drip</b> step to a branch to stop there.
      </p>
    </div>
  );
}

function ActionEditor({ node, onChange, employees, sequences, currentId }) {
  const a = node.action || {};
  const set = (patch) => onChange({ action: { ...a, ...patch } });
  const people = employees.filter((e) => e.status !== "inactive");
  return (
    <div className="space-y-4">
      <Field label="Action">
        <Pick value={a.kind} onChange={(v) => onChange({ action: { kind: v } })} options={ACTION_KINDS.map((k) => ({ value: k.key, label: k.label }))} />
      </Field>
      {a.kind === "set_stage" && (
        <Field label="Move the lead to" hint="Only applies to leads. It also starts any drip set to that stage.">
          <Pick value={a.value} onChange={(v) => set({ value: v })} options={LEAD_STAGES.map((s) => ({ value: s, label: s }))} />
        </Field>
      )}
      {a.kind === "create_task" && (
        <>
          <Field label="To-do"><Input className="mt-1" value={a.title || ""} onChange={(e) => set({ title: e.target.value })} placeholder="Call {{full_name}} about their quote" /></Field>
          <Field label="Notes"><Textarea className="mt-1" rows={3} value={a.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due in (days)"><Input className="mt-1" type="number" min={0} value={a.due_days ?? 0} onChange={(e) => set({ due_days: Number(e.target.value) })} /></Field>
            <Field label="Priority">
              <Pick value={a.priority || "medium"} onChange={(v) => set({ priority: v })} options={["low", "medium", "high"].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
            </Field>
          </div>
          <Field label="Assign to" hint="Shows in the lead's or client's Next Steps.">
            <Pick value={a.assign === "" ? "__none__" : a.assign || "rep"} onChange={(v) => set({ assign: v === "__none__" ? "" : v })}
              options={[{ value: "rep", label: "Their sales rep / PM" }, { value: "__none__", label: "No one" }, ...people.map((e) => ({ value: e.full_name, label: e.full_name }))]} />
          </Field>
        </>
      )}
      {a.kind === "notify" && (
        <>
          <Field label="Who">
            <Pick value={a.to || "rep"} onChange={(v) => set({ to: v })}
              options={[{ value: "rep", label: "Their sales rep / PM" }, ...people.filter((e) => e.email).map((e) => ({ value: e.email, label: e.full_name }))]} />
          </Field>
          <Field label="Title"><Input className="mt-1" value={a.title || ""} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Message"><Textarea className="mt-1" rows={3} value={a.message || ""} onChange={(e) => set({ message: e.target.value })} /></Field>
          <p className="text-[11px] text-slate-500">Shows in the bell menu in the CRM. Merge fields like {"{{full_name}}"} work here.</p>
        </>
      )}
      {a.kind === "enroll" && (
        <Field label="Drip" hint="Starts them in that drip now, unless they're already in it. That drip must be turned on to send.">
          <Pick value={a.sequence_id} onChange={(v) => set({ sequence_id: v })}
            options={sequences.filter((s) => s.id !== currentId && s.trigger_type !== "broadcast").map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
      )}
    </div>
  );
}

function WaitEditor({ node, onChange }) {
  const { amount, unit } = splitDelay(node.minutes);
  return (
    <Field label="Wait for" hint="Texts also wait for your texting hours (Settings tab).">
      <div className="mt-1 flex gap-2">
        <Input type="number" min={0} className="w-28" value={amount} onChange={(e) => onChange({ minutes: toMinutes(e.target.value, unit) })} />
        <Select value={unit} onValueChange={(u) => onChange({ minutes: toMinutes(amount, u) })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{DELAY_UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </Field>
  );
}

const TITLES = { email: "Send email", sms: "Send text", wait: "Wait", condition: "If / else", action: "Action", end: "End drip" };

export default function NodeEditorPanel({ node, onChange, onMove, onDuplicate, onDelete, employees, sequences, currentId, problem, hereCount }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{TITLES[node.type] || "Step"}</h3>
        <div className="flex">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Move up" onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Move down" onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicate" onClick={onDuplicate}><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" title="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {problem && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{problem}</p>}
      {hereCount > 0 && <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-700">{hereCount} {hereCount === 1 ? "person is" : "people are"} at this step now. Deleting it finishes the drip for them.</p>}

      {(node.type === "email" || node.type === "sms") && (
        <MessageBodyEditor channel={node.type} value={{ subject: node.subject || "", body: node.body || "" }} onChange={(v) => onChange(v)} rows={9} />
      )}
      {node.type === "wait" && <WaitEditor node={node} onChange={onChange} />}
      {node.type === "condition" && <ConditionEditor node={node} onChange={onChange} />}
      {node.type === "action" && <ActionEditor node={node} onChange={onChange} employees={employees} sequences={sequences} currentId={currentId} />}
      {node.type === "end" && <p className="text-sm text-slate-600">The drip finishes for anyone who reaches this step. Nothing after it runs.</p>}
    </div>
  );
}
