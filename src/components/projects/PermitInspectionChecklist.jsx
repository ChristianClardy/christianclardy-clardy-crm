import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createInspectionSheetRow, insertRowIntoSheetByDate } from "@/lib/projectSheetOrdering";
import { Plus, Trash2 } from "lucide-react";

export default function PermitInspectionChecklist({ projectId, isEnabled }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", due_date: "", notes: "" });

  const loadTasks = async () => {
    const data = await base44.entities.PermitInspectionTask.filter({ project_id: projectId }, "created_date", 200);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!projectId) return;
    loadTasks();
    const unsubscribe = base44.entities.PermitInspectionTask.subscribe(() => loadTasks());
    return unsubscribe;
  }, [projectId]);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"))),
    [tasks]
  );

  const completedCount = sortedTasks.filter((task) => task.completed).length;

  const syncInspectionTaskToSheet = async (task) => {
    const existingSheets = await base44.entities.ProjectSheet.filter({ project_id: projectId });
    const sheetRow = createInspectionSheetRow(task);

    if (existingSheets.length > 0) {
      const sheet = existingSheets[0];
      const nextRows = insertRowIntoSheetByDate(sheet.rows || [], sheetRow);
      await base44.entities.ProjectSheet.update(sheet.id, { rows: nextRows });
      window.dispatchEvent(new CustomEvent("project-sheet-rows-updated", { detail: { projectId, rows: nextRows } }));
      return;
    }

    const nextRows = [sheetRow];
    await base44.entities.ProjectSheet.create({
      project_id: projectId,
      rows: nextRows,
    });
    window.dispatchEvent(new CustomEvent("project-sheet-rows-updated", { detail: { projectId, rows: nextRows } }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const createdTask = await base44.entities.PermitInspectionTask.create({
      project_id: projectId,
      title: form.title.trim(),
      due_date: form.due_date || undefined,
      notes: form.notes.trim(),
      completed: false,
    });
    await syncInspectionTaskToSheet(createdTask);
    setForm({ title: "", due_date: "", notes: "" });
    setSaving(false);
  };

  const handleToggle = async (task) => {
    await base44.entities.PermitInspectionTask.update(task.id, { completed: !task.completed });
  };

  const handleDelete = async (taskId) => {
    await base44.entities.PermitInspectionTask.delete(taskId);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Inspection Sub Tasks</h2>
          <p className="text-sm text-slate-500 mt-1">Track each required inspection through completion.</p>
        </div>
        <Badge className="border bg-slate-100 text-slate-700 border-slate-200">
          {completedCount}/{sortedTasks.length} Complete
        </Badge>
      </div>

      {!isEnabled ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Inspection tasks unlock after permit approval</p>
          <p className="text-sm text-slate-500 mt-1">Set the permit status to Approved to start creating inspection steps.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 lg:grid-cols-[1.4fr,180px] gap-4 rounded-2xl border border-slate-200 p-4 bg-slate-50">
            <div className="space-y-4">
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Add inspection sub task"
              />
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            <div className="space-y-4">
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
              />
              <Button type="submit" disabled={!form.title.trim() || saving} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                <Plus className="w-4 h-4 mr-2" />
                {saving ? "Adding..." : "Add Task"}
              </Button>
            </div>
          </form>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No inspection tasks yet</p>
              <p className="text-sm text-slate-500 mt-1">Create the first inspection step to start tracking progress.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <Checkbox checked={task.completed} onCheckedChange={() => handleToggle(task)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("font-medium text-slate-900", task.completed && "line-through text-slate-400")}>{task.title}</p>
                      <Badge className={cn("border", task.completed ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200")}>
                        {task.completed ? "Completed" : "Open"}
                      </Badge>
                      {task.due_date && <span className="text-sm text-slate-500">Due {task.due_date}</span>}
                    </div>
                    {task.notes && <p className="text-sm text-slate-600 mt-2">{task.notes}</p>}
                  </div>
                  <button type="button" onClick={() => handleDelete(task.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}