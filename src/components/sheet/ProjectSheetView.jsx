import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, Save, PlusCircle, ArrowUpDown, ArrowUp, ArrowDown, SlidersHorizontal, X, LayoutList, GanttChart, Bell, BellPlus, Sparkles, CalendarDays, IndentIncrease, IndentDecrease, Printer, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import GanttView from "./GanttView";
import TemplatePicker from "@/components/projects/TemplatePicker";
import SheetStyleToolbar, { DEFAULT_SHEET_STYLE } from "./SheetStyleToolbar";
import SheetFormattingBar from "./SheetFormattingBar";
import { Cell, StatusCell, PercentCell, AssigneeCell, DependencyCell } from "./SheetCells";
import projectSheetOrdering from "@/lib/projectSheetOrdering";
import DEFAULT_PROJECT_SHEET_TEMPLATE from "./defaultProjectSheetTemplate";

function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function parseDurationDays(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  const match = s.match(/^(\d+\.?\d*)\s*(d|day|days|w|week|weeks)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2] || "d";
  if (unit.startsWith("w")) return Math.round(num * 7);
  return Math.round(num);
}
function formatDuration(days) {
  if (!days || days <= 0) return "";
  if (days % 7 === 0 && days >= 7) return `${days / 7} week${days / 7 !== 1 ? "s" : ""}`;
  return `${days} day${days !== 1 ? "s" : ""}`;
}
function propagateDependencies(rows, changedId) {
  const map = Object.fromEntries(rows.map(r => [r.id, { ...r }]));
  const visited = new Set();
  function propagate(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const row = map[id];
    if (!row || !row.end_date) return;
    rows.forEach(r => {
      if (r.depends_on === id && !r.is_section_header) {
        const dep = map[r.id];
        if (!dep) return;
        const newStart = addDays(row.end_date, 1);
        if (dep.start_date !== newStart) {
          const duration = dep.start_date && dep.end_date ? daysBetween(dep.start_date, dep.end_date) : 0;
          dep.start_date = newStart;
          dep.end_date = duration > 0 ? addDays(newStart, duration) : dep.end_date;
          map[dep.id] = dep;
        }
        propagate(dep.id);
      }
    });
  }
  propagate(changedId);
  return rows.map(r => map[r.id] || r);
}
function newId() {
  return Math.random().toString(36).slice(2, 10);
}
function SortIcon({ col, sortConfig }) {
  if (sortConfig.col !== col) return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-300 inline-block" />;
  return sortConfig.dir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-amber-500 inline-block" /> : <ArrowDown className="w-3 h-3 ml-1 text-amber-500 inline-block" />;
}
function FilterDropdown({ col, filters, setFilters, rows, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const taskRows = rows.filter((r) => !r.is_section_header);
  const uniqueValues = [...new Set(taskRows.map((r) => r[col]).filter(Boolean))].sort();
  const current = filters[col] || "";
  const active = !!current;
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(!open)} className={cn("ml-1 p-0.5 rounded transition-colors", active ? "text-amber-500" : "text-slate-300 hover:text-slate-500")} title={`Filter ${label}`}>
        <SlidersHorizontal className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-xl w-44 py-1 text-xs">
          <div className="px-2 pt-1 pb-1 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-100">Filter by {label}</div>
          {col === "start_date" || col === "end_date" ? (
            <div className="px-2 py-2 space-y-1">
              <label className="text-slate-500">From</label>
              <input type="date" value={filters[`${col}_from`] || ""} onChange={(e) => setFilters((f) => ({ ...f, [`${col}_from`]: e.target.value }))} className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-400" />
              <label className="text-slate-500">To</label>
              <input type="date" value={filters[`${col}_to`] || ""} onChange={(e) => setFilters((f) => ({ ...f, [`${col}_to`]: e.target.value }))} className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-400" />
              <button className="w-full text-rose-500 hover:bg-rose-50 rounded px-2 py-1 text-left" onClick={() => { setFilters((f) => { const n = { ...f }; delete n[`${col}_from`]; delete n[`${col}_to`]; return n; }); setOpen(false); }}>Clear</button>
            </div>
          ) : (
            <>
              <button className={cn("w-full text-left px-3 py-1.5 hover:bg-slate-50", !current && "font-semibold text-amber-600")} onClick={() => { setFilters((f) => { const n = { ...f }; delete n[col]; return n; }); setOpen(false); }}>All</button>
              {uniqueValues.map((v) => (
                <button key={v} className={cn("w-full text-left px-3 py-1.5 hover:bg-amber-50", current === v && "font-semibold text-amber-600")} onClick={() => { setFilters((f) => ({ ...f, [col]: v })); setOpen(false); }}>{v}</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
const BUILTIN_COLS = [
  { key: "task", label: "Task / Phase", width: "w-[260px]", align: "left" },
  { key: "assigned_to", label: "Assigned To", width: "w-[140px]", align: "left" },
  { key: "depends_on", label: "Depends On", width: "w-[140px]", align: "left" },
  { key: "start_date", label: "Start Date", width: "w-[120px]", align: "center" },
  { key: "end_date", label: "End Date", width: "w-[120px]", align: "center" },
  { key: "duration", label: "Duration", width: "w-[80px]", align: "center" },
  { key: "status", label: "Status", width: "w-[120px]", align: "center" },
  { key: "percent_complete", label: "Progress", width: "w-[150px]", align: "left" },
  { key: "notes", label: "Notes", width: "", align: "left" },
];

export default function ProjectSheetView({ projectId, focusTaskId, externalGanttZoom, onGanttZoomChange, onRowsChange, externalRows }) {
  const [rows, setRows] = useState([]);
  const [sheetId, setSheetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autosaveTimer = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [collapsedParents, setCollapsedParents] = useState({});
  const [subcontractors, setSubcontractors] = useState([]);
  const [sortConfig, setSortConfig] = useState({ col: null, dir: "asc" });
  const [filters, setFilters] = useState({});
  const [extraCols, setExtraCols] = useState([]);
  const [hiddenBuiltinCols, setHiddenBuiltinCols] = useState([]);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [selectedColKeys, setSelectedColKeys] = useState(new Set());
  const [viewMode, setViewMode] = useState("sheet");
  const dragRow = useRef(null);
  const dragOver = useRef(null);
  const [selection, setSelection] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [copyFlash, setCopyFlash] = useState(false);
  const lastActiveCellRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [reminderDialog, setReminderDialog] = useState(null);
  const [reminderForm, setReminderForm] = useState({ title: "", remind_date: "", notes: "" });
  const [reminderSaving, setReminderSaving] = useState(false);
  const [aiScheduleDialog, setAiScheduleDialog] = useState(false);
  const [aiStartDate, setAiStartDate] = useState("");
  const [aiScheduleLoading, setAiScheduleLoading] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sheetStyle, setSheetStyle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sheet_style_${projectId}`)) || DEFAULT_SHEET_STYLE; } catch { return DEFAULT_SHEET_STYLE; }
  });
  const updateSheetStyle = (s) => {
    setSheetStyle(s);
    localStorage.setItem(`sheet_style_${projectId}`, JSON.stringify(s));
  };
  useEffect(() => { loadSheet(); loadSubcontractors(); loadEmployees(); loadTemplates(); }, [projectId]);
  const selectedRowIdRef = useRef(null);
  selectedRowIdRef.current = selectedRowId;
  const getVisibleCols = () => [...BUILTIN_COLS.filter(c => !hiddenBuiltinCols.includes(c.key)).map(c => c.key), ...extraCols.map(c => c.key)];
  const getTaskDisplayRows = () => getDisplayRows().filter(r => r._type === "task");
  const getNormSel = (sel) => {
    if (!sel) return null;
    return {
      r0: Math.min(sel.anchor.rowIdx, sel.focus.rowIdx),
      r1: Math.max(sel.anchor.rowIdx, sel.focus.rowIdx),
      c0: Math.min(sel.anchor.colIdx, sel.focus.colIdx),
      c1: Math.max(sel.anchor.colIdx, sel.focus.colIdx),
    };
  };
  const isCellSelected = (rowIdx, colIdx) => {
    const s = getNormSel(selection);
    if (!s) return false;
    return rowIdx >= s.r0 && rowIdx <= s.r1 && colIdx >= s.c0 && colIdx <= s.c1;
  };
  const getFocusedCellSelection = () => {
    const activeElement = document.activeElement;
    const activeCell = activeElement instanceof HTMLElement ? activeElement.closest("td") : null;
    const activeRow = activeCell?.closest?.('tr[data-row-id]');
    const activeRowId = activeRow?.getAttribute('data-row-id');
    const activeRowIdx = activeRowId ? taskDisplayRowIdxMap[activeRowId] : undefined;
    const activeCellIndex = activeCell ? Array.from(activeCell.parentElement?.children || []).indexOf(activeCell) : -1;
    const activeColIdx = activeCellIndex >= 2 ? activeCellIndex - 2 : undefined;
    if (activeRowIdx === undefined || activeColIdx === undefined || activeColIdx < 0) return null;
    return { rowIdx: activeRowIdx, colIdx: activeColIdx };
  };
  const handleCellClick = (e, rowIdx, colIdx) => {
    e.stopPropagation();
    lastActiveCellRef.current = { rowIdx, colIdx };
    if (e.shiftKey && selection) setSelection(prev => ({ ...prev, focus: { rowIdx, colIdx } }));
    else setSelection({ anchor: { rowIdx, colIdx }, focus: { rowIdx, colIdx } });
  };
  const getSelectedTaskIdsFromCellSelection = () => {
    const s = getNormSel(selection);
    if (!s) return [];
    return getTaskDisplayRows().slice(s.r0, s.r1 + 1).map((row) => row.id);
  };
  useEffect(() => {
    const handler = async (e) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const cmdHeld = isMac ? e.metaKey : e.ctrlKey;
      const isIndentShortcut = e.key === "]" || e.code === "BracketRight";
      const isOutdentShortcut = e.key === "[" || e.code === "BracketLeft";
      if (cmdHeld && (isIndentShortcut || isOutdentShortcut)) {
        const selectedIds = Array.from(selectedRowIds);
        const cellSelectedIds = selection ? getSelectedTaskIdsFromCellSelection() : [];
        const targetIds = selectedIds.length > 0 ? selectedIds : cellSelectedIds;
        const rowId = selectedRowIdRef.current;
        if (targetIds.length > 0) {
          e.preventDefault();
          if (isIndentShortcut) indentSelectedRows(targetIds);
          if (isOutdentShortcut) outdentSelectedRows(targetIds);
          return;
        }
        if (rowId) {
          e.preventDefault();
          if (isIndentShortcut) indentRow(rowId);
          if (isOutdentShortcut) outdentRow(rowId);
          return;
        }
      }
      if (e.key === "Escape") {
        setSelection(null);
        return;
      }
      if (!cmdHeld) return;
      const visibleCols = getVisibleCols();
      const taskRows = getTaskDisplayRows();
      const focusedCell = getFocusedCellSelection() || lastActiveCellRef.current;
      const hasSelection = !!selection;
      const hasMultiSelection = hasSelection && (selection.anchor.rowIdx !== selection.focus.rowIdx || selection.anchor.colIdx !== selection.focus.colIdx);
      const effectiveSelection = selection || (focusedCell ? { anchor: focusedCell, focus: focusedCell } : null);
      if (!effectiveSelection) return;
      const s = getNormSel(effectiveSelection);
      if (!s) return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (focusedCell && !hasMultiSelection) {
          const row = taskRows[focusedCell.rowIdx];
          const col = visibleCols[focusedCell.colIdx];
          const value = row && col ? (row[col] ?? "") : "";
          const grid = [[value]];
          setClipboard(grid);
          navigator.clipboard.writeText(String(value)).catch(() => {});
          setSelection({ anchor: focusedCell, focus: focusedCell });
          setCopyFlash(true);
          setTimeout(() => setCopyFlash(false), 600);
          return;
        }
        const grid = [];
        for (let ri = s.r0; ri <= s.r1; ri++) {
          const row = taskRows[ri];
          if (!row) continue;
          const rowVals = [];
          for (let ci = s.c0; ci <= s.c1; ci++) {
            const col = visibleCols[ci];
            rowVals.push(col ? (row[col] ?? "") : "");
          }
          grid.push(rowVals);
        }
        setClipboard(grid);
        navigator.clipboard.writeText(grid.map(r => r.join("\t")).join("\n")).catch(() => {});
        setCopyFlash(true);
        setTimeout(() => setCopyFlash(false), 600);
      }
      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        let grid = clipboard;
        try {
          const text = await navigator.clipboard.readText();
          if (text) grid = text.split("\n").map(r => r.split("\t"));
        } catch {}
        if (!grid || grid.length === 0) return;
        const startRow = s.r0;
        const startCol = s.c0;
        const singleValuePaste = grid.length === 1 && (grid[0]?.length || 0) === 1;
        setRows(prev => {
          const next = [...prev];
          if (singleValuePaste) {
            const pastedValue = grid[0][0];
            for (let ri = s.r0; ri <= s.r1; ri++) {
              const targetTaskRow = taskRows[ri];
              if (!targetTaskRow) continue;
              const rowIdx = next.findIndex(r => r.id === targetTaskRow.id);
              if (rowIdx === -1) continue;
              const updated = { ...next[rowIdx] };
              for (let ci = s.c0; ci <= s.c1; ci++) {
                const col = visibleCols[ci];
                if (!col || col === "depends_on") continue;
                updated[col] = pastedValue;
              }
              next[rowIdx] = updated;
            }
            return next;
          }
          for (let gi = 0; gi < grid.length; gi++) {
            const targetTaskRow = taskRows[startRow + gi];
            if (!targetTaskRow) break;
            const rowIdx = next.findIndex(r => r.id === targetTaskRow.id);
            if (rowIdx === -1) continue;
            const updated = { ...next[rowIdx] };
            for (let gj = 0; gj < grid[gi].length; gj++) {
              const col = visibleCols[startCol + gj];
              if (!col) break;
              if (col === "depends_on") continue;
              updated[col] = grid[gi][gj];
            }
            next[rowIdx] = updated;
          }
          return next;
        });
        setDirty(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, clipboard, hiddenBuiltinCols, extraCols, rows, filters, sortConfig, collapsedSections, collapsedParents, selectedRowIds]);
  useEffect(() => {
    if (!dirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { save(); }, 2000);
    return () => clearTimeout(autosaveTimer.current);
  }, [rows, dirty]);
  useEffect(() => {
    if (rows.length > 0) onRowsChange?.(rows);
  }, [rows]);
  useEffect(() => {
    if (externalRows && externalRows.length > 0) {
      setRows(projectSheetOrdering.sortSheetRowsByDates(externalRows));
      setDirty(true);
    }
  }, [externalRows]);
  useEffect(() => {
    if (!focusTaskId || viewMode !== "sheet" || rows.length === 0) return;
    const targetRow = rows.find((row) => row.id === focusTaskId && !row.is_section_header);
    if (!targetRow) return;
    setSelectedRowId(focusTaskId);
    const timer = setTimeout(() => {
      const element = document.querySelector(`[data-row-id="${focusTaskId}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => clearTimeout(timer);
  }, [focusTaskId, rows, viewMode]);
  const loadEmployees = async () => {
    const emps = await base44.entities.Employee.list();
    setEmployees(emps.filter(e => e.status === "active"));
  };
  const loadTemplates = async () => {
    const templates = await base44.entities.ProjectSheetTemplate.list();
    setSavedTemplates(templates);
  };
  const applyTemplate = (selection) => {
    setSelectedTemplate(selection);
    const templateRows = selection?.template?.rows || [];
    if (templateRows.length) {
      setRows(templateRows);
      setDirty(true);
    }
  };
  const loadSheet = async () => {
    setLoading(true);
    const existing = await base44.entities.ProjectSheet.filter({ project_id: projectId });
    if (existing.length > 0) {
      setSheetId(existing[0].id);
      const loadedRows = projectSheetOrdering.sortSheetRowsByDates(existing[0].rows || []);
      setRows(loadedRows);
      onRowsChange?.(loadedRows);
    } else {
      setRows([]);
      onRowsChange?.([]);
    }
    setLoading(false);
  };
  const loadSubcontractors = async () => {
    const subs = await base44.entities.Subcontractor.list();
    setSubcontractors(subs);
  };
  const save = async () => {
    setSaving(true);
    if (sheetId) await base44.entities.ProjectSheet.update(sheetId, { rows });
    else {
      const created = await base44.entities.ProjectSheet.create({ project_id: projectId, rows });
      setSheetId(created.id);
    }
    const taskRows = rows.filter((r) => !r.is_section_header);
    if (taskRows.length > 0) {
      const avg = Math.round(taskRows.reduce((sum, r) => sum + (Number(r.percent_complete) || 0), 0) / taskRows.length);
      await base44.entities.Project.update(projectId, { percent_complete: avg });
    }
    setSaving(false);
    setDirty(false);
  };
  const updateRow = (id, field, value) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        let next = { ...r, [field]: value };
        if (field === "status" && value === "Completed") next.percent_complete = 100;
        if (field === "percent_complete") {
          const pct = Number(value);
          if (pct === 0) next.status = "Not Started";
          else if (pct === 100) next.status = "Completed";
          else if (pct < 100 && r.status === "Completed") next.status = "In Progress";
        }
        if (field === "depends_on" && value) {
          const predecessor = prev.find(r => r.id === value);
          if (predecessor && predecessor.end_date) {
            const newStart = addDays(predecessor.end_date, 1);
            next.start_date = newStart;
            const days = parseDurationDays(r.duration);
            if (days) next.end_date = addDays(newStart, days - 1);
          }
        }
        if (field === "start_date" || field === "duration") {
          const start = field === "start_date" ? value : r.start_date;
          const durStr = field === "duration" ? value : r.duration;
          const days = parseDurationDays(durStr);
          if (start && days) next.end_date = addDays(start, days - 1);
        } else if (field === "end_date") {
          const start = r.start_date;
          const end = value;
          if (start && end && end >= start) next.duration = formatDuration(daysBetween(start, end) + 1);
        }
        return next;
      });
      if (["end_date", "start_date", "depends_on", "duration"].includes(field)) return projectSheetOrdering.sortSheetRowsByDates(propagateDependencies(updated, id));
      return updated;
    });
    setDirty(true);
  };
  const addRow = (afterId, indentLevel = 0) => {
    const idx = rows.findIndex((r) => r.id === afterId);
    const newRow = { id: newId(), is_section_header: false, indent: indentLevel, section: "", task: "New Task", assigned_to: "", start_date: "", end_date: "", duration: "", status: "Not Started", percent_complete: 0, notes: "" };
    const next = [...rows];
    next.splice(idx + 1, 0, newRow);
    setRows(next);
    setDirty(true);
  };
  const addChildRow = (parentId) => {
    const parent = rows.find(r => r.id === parentId);
    const parentIndent = parent?.indent || 0;
    const childIndent = Math.min(parentIndent + 1, 2);
    const parentIdx = rows.findIndex(r => r.id === parentId);
    let insertAfterIdx = parentIdx;
    for (let i = parentIdx + 1; i < rows.length; i++) {
      if (rows[i].is_section_header || (rows[i].indent ?? 0) <= parentIndent) break;
      insertAfterIdx = i;
    }
    const newRow = { id: newId(), is_section_header: false, indent: childIndent, section: "", task: "New Task", assigned_to: "", start_date: "", end_date: "", duration: "", status: "Not Started", percent_complete: 0, notes: "" };
    const next = [...rows];
    next.splice(insertAfterIdx + 1, 0, newRow);
    setRows(next);
    setDirty(true);
  };
  const getRowBranchRange = (rowList, rowId) => {
    const start = rowList.findIndex((r) => r.id === rowId);
    if (start === -1) return null;
    const baseIndent = rowList[start]?.indent || 0;
    let end = start + 1;
    while (end < rowList.length && !rowList[end].is_section_header && (rowList[end].indent || 0) > baseIndent) end++;
    return { start, end };
  };
  const shiftRowBranch = (rowList, rowId, delta) => {
    if (!delta) return rowList;
    const range = getRowBranchRange(rowList, rowId);
    if (!range) return rowList;
    return rowList.map((row, index) => index < range.start || index >= range.end ? row : { ...row, indent: Math.max((row.indent || 0) + delta, 0) });
  };
  const indentRow = (rowId) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId);
      if (idx <= 0) return prev;
      const currentRow = prev[idx];
      const previousRow = prev[idx - 1];
      if (!currentRow || currentRow.is_section_header || !previousRow || previousRow.is_section_header) return prev;
      const targetIndent = (previousRow.indent || 0) + 1;
      return shiftRowBranch(prev, rowId, targetIndent - (currentRow.indent || 0));
    });
    setDirty(true);
  };
  const outdentRow = (rowId) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === rowId);
      if (!row || row.is_section_header || (row.indent || 0) === 0) return prev;
      return shiftRowBranch(prev, rowId, -1);
    });
    setDirty(true);
  };
  const getSelectedBranchRootIds = (rowList, selectedIds) => {
    const selectedSet = new Set(selectedIds);
    return rowList.filter((row) => selectedSet.has(row.id) && !row.is_section_header).filter((row) => {
      const rowIndex = rowList.findIndex((item) => item.id === row.id);
      const rowIndent = row.indent || 0;
      for (let i = rowIndex - 1; i >= 0; i--) {
        const previousRow = rowList[i];
        if (previousRow.is_section_header) break;
        const previousIndent = previousRow.indent || 0;
        if (previousIndent < rowIndent) return !selectedSet.has(previousRow.id);
      }
      return true;
    }).map((row) => row.id);
  };
  const indentSelectedRows = (selectedIds) => {
    setRows((prev) => {
      const rootIds = getSelectedBranchRootIds(prev, selectedIds);
      const deltas = rootIds.map((rowId) => {
        const idx = prev.findIndex((r) => r.id === rowId);
        if (idx <= 0) return { rowId, delta: 0 };
        const currentRow = prev[idx];
        const previousRow = prev[idx - 1];
        if (!currentRow || currentRow.is_section_header || !previousRow || previousRow.is_section_header) return { rowId, delta: 0 };
        return { rowId, delta: ((previousRow.indent || 0) + 1) - (currentRow.indent || 0) };
      });
      let next = prev;
      deltas.forEach(({ rowId, delta }) => { next = shiftRowBranch(next, rowId, delta); });
      return next;
    });
    setDirty(true);
  };
  const outdentSelectedRows = (selectedIds) => {
    setRows((prev) => {
      const rootIds = getSelectedBranchRootIds(prev, selectedIds);
      let next = prev;
      rootIds.forEach((rowId) => {
        const row = next.find((r) => r.id === rowId);
        if (!row || row.is_section_header || (row.indent || 0) === 0) return;
        next = shiftRowBranch(next, rowId, -1);
      });
      return next;
    });
    setDirty(true);
  };
  const insertRowAbove = (rowId) => {
    const idx = rows.findIndex((r) => r.id === rowId);
    const sameIndent = rows[idx]?.indent || 0;
    const newRow = { id: newId(), is_section_header: false, indent: sameIndent, section: "", task: "New Task", assigned_to: "", start_date: "", end_date: "", duration: "", status: "Not Started", percent_complete: 0, notes: "" };
    const next = [...rows];
    next.splice(Math.max(0, idx), 0, newRow);
    setRows(next);
    setDirty(true);
  };
  const insertColLeft = (colKey) => {
    const allCols = [...BUILTIN_COLS.map(c => c.key), ...extraCols.map(c => c.key)];
    const idx = allCols.indexOf(colKey);
    const newCol = { key: `col_${newId()}`, label: "New Column" };
    const next = [...extraCols];
    next.splice(Math.max(0, idx - BUILTIN_COLS.length), 0, newCol);
    setExtraCols(next);
  };
  const insertColRight = (colKey) => {
    const allCols = [...BUILTIN_COLS.map(c => c.key), ...extraCols.map(c => c.key)];
    const idx = allCols.indexOf(colKey);
    const newCol = { key: `col_${newId()}`, label: "New Column" };
    const next = [...extraCols];
    next.splice(Math.max(0, idx - BUILTIN_COLS.length + 1), 0, newCol);
    setExtraCols(next);
  };
  const deleteCol = (colKey) => {
    setExtraCols(prev => prev.filter(c => c.key !== colKey));
    setRows(prev => prev.map(r => { const copy = { ...r }; delete copy[colKey]; return copy; }));
    setDirty(true);
  };
  const clearSheet = async () => {
    if (sheetId) await base44.entities.ProjectSheet.delete(sheetId);
    setSheetId(null);
    setRows([]);
    setDirty(false);
    setConfirmClear(false);
  };
  const deleteBuiltinCol = (colKey) => setHiddenBuiltinCols(prev => [...prev, colKey]);
  const restoreBuiltinCol = (colKey) => setHiddenBuiltinCols(prev => prev.filter(k => k !== colKey));
  const updateColLabel = (colKey, label) => setExtraCols(prev => prev.map(c => c.key === colKey ? { ...c, label } : c));
  const addSection = () => {
    const newSection = { id: newId(), is_section_header: true, section: "NEW SECTION", task: "", assigned_to: "", start_date: "", end_date: "", duration: "", status: "", percent_complete: 0, notes: "" };
    const newRow = { id: newId(), is_section_header: false, section: "", task: "New Task", assigned_to: "", start_date: "", end_date: "", duration: "", status: "Not Started", percent_complete: 0, notes: "" };
    setRows((prev) => [...prev, newSection, newRow]);
    setDirty(true);
  };
  const deleteRow = (id) => {
    setRows((prev) => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx === -1) return prev;
      const parentIndent = prev[idx]?.indent || 0;
      let end = idx + 1;
      while (end < prev.length && !prev[end].is_section_header && (prev[end].indent || 0) > parentIndent) end++;
      return prev.filter((_, i) => i < idx || i >= end);
    });
    setDirty(true);
  };
  const fillDown = (rowId, field) => {
    setRows((prev) => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const sourceValue = prev[idx][field];
      const next = [...prev];
      for (let i = idx + 1; i < next.length; i++) {
        if (next[i].is_section_header) break;
        let update = { [field]: sourceValue };
        if (field === "status" && sourceValue === "Completed") update.percent_complete = 100;
        if (field === "percent_complete") {
          const pct = Number(sourceValue);
          if (pct === 0) update.status = "Not Started";
          else if (pct === 100) update.status = "Completed";
          else if (pct < 100 && next[i].status === "Completed") update.status = "In Progress";
        }
        next[i] = { ...next[i], ...update };
      }
      return next;
    });
    setDirty(true);
  };
  const applyRowFormat = (ids, key, value) => {
    setRows(prev => prev.map(r => {
      if (!ids.includes(r.id)) return r;
      if (key === "_clear") return { ...r, _fmt: {} };
      return { ...r, _fmt: { ...(r._fmt || {}), [key]: value } };
    }));
    setDirty(true);
  };
  const openReminderDialog = (row) => {
    setReminderForm({ title: `Reminder: ${row.task || "Task"} due`, remind_date: row.end_date || "", notes: "" });
    setReminderDialog({ row });
  };
  const saveReminder = async () => {
    setReminderSaving(true);
    await base44.entities.Reminder.create({ ...reminderForm, project_id: projectId, task_name: reminderDialog.row.task || "" });
    setReminderSaving(false);
    setReminderDialog(null);
  };
  const runAiSchedule = async () => {
    if (!aiStartDate) return;
    setAiScheduleLoading(true);
    const taskList = rows.filter(r => !r.is_section_header).map((r, i) => ({ index: i, task: r.task, section: rows.find(s => s.is_section_header && rows.indexOf(s) < rows.indexOf(r))?.section || "" }));
    const result = await base44.integrations.Core.InvokeLLM({
      model: "gpt_5_mini",
      prompt: `You are a construction project scheduling expert. Given a list of construction tasks and a project start date of ${aiStartDate}, assign realistic start_date and end_date (YYYY-MM-DD) and duration (e.g. "3d", "1w") for each task. Tasks in the same section should be sequential. Consider typical construction sequencing (e.g. foundation before framing, framing before MEP, etc.). Tasks: ${JSON.stringify(taskList)}`,
      response_json_schema: { type: "object", properties: { schedule: { type: "array", items: { type: "object", properties: { index: { type: "number" }, start_date: { type: "string" }, end_date: { type: "string" }, duration: { type: "string" } } } } } }
    });
    if (result?.schedule) {
      const taskRowsOnly = rows.filter(r => !r.is_section_header);
      setRows(prev => {
        const updated = [...prev];
        result.schedule.forEach(({ index, start_date, end_date, duration }) => {
          const targetId = taskRowsOnly[index]?.id;
          if (!targetId) return;
          const i = updated.findIndex(r => r.id === targetId);
          if (i !== -1) updated[i] = { ...updated[i], start_date, end_date, duration };
        });
        return projectSheetOrdering.sortSheetRowsByDates(updated);
      });
      setDirty(true);
    }
    setAiScheduleLoading(false);
    setAiScheduleDialog(false);
  };
  const toggleSection = (id) => setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleParent = (id) => setCollapsedParents((prev) => ({ ...prev, [id]: !prev[id] }));
  const rowHasChildren = (rowId) => {
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx === -1 || idx === rows.length - 1) return false;
    const parentIndent = rows[idx]?.indent || 0;
    const next = rows[idx + 1];
    return next && !next.is_section_header && (next.indent || 0) > parentIndent;
  };
  const handleSort = (col) => setSortConfig((prev) => ({ col, dir: prev.col === col && prev.dir === "asc" ? "desc" : "asc" }));
  const onDragStart = (e, id) => { dragRow.current = id; };
  const onDragEnter = (e, id) => { dragOver.current = id; };
  const onDragEnd = () => {
    if (dragRow.current === dragOver.current) return;
    const copy = [...rows];
    const fromIdx = copy.findIndex((r) => r.id === dragRow.current);
    const toIdx = copy.findIndex((r) => r.id === dragOver.current);
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    setRows(copy);
    setDirty(true);
    dragRow.current = null;
    dragOver.current = null;
    setSortConfig({ col: null, dir: "asc" });
  };
  const getDisplayRows = () => {
    const segments = [];
    let current = null;
    for (const row of rows) {
      if (row.is_section_header) {
        current = { header: row, tasks: [] };
        segments.push(current);
      } else {
        if (!current) {
          current = { header: null, tasks: [] };
          segments.push(current);
        }
        current.tasks.push(row);
      }
    }
    const hasFilters = Object.keys(filters).length > 0;
    const result = [];
    for (const seg of segments) {
      let tasks = seg.tasks;
      if (hasFilters) {
        tasks = tasks.filter((r) => {
          if (filters.status && r.status !== filters.status) return false;
          if (filters.assigned_to && r.assigned_to !== filters.assigned_to) return false;
          if (filters.start_date_from && r.start_date && r.start_date < filters.start_date_from) return false;
          if (filters.start_date_to && r.start_date && r.start_date > filters.start_date_to) return false;
          if (filters.end_date_from && r.end_date && r.end_date < filters.end_date_from) return false;
          if (filters.end_date_to && r.end_date && r.end_date > filters.end_date_to) return false;
          return true;
        });
      }
      if (sortConfig.col) {
        tasks = [...tasks].sort((a, b) => {
          const av = a[sortConfig.col] ?? "";
          const bv = b[sortConfig.col] ?? "";
          const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sortConfig.dir === "asc" ? cmp : -cmp;
        });
      }
      if (!hasFilters && !sortConfig.col) {
        if (seg.header) {
          result.push({ ...seg.header, _type: "header" });
          if (!collapsedSections[seg.header.id]) {
            let skipUntilIndent = null;
            for (const t of tasks) {
              const indent = t.indent || 0;
              if (skipUntilIndent !== null) {
                if (indent > skipUntilIndent) continue;
                skipUntilIndent = null;
              }
              result.push({ ...t, _type: "task" });
              if (collapsedParents[t.id]) skipUntilIndent = indent;
            }
          }
        } else {
          let skipUntilIndent = null;
          for (const t of tasks) {
            const indent = t.indent || 0;
            if (skipUntilIndent !== null) {
              if (indent > skipUntilIndent) continue;
              skipUntilIndent = null;
            }
            result.push({ ...t, _type: "task" });
            if (collapsedParents[t.id]) skipUntilIndent = indent;
          }
        }
      } else {
        if (seg.header) {
          result.push({ ...seg.header, _type: "header" });
          tasks.forEach((t) => result.push({ ...t, _type: "task" }));
        } else tasks.forEach((t) => result.push({ ...t, _type: "task" }));
      }
    }
    return result;
  };
  const activeFilterCount = Object.keys(filters).length;
  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!sheetId && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center"><Plus className="w-8 h-8 text-amber-500" /></div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-800">No Project Sheet Yet</h3>
          <p className="text-slate-500 text-sm mt-1">Start blank, use the default template, or generate one with AI.</p>
        </div>
        <div className="w-full space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI or Saved Template</p>
            <TemplatePicker savedTemplates={savedTemplates} onSelect={applyTemplate} selectedLabel={selectedTemplate?.type === "saved" ? selectedTemplate.template.name : selectedTemplate?.type === "ai" ? `AI: ${selectedTemplate.template.label}` : null} onClear={() => setSelectedTemplate(null)} />
          </div>
          <div className="flex items-center gap-3"><div className="flex-1 h-px bg-slate-200" /><span className="text-xs text-slate-400">or</span><div className="flex-1 h-px bg-slate-200" /></div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setRows([]); setDirty(true); }}>Start Blank</Button>
            <Button className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white" onClick={() => { setRows(DEFAULT_PROJECT_SHEET_TEMPLATE); setDirty(true); }}>Default Template</Button>
          </div>
        </div>
      </div>
    );
  }
  const taskRows = rows.filter((r) => !r.is_section_header);
  const completedCount = taskRows.filter((r) => r.status === "Completed").length;
  const displayRows = getDisplayRows();
  const formattedRowStyles = rows.filter(r => r._fmt && Object.values(r._fmt).some(v => v)).map(r => {
    const f = r._fmt || {};
    const rules = [f.bold && "font-weight: bold !important", f.italic && "font-style: italic !important", f.underline && "text-decoration: underline !important", f.color && `color: ${f.color} !important`, f.align && `text-align: ${f.align} !important`].filter(Boolean).join("; ");
    if (!rules) return "";
    return `[data-row-id="${r.id}"] td, [data-row-id="${r.id}"] td * { ${rules} }`;
  }).join("\n");
  const taskRowNumMap = {};
  rows.filter(r => !r.is_section_header).forEach((r, i) => { taskRowNumMap[r.id] = i + 1; });
  const visibleColKeys = [...BUILTIN_COLS.filter(c => !hiddenBuiltinCols.includes(c.key)).map(c => c.key), ...extraCols.map(c => c.key)];
  const taskDisplayRowIds = displayRows.filter(r => r._type === "task").map(r => r.id);
  const taskDisplayRowIdxMap = {};
  taskDisplayRowIds.forEach((id, i) => { taskDisplayRowIdxMap[id] = i; });
  return (
    <div className="space-y-4">
      {formattedRowStyles && <style>{formattedRowStyles}</style>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-slate-500"><span className="font-semibold text-slate-800">{completedCount}</span> / {taskRows.length} tasks completed</div>
          <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: taskRows.length ? `${(completedCount / taskRows.length) * 100}%` : "0%" }} /></div>
          {activeFilterCount > 0 && <button className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors" onClick={() => setFilters({})}><X className="w-3 h-3" />Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}</button>}
          {sortConfig.col && <button className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors" onClick={() => setSortConfig({ col: null, dir: "asc" })}><X className="w-3 h-3" />Clear sort</button>}
        </div>
        <div className="flex gap-2">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            <button className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-all font-medium", viewMode === "sheet" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")} onClick={() => setViewMode("sheet")}><LayoutList className="w-3.5 h-3.5" /> Sheet</button>
            <button className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-all font-medium", viewMode === "gantt" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")} onClick={() => setViewMode("gantt")}><GanttChart className="w-3.5 h-3.5" /> Gantt</button>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const html = `<html><head><title>Project Sheet</title><style>body { font-family: Arial, sans-serif; font-size: 12px; color: #222; margin: 24px; } h2 { margin-bottom: 16px; font-size: 16px; color: #3d3530; } table { border-collapse: collapse; width: 100%; } th { background: #3d3530; color: #fff; padding: 6px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; } td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; } .section { background: #475569; color: #fff; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; } .section td { padding: 5px 10px; } .done { color: #16a34a; } .inprog { color: #d97706; } .blocked { color: #dc2626; } @media print { @page { margin: 1cm; } }</style></head><body><h2>Project Schedule</h2><table><thead><tr><th>#</th><th>Task</th><th>Assigned To</th><th>Start Date</th><th>End Date</th><th>Duration</th><th>Status</th><th>Progress</th><th>Notes</th></tr></thead><tbody>${rows.map((r, idx) => { if (r.is_section_header) return `<tr class="section"><td colspan="9">${r.section || ''}</td></tr>`; const num = rows.filter((x, i) => !x.is_section_header && i <= idx).length; const statusClass = r.status === 'Completed' ? 'done' : r.status === 'In Progress' ? 'inprog' : r.status === 'Blocked' ? 'blocked' : ''; return `<tr><td>${num}</td><td>${r.task || ''}</td><td>${r.assigned_to || ''}</td><td>${r.start_date || ''}</td><td>${r.end_date || ''}</td><td>${r.duration || ''}</td><td class="${statusClass}">${r.status || ''}</td><td>${r.percent_complete || 0}%</td><td>${r.notes || ''}</td></tr>`; }).join('')}</tbody></table></body></html>`;
            const win = window.open('', '_blank');
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => win.print(), 400);
          }}><Printer className="w-4 h-4 mr-1" />Print</Button>
          <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); alert("Link copied to clipboard!"); } catch { prompt("Copy this link to share:", window.location.href); } }}><Share2 className="w-4 h-4 mr-1" />Share</Button>
          <Button variant="outline" size="sm" onClick={() => setAiScheduleDialog(true)} className="text-purple-600 border-purple-200 hover:bg-purple-50"><Sparkles className="w-4 h-4 mr-1" />AI Schedule</Button>
          <Button variant="outline" size="sm" onClick={addSection}><PlusCircle className="w-4 h-4 mr-1" />Add Section</Button>
          {!confirmClear && <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)} className="text-rose-500 border-rose-200 hover:bg-rose-50"><Trash2 className="w-4 h-4 mr-1" />Delete Sheet</Button>}
          {confirmClear && <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5"><span className="text-xs text-rose-700 font-medium">Delete this sheet?</span><button className="text-xs text-white bg-rose-500 hover:bg-rose-600 px-2 py-0.5 rounded" onClick={clearSheet}>Yes, delete</button><button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setConfirmClear(false)}>Cancel</button></div>}
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500">{saving ? <><div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />Saving…</> : dirty ? <><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Unsaved</> : <><Save className="w-3.5 h-3.5 text-emerald-500" />Autosaved</>}</div>
        </div>
      </div>
      {viewMode === "sheet" && <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm space-y-2"><SheetStyleToolbar style={sheetStyle} onChange={updateSheetStyle} /><SheetFormattingBar selectedRowIds={selectedRowIds} selectedColKeys={selectedColKeys} rows={rows} onApplyRowFormat={applyRowFormat} onClearSelection={() => { setSelectedRowIds(new Set()); setSelectedColKeys(new Set()); }} /></div>}
      {viewMode === "gantt" && <GanttView rows={rows} externalDayPx={externalGanttZoom} onExternalDayPxChange={onGanttZoomChange} />}
      {reminderDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReminderDialog(null)}><div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}><div className="flex items-center gap-2 mb-4"><Bell className="w-5 h-5 text-amber-500" /><h3 className="text-base font-semibold text-slate-800">Set Reminder</h3></div><div className="space-y-3"><div><label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Title</label><input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400" value={reminderForm.title} onChange={e => setReminderForm(f => ({ ...f, title: e.target.value }))} /></div><div><label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Remind On</label><input type="date" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400" value={reminderForm.remind_date} onChange={e => setReminderForm(f => ({ ...f, remind_date: e.target.value }))} /></div><div><label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Notes (optional)</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none" rows={2} value={reminderForm.notes} onChange={e => setReminderForm(f => ({ ...f, notes: e.target.value }))} /></div></div><div className="flex justify-end gap-2 mt-4"><button className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg" onClick={() => setReminderDialog(null)}>Cancel</button><button className="px-4 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50" disabled={!reminderForm.title || !reminderForm.remind_date || reminderSaving} onClick={saveReminder}>{reminderSaving ? "Saving…" : "Save Reminder"}</button></div></div></div>}
      {aiScheduleDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !aiScheduleLoading && setAiScheduleDialog(false)}><div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}><div className="flex items-center gap-2 mb-4"><Sparkles className="w-5 h-5 text-purple-500" /><h3 className="text-base font-semibold text-slate-800">AI Autofill Schedule</h3></div><p className="text-sm text-slate-500 mb-4">Enter a project start date and AI will assign realistic start/end dates and durations to all tasks based on typical construction sequencing.</p><div><label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Project Start Date</label><input type="date" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400" value={aiStartDate} onChange={e => setAiStartDate(e.target.value)} /></div><div className="flex justify-end gap-2 mt-5"><button className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg" onClick={() => setAiScheduleDialog(false)} disabled={aiScheduleLoading}>Cancel</button><button className="px-4 py-1.5 text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 flex items-center gap-2" disabled={!aiStartDate || aiScheduleLoading} onClick={runAiSchedule}>{aiScheduleLoading ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</> : <><Sparkles className="w-3.5 h-3.5" />Generate Schedule</>}</button></div></div></div>}
      {viewMode === "sheet" && <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative" onWheel={(e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); e.currentTarget.querySelector(".overflow-x-auto").scrollLeft += e.deltaX || e.deltaY; } }}>
        {copyFlash && <div className="absolute top-2 right-4 z-50 bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg pointer-events-none animate-pulse">Copied to clipboard</div>}
        {selection && <div className="absolute top-2 left-4 z-50 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2"><span>{Math.abs(selection.focus.rowIdx - selection.anchor.rowIdx) + 1} × {Math.abs(selection.focus.colIdx - selection.anchor.colIdx) + 1} selected</span><span className="text-blue-400">· Cmd/Ctrl+C copy · Cmd/Ctrl+V paste · Esc clear</span><button onClick={() => setSelection(null)} className="text-blue-400 hover:text-blue-600"><X className="w-3 h-3" /></button></div>}
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table className="w-full min-w-[900px] border-collapse" style={{ fontFamily: sheetStyle.fontFamily, fontSize: `${sheetStyle.fontSize}px` }}>
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider sticky top-0 z-20" style={{ backgroundColor: sheetStyle.headerBg, color: sheetStyle.headerText }}>
                <th className="w-8 px-2 py-3 sticky left-0 z-30 cursor-pointer hover:bg-blue-700 transition-colors" style={{ backgroundColor: sheetStyle.headerBg }} title="Click to select all rows" onClick={() => { const allTaskIds = new Set(rows.filter(r => !r.is_section_header).map(r => r.id)); setSelectedRowIds(prev => prev.size === allTaskIds.size ? new Set() : allTaskIds); setSelectedColKeys(new Set()); }} />
                <th className="w-4 px-0 py-3 sticky left-8 z-30" style={{ backgroundColor: sheetStyle.headerBg }} />
                {BUILTIN_COLS.filter(c => !hiddenBuiltinCols.includes(c.key)).map((col) => (
                  <th key={col.key} className={cn("px-3 py-3 whitespace-nowrap relative group/col", col.width, col.align === "center" && "text-center", col.align === "left" && "text-left", col.key === "task" && !hiddenBuiltinCols.includes("task") && "sticky left-12 z-30 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-slate-200")} onMouseEnter={() => setHoveredCol(col.key)} onMouseLeave={() => setHoveredCol(null)} style={col.key === "task" && !hiddenBuiltinCols.includes("task") ? { backgroundColor: sheetStyle.headerBg } : {}}>
                    <div className="absolute left-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-pointer z-10 opacity-0 group-hover/col:opacity-100 transition-opacity" onClick={() => insertColLeft(col.key)} title="Insert column to the left"><div className="w-full h-full flex items-center justify-center hover:bg-amber-100"><Plus className="w-2.5 h-2.5 text-amber-500" /></div></div>
                    <div className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-pointer z-10 opacity-0 group-hover/col:opacity-100 transition-opacity" onClick={() => insertColRight(col.key)} title="Insert column to the right"><div className="w-full h-full flex items-center justify-center hover:bg-amber-100"><Plus className="w-2.5 h-2.5 text-amber-500" /></div></div>
                    <div className="flex items-center justify-between gap-1">
                      <div className={cn("flex items-center gap-0.5 cursor-pointer select-none", col.align === "center" && "justify-center")} onClick={() => handleSort(col.key)}><span>{col.label}</span><SortIcon col={col.key} sortConfig={sortConfig} />{["task", "assigned_to", "start_date", "end_date", "status"].includes(col.key) && <FilterDropdown col={col.key} filters={filters} setFilters={setFilters} rows={rows} label={col.label} />}</div>
                      <button className="opacity-0 group-hover/col:opacity-100 p-0.5 rounded hover:bg-rose-100 text-rose-400 transition-opacity flex-shrink-0" onClick={(e) => { e.stopPropagation(); deleteBuiltinCol(col.key); }} title="Hide column"><X className="w-3 h-3" /></button>
                    </div>
                  </th>
                ))}
                {extraCols.map((col) => (
                  <th key={col.key} className="px-3 py-3 whitespace-nowrap relative group/col text-left w-[120px]" onMouseEnter={() => setHoveredCol(col.key)} onMouseLeave={() => setHoveredCol(null)}>
                    <div className="absolute left-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-pointer z-10 opacity-0 group-hover/col:opacity-100 transition-opacity" onClick={() => insertColLeft(col.key)} title="Insert column to the left"><div className="w-full h-full flex items-center justify-center hover:bg-amber-100"><Plus className="w-2.5 h-2.5 text-amber-500" /></div></div>
                    <div className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-pointer z-10 opacity-0 group-hover/col:opacity-100 transition-opacity" onClick={() => insertColRight(col.key)} title="Insert column to the right"><div className="w-full h-full flex items-center justify-center hover:bg-amber-100"><Plus className="w-2.5 h-2.5 text-amber-500" /></div></div>
                    <div className="flex items-center gap-1"><input className="bg-transparent font-semibold uppercase tracking-wider text-xs text-slate-500 w-full outline-none focus:ring-1 focus:ring-amber-300 rounded px-1" value={col.label} onChange={(e) => updateColLabel(col.key, e.target.value)} /><button className="opacity-0 group-hover/col:opacity-100 p-0.5 rounded hover:bg-rose-100 text-rose-400 transition-opacity" onClick={() => deleteCol(col.key)} title="Delete column"><X className="w-3 h-3" /></button></div>
                  </th>
                ))}
                <th className="w-14 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                if (row._type === "header") {
                  const collapsed = collapsedSections[row.id] && !sortConfig.col && !activeFilterCount;
                  return <tr key={row.id} className="bg-slate-700 text-white border-b border-slate-600 group/srow" draggable={!sortConfig.col} onDragStart={(e) => onDragStart(e, row.id)} onDragEnter={(e) => onDragEnter(e, row.id)} onDragEnd={onDragEnd} onMouseEnter={() => setHoveredRow(row.id)} onMouseLeave={() => setHoveredRow(null)}><td className="px-2 py-2 cursor-grab text-slate-400 sticky left-0 z-10 bg-slate-700"><GripVertical className="w-3.5 h-3.5" /></td><td className="px-0 py-0 w-4 relative sticky left-8 z-10 bg-slate-700"><div className="flex flex-col h-full items-center justify-center gap-0 opacity-0 group-hover/srow:opacity-100 transition-opacity"><button className="w-4 flex-1 flex items-center justify-center hover:bg-amber-500/30 text-amber-300 rounded-sm" title="Insert row above" onClick={() => insertRowAbove(row.id)}><Plus className="w-2.5 h-2.5" /></button><button className="w-4 flex-1 flex items-center justify-center hover:bg-amber-500/30 text-amber-300 rounded-sm" title="Insert row below" onClick={() => addRow(row.id)}><Plus className="w-2.5 h-2.5" /></button></div></td><td colSpan={BUILTIN_COLS.length + extraCols.length} className="px-3 py-2"><div className="flex items-center gap-2"><button onClick={() => toggleSection(row.id)} className="text-slate-300 hover:text-white">{collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button><Cell value={row.section} onChange={(v) => updateRow(row.id, "section", v)} placeholder="Section name" className="text-white font-bold text-xs uppercase tracking-widest bg-transparent hover:bg-slate-600" /></div></td><td className="px-2 py-2"><button className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-rose-400 transition-colors" onClick={() => deleteRow(row.id)}><Trash2 className="w-3.5 h-3.5" /></button></td></tr>;
                }
                const fmt = row._fmt || {};
                const isRowSelected = selectedRowIds.has(row.id);
                const rowBg = isRowSelected ? "#e0f2fe" : (fmt.bg || (selectedRowId === row.id ? "#fffbeb" : ((!row.end_date || String(row.status || "").toLowerCase() === "completed") ? sheetStyle.stripeEven : (() => { const today = new Date(); today.setHours(0, 0, 0, 0); const soon = new Date(today); soon.setDate(soon.getDate() + 7); const due = new Date(`${row.end_date}T00:00:00`); return Number.isNaN(due.getTime()) ? sheetStyle.stripeEven : due < today ? "#fff1f2" : due <= soon ? "#fffbeb" : sheetStyle.stripeEven; })())));
                return <tr key={row.id} data-row-id={row.id} className={cn("border-b border-slate-100 group transition-colors group/trow cursor-pointer", selectedRowId === row.id && !isRowSelected && "ring-1 ring-inset ring-amber-300")} style={{ height: sheetStyle.rowHeight, backgroundColor: rowBg }} draggable={!sortConfig.col} onClick={() => { if (!selection) setSelectedRowId(row.id === selectedRowId ? null : row.id); }} onDragStart={(e) => onDragStart(e, row.id)} onDragEnter={(e) => onDragEnter(e, row.id)} onDragEnd={onDragEnd} onMouseEnter={() => setHoveredRow(row.id)} onMouseLeave={() => setHoveredRow(null)}>
                  <td className={cn("px-1 py-1 sticky left-0 z-10 w-8 min-w-[32px] select-none", isRowSelected ? "bg-blue-100" : "bg-inherit")} style={{ backgroundColor: isRowSelected ? "#bfdbfe" : rowBg }} onClick={(e) => { e.stopPropagation(); setSelectedRowIds(prev => { const next = new Set(prev); if (e.shiftKey) { const taskIds = displayRows.filter(r => r._type === "task").map(r => r.id); const lastSelected = [...next].pop(); const from = taskIds.indexOf(lastSelected); const to = taskIds.indexOf(row.id); if (from !== -1 && to !== -1) taskIds.slice(Math.min(from, to), Math.max(from, to) + 1).forEach(id => next.add(id)); else next.has(row.id) ? next.delete(row.id) : next.add(row.id); } else if (e.ctrlKey || e.metaKey) next.has(row.id) ? next.delete(row.id) : next.add(row.id); else { if (next.size === 1 && next.has(row.id)) return new Set(); return new Set([row.id]); } return next; }); setSelectedColKeys(new Set()); }} title="Click to select row for formatting"><div className="flex items-center justify-end gap-0.5"><span className={cn("text-[10px] w-5 text-right select-none", isRowSelected ? "text-blue-600 font-bold" : "text-slate-300 group-hover:hidden")}>{taskRowNumMap[row.id]}</span><GripVertical className={cn("w-3.5 h-3.5 text-slate-300", isRowSelected ? "hidden" : "hidden group-hover:block")} /></div></td>
                  <td className="px-0 py-0 w-4 relative sticky left-8 z-10" style={{ backgroundColor: "inherit" }}><div className="flex flex-col h-full items-center justify-center gap-0 opacity-0 group-hover/trow:opacity-100 transition-opacity"><button className="w-4 flex-1 flex items-center justify-center hover:bg-amber-100 text-amber-400 rounded-sm" title="Insert row above" onClick={() => insertRowAbove(row.id)}><Plus className="w-2.5 h-2.5" /></button><button className="w-4 flex-1 flex items-center justify-center hover:bg-amber-100 text-amber-400 rounded-sm" title="Insert row below" onClick={() => addRow(row.id)}><Plus className="w-2.5 h-2.5" /></button></div></td>
                  {!hiddenBuiltinCols.includes("task") && (() => { const indent = row.indent || 0; const hasChildren = rowHasChildren(row.id); const isCollapsed = collapsedParents[row.id]; const rowIndex = rows.findIndex((r) => r.id === row.id); const canIndent = rowIndex > 0 && !rows[rowIndex - 1]?.is_section_header; const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("task"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1 sticky left-12 z-10 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-slate-200" style={{ backgroundColor: _sel ? "#dbeafe" : "inherit", outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><div className="flex items-center" style={{ paddingLeft: indent * 20 }}>{indent > 0 && <div className="flex items-center flex-shrink-0 mr-1"><div className="w-3 h-4 border-l-2 border-b-2 border-slate-200 rounded-bl-sm flex-shrink-0" /></div>}{hasChildren ? <button className="flex-shrink-0 text-slate-400 hover:text-slate-700 mr-1" onClick={() => toggleParent(row.id)} title={isCollapsed ? "Expand children" : "Collapse children"}>{isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button> : <div className="w-4 flex-shrink-0" />}<Cell value={row.task} onChange={(v) => updateRow(row.id, "task", v)} placeholder="Task name" className={cn("flex-1 font-medium", indent === 0 ? "text-slate-800" : indent === 1 ? "text-slate-700" : "text-slate-500 italic")} /><div className="opacity-0 group-hover/trow:opacity-100 transition-opacity flex items-center gap-0.5 ml-1 flex-shrink-0">{canIndent && <button className="p-0.5 rounded hover:bg-amber-100 text-slate-300 hover:text-amber-600" title="Indent under row above" onClick={() => indentRow(row.id)}><IndentIncrease className="w-3 h-3" /></button>}<button className="p-0.5 rounded hover:bg-emerald-100 text-slate-300 hover:text-emerald-600" title="Add child task" onClick={() => addChildRow(row.id)}><PlusCircle className="w-3 h-3" /></button>{indent > 0 && <button className="p-0.5 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-600" title="Outdent (move up a level)" onClick={() => outdentRow(row.id)}><IndentDecrease className="w-3 h-3" /></button>}</div></div></td>; })()}
                  {!hiddenBuiltinCols.includes("assigned_to") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("assigned_to"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1 relative group/assign" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><AssigneeCell value={row.assigned_to} onChange={(v) => updateRow(row.id, "assigned_to", v)} subcontractors={subcontractors} employees={employees} />{row.assigned_to && <button className="absolute bottom-0 right-0 w-3 h-3 bg-amber-400 hover:bg-amber-500 rounded-sm opacity-0 group-hover/assign:opacity-100 transition-opacity cursor-s-resize flex items-center justify-center z-10" title="Fill down to remaining rows in section" onMouseDown={(e) => { e.preventDefault(); fillDown(row.id, "assigned_to"); }}><span className="text-[8px] text-white font-bold">↓</span></button>}</td>; })()}
                  {!hiddenBuiltinCols.includes("depends_on") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("depends_on"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><DependencyCell rowId={row.id} value={row.depends_on || null} onChange={(v) => updateRow(row.id, "depends_on", v)} rows={rows} rowNumber={rows.filter(r => !r.is_section_header).findIndex(r => r.id === row.id) + 1} />{row.depends_on && (() => { const pred = rows.find(r => r.id === row.depends_on); if (pred && pred.end_date && row.start_date && row.start_date < pred.end_date) return <div className="text-[10px] text-rose-500 px-2 mt-0.5 flex items-center gap-1"><span>⚠ Conflict</span></div>; return null; })()}</td>; })()}
                  {!hiddenBuiltinCols.includes("start_date") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("start_date"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><Cell value={row.start_date} onChange={(v) => updateRow(row.id, "start_date", v)} type="date" centerAlign className="text-slate-600" /></td>; })()}
                  {!hiddenBuiltinCols.includes("end_date") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("end_date"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1 relative group/enddate" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><Cell value={row.end_date} onChange={(v) => updateRow(row.id, "end_date", v)} type="date" centerAlign className="text-slate-600" />{row.end_date && <button className="absolute top-1 right-1 opacity-0 group-hover/enddate:opacity-100 transition-opacity p-0.5 rounded hover:bg-amber-100 text-amber-500" title="Set reminder for this due date" onClick={() => openReminderDialog(row)}><BellPlus className="w-3 h-3" /></button>}</td>; })()}
                  {!hiddenBuiltinCols.includes("duration") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("duration"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><Cell value={row.duration} onChange={(v) => updateRow(row.id, "duration", v)} placeholder="e.g. 3d" centerAlign className="text-slate-600" /></td>; })()}
                  {!hiddenBuiltinCols.includes("status") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("status"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1 relative group/status" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><StatusCell value={row.status} onChange={(v) => updateRow(row.id, "status", v)} />{row.status && <button className="absolute bottom-0 right-0 w-3 h-3 bg-amber-400 hover:bg-amber-500 rounded-sm opacity-0 group-hover/status:opacity-100 transition-opacity cursor-s-resize flex items-center justify-center z-10" title="Fill down to remaining rows in section" onMouseDown={(e) => { e.preventDefault(); fillDown(row.id, "status"); }}><span className="text-[8px] text-white font-bold">↓</span></button>}</td>; })()}
                  {!hiddenBuiltinCols.includes("percent_complete") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("percent_complete"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><PercentCell value={row.percent_complete} onChange={(v) => updateRow(row.id, "percent_complete", v)} /></td>; })()}
                  {!hiddenBuiltinCols.includes("notes") && (() => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf("notes"); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td className="px-1 py-1" style={{ color: sheetStyle.cellTextColor, backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><Cell value={row.notes} onChange={(v) => updateRow(row.id, "notes", v)} placeholder="Add note…" className="text-slate-500" /></td>; })()}
                  {extraCols.map((col) => { const _ri = taskDisplayRowIdxMap[row.id] ?? -1; const _ci = visibleColKeys.indexOf(col.key); const _sel = _ri >= 0 && _ci >= 0 && isCellSelected(_ri, _ci); return <td key={col.key} className="px-1 py-1" style={{ backgroundColor: _sel ? "#dbeafe" : undefined, outline: _sel ? "1px solid #3b82f6" : undefined }} onMouseDown={(e) => { if (!e.target.closest("input,button,select")) handleCellClick(e, _ri, _ci); }}><Cell value={row[col.key] || ""} onChange={(v) => updateRow(row.id, col.key, v)} placeholder="—" className="text-slate-600" /></td>; })}
                  <td className="px-2 py-1"><div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><button className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500" onClick={() => deleteRow(row.id)}><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
          <button className="flex items-center gap-2 text-sm text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors" onClick={() => addRow(rows[rows.length - 1]?.id)}><Plus className="w-4 h-4" />Add Row</button>
          <div className="flex items-center gap-2">{hiddenBuiltinCols.length > 0 && <div className="flex items-center gap-1 flex-wrap">{hiddenBuiltinCols.map(key => { const col = BUILTIN_COLS.find(c => c.key === key); return <button key={key} className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 bg-slate-100 hover:bg-amber-50 border border-slate-200 px-2 py-1 rounded-lg transition-colors" onClick={() => restoreBuiltinCol(key)} title="Restore column">+ {col?.label}</button>; })}</div>}<button className="flex items-center gap-2 text-sm text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors" onClick={() => setExtraCols(prev => [...prev, { key: `col_${newId()}`, label: "New Column" }])}><Plus className="w-4 h-4" />Add Column</button></div>
        </div>
      </div>}
    </div>
  );
}