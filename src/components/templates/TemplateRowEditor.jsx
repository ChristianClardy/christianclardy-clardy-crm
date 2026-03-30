import { useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, X, Trash2, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * TemplateRowEditor
 * Props:
 *   rows: array of row objects
 *   onChange: (newRows) => void  — called on every mutation
 *   history: { past, future }    — undo/redo stacks (managed by parent)
 *   onUndo: () => void
 *   onRedo: () => void
 */
export default function TemplateRowEditor({ rows, onChange, history, onUndo, onRedo }) {
  const [selected, setSelected] = useState(new Set());

  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    const reordered = Array.from(rows);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onChange(reordered);
    setSelected(new Set());
  }, [rows, onChange]);

  const toggleSelect = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((_, i) => i)));
    }
  };

  const deleteSelected = () => {
    onChange(rows.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  };

  const deleteSingle = (idx) => {
    onChange(rows.filter((_, i) => i !== idx));
    setSelected(prev => { const s = new Set(prev); s.delete(idx); return s; });
  };

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
            >
              {selected.size === rows.length ? "Deselect all" : "Select all"}
            </button>
          )}
          {selected.size > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deleteSelected}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5 h-7 text-xs"
            >
              <Trash2 className="w-3 h-3" />
              Delete {selected.size} selected
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            className={cn(
              "p-1.5 rounded transition-colors",
              canUndo ? "text-slate-600 hover:bg-slate-100" : "text-slate-300 cursor-not-allowed"
            )}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className={cn(
              "p-1.5 rounded transition-colors",
              canRedo ? "text-slate-600 hover:bg-slate-100" : "text-slate-300 cursor-not-allowed"
            )}
          >
            <Redo2 className="w-4 h-4" />
          </button>
          {(canUndo || canRedo) && (
            <span className="text-xs text-slate-400 ml-1">
              {history.past.length} change{history.past.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Drag-and-drop list */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="template-rows">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-1 max-h-64 overflow-y-auto pr-1"
            >
              {rows.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-6">
                  No items yet. Add items below or use a template.
                </p>
              )}
              {rows.map((row, idx) => (
                <Draggable key={row.id || `row-${idx}`} draggableId={row.id || `row-${idx}`} index={idx}>
                  {(drag, snapshot) => (
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-sm select-none transition-shadow",
                        row.is_section_header
                          ? "bg-amber-50 font-semibold text-amber-900"
                          : "bg-slate-50 text-slate-700",
                        selected.has(idx) && "ring-2 ring-amber-400 ring-offset-1",
                        snapshot.isDragging && "shadow-lg opacity-90"
                      )}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selected.has(idx)}
                        onChange={() => toggleSelect(idx)}
                        className="w-3.5 h-3.5 accent-amber-500 shrink-0 cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      />
                      {/* Drag handle */}
                      <span
                        {...drag.dragHandleProps}
                        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      {row.is_section_header && (
                        <span className="text-xs text-amber-500 uppercase tracking-wide">§</span>
                      )}
                      <span className="flex-1 truncate">{row.task || row.section}</span>
                      <button
                        type="button"
                        onClick={() => deleteSingle(idx)}
                        className="text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}