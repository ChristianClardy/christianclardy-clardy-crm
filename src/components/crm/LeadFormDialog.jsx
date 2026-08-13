import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeadSources } from "@/lib/leadSources";

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

export default function LeadFormDialog({ open, onOpenChange, onCreated, lead = null }) {
  const isEditing = Boolean(lead);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [existingLeads, setExistingLeads] = useState([]);
  const [dupError, setDupError] = useState("");
  const leadSourceOptions = useLeadSources();

  useEffect(() => {
    if (!open) return;
    setDupError("");
    setForm(
      isEditing
        ? {
            full_name: lead.full_name || "",
            email: lead.email || "",
            phone: lead.phone || "",
            property_address: lead.property_address || "",
            project_type: lead.project_type || "Other",
            lead_source: lead.lead_source || "Website",
            assigned_sales_rep: lead.assigned_sales_rep || "",
            follow_up_date: lead.follow_up_date || "",
            project_description: lead.project_description || "",
            notes: lead.notes || "",
          }
        : initialForm
    );
    base44.entities.Employee.list("full_name", 500).then((data) => setEmployees((data || []).filter((employee) => employee.status !== "inactive")));
    base44.entities.Lead.list("-created_date", 5000).then(setExistingLeads);
  }, [open, lead, isEditing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDupError("");

    const normName  = form.full_name.trim().toLowerCase();
    const normEmail = form.email?.trim().toLowerCase();
    const normPhone = form.phone?.trim().replace(/\D/g, "");

    const dup = existingLeads.find((l) =>
      l.id !== lead?.id && (
        l.full_name?.trim().toLowerCase() === normName ||
        (normEmail && l.email?.trim().toLowerCase() === normEmail) ||
        (normPhone && l.phone?.replace(/\D/g, "") === normPhone)
      )
    );

    if (dup) {
      const reason =
        dup.full_name?.trim().toLowerCase() === normName  ? `A lead named "${dup.full_name}" already exists.` :
        normEmail && dup.email?.trim().toLowerCase() === normEmail ? `A lead with email "${dup.email}" already exists.` :
        `A lead with phone "${dup.phone}" already exists.`;
      setDupError(reason);
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await base44.entities.Lead.update(lead.id, form);
      } else {
        await base44.entities.Lead.create({ ...form, status: "New Lead" });
        setForm(initialForm);
      }
      onOpenChange(false);
      onCreated?.();
    } catch {
      // error already shown by base44Client alert
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Lead" : "Add Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Lead Name *</Label>
              <Input value={form.full_name} onChange={(e) => { setDupError(""); setForm({ ...form, full_name: e.target.value }); }} className="mt-1.5" required />
              {dupError && <p className="text-sm text-rose-600 mt-1">{dupError}</p>}
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
              <Input type="email" value={form.email} onChange={(e) => { setDupError(""); setForm({ ...form, email: e.target.value }); }} className="mt-1.5" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => { setDupError(""); setForm({ ...form, phone: e.target.value }); }} className="mt-1.5" />
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
                  {leadSourceOptions.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={(value) => setForm({ ...form, project_type: value })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    "Pergola", "Covered Patio", "Cabana", "Outdoor Kitchen", "Pool", "Remodel", "Addition", "Backyard Revamp", "Other"
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
            <Button type="submit" disabled={saving}>
              {saving ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Lead")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}