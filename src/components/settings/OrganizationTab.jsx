import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/lib/TenantContext";
import { useAuth } from "@/lib/AuthContext";
import {
  Building2, Save, Users, Mail, Trash2, Plus,
  Copy, Check, Loader2, Shield, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ROLE_STYLES = {
  admin:           "bg-rose-100 text-rose-700",
  project_manager: "bg-violet-100 text-violet-700",
  office:          "bg-blue-100 text-blue-700",
  foreman:         "bg-amber-100 text-amber-700",
  laborer:         "bg-slate-100 text-slate-600",
  user:            "bg-slate-100 text-slate-600",
};

function RoleBadge({ role }) {
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", ROLE_STYLES[role] || ROLE_STYLES.user)}>
      {role}
    </span>
  );
}

export default function OrganizationTab() {
  const { user } = useAuth();
  const { organization, membership, isAdmin, reload } = useTenant();

  const [orgName, setOrgName] = useState(organization?.name || "");
  const [savingOrg, setSavingOrg] = useState(false);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);

  useEffect(() => {
    if (organization?.id) loadMembers();
  }, [organization?.id]);

  const loadMembers = async () => {
    setLoadingMembers(true);
    const [{ data: mem }, { data: inv }] = await Promise.all([
      supabase.from("organization_members").select("*").eq("organization_id", organization.id).order("joined_at"),
      supabase.from("organization_invitations").select("*").eq("organization_id", organization.id).is("accepted_at", null).order("created_at", { ascending: false }),
    ]);
    setMembers(mem || []);
    setInvitations((inv || []).filter(i => new Date(i.expires_at) > new Date()));
    setLoadingMembers(false);
  };

  const handleSaveOrg = async () => {
    if (!orgName.trim() || !isAdmin) return;
    setSavingOrg(true);
    await supabase.from("organizations").update({ name: orgName.trim() }).eq("id", organization.id);
    await reload();
    setSavingOrg(false);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !isAdmin) return;
    setInviting(true);
    try {
      const { data, error } = await supabase
        .from("organization_invitations")
        .insert({
          organization_id: organization.id,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          invited_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      setInviteEmail("");
      setInviteOpen(false);
      loadMembers();
      // Show token to copy
      setCopiedToken(null);
      alert(`Invite created! Share this token with ${data.email}:\n\n${data.token}\n\nThey will enter it on the onboarding screen.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleCopyToken = async (token) => {
    await navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevokeInvite = async (id) => {
    if (!confirm("Revoke this invitation?")) return;
    await supabase.from("organization_invitations").update({ expires_at: new Date().toISOString() }).eq("id", id);
    loadMembers();
  };

  const handleRemoveMember = async (memberId, memberUserId) => {
    if (memberUserId === user.id) { alert("You cannot remove yourself."); return; }
    if (!confirm("Remove this member from the organization?")) return;
    await supabase.from("organization_members").delete().eq("id", memberId);
    loadMembers();
  };

  const handleChangeRole = async (memberId, newRole) => {
    await supabase.from("organization_members").update({ role: newRole }).eq("id", memberId);
    loadMembers();
  };

  if (!organization) return (
    <div className="p-6 text-center text-slate-500">No organization found.</div>
  );

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Org settings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-5 h-5 text-amber-600" />
          <h3 className="text-base font-semibold text-slate-800">Organization Settings</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Organization Name</Label>
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              disabled={!isAdmin}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Organization ID</Label>
            <Input value={organization.id} readOnly className="mt-1.5 font-mono text-xs text-slate-400" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium capitalize">{organization.plan || "starter"} plan</span>
          <span className="text-xs text-slate-400">Created {new Date(organization.created_at).toLocaleDateString()}</span>
        </div>
        {isAdmin && (
          <Button onClick={handleSaveOrg} disabled={savingOrg || orgName.trim() === organization.name} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-1.5">
            {savingOrg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </Button>
        )}
      </div>

      {/* Members */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-800">Members ({members.length})</h3>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Invite Member
            </Button>
          )}
        </div>
        {loadingMembers ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5 text-left">Member</th>
                <th className="px-5 py-2.5 text-left">Role</th>
                <th className="px-5 py-2.5 text-left">Joined</th>
                {isAdmin && <th className="px-5 py-2.5 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: "#b5965a" }}>
                        {(m.invited_email || m.user_id || "U")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{m.invited_email || m.user_id}</p>
                        {m.user_id === user.id && <span className="text-xs text-amber-600 font-medium">You</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {isAdmin && m.user_id !== user.id ? (
                      <select
                        value={m.role}
                        onChange={e => handleChangeRole(m.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                      >
                        {["admin", "project_manager", "office", "foreman", "laborer", "user"].map(r => (
                          <option key={r} value={r} className="capitalize">{r}</option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{new Date(m.joined_at).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-center">
                      {m.user_id !== user.id && (
                        <button onClick={() => handleRemoveMember(m.id, m.user_id)} className="p-1.5 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Invitations */}
      {isAdmin && invitations.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Mail className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-800">Pending Invitations ({invitations.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5 text-left">Email</th>
                <th className="px-5 py-2.5 text-left">Role</th>
                <th className="px-5 py-2.5 text-left">Token</th>
                <th className="px-5 py-2.5 text-left">Expires</th>
                <th className="px-5 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 text-slate-700">{inv.email}</td>
                  <td className="px-5 py-3"><RoleBadge role={inv.role} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[140px]">{inv.token}</code>
                      <button onClick={() => handleCopyToken(inv.token)} className="p-1 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600">
                        {copiedToken === inv.token ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{new Date(inv.expires_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => handleRevokeInvite(inv.id)} className="p-1.5 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Non-admin notice */}
      {!isAdmin && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">Only organization admins can manage members and settings. Contact your admin to make changes.</p>
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-4 h-4 text-amber-600" /> Invite Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="mt-1.5" placeholder="team@example.com" autoFocus />
            </div>
            <div>
              <Label>Role</Label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="mt-1.5 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                {["admin", "project_manager", "office", "foreman", "laborer", "user"].map(r => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">An invite token will be generated. Share it with the new member — they'll enter it on the onboarding screen after signing up.</p>
            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={inviting} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Generate Invite
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
