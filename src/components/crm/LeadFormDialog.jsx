import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_SOURCE_OPTIONS } from "@/lib/leadSources";

const initialForm = {
  full_name: "",
  email: "",
  phone: "",
  property_address: "",
  project_type: "Other",
  lead_source: "Website",
  assigned_sales_rep: "",
  follow_up_date: "",
  project_description: "",
  notes: "",
};

export default function LeadFormDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (!open) return;
    base44.entities.Employee.list("full_name", 500).then((data) => setEmployees((data || []).filter((employee) => employee.status !== "inactive")));
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Lead.create({ ...form, status: "New Lead" });
    setSaving(false);
    setForm(initialForm);
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Lead Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1.5" required />
            </div>
            <div>
              <Label>Assigned Sales Rep *</Label>
              <Select value={form.assigned_sales_rep} onValueChange={(value) => setForm({ ...form, assigned_sales_rep: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => <SelectItem key={employee.id} value={employee.full_name}>{employee.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Lead Source</Label>
              <Select value={form.lead_source} onValueChange={(value) => setForm({ ...form, lead_source: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCE_OPTIONS.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={(value) => setForm({ ...form, project_type: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    "Pergola", "Covered Patio", "Cabana", "Outdoor Kitchen", "Remodel", "Addition", "Backyard Revamp", "Other"
                  ].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Next Follow Up</Label>
            <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} className="mt-1.5 max-w-xs" />
          </div>
          <div>
            <Label>Project Description</Label>
            <Textarea value={form.project_description} onChange={(e) => setForm({ ...form, project_description: e.target.value })} className="mt-1.5" rows={3} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Lead"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}