import { useState } from "react";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SubtaskList({ subtasks = [], onChange }) {
  const [newTitle, setNewTitle] = useState("");

  const add = () => {
    const t = newTitle.trim();
    if (!t) return;
    onChange([...subtasks, { id: Math.random().toString(36).slice(2), title: t, completed: false }]);
    setNewTitle("");
  };

  const toggle = (id) => {
    onChange(subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const remove = (id) => {
    onChange(subtasks.filter(s => s.id !== id));
  };

  const updateTitle = (id, title) => {
    onChange(subtasks.map(s => s.id === id ? { ...s, title } : s));
  };

  const completedCount = subtasks.filter(s => s.completed).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Subtasks {subtasks.length > 0 && `· ${completedCount}/${subtasks.length}`}
        </span>
      </div>

      <div className="space-y-1">
        {subtasks.map(s => (
          <div key={s.id} className="flex items-center gap-2 group">
            <button onClick={() => toggle(s.id)} className={cn("shrink-0 transition-colors", s.completed ? "text-emerald-500" : "text-slate-300 hover:text-slate-400")}>
              {s.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            </button>
            <input
              value={s.title}
              onChange={e => updateTitle(s.id, e.target.value)}
              className={cn("flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-amber-300", s.completed && "line-through text-slate-400")}
            />
            <button onClick={() => remove(s.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-600">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add subtask…"
          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-amber-300"
        />
        <button
          type="button"
          onClick={add}
          disabled={!newTitle.trim()}
          className="p-1.5 rounded-lg bg-amber-100 text-amber-600 hover:bg-amber-200 disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}