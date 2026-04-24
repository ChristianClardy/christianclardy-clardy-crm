import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Plus, Search, X, Link2Off } from "lucide-react";

// ── URL detection helper ───────────────────────────────────────
function isUrl(val) {
  if (!val || typeof val !== "string") return false;
  return /^https?:\/\//i.test(val.trim()) || /^www\./i.test(val.trim());
}
function normalizeUrl(val) {
  const v = val.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

// ── Inline editable cell (Excel-style) ────────────────────────
// - Double-click opens edit mode
// - While selected (parent), typing a printable key opens edit replacing content
// - Tab → commit; Enter → commit; Esc → cancel
export function Cell({ value, onChange, className, placeholder, type = "text", centerAlign = false, editTrigger = null, editMode = "keep", onCommitNavigate }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  const divRef = useRef(null);
  const activateRef = useRef(null);
  activateRef.current = () => { setLocal(value ?? ""); setEditing(true); };

  useEffect(() => { setLocal(value ?? ""); }, [value]);
  useEffect(() => {
    if (!editTrigger) return;
    setLocal(editMode === "replace" ? "" : (value ?? ""));
    setEditing(true);
  }, [editTrigger]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const handler = () => activateRef.current?.();
    el.addEventListener("activate-for-edit", handler);
    return () => el.removeEventListener("activate-for-edit", handler);
  }, []);

  const commit = () => {
    setEditing(false);
    if (local !== value) onChange(local);
  };

  const cancel = () => {
    setLocal(value ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            onCommitNavigate?.("enter");
          }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
          if (e.key === "Tab") {
            e.preventDefault();
            commit();
            onCommitNavigate?.(e.shiftKey ? "shift+tab" : "tab");
          }
        }}
        className={cn(
          "w-full bg-white border border-amber-400 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-amber-400",
          centerAlign && "text-center",
          className
        )}
      />
    );
  }

  const isLink = isUrl(local);

  return (
    <div
      ref={divRef}
      data-editable
      className={cn(
        "px-2 py-1 rounded text-sm min-h-[28px] flex items-center select-none",
        centerAlign && "justify-center",
        isLink ? "cursor-pointer" : "cursor-default",
        className
      )}
      onClick={() => { setLocal(value ?? ""); setEditing(true); }}
    >
      {local ? (
        isLink ? (
          <a
            href={normalizeUrl(local)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800 truncate max-w-full"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setLocal(value ?? ""); setEditing(true); }}
          >
            {local}
          </a>
        ) : (
          <span className="truncate">{local}</span>
        )
      ) : (
        <span className="text-slate-300 italic">{placeholder}</span>
      )}
    </div>
  );
}

// ── Status options ─────────────────────────────────────────────
export const STATUS_OPTIONS = [
  { value: "Not Started", color: "bg-slate-100 text-slate-600" },
  { value: "Scheduled",   color: "bg-blue-100 text-blue-700" },
  { value: "In Progress", color: "bg-amber-100 text-amber-700" },
  { value: "On Hold",     color: "bg-orange-100 text-orange-700" },
  { value: "Completed",   color: "bg-emerald-100 text-emerald-700" },
  { value: "Blocked",     color: "bg-rose-100 text-rose-700" },
];

export const statusColor = (val) =>
  STATUS_OPTIONS.find((s) => s.value === val)?.color ?? "bg-slate-100 text-slate-500";

// ── Status dropdown cell ───────────────────────────────────────
export function StatusCell({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        className={cn("text-xs font-medium px-2 py-1 rounded-full w-full text-center whitespace-nowrap", statusColor(value) || "bg-slate-100 text-slate-500")}
        onClick={() => setOpen(!open)}
      >
        {value || "—"}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-xl w-36 py-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              className={cn("w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-slate-50", s.color.split(" ")[1])}
              onClick={() => { onChange(s.value); setOpen(false); }}
            >
              {s.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Percent bar cell ───────────────────────────────────────────
export function PercentCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? 0);

  useEffect(() => { setLocal(value ?? 0); }, [value]);

  const pct = Math.max(0, Math.min(100, Number(local) || 0));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0} max={100}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { setEditing(false); onChange(Number(local) || 0); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { setEditing(false); onChange(Number(local) || 0); } }}
        className="w-full border border-amber-400 rounded px-2 py-1 text-sm text-center outline-none"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 cursor-pointer" onDoubleClick={() => setEditing(true)}>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-amber-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Assignee cell ──────────────────────────────────────────────
