import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Save, Search, X, ClipboardPaste, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import SheetStyleToolbar, { DEFAULT_SHEET_STYLE } from "@/components/sheet/SheetStyleToolbar";
import SheetFormattingBar from "@/components/sheet/SheetFormattingBar";

const DEFAULT_COLUMNS = [
  { key: "city",                        label: "City",                          width: 150 },
  { key: "login_portal",                label: "Login Portal",                  width: 160, isLink: true },
  { key: "username",                    label: "Username",                      width: 150 },
  { key: "email",                       label: "Email",                         width: 180 },
  { key: "password",                    label: "Password",                      width: 140 },
  { key: "registered_contractor_number",label: "Registered Contractor #",       width: 170 },
  { key: "security_question",           label: "Security Question",             width: 200 },
  { key: "security_answer",             label: "Security Answer",               width: 180 },
  { key: "name_on_file",                label: "Name on File",                  width: 150 },
  { key: "address",                     label: "Address",                       width: 200 },
  { key: "phone",                       label: "Phone #",                       width: 130 },
  { key: "fully_registered",            label: "Fully Registered?",             width: 130, type: "select", options: ["Yes", "No", "Pending"] },
  { key: "misc_info",                   label: "Misc Info",                     width: 240 },
];

/** Shorten a URL to just the hostname for display */
function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function EditableCell({ value, onChange, type = "text", options, fontSize, selected, onMouseDown, onMouseEnter, isLink = false }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");

  useEffect(() => { setLocal(value ?? ""); }, [value]);

  const commit = () => {
    setEditing(false);
    if (local !== (value ?? "")) onChange(local);
  };

  if (type === "select") {
    return (
      <div
        className={cn("w-full h-full", selected && "ring-2 ring-inset ring-blue-400")}
        onMouseDown={onMouseDown}
        onMouseEnter={onMouseEnter}
      >
        <select
          value={local}
          onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
          className="w-full bg-transparent text-slate-700 outline-none cursor-pointer px-2 py-1 rounded hover:bg-amber-50 focus:bg-white focus:ring-1 focus:ring-amber-400"
          style={{ fontSize: fontSize ? `${fontSize}px` : undefined }}
        >
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setLocal(value ?? ""); setEditing(false); } }}
        className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-amber-400"
      />
    );
  }

  const isUrl = isLink && local && (local.startsWith("http://") || local.startsWith("https://"));

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={() => setEditing(true)}
      className={cn(
        "px-2 py-1 rounded text-sm min-h-[28px] flex items-center",
        selected && "bg-blue-50 ring-2 ring-inset ring-blue-400"
      )}
    >
      {isUrl ? (
        <a
          href={local}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline truncate"
          title={local}
          onClick={e => e.stopPropagation()}
        >
          {shortenUrl(local)}
        </a>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="cursor-text hover:bg-amber-50 rounded w-full truncate text-slate-700"
          title={local}
        >
          {local || <span className="text-slate-300 italic text-xs">—</span>}
        </div>
      )}
    </div>
  );
}

function newColKey() { return `custom_${Math.random().toString(36).slice(2, 8)}`; }

