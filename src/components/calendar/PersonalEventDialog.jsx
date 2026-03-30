import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const emptyForm = {
  title: "",
  description: "",
  location: "",
  start_datetime: "",
  end_datetime: "",
};

export default function PersonalEventDialog({ open, onOpenChange, event, initialRange, onSaved }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title || "",
        description: event.description || "",
        location: event.location || "",
        start_datetime: String(event.start_datetime || "").slice(0, 16),
        end_datetime: String(event.end_datetime || "").slice(0, 16),
      });
    } else if (initialRange) {
      setForm({
        ...emptyForm,
        start_datetime: String(initialRange.start_datetime || "").slice(0, 16),
        end_datetime: String(initialRange.end_datetime || "").slice(0, 16),
      });
    } else {
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setForm({
        ...emptyForm,
        start_datetime: start.toISOString().slice(0, 16),
        end_datetime: end.toISOString().slice(0, 16),
      });
    }
  }, [event, initialRange, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (event?.id) {
      await base44.entities.CalendarEvent.update(event.id, form);
    } else {
      await base44.entities.CalendarEvent.create(form);
    }
    onOpenChange(false);
    await onSaved?.();
  };

  const handleDelete = async () => {
    if (!event?.id) return;
    await base44.entities.CalendarEvent.delete(event.id);
    onOpenChange(false);
    await onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? "Edit Personal Event" : "Add Personal Event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} className="mt-1.5" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start</Label>
              <Input type="datetime-local" value={form.start_datetime} onChange={(e) => setForm((current) => ({ ...current, start_datetime: e.target.value }))} className="mt-1.5" required />
            </div>
            <div>
              <Label>End</Label>
              <Input type="datetime-local" value={form.end_datetime} onChange={(e) => setForm((current) => ({ ...current, end_datetime: e.target.value }))} className="mt-1.5" required />
            </div>
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} className="mt-1.5" placeholder="Optional" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} className="mt-1.5" rows={3} />
          </div>
          <div className="flex justify-between gap-3 pt-2">
            <div>
              {event && (
                <Button type="button" variant="outline" className="text-rose-600" onClick={handleDelete}>Delete</Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-slate-900 text-white hover:bg-slate-800">Save</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}