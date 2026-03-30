import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, CheckCircle2, Circle, Mail, Plus, Printer } from "lucide-react";
import PriorityQueueDatePicker from "@/components/dashboard/PriorityQueueDatePicker";
import PriorityQueueEditDialog from "@/components/dashboard/PriorityQueueEditDialog";
import PriorityQueueEmailDialog from "@/components/dashboard/PriorityQueueEmailDialog";
import { buildPriorityQueueEmailBody, buildPriorityQueuePrintHtml, formatDueLabel, groupQueueItems, sortQueueItems } from "@/components/dashboard/priorityQueueUtils";

const priorityStyles = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

const emptyTask = {
  title: "",
  due_date: "",
  priority: "medium",
};

export default function PriorityQueuePanel() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newTask, setNewTask] = useState(emptyTask);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ ...emptyTask, notes: "" });
  const [emailOpen, setEmailOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("Priority Queue");

  const loadItems = async () => {
    const me = await base44.auth.me();
    const todoItems = await base44.entities.TodoItem.list("-updated_date", 200);
    const visibleItems = (todoItems || []).filter((item) => item.created_by === me.email || item.assigned_to === me.full_name);

    setUser(me);
    setRecipientEmail(me.email || "");
    setEmailSubject(`${me.full_name || "My"} Priority Queue`);
    setItems(visibleItems);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
    const unsubscribe = base44.entities.TodoItem.subscribe(() => loadItems());
    return () => unsubscribe();
  }, []);

  const activeCount = useMemo(() => items.filter((item) => !item.completed).length, [items]);
  const visibleItems = useMemo(() => showCompleted ? items : items.filter((item) => !item.completed), [items, showCompleted]);
  const sortedItems = useMemo(() => sortQueueItems(visibleItems), [visibleItems]);
  const groupedItems = useMemo(() => groupQueueItems(sortedItems), [sortedItems]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    await base44.entities.TodoItem.create({
      title: newTask.title,
      due_date: newTask.due_date || null,
      priority: newTask.priority,
      completed: false,
    });
    setNewTask(emptyTask);
    await loadItems();
  };

  const handleToggleComplete = async (item) => {
    await base44.entities.TodoItem.update(item.id, { completed: !item.completed });
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditForm({
      title: item.title || "",
      due_date: item.due_date || "",
      priority: item.priority || "medium",
      notes: item.notes || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    await base44.entities.TodoItem.update(editingItem.id, {
      title: editForm.title,
      due_date: editForm.due_date || null,
      priority: editForm.priority,
      notes: editForm.notes,
    });
    setEditingItem(null);
    setEditForm({ ...emptyTask, notes: "" });
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=960,height=720");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(buildPriorityQueuePrintHtml({
      items: sortedItems,
      ownerName: user?.full_name || "Your",
    }));
    printWindow.document.close();
  };

  const handleSendEmail = () => {
    const body = buildPriorityQueueEmailBody({
      items: sortedItems,
      ownerName: user?.full_name || "Your",
    });

    window.location.href = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    setEmailOpen(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: "#ddd5c8" }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#b5965a", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-5" style={{ borderColor: "#ddd5c8" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.16em" }}>Agenda + To Do</p>
            <h2 className="text-xl font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Priority Queue</h2>
            <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>{activeCount} active items in your queue</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowCompleted((value) => !value)}>
              {showCompleted ? "Hide completed" : "Show completed"}
            </Button>
            <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4" /> Print</Button>
            <Button variant="outline" onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4" /> Email</Button>
          </div>
        </div>

        <form onSubmit={handleAddTask} className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_180px_160px_auto]">
          <Input
            value={newTask.title}
            onChange={(e) => setNewTask((current) => ({ ...current, title: e.target.value }))}
            placeholder="Add a priority item"
            required
          />
          <PriorityQueueDatePicker
            value={newTask.due_date}
            onChange={(value) => setNewTask((current) => ({ ...current, due_date: value }))}
          />
          <Select value={newTask.priority} onValueChange={(value) => setNewTask((current) => ({ ...current, priority: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}><Plus className="h-4 w-4" /> Add</Button>
        </form>

        {groupedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-5 py-10 text-center" style={{ borderColor: "#ddd5c8", backgroundColor: "#f8f6f3", color: "#7a6e66" }}>
            Your queue is clear.
          </div>
        ) : (
          <div className="space-y-5">
            {groupedItems.map((group) => (
              <div key={group.key}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1" style={{ backgroundColor: "#ede6dd" }} />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "#b5965a" }}>{group.label}</p>
                  <div className="h-px flex-1" style={{ backgroundColor: "#ede6dd" }} />
                </div>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleEditItem(item)}
                      className="w-full cursor-pointer rounded-2xl border p-4 text-left transition-shadow hover:shadow-sm"
                      style={{ borderColor: "#ddd5c8", backgroundColor: item.completed ? "#f8f6f3" : "#fff" }}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleComplete(item);
                          }}
                          className="mt-0.5"
                          type="button"
                          style={{ color: item.completed ? "#b5965a" : "#c7b8a7" }}
                        >
                          {item.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold" style={{ color: item.completed ? "#7a6e66" : "#3d3530", textDecoration: item.completed ? "line-through" : "none" }}>{item.title}</p>
                            <Badge className={priorityStyles[item.priority || "medium"]}>{(item.priority || "medium").toUpperCase()}</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: "#7a6e66" }}>
                            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatDueLabel(item.due_date)}</span>
                            {item.assigned_to ? <span>{item.assigned_to}</span> : null}
                          </div>
                          {item.notes ? <p className="mt-2 text-sm" style={{ color: "#5a4f48" }}>{item.notes}</p> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PriorityQueueEditDialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingItem(null);
            setEditForm({ ...emptyTask, notes: "" });
          }
        }}
        formData={editForm}
        onChange={(field, value) => setEditForm((current) => ({ ...current, [field]: value }))}
        onSubmit={handleSaveEdit}
      />

      <PriorityQueueEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        recipientEmail={recipientEmail}
        setRecipientEmail={setRecipientEmail}
        subject={emailSubject}
        setSubject={setEmailSubject}
        onSubmit={handleSendEmail}
        isSending={false}
      />
    </>
  );
}