function MuniRow({ row, ri, columns, sheetStyle, isRowSelected, dragOverId, isCellSelected, onRowDragStart, onRowDragEnter, onRowDragEnd, onSelectRow, updateCell, deleteRow, handleCellMouseDown, handleCellMouseEnter }) {
  const fmt = row._fmt || {};
  const rowBg = isRowSelected ? "#e0f2fe" : (fmt.bg || (ri % 2 === 0 ? sheetStyle.stripeEven : sheetStyle.stripeOdd));
  return (
    <tr
      data-row-id={row.id}
      draggable
      onDragStart={e => onRowDragStart(e, row.id)}
      onDragEnter={() => onRowDragEnter(row.id)}
      onDragOver={e => e.preventDefault()}
      onDragEnd={onRowDragEnd}
      className={cn("border-b border-slate-100 group transition-all", dragOverId === row.id && "border-t-2 border-t-amber-400")}
      style={{ backgroundColor: rowBg, height: sheetStyle.rowHeight }}
    >
      <td
        className="px-1 py-1 w-8 sticky left-0 z-10 cursor-pointer select-none"
        style={{ backgroundColor: isRowSelected ? "#bfdbfe" : rowBg }}
        title="Click to select row for formatting"
        onClick={onSelectRow}
      >
        <div className="flex items-center justify-center">
          {isRowSelected
            ? <span className="text-[10px] text-blue-600 font-bold w-5 text-center">{ri + 1}</span>
            : <GripVertical className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500" />
          }
        </div>
      </td>
      <td className="px-2 py-1 text-center text-xs text-slate-400 sticky left-8 z-10 select-none" style={{ backgroundColor: isRowSelected ? "#bfdbfe" : rowBg }}>
        {ri + 1}
      </td>
      {columns.map((col, ci) => {
        const sel = isCellSelected(ri, ci);
        return (
          <td key={col.key} className={cn("px-1 py-1 relative", sel && "bg-blue-50")} style={{ minWidth: col.width, width: col.width, color: sheetStyle.cellTextColor }}>
            <EditableCell
              value={row[col.key]}
              onChange={v => updateCell(row.id, col.key, v)}
              type={col.type || "text"}
              options={col.options}
              fontSize={sheetStyle.fontSize}
              selected={sel}
              onMouseDown={(e) => handleCellMouseDown(e, ri, ci)}
              onMouseEnter={() => handleCellMouseEnter(ri, ci)}
              isLink={col.isLink || false}
            />
            {sel && <div className="absolute inset-0 pointer-events-none border border-blue-400 z-10" />}
          </td>
        );
      })}
      <td className="px-2 py-1 sticky right-0 z-10" style={{ backgroundColor: isRowSelected ? "#bfdbfe" : rowBg }}>
        <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export default function Municipalities() {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [sheetStyle, setSheetStyle] = useState(() => {
    try { return JSON.parse(localStorage.getItem("muni_sheet_style")) || DEFAULT_SHEET_STYLE; } catch { return DEFAULT_SHEET_STYLE; }
  });
  const autosaveTimer = useRef(null);
  const pendingUpdates = useRef({});

  // Selection state
  const [selection, setSelection] = useState(null);
  const isDragging = useRef(false);
  const [pasteFlash, setPasteFlash] = useState(false);

  // Row formatting state (Smartsheet-style)
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());

  const applyRowFormat = (ids, key, value) => {
    setRows(prev => prev.map(r => {
      if (!ids.includes(r.id)) return r;
      if (key === "_clear") return { ...r, _fmt: {} };
      return { ...r, _fmt: { ...(r._fmt || {}), [key]: value } };
    }));
    setDirty(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveAll, 2000);
  };

  // Build scoped CSS for formatted rows
  const formattedRowStyles = rows
    .filter(r => r._fmt && Object.values(r._fmt).some(v => v))
    .map(r => {
      const f = r._fmt || {};
      const rules = [
        f.bold      && "font-weight: bold !important",
        f.italic    && "font-style: italic !important",
        f.underline && "text-decoration: underline !important",
        f.color     && `color: ${f.color} !important`,
        f.align     && `text-align: ${f.align} !important`,
      ].filter(Boolean).join("; ");
      if (!rules) return "";
      return `[data-row-id="${r.id}"] td, [data-row-id="${r.id}"] td * { ${rules} }`;
    })
    .join("\n");

  // Row drag-to-reorder
  const dragRowId = useRef(null);
  const dragOverRowId = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  const updateStyle = (s) => {
    setSheetStyle(s);
    localStorage.setItem("muni_sheet_style", JSON.stringify(s));
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.Municipality.list("-created_date", 500);
    setRows(data);
    setLoading(false);
  };

  const updateCell = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    if (!pendingUpdates.current[id]) pendingUpdates.current[id] = {};
    pendingUpdates.current[id][field] = value;
    setDirty(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveAll, 2000);
  };

  const saveAll = async () => {
    setSaving(true);
    const updates = { ...pendingUpdates.current };
    pendingUpdates.current = {};
    await Promise.all(
      Object.entries(updates).map(([id, data]) =>
        base44.entities.Municipality.update(id, data)
      )
    );
    setSaving(false);
    setDirty(false);
  };

  const addRow = async () => {
    const created = await base44.entities.Municipality.create({ city: "New City" });
    setRows(prev => [created, ...prev]);
  };

  const deleteRow = async (id) => {
    if (!confirm("Delete this row?")) return;
    await base44.entities.Municipality.delete(id);
    setRows(prev => prev.filter(r => r.id !== id));
    delete pendingUpdates.current[id];
  };

  const addColumn = () => {
    const key = newColKey();
    setColumns(prev => [...prev, { key, label: "New Column", width: 150 }]);
  };

  const updateColLabel = (key, label) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, label } : c));
  };

  const deleteColumn = (key) => {
    setColumns(prev => prev.filter(c => c.key !== key));
  };

  // ── Row drag-to-reorder ──────────────────────────────────────
  const onRowDragStart = (e, id) => {
    dragRowId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const onRowDragEnter = (id) => {
    if (dragRowId.current === id) return;
    dragOverRowId.current = id;
    setDragOverId(id);
  };

  const onRowDragEnd = () => {
    if (dragRowId.current && dragOverRowId.current && dragRowId.current !== dragOverRowId.current) {
      setRows(prev => {
        const copy = [...prev];
        const fromIdx = copy.findIndex(r => r.id === dragRowId.current);
        const toIdx = copy.findIndex(r => r.id === dragOverRowId.current);
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
        return copy;
      });
    }
    dragRowId.current = null;
    dragOverRowId.current = null;
    setDragOverId(null);
  };

  const filtered = rows.filter(r =>
    !search ||
    (r.city || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.name_on_file || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.username || "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Selection helpers ─────────────────────────────────────────
  const getNormSel = () => {
    if (!selection) return null;
    const r0 = Math.min(selection.anchor.ri, selection.focus.ri);
    const r1 = Math.max(selection.anchor.ri, selection.focus.ri);
    const c0 = Math.min(selection.anchor.ci, selection.focus.ci);
    const c1 = Math.max(selection.anchor.ci, selection.focus.ci);
    return { r0, r1, c0, c1 };
  };

  const isCellSelected = (ri, ci) => {
    const s = getNormSel();
    if (!s) return false;
    return ri >= s.r0 && ri <= s.r1 && ci >= s.c0 && ci <= s.c1;
  };

  const handleCellMouseDown = (e, ri, ci) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    if (e.shiftKey && selection) {
      setSelection(prev => ({ ...prev, focus: { ri, ci } }));
    } else {
      setSelection({ anchor: { ri, ci }, focus: { ri, ci } });
    }
  };

  const handleCellMouseEnter = (ri, ci) => {
    if (!isDragging.current) return;
    setSelection(prev => prev ? { ...prev, focus: { ri, ci } } : prev);
  };

  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  // ── Paste handler ─────────────────────────────────────────────
  const applyPaste = useCallback((text) => {
    if (!selection || !text) return;
    const s = getNormSel();
    if (!s) return;

    const pastedRows = text
      .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      .trimEnd()
      .split("\n")
      .map(line => line.split("\t"));

    setRows(prev => {
      const next = [...prev];
      const filteredRows = next.filter(r =>
        !search ||
        (r.city || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.name_on_file || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.username || "").toLowerCase().includes(search.toLowerCase())
      );

      pastedRows.forEach((pastedRowCells, gi) => {
        const targetRow = filteredRows[s.r0 + gi];
        if (!targetRow) return;
        const rowIdx = next.findIndex(r => r.id === targetRow.id);
        if (rowIdx === -1) return;
        const updated = { ...next[rowIdx] };

        pastedRowCells.forEach((cellVal, gj) => {
          const col = columns[s.c0 + gj];
          if (!col) return;
          updated[col.key] = cellVal.trim();
          if (!pendingUpdates.current[updated.id]) pendingUpdates.current[updated.id] = {};
          pendingUpdates.current[updated.id][col.key] = cellVal.trim();
        });

        next[rowIdx] = updated;
      });

      return next;
    });

    setDirty(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveAll, 2000);
    setPasteFlash(true);
    setTimeout(() => setPasteFlash(false), 1000);
  }, [selection, search, columns]);

  useEffect(() => {
    const handler = async (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!selection) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") || await navigator.clipboard.readText().catch(() => "");
      applyPaste(text);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [applyPaste, selection]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setSelection(null); return; }

      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        const s = getNormSel();
        if (!s) return;

        setRows(prev => {
          const next = [...prev];
          const filteredRows = next.filter(r =>
            !search ||
            (r.city || "").toLowerCase().includes(search.toLowerCase()) ||
            (r.name_on_file || "").toLowerCase().includes(search.toLowerCase()) ||
            (r.username || "").toLowerCase().includes(search.toLowerCase())
          );
          for (let ri = s.r0; ri <= s.r1; ri++) {
            const targetRow = filteredRows[ri];
            if (!targetRow) continue;
            const rowIdx = next.findIndex(r => r.id === targetRow.id);
            if (rowIdx === -1) continue;
            const updated = { ...next[rowIdx] };
            for (let ci = s.c0; ci <= s.c1; ci++) {
              const col = columns[ci];
              if (!col) continue;
              updated[col.key] = "";
              if (!pendingUpdates.current[updated.id]) pendingUpdates.current[updated.id] = {};
              pendingUpdates.current[updated.id][col.key] = "";
            }
            next[rowIdx] = updated;
          }
          return next;
        });

        setDirty(true);
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(saveAll, 2000);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, search, columns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const normSel = getNormSel();

  return (
    <div className="p-6 lg:p-8 max-w-full space-y-4" style={{ backgroundColor: "#f5f0eb" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.18em" }}>Reference</p>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Municipalities</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-px w-8" style={{ backgroundColor: "#b5965a" }} />
            <p className="text-sm" style={{ color: "#7a6e66" }}>Track login portals, credentials, and registration status by city.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500">
            {saving ? (
              <><div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />Saving…</>
            ) : dirty ? (
              <><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Unsaved</>
            ) : (
              <><Save className="w-3.5 h-3.5 text-emerald-500" />Autosaved</>
            )}
          </div>
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold tracking-wide transition-all duration-200"
            style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#b5965a"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "#3d3530"}
          >
            <Plus className="w-4 h-4" />
            Add Row
          </button>
        </div>
      </div>

      {/* Style Toolbar */}
      {formattedRowStyles && <style>{formattedRowStyles}</style>}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm space-y-2">
        <SheetStyleToolbar style={sheetStyle} onChange={updateStyle} />
        <SheetFormattingBar
          selectedRowIds={selectedRowIds}
          selectedColKeys={new Set()}
          rows={rows}
          onApplyRowFormat={applyRowFormat}
          onClearSelection={() => setSelectedRowIds(new Set())}
        />
      </div>

      {/* Search + paste hint */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search municipalities…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-amber-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pasteFlash && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-pulse">
              <ClipboardPaste className="w-3.5 h-3.5" /> Pasted!
            </div>
          )}
          {selection ? (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              <ClipboardPaste className="w-3.5 h-3.5" />
              {Math.abs(selection.focus.ri - selection.anchor.ri) + 1} × {Math.abs(selection.focus.ci - selection.anchor.ci) + 1} selected · Ctrl+V paste · Del clear · Esc cancel
              <button onClick={() => setSelection(null)} className="text-blue-400 hover:text-blue-600 ml-1"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Click a cell to select, drag to select range · Ctrl+V paste from Excel · Del to clear</p>
          )}
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative">
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
          <table
            className="border-collapse"
            style={{
              minWidth: columns.reduce((s, c) => s + c.width, 0) + 80,
              fontFamily: sheetStyle.fontFamily,
              fontSize: `${sheetStyle.fontSize}px`,
            }}
          >
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wider sticky top-0 z-20"
                style={{ backgroundColor: sheetStyle.headerBg, color: sheetStyle.headerText }}>
                {/* drag handle col */}
                <th className="w-8 px-1 py-3 sticky left-0 z-30" style={{ backgroundColor: sheetStyle.headerBg }} />
                <th className="w-10 px-2 py-3 text-center sticky left-8 z-30" style={{ backgroundColor: sheetStyle.headerBg }}>#</th>
                {columns.map((col, ci) => (
                  <th
                    key={col.key}
                    className="px-3 py-3 text-left whitespace-nowrap group/col relative"
                    style={{ minWidth: col.width, width: col.width }}
                  >
                    <div className="flex items-center gap-1">
                      <input
                        className="bg-transparent font-semibold uppercase tracking-wider text-xs outline-none focus:ring-1 focus:ring-amber-300 rounded px-0.5 w-full"
                        style={{ color: sheetStyle.headerText }}
                        value={col.label}
                        onChange={e => updateColLabel(col.key, e.target.value)}
                      />
                      {ci >= DEFAULT_COLUMNS.length && (
                        <button
                          className="opacity-0 group-hover/col:opacity-100 p-0.5 rounded hover:bg-rose-100 text-rose-400 flex-shrink-0"
                          onClick={() => deleteColumn(col.key)}
                          title="Delete column"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-10 px-2 py-3 sticky right-0 z-30" style={{ backgroundColor: sheetStyle.headerBg }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 3} className="text-center py-16 text-slate-400 italic text-sm">
                    No municipalities yet. Click "Add Row" to get started.
                  </td>
                </tr>
              )}
              {filtered.map((row, ri) => <MuniRow
                key={row.id}
                row={row}
                ri={ri}
                columns={columns}
                sheetStyle={sheetStyle}
                isRowSelected={selectedRowIds.has(row.id)}
                dragOverId={dragOverId}
                isCellSelected={isCellSelected}
                onRowDragStart={onRowDragStart}
                onRowDragEnter={onRowDragEnter}
                onRowDragEnd={onRowDragEnd}
                onSelectRow={(e) => {
                  e.stopPropagation();
                  setSelectedRowIds(prev => {
                    const next = new Set(prev);
                    if (e.shiftKey) {
                      const ids = filtered.map(r => r.id);
                      const lastSelected = [...next].pop();
                      const from = ids.indexOf(lastSelected);
                      const to = ids.indexOf(row.id);
                      if (from !== -1 && to !== -1) {
                        const [a, b] = [Math.min(from, to), Math.max(from, to)];
                        ids.slice(a, b + 1).forEach(id => next.add(id));
                      } else {
                        next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                      }
                    } else if (e.ctrlKey || e.metaKey) {
                      next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                    } else {
                      if (next.size === 1 && next.has(row.id)) return new Set();
                      return new Set([row.id]);
                    }
                    return next;
                  });
                }}
                updateCell={updateCell}
                deleteRow={deleteRow}
                handleCellMouseDown={handleCellMouseDown}
                handleCellMouseEnter={handleCellMouseEnter}
              />)}

            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={addRow}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Row
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{filtered.length} row{filtered.length !== 1 ? "s" : ""}</span>
            <button
              onClick={addColumn}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Column
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}