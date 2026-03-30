import { useState, useEffect, useRef } from "react";
import { Plus, CheckCircle2, Circle, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clarity_quick_notes";

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function newItem(text = "") {
  return { id: Math.random().toString(36).slice(2), text, checked: false, checked_at: null };
}

export default function QuickNotes({ completedHideAfterHours = null }) {
  const [items, setItems] = useState(() => loadNotes());
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef();

  useEffect(() => { saveNotes(items); }, [items]);

  const addItem = () => {
    const text = inputVal.trim();
    if (!text) return;
    setItems(prev => [newItem(text), ...prev]);
    setInputVal("");
    inputRef.current?.focus();
  };

  const toggleItem = (id) => {
    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      checked: !i.checked,
      checked_at: !i.checked ? new Date().toISOString() : null,
    } : i));
  };

  const deleteItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateText = (id, text) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, text } : i));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") addItem();
  };

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
  const visibleChecked = completedHideAfterHours == null
    ? checked
    : checked.filter(i => {
        if (!i.checked_at) return true;
        return Date.now() - new Date(i.checked_at).getTime() < completedHideAfterHours * 60 * 60 * 1000;
      });

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#fff", borderColor: "#ddd5c8" }}>
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "#ede6dd", backgroundColor: "#faf8f5" }}>
        <h2 className="text-base font-semibold" style={{ color: "#3d3530" }}>Quick Notes</h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#ede6dd", color: "#7a6e66" }}>
          {unchecked.length} remaining
        </span>
      </div>

      {/* Input */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full border-2 shrink-0" style={{ borderColor: "#ddd5c8" }} />
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note item…"
          className="flex-1 text-sm outline-none bg-transparent placeholder:italic"
          style={{ color: "#3d3530" }}
        />
        <button
          onClick={addItem}
          disabled={!inputVal.trim()}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
          style={{ backgroundColor: "#b5965a", color: "#fff" }}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Unchecked items */}
      <div className="px-4 pb-2 space-y-0.5">
        {unchecked.map(item => (
          <NoteItem key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} onUpdate={updateText} />
        ))}
      </div>

      {/* Completed divider */}
      {visibleChecked.length > 0 && (
        <>
          <div className="mx-4 my-2 border-t" style={{ borderColor: "#ede6dd" }} />
          <div className="px-5 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#b5965a" }}>
              Completed · {visibleChecked.length}
            </p>
          </div>
          <div className="px-4 pb-4 space-y-0.5">
            {visibleChecked.map(item => (
              <NoteItem key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} onUpdate={updateText} />
            ))}
          </div>
        </>
      )}

      {unchecked.length === 0 && visibleChecked.length === 0 && (
        <div className="px-4 pb-6 pt-2 text-center">
          <p className="text-sm italic" style={{ color: "#b5965a" }}>No notes yet. Add one above!</p>
        </div>
      )}
    </div>
  );
}

function NoteItem({ item, onToggle, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(item.text);
  const inputRef = useRef();

  useEffect(() => { setLocal(item.text); }, [item.text]);

  const commit = () => {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed) onUpdate(item.id, trimmed);
    else setLocal(item.text);
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-1 rounded-xl group transition-colors hover:bg-slate-50">
      {/* Bubble check button */}
      <button
        onClick={() => onToggle(item.id)}
        className="shrink-0 transition-all"
        style={{ color: item.checked ? "#b5965a" : "#ddd5c8" }}
      >
        {item.checked
          ? <CheckCircle2 className="w-5 h-5" />
          : <Circle className="w-5 h-5 hover:text-amber-400 transition-colors" style={{ color: "#c9b8aa" }} />
        }
      </button>

      {/* Text */}
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commit(); }}
          className="flex-1 text-sm outline-none border-b border-amber-400 bg-transparent"
          style={{ color: "#3d3530" }}
        />
      ) : (
        <span
          onClick={() => { setEditing(true); }}
          className={cn("flex-1 text-sm cursor-text select-none", item.checked && "line-through")}
          style={{ color: item.checked ? "#b5965a" : "#3d3530" }}
        >
          {item.text}
        </span>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
        style={{ color: "#e11d48" }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}