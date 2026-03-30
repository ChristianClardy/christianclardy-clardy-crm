import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, CheckSquare, Edit2, Plus, Trash2 } from "lucide-react";

const emptyForm = {
  title: "",
  due_date: "",
  assigned_to: "",
  priority: "medium",
  notes: "",
};

export default function NextStepsPanel({
  title = "Next Steps",
  linkedClientId = "",
  linkedProjectId = "",
  linkedCalendarEventId = "",
  defaultAssignee = "",
  employees = [],
}) {
  const [items, setItems] = useState([]);
  const [teamMembers, setTeamMembers] = useState(employees);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, assigned_to: defaultAssignee || "" });

  const effectiveEmployees = useMemo(() => teamMembers.filter((employee) => employee.status !== "inactive"), [teamMembers]);

  useEffect(() => {
    if (employees.length) setTeamMembers(employees);
  }, [employees]);

  useEffect(() => {
    if (employees.length) return;
    base44.entities.Employee.list("full_name", 500).then((data) => setTeamMembers(data || []));
  }, [employees.length]);

  const loadItems = async () => {
    const query = linkedCalendarEventId
      ? { linked_calendar_event_id: linkedCalendarEventId }
      : {
          ...(linkedProjectId ? { linked_project_id: linkedProjectId } : {}),
          ...(!linkedProjectId && linkedClientId ? { linked_client_id: linkedClientId } : {}),
        };

    if (!Object.keys(query).length) {
      setItems([]);
      return;
    }

    const data = await base44.entities.TodoItem.filter(query, "due_date", 200);
    setItems(data || []);
  };

  useEffect(() => {
    loadItems();
    const unsubscribe = base44.entities.TodoItem.subscribe(() => loadItems());
    return () => unsubscribe();
  }, [linkedClientId, linkedProjectId, linkedCalendarEventId]);

  const resetForm = () => {
    setEditingItem(null);
    setForm({ ...emptyForm, assigned_to: defaultAssignee || "" });
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      linked_client_id: linkedClientId || null,
      linked_project_id: linkedProjectId || null,
      linked_calendar_event_id: linkedCalendarEventId || null,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
    };

    if (editingItem?.id) {
      await base44.entities.TodoItem.update(editingItem.id, payload);
    } else {
      await base44.entities.TodoItem.create(payload);
    }

    resetForm();
    await loadItems();
  };

  const startEditing = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title || "",
      due_date: item.due_date || "",
      assigned_to: item.assigned_to || "",
      priority: item.priority || "medium",
      notes: item.notes || "",
    });
    setShowForm(true);
  };

  const toggleCompleted = async (item) => {
    await base44.entities.TodoItem.update(item.id, { completed: !item.completed });
    await loadItems();
  };

  const removeItem = async (itemId) => {
    await base44.entities.TodoItem.delete(itemId);
    await loadItems();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-slate-500" />
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => {
          setEditingItem(null);
          setForm({ ...emptyForm, assigned_to: defaultAssignee || "" });
          setShowForm((value) => !value);
        }}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <Label>Next Step</Label>
            <Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} className="mt-1.5" required />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((current) => ({ ...current, due_date: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select value={form.assigned_to || "__none__"} onValueChange={(value) => setForm((current) => ({ ...current, assigned_to: value === "__none__" ? "" : value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {effectiveEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.full_name}>{employee.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} className="mt-1.5" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
            <Button type="submit">{editingItem ? "Update" : "Save"}</Button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No next steps yet.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Checkbox checked={Boolean(item.completed)} onCheckedChange={() => toggleCompleted(item)} className="mt-0.5" />
                  <div>
                    <p className={`font-medium ${item.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>{item.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {item.due_date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {item.due_date}</span>}
                      {item.assigned_to && <span>{item.assigned_to}</span>}
                      <span className="capitalize">{item.priority || "medium"} priority</span>
                    </div>
                    {item.notes && <p className="mt-2 text-sm text-slate-600">{item.notes}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" type="button" onClick={() => startEditing(item)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" type="button" onClick={() => removeItem(item.id)} className="text-rose-600 hover:text-rose-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}