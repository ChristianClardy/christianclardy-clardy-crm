import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LostReasonDialog from "@/components/crm/LostReasonDialog";
import DesignerAssignmentDialog from "@/components/crm/DesignerAssignmentDialog";
import { setLeadStatus, markLeadLost, assignDesignerAndSetInDesign } from "@/lib/leadConversion";
import { LEAD_STAGES } from "@/lib/leadStages";

// Blocks Escape / overlay-click / outside-pointer dismissal — this modal can
// only be dismissed by actually resolving the appointment.
const blockDismiss = (e) => e.preventDefault();

export default function OverdueAppointmentDialog({ event, onResolved }) {
  const [mode, setMode] = useState("outcome"); // "outcome" | "reschedule"
  const [saving, setSaving] = useState(false);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");

  const [stageStep, setStageStep] = useState(false);
  const [lead, setLead] = useState(null);
  const [stageValue, setStageValue] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [lostReasonOpen, setLostReasonOpen] = useState(false);
  const [designerPromptOpen, setDesignerPromptOpen] = useState(false);

  useEffect(() => {
    setMode("outcome");
    setSaving(false);
    setRescheduleStart(String(event.start_datetime || "").slice(0, 16));
    setRescheduleEnd(String(event.end_datetime || event.start_datetime || "").slice(0, 16));
    setRescheduleError("");
    setStageStep(false);
    setLead(null);
    setStageValue("");
  }, [event.id]);

  // Completed/Cancelled both hand off to a lead-stage prompt when the
  // appointment is tied to a lead — Reschedule skips this, nothing about the
  // deal actually changed.
  const afterAppointmentResolved = async () => {
    if (event.lead_id) {
      try {
        const rows = await base44.entities.Lead.filter({ id: event.lead_id });
        const leadRow = rows?.[0] || null;
        if (leadRow) {
          setLead(leadRow);
          setStageValue(leadRow.status || "New Lead");
          setStageStep(true);
          return;
        }
      } catch (err) {
        console.error("Failed to load lead for stage update:", err?.message);
      }
    }
    onResolved();
  };

  const handleCompleted = async () => {
    setSaving(true);
    try {
      await base44.entities.CalendarEvent.update(event.id, { status: "completed" });
      await afterAppointmentResolved();
    } catch (err) {
      console.error("Failed to mark appointment completed:", err?.message);
      alert("Could not update the appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAppointment = async () => {
    setSaving(true);
    try {
      await base44.entities.CalendarEvent.update(event.id, { status: "cancelled" });
      await afterAppointmentResolved();
    } catch (err) {
      console.error("Failed to cancel appointment:", err?.message);
      alert("Could not cancel the appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleStart || new Date(rescheduleStart) <= new Date()) {
      setRescheduleError("Pick a start time in the future.");
      return;
    }
    setRescheduleError("");
    setSaving(true);
    try {
      await base44.entities.CalendarEvent.update(event.id, {
        start_datetime: rescheduleStart,
        end_datetime: rescheduleEnd || rescheduleStart,
        status: "scheduled",
      });
      onResolved();
    } catch (err) {
      console.error("Failed to reschedule appointment:", err?.message);
      alert("Could not reschedule the appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateStage = async (value) => {
    setSavingStage(true);
    try {
      await setLeadStatus(lead, value);
      onResolved();
    } catch (err) {
      console.error("Status update failed:", err?.message);
      alert(`Could not set stage "${value}".\n\nRun this in Supabase SQL editor:\nALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS '${value}';`);
      setSavingStage(false);
    }
  };

  const handleStageChange = (value) => {
    setStageValue(value);
    // Mirrors LeadDetail.jsx's stage-change branching so these two stages
    // still capture the same required detail from this shortcut path.
    if (value === "Lost/No Decision") {
      setLostReasonOpen(true);
      return;
    }
    if (value === "In Design") {
      setDesignerPromptOpen(true);
      return;
    }
    updateStage(value);
  };

  const handleSaveLostReason = async ({ reason, notes }) => {
    setSavingStage(true);
    try {
      await markLeadLost(lead, { reason, notes });
      setLostReasonOpen(false);
      onResolved();
    } catch (err) {
      console.error("Failed to save lost reason:", err?.message);
      alert("Could not save the lost reason. Please try again.");
      setSavingStage(false);
    }
  };

  const handleSkipDesigner = () => {
    setDesignerPromptOpen(false);
    updateStage("In Design");
  };

  const handleSaveDesigner = async (designer) => {
    setSavingStage(true);
    try {
      await assignDesignerAndSetInDesign(lead, designer);
      setDesignerPromptOpen(false);
      onResolved();
    } catch (err) {
      console.error("Failed to assign designer:", err?.message);
      alert("Could not assign the designer. Please try again.");
      setSavingStage(false);
    }
  };

  if (stageStep && lead) {
    return (
      <>
        <Dialog open onOpenChange={() => {}}>
          <DialogContent
            className="max-w-sm"
            hideCloseButton
            onEscapeKeyDown={blockDismiss}
            onPointerDownOutside={blockDismiss}
            onInteractOutside={blockDismiss}
          >
            <DialogHeader>
              <DialogTitle>Update {lead.full_name}'s stage</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-500">
              "{event.title}" is resolved — what stage is this lead at now?
            </p>
            <div>
              <Label>Stage</Label>
              <Select value={stageValue} onValueChange={handleStageChange} disabled={savingStage}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </DialogContent>
        </Dialog>

        {lostReasonOpen && (
          <LostReasonDialog lead={lead} saving={savingStage} onCancel={() => setLostReasonOpen(false)} onSave={handleSaveLostReason} />
        )}
        {designerPromptOpen && (
          <DesignerAssignmentDialog lead={lead} saving={savingStage} onSkip={handleSkipDesigner} onSave={handleSaveDesigner} />
        )}
      </>
    );
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        hideCloseButton
        onEscapeKeyDown={blockDismiss}
        onPointerDownOutside={blockDismiss}
        onInteractOutside={blockDismiss}
      >
        <DialogHeader>
          <DialogTitle>Appointment needs an update</DialogTitle>
        </DialogHeader>
        <div>
          <p className="font-medium text-slate-900">{event.title}</p>
          <p className="mt-1 text-sm text-slate-500">
            Scheduled for {new Date(event.start_datetime).toLocaleString()} — this has passed and still needs to be resolved.
          </p>
        </div>

        {mode === "outcome" ? (
          <div className="flex flex-col gap-2">
            <Button onClick={handleCompleted} disabled={saving}>Mark Completed</Button>
            <Button variant="outline" onClick={() => setMode("reschedule")} disabled={saving}>Reschedule</Button>
            <Button variant="outline" className="text-rose-600" onClick={handleCancelAppointment} disabled={saving}>
              Cancel Appointment
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>New start</Label>
              <Input type="datetime-local" value={rescheduleStart} onChange={(e) => setRescheduleStart(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>New end</Label>
              <Input type="datetime-local" value={rescheduleEnd} onChange={(e) => setRescheduleEnd(e.target.value)} className="mt-1.5" />
            </div>
            {rescheduleError && <p className="text-sm text-rose-600">{rescheduleError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMode("outcome")} disabled={saving}>Back</Button>
              <Button onClick={handleReschedule} disabled={saving}>{saving ? "Saving…" : "Save new time"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
