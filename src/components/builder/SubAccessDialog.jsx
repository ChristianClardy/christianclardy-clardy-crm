import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendInvite } from "@/lib/sendInvite";

const ACTIVE_STATUSES = new Set(["planning", "in_progress", "on_hold"]);

// Staff-only: which jobs a subcontractor can see in the app, and who from that
// sub has an app login. Portal logins are never deleted through the app (the
// database blocks it, see 034_subcontractor_portal.sql), only turned off.
export default function SubAccessDialog({ sub, onOpenChange, projects, assignments, portalUsers, onAssignmentsChange, onPortalUsersChange }) {
  const [busyProject, setBusyProject] = useState(null);
  const [invite, setInvite] = useState({ full_name: "", email: "" });
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [showAllJobs, setShowAllJobs] = useState(false);

  if (!sub) return null;

  const subAssignments = assignments.filter((a) => a.subcontractor_id === sub.id);
  const assignedIds = new Set(subAssignments.map((a) => a.project_id));
  const logins = portalUsers.filter((u) => u.subcontractor_id === sub.id);
  const visibleProjects = projects.filter((p) => showAllJobs || ACTIVE_STATUSES.has(p.status) || assignedIds.has(p.id));

  const toggleProject = async (projectId) => {
    setBusyProject(projectId);
    try {
      const existing = subAssignments.find((a) => a.project_id === projectId);
      if (existing) {
        await base44.entities.ProjectSubcontractor.delete(existing.id);
        onAssignmentsChange(assignments.filter((a) => a.id !== existing.id));
      } else {
        const created = await base44.entities.ProjectSubcontractor.create({ project_id: projectId, subcontractor_id: sub.id });
        onAssignmentsChange([...assignments, created]);
      }
    } finally {
      setBusyProject(null);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!invite.email.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await sendInvite({ email: invite.email.trim(), fullName: invite.full_name.trim(), subcontractorId: sub.id });
      const fresh = await base44.entities.SubcontractorPortalUser.list("email");
      onPortalUsersChange(fresh);
      setInviteMsg({ ok: true, text: `Invite sent to ${invite.email.trim()}. They'll get an email to set a password, then can install the app.` });
      setInvite({ full_name: "", email: "" });
    } catch (err) {
      setInviteMsg({ ok: false, text: err.message });
    } finally {
      setInviting(false);
    }
  };

  const setLoginActive = async (login, active) => {
    if (!active && !confirm(`Turn off app access for ${login.full_name || login.email}? They'll be signed out of everything.`)) return;
    // Keyed by user_id (no `id` column), so this can't go through base44's update(id).
    const { error } = await supabase.from("subcontractor_portal_users").update({ active }).eq("user_id", login.user_id);
    if (error) { alert(`Could not update access: ${error.message}`); return; }
    onPortalUsersChange(portalUsers.map((u) => (u.user_id === login.user_id ? { ...u, active } : u)));
  };

  return (
    <Dialog open={!!sub} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub.name}: jobs & app access</DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Jobs they can see in the app</h3>
            <label className="text-xs text-slate-500 flex items-center gap-1.5">
              <Checkbox checked={showAllJobs} onCheckedChange={(v) => setShowAllJobs(!!v)} /> Show completed jobs
            </label>
          </div>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {visibleProjects.length === 0 && <p className="text-sm text-slate-400 p-3">No active projects.</p>}
            {visibleProjects.map((p) => (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                {busyProject === p.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : (
                  <Checkbox checked={assignedIds.has(p.id)} onCheckedChange={() => toggleProject(p.id)} disabled={!!busyProject} />
                )}
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{p.name}</span>
                  {p.address && <span className="block text-xs text-slate-500 truncate">{p.address}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">App logins</h3>
          {logins.length === 0 && <p className="text-sm text-slate-400">No one from {sub.name} has an app login yet.</p>}
          {logins.map((u) => (
            <div key={u.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate">{u.full_name || u.email}</p>
                <p className="text-xs text-slate-500 truncate">{u.email}{u.active ? "" : " · access off"}</p>
              </div>
              {u.active ? (
                <Button size="sm" variant="outline" onClick={() => setLoginActive(u, false)}><UserX className="w-4 h-4 mr-1" /> Turn off</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setLoginActive(u, true)}><UserCheck className="w-4 h-4 mr-1" /> Turn on</Button>
              )}
            </div>
          ))}

          <form onSubmit={handleInvite} className="rounded-xl bg-slate-50 p-3 space-y-2">
            <p className="text-xs text-slate-600">Invite someone from {sub.name}. They'll only see the jobs checked above, never clients, pricing, or other jobs.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder="Crew lead name" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder={sub.email || "name@company.com"} />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={inviting} style={{ backgroundColor: "#b5965a", color: "#f5f0eb" }}>
              {inviting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              Send app invite
            </Button>
            {inviteMsg && <p className={inviteMsg.ok ? "text-xs text-emerald-700" : "text-xs text-red-600"}>{inviteMsg.text}</p>}
          </form>
        </section>
      </DialogContent>
    </Dialog>
  );
}
