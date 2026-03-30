import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import PermitInspectionChecklist from "@/components/projects/PermitInspectionChecklist";

const STATUS_OPTIONS = ["Not Required", "Needed", "Submitted", "Approved", "Delayed", "Closed"];

const STATUS_STYLES = {
  "Not Required": "bg-slate-100 text-slate-700 border-slate-200",
  Needed: "bg-amber-100 text-amber-700 border-amber-200",
  Submitted: "bg-blue-100 text-blue-700 border-blue-200",
  Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Delayed: "bg-rose-100 text-rose-700 border-rose-200",
  Closed: "bg-slate-900 text-white border-slate-900",
};

const today = new Date().toISOString().slice(0, 10);

export default function PermitTracker({ project, onProjectUpdated }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status: project?.permit_status || "Needed",
    status_date: today,
    notes: "",
  });

  const loadUpdates = async () => {
    const data = await base44.entities.PermitUpdate.filter({ project_id: project.id }, "status_date", 200);
    setUpdates(data);
    setLoading(false);
  };

  useEffect(() => {
    setForm((prev) => ({ ...prev, status: project?.permit_status || prev.status || "Needed" }));
  }, [project?.permit_status]);

  useEffect(() => {
    if (!project?.id) return;
    loadUpdates();
    const unsubscribe = base44.entities.PermitUpdate.subscribe(() => loadUpdates());
    return unsubscribe;
  }, [project?.id]);

  const timeline = useMemo(
    () => [...updates].sort((a, b) => String(a.status_date).localeCompare(String(b.status_date))),
    [updates]
  );

  const inspectionsEnabled = useMemo(
    () => ["Approved", "Closed"].includes(project?.permit_status) || updates.some((item) => ["Approved", "Closed"].includes(item.status)),
    [project?.permit_status, updates]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.PermitUpdate.create({
      project_id: project.id,
      status: form.status,
      status_date: form.status_date,
      notes: form.notes,
    });
    await base44.entities.Project.update(project.id, { permit_status: form.status });
    setForm({ status: form.status, status_date: today, notes: "" });
    setSaving(false);
    onProjectUpdated?.();
  };

  const handleDelete = async (updateId) => {
    await base44.entities.PermitUpdate.delete(updateId);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Permit Status</h2>
            <p className="text-sm text-slate-500 mt-1">Track permit progress for this project.</p>
          </div>
          <Badge className={cn("border", STATUS_STYLES[project?.permit_status || "Needed"])}>
            {project?.permit_status || "Needed"}
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">Status</p>
            <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">Date</p>
            <Input
              type="date"
              value={form.status_date}
              onChange={(e) => setForm((prev) => ({ ...prev, status_date: e.target.value }))}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">Notes</p>
            <Textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Add permit notes, requirements, or next steps..."
            />
          </div>

          <Button type="submit" disabled={!form.status || !form.status_date || saving} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Add Status Update"}
          </Button>
        </form>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-5">Permit Timeline</h2>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : timeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No permit updates yet</p>
              <p className="text-sm text-slate-500 mt-1">Add the first permit status update to start the timeline.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {timeline.map((item, index) => (
                <div key={item.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={cn("w-3.5 h-3.5 rounded-full mt-1.5 border", STATUS_STYLES[item.status])} />
                    {index < timeline.length - 1 && <div className="w-px flex-1 bg-slate-200 my-2" />}
                  </div>
                  <div className="flex-1 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cn("border", STATUS_STYLES[item.status])}>{item.status}</Badge>
                          <span className="text-sm text-slate-500">{item.status_date}</span>
                        </div>
                        {item.notes && <p className="text-sm text-slate-600 mt-3 leading-relaxed">{item.notes}</p>}
                      </div>
                      <button
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => handleDelete(item.id)}
                        title="Delete update"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <PermitInspectionChecklist projectId={project.id} isEnabled={inspectionsEnabled} />
      </div>
    </div>
  );
}