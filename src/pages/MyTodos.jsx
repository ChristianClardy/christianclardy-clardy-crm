import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Circle, CheckCircle2, Calendar, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import moment from "moment";
import QuickNotes from "@/components/notes/QuickNotes";
import SubtaskList from "@/components/tasks/SubtaskList";

const priorityStyles = {
  low: { label: "Low", class: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", class: "bg-amber-100 text-amber-700" },
  high: { label: "High", class: "bg-rose-100 text-rose-700" },
};

export default function MyTodos() {
  const [todos, setTodos] = useState([]);
  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active"); // "active" | "completed" | "all"
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [formData, setFormData] = useState({ title: "", priority: "medium", due_date: "", notes: "", assigned_to: "", recurring: "none", subtasks: [] });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      const [items, emps] = await Promise.all([
        base44.entities.TodoItem.filter({ created_by: me.email }, "-created_date"),
        base44.entities.Employee.list(),
      ]);
      setTodos(items);
      setEmployees(emps.filter(e => e.status === "active"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (todo = null) => {
    if (todo) {
      setEditingTodo(todo);
      setFormData({
        title: todo.title,
        priority: todo.priority || "medium",
        due_date: todo.due_date || "",
        notes: todo.notes || "",
        assigned_to: todo.assigned_to || "",
        recurring: todo.recurring || "none",
        subtasks: todo.subtasks || [],
      });
    } else {
      setEditingTodo(null);
      setFormData({ title: "", priority: "medium", due_date: "", notes: "", assigned_to: "", recurring: "none", subtasks: [] });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const prevAssigned = editingTodo?.assigned_to || "";
    if (editingTodo) {
      await base44.entities.TodoItem.update(editingTodo.id, formData);
    } else {
      await base44.entities.TodoItem.create(formData);
    }
    // Notify if newly assigned
    if (formData.assigned_to && formData.assigned_to !== prevAssigned) {
      const assignee = employees.find(e => e.full_name === formData.assigned_to);
      if (assignee?.email) {
        await base44.entities.Notification.create({
          user_email: assignee.email,
          title: `Task Assigned: ${formData.title}`,
          message: `You have been assigned the task "${formData.title}"${formData.due_date ? ` due ${formData.due_date}` : ""}.`,
          type: "assignment",
        });
      }
    }
    setIsDialogOpen(false);
    loadData();
  };

  const toggleComplete = async (todo) => {
    await base44.entities.TodoItem.update(todo.id, { completed: !todo.completed });
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTodo = async (id) => {
    await base44.entities.TodoItem.delete(id);
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  const filtered = todos.filter(t => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter(t => !t.completed).length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#3d3530" }}>My To-Do List</h1>
          <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>
            {user?.full_name ? `${user.full_name}'s tasks` : "Your personal tasks"} · {activeCount} remaining
          </p>
        </div>
        <Button
          onClick={() => openDialog()}
          className="gap-2"
          style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}
        >
          <Plus className="w-4 h-4" />
          Add Task
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ backgroundColor: "#ede6dd" }}>
        {["active", "completed", "all"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("flex-1 py-2 px-4 rounded-lg text-sm font-medium capitalize transition-all")}
            style={filter === f
              ? { backgroundColor: "#fff", color: "#3d3530", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
              : { color: "#7a6e66" }
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* Todo List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ backgroundColor: "#ede6dd" }}>
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#b5965a" }} />
          <p className="font-medium" style={{ color: "#3d3530" }}>
            {filter === "completed" ? "No completed tasks yet" : "All caught up!"}
          </p>
          <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>
            {filter === "active" ? "Add a new task to get started." : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(todo => {
            const isOverdue = todo.due_date && !todo.completed && moment(todo.due_date).isBefore(moment(), 'day');
            return (
              <div
                key={todo.id}
                className="flex items-start gap-3 p-4 rounded-xl border group transition-all cursor-pointer"
                style={{ backgroundColor: "#fff", borderColor: "#ddd5c8" }}
                onClick={() => openDialog(todo)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleComplete(todo); }}
                  className="mt-0.5 shrink-0 transition-colors"
                  style={{ color: todo.completed ? "#b5965a" : "#ddd5c8" }}
                >
                  {todo.completed
                    ? <CheckCircle2 className="w-5 h-5" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>

                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium text-sm", todo.completed && "line-through")}
                    style={{ color: todo.completed ? "#7a6e66" : "#3d3530" }}>
                    {todo.title}
                  </p>
                  {todo.notes && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: "#7a6e66" }}>{todo.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge className={cn("text-xs", priorityStyles[todo.priority]?.class)}>
                      {priorityStyles[todo.priority]?.label}
                    </Badge>
                    {todo.due_date && (
                      <span className={cn("flex items-center gap-1 text-xs")}
                        style={{ color: isOverdue ? "#e11d48" : "#7a6e66" }}>
                        <Calendar className="w-3 h-3" />
                        {moment(todo.due_date).format("MMM D")}
                        {isOverdue && " · Overdue"}
                      </span>
                    )}
                    {todo.assigned_to && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: "#7a6e66" }}>
                        <Users className="w-3 h-3" /> {todo.assigned_to}
                      </span>
                    )}
                    {todo.recurring && todo.recurring !== "none" && (
                      <span className="flex items-center gap-1 text-xs text-blue-500">
                        <RefreshCw className="w-3 h-3" /> {todo.recurring}
                      </span>
                    )}
                    {todo.subtasks?.length > 0 && (
                      <span className="text-xs" style={{ color: "#7a6e66" }}>
                        {todo.subtasks.filter(s=>s.completed).length}/{todo.subtasks.length} subtasks
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                  style={{ color: "#e11d48" }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Notes Section */}
      <QuickNotes />

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTodo ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Task *</Label>
              <Input
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="What needs to be done?"
                required
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Assign To</Label>
                <Select value={formData.assigned_to || "__none__"} onValueChange={v => setFormData({ ...formData, assigned_to: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recurring</Label>
                <Select value={formData.recurring || "none"} onValueChange={v => setFormData({ ...formData, recurring: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1.5"
                rows={2}
                placeholder="Optional notes..."
              />
            </div>
            <div>
              <Label>Subtasks</Label>
              <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <SubtaskList subtasks={formData.subtasks} onChange={v => setFormData({ ...formData, subtasks: v })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
                {editingTodo ? "Save Changes" : "Add Task"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}