export function AssigneeCell({ value, onChange, subcontractors, employees, onCreateSubcontractor }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSubcontractors, setCreatedSubcontractors] = useState([]);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const availableSubcontractors = [...createdSubcontractors, ...subcontractors.filter((sub) => !createdSubcontractors.some((created) => created.id === sub.id))];
  const q = search.toLowerCase();
  const filteredEmployees = employees.filter((e) => e.full_name.toLowerCase().includes(q));
  const filteredSubs = availableSubcontractors.filter((s) =>
    s.name.toLowerCase().includes(q) || (s.contact_person || "").toLowerCase().includes(q)
  );
  const hasResults = filteredEmployees.length > 0 || filteredSubs.length > 0;
  const canCreateSubcontractor = search.trim() && !availableSubcontractors.some((s) => s.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div ref={ref} className="relative">
      <div
        className="px-2 py-1 rounded cursor-pointer hover:bg-amber-50 text-sm min-h-[28px] flex items-center text-slate-600"
        onClick={() => { setOpen(true); setSearch(""); }}
      >
        {value || <span className="text-slate-300 italic">Assign…</span>}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-xl w-60 py-1">
          <div className="px-2 pb-1 pt-1 border-b border-slate-100">
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1">
              <Search className="w-3 h-3 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees or subs…"
                className="text-xs bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {value && (
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50 flex items-center gap-1.5"
                onClick={() => { onChange(""); setOpen(false); }}
              >
                <X className="w-3 h-3" /> Clear assignment
              </button>
            )}
            {filteredEmployees.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Employees</div>
                {filteredEmployees.map((e) => (
                  <button key={e.id} className="w-full text-left px-3 py-1.5 hover:bg-amber-50 transition-colors" onClick={() => { onChange(e.full_name); setOpen(false); }}>
                    <p className="text-xs font-medium text-slate-800">{e.full_name}</p>
                    <p className="text-xs text-slate-400 capitalize">{e.role?.replace(/_/g, " ")}</p>
                  </button>
                ))}
              </>
            )}
            {filteredSubs.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Subcontractors</div>
                {filteredSubs.map((s) => (
                  <button key={s.id} className="w-full text-left px-3 py-1.5 hover:bg-amber-50 transition-colors" onClick={() => { onChange(s.name); setOpen(false); }}>
                    <p className="text-xs font-medium text-slate-800">{s.name}</p>
                    {s.trade && <p className="text-xs text-slate-400 capitalize">{s.trade}</p>}
                  </button>
                ))}
              </>
            )}
            {!hasResults && <p className="text-xs text-slate-400 px-3 py-2 italic">No results</p>}
          </div>
          <div className="border-t border-slate-100 px-2 py-1.5 space-y-2">
            {canCreateSubcontractor && (
              <button
                className="w-full text-left px-2 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2 text-xs font-medium"
                disabled={creating}
                onClick={async () => {
                  setCreating(true);
                  try {
                    const created = onCreateSubcontractor
                      ? await onCreateSubcontractor(search.trim())
                      : await base44.entities.Subcontractor.create({
                          name: search.trim(),
                          trade: "Other",
                          status: "active",
                        });
                    setCreatedSubcontractors((prev) => [created, ...prev]);
                    onChange(created.name);
                    setOpen(false);
                  } catch (err) {
                    console.error("Failed to create subcontractor", err);
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {creating ? "Creating subcontractor..." : `Create subcontractor: ${search.trim()}`}
              </button>
            )}
            <div>
              <p className="text-xs text-slate-400 italic">Or type a custom name:</p>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && search.trim()) { onChange(search.trim()); setOpen(false); } }}
                placeholder="Press Enter to use custom…"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 mt-1 outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dependency cell ────────────────────────────────────────────
export function DependencyCell({ rowId, value, onChange, rows, rowNumber }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const taskRows = rows.filter(r => !r.is_section_header);
  const rowNumMap = {};
  taskRows.forEach((r, i) => { rowNumMap[r.id] = i + 1; });

  const predNum = value ? rowNumMap[value] : null;
  const predecessor = value ? rows.find(r => r.id === value) : null;
  const currentValue = predNum ? String(predNum) : "";

  const beginEdit = () => {
    setInputVal(currentValue);
    setEditing(true);
  };

  const commit = (raw) => {
    const trimmed = String(raw ?? "").trim();
    const num = parseInt(trimmed, 10);

    if (!trimmed) {
      if (!value) onChange(null);
      setEditing(false);
      return;
    }

    if (trimmed === currentValue) {
      setEditing(false);
      return;
    }

    if (!isNaN(num)) {
      const target = taskRows[num - 1];
      if (target && target.id !== rowId) onChange(target.id);
    }

    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={taskRows.length}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onBlur={() => commit(inputVal)}
        onKeyDown={e => {
          if (e.key === "Enter") commit(inputVal);
          if (e.key === "Escape") { setInputVal(currentValue); setEditing(false); }
        }}
        placeholder={`1–${taskRows.length}`}
        className="w-14 border border-amber-400 rounded px-2 py-1 text-xs text-center outline-none"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-xs min-h-[28px]",
        predNum ? "text-blue-700" : "text-slate-300 hover:text-slate-500"
      )}
      onClick={beginEdit}
      title={predecessor ? `Row ${predNum}: ${predecessor.task}` : "Click to set dependency by row number"}
    >
      {predNum ? (
        <>
          <span className="font-semibold bg-blue-100 text-blue-700 rounded px-1">{predNum}</span>
          <span className="text-slate-400 truncate max-w-[60px]">{predecessor?.task}</span>
          <button
            className="ml-auto text-rose-400 hover:text-rose-600"
            onClick={e => { e.stopPropagation(); onChange(null); }}
            title="Remove dependency"
          >
            <Link2Off className="w-3 h-3" />
          </button>
        </>
      ) : (
        <span className="italic">—</span>
      )}
    </div>
  );
}