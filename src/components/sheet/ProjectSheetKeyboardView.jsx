import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import ProjectSheetView from "@/components/sheet/ProjectSheetView";
import { sortProjectSheetRows } from "@/lib/projectSheetOrdering";

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
  const map = Object.fromEntries(rows.map((r) => [r.id, { ...r }]));
  const visited = new Set();

  function propagate(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const row = map[id];
    if (!row || !row.end_date) return;

    rows.forEach((r) => {
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
  return rows.map((r) => map[r.id] || r);
}

function getTaskRows(container) {
  return Array.from(container.querySelectorAll('tbody tr[data-row-id]'));
}

function getEditableCells(row) {
  return Array.from(row.querySelectorAll("td")).slice(2, -1);
}

function rowsHaveDifferentSequence(a = [], b = []) {
  if (a.length !== b.length) return true;
  return a.some((row, index) => row?.id !== b[index]?.id);
}

function rowsHaveDifferentContent(a = [], b = []) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function cloneRows(rows = []) {
  return JSON.parse(JSON.stringify(rows));
}

function activateCell(cell) {
  if (!cell) return;

  const editableInput = cell.querySelector("input, textarea, select");
  if (editableInput) {
    editableInput.focus?.();
    editableInput.select?.();
    return;
  }

  const editableText = cell.querySelector("[data-editable], a, span, div");
  const target = editableText || cell;
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  setTimeout(() => {
    const focusable = cell.querySelector("input, textarea, select");
    focusable?.focus?.();
    focusable?.select?.();
  }, 20);
}

const BUILTIN_COLUMN_LABELS = {
  "Task / Phase": "task",
  "Assigned To": "assigned_to",
  "Depends On": "depends_on",
  "Start Date": "start_date",
  "End Date": "end_date",
  "Duration": "duration",
  "Status": "status",
  "Progress": "percent_complete",
  "Notes": "notes",
};

function getVisibleFieldOrder(container, rowData = {}) {
  const headers = Array.from(container.querySelectorAll("thead tr:last-child th")).slice(2, -1);
  const reservedKeys = new Set([
    "id",
    "section",
    "is_section_header",
    "indent",
    "created_by",
    "created_date",
    "updated_date",
    ...Object.values(BUILTIN_COLUMN_LABELS),
  ]);
  const extraFields = Object.keys(rowData).filter((key) => !reservedKeys.has(key));
  let extraFieldIndex = 0;

  return headers.map((header) => {
    const label = header.textContent?.replace(/\s+/g, " ").trim();
    return BUILTIN_COLUMN_LABELS[label] || extraFields[extraFieldIndex++] || null;
  });
}

export default function ProjectSheetKeyboardView(props) {
  const containerRef = useRef(null);
  const rowsRef = useRef([]);
  const pendingOverrideRef = useRef(false);
  const undoStackRef = useRef([]);
  const applyingUndoRef = useRef(false);
  const dragFillCleanupRef = useRef(null);
  const [overrideRows, setOverrideRows] = useState(null);
  const [sheetInstanceKey, setSheetInstanceKey] = useState(0);

  const applyFieldUpdate = (row, sourceRows, field, value) => {
    let next = { ...row, [field]: value };

    if (field === "status" && value === "Completed") {
      next.percent_complete = 100;
    }

    if (field === "percent_complete") {
      const pct = Number(value);
      if (pct === 0) next.status = "Not Started";
      else if (pct === 100) next.status = "Completed";
      else if (pct < 100 && row.status === "Completed") next.status = "In Progress";
    }

    if (field === "depends_on" && value) {
      const predecessor = sourceRows.find((r) => r.id === value);
      if (predecessor && predecessor.end_date) {
        const newStart = addDays(predecessor.end_date, 1);
        next.start_date = newStart;
        const days = parseDurationDays(row.duration);
        if (days) next.end_date = addDays(newStart, days - 1);
      }
    }

    if (field === "start_date" || field === "duration") {
      const start = field === "start_date" ? value : row.start_date;
      const durStr = field === "duration" ? value : row.duration;
      const days = parseDurationDays(durStr);
      if (start && days) {
        next.end_date = addDays(start, days - 1);
      }
    } else if (field === "end_date") {
      const start = row.start_date;
      const end = value;
      if (start && end && end >= start) {
        next.duration = formatDuration(daysBetween(start, end) + 1);
      }
    }

    return next;
  };

  const applyFillRange = (rowId, field, targetRowId = null) => {
    const currentRows = rowsRef.current || [];
    const startIndex = currentRows.findIndex((r) => r.id === rowId);
    if (startIndex === -1) return;

    const sourceValue = currentRows[startIndex]?.[field];
    let next = [...currentRows];
    const changedIds = [];

    for (let i = startIndex + 1; i < next.length; i++) {
      if (next[i].is_section_header) break;
      next[i] = applyFieldUpdate(next[i], next, field, sourceValue);
      changedIds.push(next[i].id);
      if (targetRowId && next[i].id === targetRowId) break;
    }

    if (changedIds.length === 0) return;

    if (["start_date", "end_date", "duration", "depends_on"].includes(field)) {
      changedIds.forEach((changedId) => {
        next = propagateDependencies(next, changedId);
      });
      next = sortProjectSheetRows(next);
    }

    pendingOverrideRef.current = true;
    setOverrideRows(next);
  };

  const handleFillDown = (rowId, field) => {
    applyFillRange(rowId, field);
  };

  const hasFillValue = (value) => value !== undefined && value !== null && String(value) !== "";

  const decorateFillHandles = () => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll(".sheet-date-fill-handle").forEach((button) => button.remove());

    const rowMap = Object.fromEntries((rowsRef.current || []).map((row) => [row.id, row]));

    getTaskRows(container).forEach((rowEl) => {
      const rowId = rowEl.getAttribute("data-row-id");
      const rowData = rowMap[rowId];
      if (!rowId || !rowData) return;

      const visibleFields = getVisibleFieldOrder(container, rowData);

      getEditableCells(rowEl).forEach((cell, cellIndex) => {
        const field = visibleFields[cellIndex];
        if (!field || !hasFillValue(rowData[field])) return;

        cell.style.position = "relative";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sheet-date-fill-handle absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-slate-300 hover:bg-slate-400 shadow-sm z-10";
        button.textContent = "";
        button.title = "Drag down to fill value";
        button.style.cursor = "ns-resize";
        button.onmousedown = (event) => {
          event.preventDefault();
          event.stopPropagation();

          const dragRowElement = button.closest('tr[data-row-id]');
          const previousDraggable = dragRowElement?.getAttribute("draggable");
          if (dragRowElement) {
            dragRowElement.setAttribute("draggable", "false");
          }

          const currentRows = rowsRef.current || [];
          const startIndex = currentRows.findIndex((item) => item.id === rowId);
          if (startIndex === -1) return;

          const paintedRows = new Set();
          let activeTargetId = null;

          const clearPreview = () => {
            paintedRows.forEach((paintedRowId) => {
              const paintedRow = container.querySelector(`tbody tr[data-row-id="${paintedRowId}"]`);
              const paintedCell = paintedRow ? getEditableCells(paintedRow)[cellIndex] : null;
              if (!paintedCell) return;
              paintedCell.style.backgroundColor = "";
              paintedCell.style.outline = "";
            });
            paintedRows.clear();
          };

          const updatePreview = (clientX, clientY) => {
            const hoveredRow = document.elementFromPoint(clientX, clientY)?.closest?.('tr[data-row-id]');
            const hoveredRowId = hoveredRow?.getAttribute("data-row-id");
            const targetIndex = hoveredRowId ? currentRows.findIndex((item) => item.id === hoveredRowId) : -1;

            clearPreview();
            activeTargetId = null;

            if (!hoveredRowId || targetIndex <= startIndex) return;
            if (currentRows.slice(startIndex + 1, targetIndex + 1).some((item) => item.is_section_header)) return;

            activeTargetId = hoveredRowId;
            currentRows.slice(startIndex + 1, targetIndex + 1).forEach((item) => {
              if (item.is_section_header) return;
              const previewRow = container.querySelector(`tbody tr[data-row-id="${item.id}"]`);
              const previewCell = previewRow ? getEditableCells(previewRow)[cellIndex] : null;
              if (!previewCell) return;
              previewCell.style.backgroundColor = "#dbeafe";
              previewCell.style.outline = "1px solid #3b82f6";
              paintedRows.add(item.id);
            });
          };

          const handleMouseMove = (moveEvent) => {
            updatePreview(moveEvent.clientX, moveEvent.clientY);
          };

          const cleanupDrag = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            clearPreview();
            if (dragRowElement) {
              if (previousDraggable === null) dragRowElement.removeAttribute("draggable");
              else dragRowElement.setAttribute("draggable", previousDraggable);
            }
            dragFillCleanupRef.current = null;
          };

          const handleMouseUp = () => {
            const targetRowId = activeTargetId;
            cleanupDrag();
            if (targetRowId) {
              applyFillRange(rowId, field, targetRowId);
            }
          };

          dragFillCleanupRef.current?.();
          dragFillCleanupRef.current = cleanupDrag;
          document.addEventListener("mousemove", handleMouseMove);
          document.addEventListener("mouseup", handleMouseUp);
        };
        cell.appendChild(button);
      });
    });
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      decorateFillHandles();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!props.externalRows) return;
    const orderedRows = sortProjectSheetRows(props.externalRows);
    rowsRef.current = orderedRows;

    if (rowsHaveDifferentSequence(props.externalRows, orderedRows)) {
      pendingOverrideRef.current = true;
      setOverrideRows(orderedRows);
      return;
    }

    const frame = requestAnimationFrame(() => {
      decorateFillHandles();
    });
    return () => cancelAnimationFrame(frame);
  }, [props.externalRows]);

  useEffect(() => {
    if (!props.projectId) return;

    const unsubscribe = base44.entities.ProjectSheet.subscribe((event) => {
      if (!event?.data || event.data.project_id !== props.projectId) return;

      const orderedRows = sortProjectSheetRows(event.data.rows || []);
      if (!rowsHaveDifferentContent(rowsRef.current, orderedRows)) {
        if (event.type === "create") {
          setSheetInstanceKey((current) => current + 1);
        }
        return;
      }

      rowsRef.current = orderedRows;
      if (event.type === "create") {
        setSheetInstanceKey((current) => current + 1);
      }
      pendingOverrideRef.current = true;
      setOverrideRows(orderedRows);
    });

    return unsubscribe;
  }, [props.projectId]);

  const undoLastChange = () => {
    const previousRows = undoStackRef.current.pop();
    if (!previousRows) return;

    applyingUndoRef.current = true;
    rowsRef.current = cloneRows(previousRows);
    pendingOverrideRef.current = true;
    setOverrideRows(cloneRows(previousRows));
  };

  const handleRowsChange = (rows) => {
    const orderedRows = sortProjectSheetRows(rows);
    const previousRows = rowsRef.current || [];

    if (!applyingUndoRef.current && rowsHaveDifferentContent(previousRows, orderedRows)) {
      undoStackRef.current.push(cloneRows(previousRows));
      if (undoStackRef.current.length > 100) {
        undoStackRef.current.shift();
      }
    }

    rowsRef.current = orderedRows;
    props.onRowsChange?.(orderedRows);

    if (rowsHaveDifferentSequence(rows, orderedRows)) {
      pendingOverrideRef.current = true;
      setOverrideRows(orderedRows);
      if (applyingUndoRef.current) {
        applyingUndoRef.current = false;
      }
      return;
    }

    if (pendingOverrideRef.current) {
      pendingOverrideRef.current = false;
      setOverrideRows(null);
    }

    if (applyingUndoRef.current) {
      applyingUndoRef.current = false;
    }

    setTimeout(() => {
      decorateFillHandles();
    }, 0);
  };

  const handleKeyDownCapture = (event) => {
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z";
    if (isUndoShortcut) {
      event.preventDefault();
      event.stopPropagation();
      if (document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, select")) {
        document.activeElement.blur();
      }
      undoLastChange();
      return;
    }

    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.closest("tbody tr[data-row-id]")) return;
    if (!event.target.matches("input, textarea, select")) return;

    const row = event.target.closest('tr[data-row-id]');
    const cell = event.target.closest("td");
    const container = containerRef.current;
    if (!row || !cell || !container) return;

    const rows = getTaskRows(container);
    const rowIndex = rows.indexOf(row);
    const cellIndex = getEditableCells(row).indexOf(cell);
    if (rowIndex === -1 || cellIndex === -1) return;

    event.preventDefault();
    event.stopPropagation();
    event.target.blur();

    if (event.key === "Enter") {
      const nextExistingRow = rows[rowIndex + 1];

      if (nextExistingRow) {
        const nextCell = getEditableCells(nextExistingRow)[cellIndex] || getEditableCells(nextExistingRow)[0];
        activateCell(nextCell);
        return;
      }

      const insertBelowButton = row.querySelector('button[title="Insert row below"]');
      insertBelowButton?.click();

      setTimeout(() => {
        const nextRows = getTaskRows(container);
        const nextRow = nextRows[rowIndex + 1];
        const nextCell = nextRow ? (getEditableCells(nextRow)[cellIndex] || getEditableCells(nextRow)[0]) : null;
        activateCell(nextCell);
      }, 40);
      return;
    }

    const step = event.shiftKey ? -1 : 1;
    let nextRowIndex = rowIndex;
    let nextCellIndex = cellIndex + step;
    let nextRow = row;
    let nextCells = getEditableCells(nextRow);

    if (nextCellIndex >= nextCells.length) {
      nextRowIndex += 1;
      nextRow = rows[nextRowIndex];
      nextCells = nextRow ? getEditableCells(nextRow) : [];
      nextCellIndex = 0;
    }

    if (nextCellIndex < 0) {
      nextRowIndex -= 1;
      nextRow = rows[nextRowIndex];
      nextCells = nextRow ? getEditableCells(nextRow) : [];
      nextCellIndex = nextCells.length - 1;
    }

    const nextCell = nextRow ? nextCells[nextCellIndex] : null;
    activateCell(nextCell);
  };

  useEffect(() => {
    return () => {
      dragFillCleanupRef.current?.();
    };
  }, []);

  return (
    <div ref={containerRef} onKeyDownCapture={handleKeyDownCapture}>
      <ProjectSheetView
        key={sheetInstanceKey}
        {...props}
        externalRows={overrideRows ?? props.externalRows}
        onRowsChange={handleRowsChange}
      />
    </div>
  );
}