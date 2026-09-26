import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Removing an employee also has to cut their app access: deleting the
// employee record alone leaves their logins working. A Builder Portal login
// keeps matching jobs by name (pm_can_access_project), and a CRM login is an
// organization_members row. Access is turned off (reversible) rather than
// deleted; the employee record itself can be deleted or just marked inactive.
export default function RemoveEmployeeDialog({ employee, pmLogin, onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [crmMember, setCrmMember] = useState(null);
  const [isMe, setIsMe] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [cutAccess, setCutAccess] = useState(true);
  const [unassign, setUnassign] = useState(false);
  const [working, setWorking] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const email = (employee.email || "").trim().toLowerCase();
      const [{ data: { user } }, { data: orgId }, projects] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("staff_org_id"),
        employee.full_name ? base44.entities.Project.filter({ project_manager: employee.full_name }).catch(() => []) : [],
      ]);
      let member = null;
      if (email && orgId) {
        const { data } = await supabase.from("organization_members").select("*")
          .eq("organization_id", orgId).ilike("invited_email", email).maybeSingle();
        member = data || null;
      }
      setCrmMember(member);
      setIsMe(!!member && member.user_id === user?.id);
      setJobs(projects);
      setLoading(false);
    })();
  }, [employee.id]);

  const hasPm = pmLogin?.active;
  const hasCrm = crmMember && (crmMember.status || "active") === "active";

  const run = async (mode) => {
    setWorking(mode);
    setError("");
    try {
      if (cutAccess) {
        if (hasPm) {
          const { error: e } = await supabase.from("pm_portal_users").update({ active: false }).eq("user_id", pmLogin.user_id);
          if (e) throw e;
        }
        if (hasCrm && !isMe) {
          const { error: e } = await supabase.from("organization_members").update({ status: "inactive" }).eq("id", crmMember.id);
          if (e) throw e;
        }
      }
      if (unassign) {
        for (const p of jobs) await base44.entities.Project.update(p.id, { project_manager: null });
      }
      if (mode === "delete") await base44.entities.Employee.delete(employee.id);
      else await base44.entities.Employee.update(employee.id, { status: "inactive" });
      onDone();
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setWorking(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !working) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Remove {employee.full_name}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-800">App access</p>
              {hasPm || hasCrm ? (
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
                  <input type="checkbox" className="mt-0.5" checked={cutAccess} onChange={(e) => setCutAccess(e.target.checked)} />
                  <span>
                    Turn off their access now
                    <span className="block text-xs text-slate-500">
                      {[hasCrm && "CRM login", hasPm && "Builder Portal login"].filter(Boolean).join(" and ")} ({(hasPm && pmLogin.email) || crmMember?.invited_email}).
                      They'll be locked out; you can turn it back on later.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-xs text-slate-500">No app login found for {employee.email || "this employee"}.</p>
              )}
              {hasCrm && isMe && (
                <p className="flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> This is your own login, so your CRM access won't be turned off.</p>
              )}
            </div>

            {jobs.length > 0 && (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-800">Jobs</p>
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
                  <input type="checkbox" className="mt-0.5" checked={unassign} onChange={(e) => setUnassign(e.target.checked)} />
                  <span>
                    Unassign them from {jobs.length} job{jobs.length !== 1 ? "s" : ""} they manage
                    <span className="block text-xs text-slate-500">{jobs.slice(0, 3).map((j) => j.name).join(", ")}{jobs.length > 3 ? "…" : ""}. Leave off to keep their name on those jobs.</span>
                  </span>
                </label>
              </div>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={onClose} disabled={!!working}>Cancel</Button>
              <Button variant="outline" onClick={() => run("inactive")} disabled={!!working}>
                {working === "inactive" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Mark inactive
              </Button>
              <Button onClick={() => { if (confirm(`Delete ${employee.full_name}? This can't be undone.`)) run("delete"); }} disabled={!!working} className="bg-rose-600 hover:bg-rose-700 text-white">
                {working === "delete" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Delete employee
              </Button>
            </div>
            <p className="text-xs text-slate-500">"Mark inactive" keeps their record and history. "Delete" removes the employee record for good.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
