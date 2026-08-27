import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchDesigners } from "@/lib/designers";

// Three separate, non-overlapping sources feed this dropdown — kept as
// distinct groups (rather than merged into one flat list) so it's clear
// where each name is actually managed: Settings → Designers, the Team
// Members tab, or the Subcontractors page.
export default function DesignerAssignmentDialog({ lead, saving, onSkip, onSave }) {
  const [designer, setDesigner] = useState(lead?.assigned_designer || "");
  const [designers, setDesigners] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);

  useEffect(() => {
    fetchDesigners().then(setDesigners).catch(() => {});
    base44.entities.Employee.list("full_name", 500)
      .then((data) => setEmployees((data || []).filter((employee) => employee.status !== "inactive")));
    base44.entities.Subcontractor.list("name", 500)
      .then((data) => setSubcontractors((data || []).filter((sub) => sub.status !== "inactive")));
  }, []);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onSkip(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign a designer</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Who's designing {lead?.full_name}'s project?
        </p>
        <div>
          <Label>Designer</Label>
          <Select value={designer} onValueChange={setDesigner}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a designer" /></SelectTrigger>
            <SelectContent>
              {designers.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Designers</SelectLabel>
                  {designers.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectGroup>
              )}
              {employees.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Team Members</SelectLabel>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.full_name}>{employee.full_name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {subcontractors.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Subcontractors</SelectLabel>
                  {subcontractors.map((sub) => <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onSkip} disabled={saving}>Skip</Button>
          <Button onClick={() => onSave(designer)} disabled={saving || !designer}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
