import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const invoiceTypes = ["Deposit", "Progress Payment", "Material Draw", "Substantial Completion", "Final Payment", "Change Order", "Other"];

export default function InvoiceDialog({ open, onOpenChange, form, onChange, onSubmit, isEditing = false, projects = [] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Project *</Label>
            <Select value={form.linked_job_id} onValueChange={(value) => onChange("linked_job_id", value)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Invoice Name *</Label>
            <Input value={form.invoice_name} onChange={(e) => onChange("invoice_name", e.target.value)} className="mt-1.5" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Amount *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => onChange("amount", e.target.value)} className="mt-1.5" required />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => onChange("due_date", e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label>Description of Work / Billing Reason</Label>
            <Textarea value={form.notes || ""} onChange={(e) => onChange("notes", e.target.value)} className="mt-1.5" rows={4} placeholder="Example: Deposit for pergola construction, including design, material ordering, and project scheduling." />
          </div>
          <div>
            <Label>Invoice Type</Label>
            <Select value={form.invoice_type} onValueChange={(value) => onChange("invoice_type", value)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {invoiceTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 text-white hover:bg-slate-800">{isEditing ? "Save Invoice" : "Create Invoice"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}