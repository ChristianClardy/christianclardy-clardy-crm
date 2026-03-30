import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PriorityQueueDatePicker from "@/components/dashboard/PriorityQueueDatePicker";

export default function PriorityQueueEditDialog({ open, onOpenChange, formData, onChange, onSubmit }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit priority item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={formData.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Task title"
          />

          <PriorityQueueDatePicker
            value={formData.due_date}
            onChange={(value) => onChange("due_date", value)}
          />

          <Select value={formData.priority} onValueChange={(value) => onChange("priority", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            value={formData.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            placeholder="Notes"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}