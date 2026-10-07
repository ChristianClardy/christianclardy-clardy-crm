import { Bell, CheckSquare, Clock, GitBranch, Mail, MessageSquare, Octagon, Plus, Shuffle, UserPlus, Zap } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { renderPreview } from "@/lib/messaging";
import { NODE_MENU, describeAction, describeCondition, describeWait } from "@/lib/workflow";

// Top-to-bottom flowchart of a drip workflow. If/else nodes split into Yes /
// No columns that join back up below. Editable: "+" between nodes, click a
// node to select it. Read-only: same picture with live counts.

const ACTION_ICON = { set_stage: Shuffle, create_task: CheckSquare, notify: Bell, enroll: UserPlus };

const STYLE = {
  email:     { icon: Mail,          label: "Email",   accent: "border-blue-200",    chip: "bg-blue-100 text-blue-700" },
  sms:       { icon: MessageSquare, label: "Text",    accent: "border-emerald-200", chip: "bg-emerald-100 text-emerald-700" },
  condition: { icon: GitBranch,     label: "If / else", accent: "border-violet-300", chip: "bg-violet-100 text-violet-700" },
  action:    { icon: Zap,           label: "Action",  accent: "border-amber-200",   chip: "bg-amber-100 text-amber-800" },
};

const Line = ({ className }) => <div className={cn("w-0.5 bg-slate-300 dark:bg-slate-600", className || "h-5")} />;

function AddButton({ listKey, index, onInsert, editable }) {
  if (!editable) return <Line className="h-7" />;
  return (
    <div className="flex flex-col items-center">
      <Line className="h-3" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:scale-110 hover:border-slate-900 hover:text-slate-900"
            aria-label="Add a step here"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-52">
          {NODE_MENU.map((g, gi) => (
            <div key={g.group}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] text-slate-400">{g.group}</DropdownMenuLabel>
              {g.items.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={() => onInsert(listKey, index, item.key)}>{item.label}</DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Line className="h-3" />
    </div>
  );
}

function HereBadge({ count, beside }) {
  if (!count) return null;
  return (
    <span className={cn(
      "absolute whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white shadow",
      beside ? "left-full top-1/2 ml-2 -translate-y-1/2" : "-right-2 -top-2"
    )}>
      {count} {beside ? "waiting" : "here"}
    </span>
  );
}

function NodeCard({ node, ctx }) {
  const { selectedId, onSelect, stats, problems, sequences } = ctx;
  const selected = selectedId === node.id;
  const problem = problems?.has(node.id);
  const s = stats?.[node.id] || {};
  const select = () => onSelect?.(node.id);
  const ring = selected ? "ring-2 ring-slate-900 ring-offset-2" : problem ? "ring-2 ring-rose-400" : "";

  if (node.type === "wait") {
    return (
      <button type="button" onClick={select} className={cn("relative flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-400", ring)}>
        <Clock className="h-4 w-4 text-slate-500" /> {describeWait(node.minutes)}
        <HereBadge count={s.here} beside />
      </button>
    );
  }
  if (node.type === "end") {
    return (
      <button type="button" onClick={select} className={cn("relative flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm", ring)}>
        <Octagon className="h-4 w-4" /> End drip
      </button>
    );
  }

  const st = STYLE[node.type] || STYLE.action;
  const Icon = node.type === "action" ? ACTION_ICON[node.action?.kind] || Zap : st.icon;
  let title = "";
  let detail = "";
  if (node.type === "email") { title = renderPreview(node.subject) || "No subject yet"; detail = renderPreview(node.body); }
  if (node.type === "sms") { title = renderPreview(node.body) || "No message yet"; }
  if (node.type === "condition") title = describeCondition(node.condition);
  if (node.type === "action") title = describeAction(node.action, sequences);

  return (
    <button
      type="button"
      onClick={select}
      className={cn("relative w-64 rounded-2xl border-2 bg-white p-3 text-left shadow-sm transition hover:shadow-md dark:bg-slate-900", st.accent, ring)}
    >
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", st.chip)}>
          <Icon className="h-3 w-3" /> {node.type === "action" ? "Action" : st.label}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      {detail && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{detail}</p>}
      {(node.type === "email" || node.type === "sms") && s.sent > 0 && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          {s.sent} sent
          {node.type === "email" && ` · ${Math.round(((s.opened || 0) / s.sent) * 100)}% opened · ${Math.round(((s.clicked || 0) / s.sent) * 100)}% clicked`}
          {s.failed ? ` · ${s.failed} failed` : ""}
        </p>
      )}
      <HereBadge count={s.here} />
    </button>
  );
}

function Branch({ side, cond, ctx }) {
  const list = cond[side] || [];
  const ends = list[list.length - 1]?.type === "end";
  const left = side === "yes";
  return (
    <div className="relative flex min-w-[17rem] flex-col items-center px-3">
      {/* top bar from the condition, and the bottom bar where branches rejoin */}
      <div className={cn("absolute top-0 h-0.5 bg-slate-300 dark:bg-slate-600", left ? "left-1/2 right-0" : "left-0 right-1/2")} />
      {!ends && <div className={cn("absolute bottom-0 h-0.5 bg-slate-300 dark:bg-slate-600", left ? "left-1/2 right-0" : "left-0 right-1/2")} />}
      <Line className="h-4" />
      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider", left ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
        {left ? "Yes" : "No"}
      </span>
      <NodeList list={list} listKey={`${cond.id}:${side}`} ctx={ctx} />
      {!ends && <Line className="min-h-4 flex-1" />}
    </div>
  );
}

function NodeList({ list, listKey, ctx }) {
  return (
    <div className="flex flex-col items-center">
      <AddButton listKey={listKey} index={0} onInsert={ctx.onInsert} editable={ctx.editable} />
      {list.map((node, i) => {
        const last = i === list.length - 1;
        return (
          <div key={node.id} className="flex flex-col items-center">
            <NodeCard node={node} ctx={ctx} />
            {node.type === "condition" && (
              <>
                <Line className="h-4" />
                <div className="flex items-stretch">
                  <Branch side="yes" cond={node} ctx={ctx} />
                  <Branch side="no" cond={node} ctx={ctx} />
                </div>
              </>
            )}
            {node.type !== "end" && (!last || ctx.editable || listKey === "root") && (
              <AddButton listKey={listKey} index={i + 1} onInsert={ctx.onInsert} editable={ctx.editable} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function WorkflowCanvas({
  flow, trigger, selectedId, onSelect, onInsert, stats, problems, sequences, editable = false, zoom = 1,
}) {
  const ctx = { selectedId, onSelect, onInsert, stats, problems, sequences, editable };
  const nodes = flow?.nodes || [];
  const endsExplicitly = nodes[nodes.length - 1]?.type === "end";
  return (
    <div className="inline-flex min-w-full justify-center p-8" style={{ zoom }}>
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => onSelect?.("trigger")}
          className={cn(
            "relative w-72 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left shadow-sm",
            selectedId === "trigger" && "ring-2 ring-slate-900 ring-offset-2"
          )}
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900"><Zap className="h-3 w-3" /> Trigger</span>
          <p className="mt-2 text-sm font-semibold text-slate-900">{trigger?.title}</p>
          {trigger?.subtitle && <p className="mt-0.5 text-xs text-slate-600">{trigger.subtitle}</p>}
          {stats?.enrolled ? <p className="mt-2 border-t border-amber-200 pt-2 text-[11px] text-amber-900">{stats.enrolled} enrolled so far</p> : null}
        </button>
        <NodeList list={nodes} listKey="root" ctx={ctx} />
        {!endsExplicitly && (
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-500">
            <Octagon className="h-3.5 w-3.5" /> Drip finishes{stats?.completed ? ` · ${stats.completed} finished` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
