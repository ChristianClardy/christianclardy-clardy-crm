import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import {
  Users, ShieldCheck, Plus, Edit2, Trash2, Search,
  Save, Check, X, CalendarDays, Copy, CheckCheck,
  Building2, UserPlus, Mail, Phone, Loader2, Palette, Moon, Sun,
  FileSignature, Link as LinkIcon,
} from "lucide-react";
import { useTheme } from "@/lib/ThemeContext";
import { COLOR_SCHEMES } from "@/lib/colorSchemes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import CompanyManager from "@/components/company/CompanyManager";
import OrganizationTab from "@/components/settings/OrganizationTab";
import { useAuth } from "@/lib/AuthContext";

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES = [
  { key: "admin",           label: "Admin",           color: "bg-rose-100 text-rose-700" },
  { key: "project_manager", label: "Project Manager", color: "bg-violet-100 text-violet-700" },
  { key: "office",          label: "Office",          color: "bg-blue-100 text-blue-700" },
  { key: "foreman",         label: "Foreman",         color: "bg-amber-100 text-amber-700" },
  { key: "laborer",         label: "Laborer",         color: "bg-slate-100 text-slate-600" },
  { key: "other",           label: "Other",           color: "bg-slate-100 text-slate-500" },
];

const MODULES = [
  { key: "dashboard",       label: "Dashboard",        description: "View company KPIs and overview" },
  { key: "sales_dashboard", label: "Sales Dashboard",  description: "View sales pipeline metrics" },
  { key: "crm",             label: "CRM",              description: "Contacts, leads, and prospects" },
  { key: "projects",        label: "Projects",         description: "Create and manage projects" },
  { key: "estimates",       label: "Estimates",        description: "Build and send estimates" },
  { key: "payments",        label: "Payments",         description: "Invoices, draws, and payments" },
  { key: "documents",       label: "Documents",        description: "Upload and manage files" },
  { key: "calendar",        label: "Calendar",         description: "Scheduling and events" },
  { key: "reports",         label: "Reports & WIP",    description: "Financial and operational reports" },
  { key: "subcontractors",  label: "Subcontractors",   description: "Manage subcontractor contacts" },
  { key: "municipalities",  label: "Municipalities",   description: "Permit portal credentials" },
  { key: "settings",        label: "Team & Settings",  description: "Manage users and permissions" },
];

const DEFAULT_PERMISSIONS = {
  admin:           { dashboard: true,  sales_dashboard: true,  crm: true,  projects: true,  estimates: true,  payments: true,  documents: true,  calendar: true,  reports: true,  subcontractors: true,  municipalities: true,  settings: true  },
  project_manager: { dashboard: true,  sales_dashboard: true,  crm: true,  projects: true,  estimates: true,  payments: true,  documents: true,  calendar: true,  reports: true,  subcontractors: true,  municipalities: true,  settings: false },
  office:          { dashboard: true,  sales_dashboard: true,  crm: true,  projects: false, estimates: true,  payments: true,  documents: true,  calendar: true,  reports: true,  subcontractors: false, municipalities: false, settings: false },
  foreman:         { dashboard: true,  sales_dashboard: false, crm: false, projects: true,  estimates: false, payments: false, documents: true,  calendar: true,  reports: false, subcontractors: false, municipalities: false, settings: false },
  laborer:         { dashboard: false, sales_dashboard: false, crm: false, projects: true,  estimates: false, payments: false, documents: false, calendar: false, reports: false, subcontractors: false, municipalities: false, settings: false },
  other:           { dashboard: true,  sales_dashboard: false, crm: false, projects: false, estimates: false, payments: false, documents: false, calendar: false, reports: false, subcontractors: false, municipalities: false, settings: false },
};

const EMPTY_EMPLOYEE = {
  full_name: "", email: "", phone: "", role: "other",
  department: "", status: "active", notes: "",
};

// ─── Role badge ──────────────────────────────────────────────────────────────

function RoleBadge({ roleKey }) {
  const role = ROLES.find(r => r.key === roleKey) || ROLES[ROLES.length - 1];
  return <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", role.color)}>{role.label}</span>;
}

// ─── Team Members tab ────────────────────────────────────────────────────────

function TeamTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY_EMPLOYEE);
  const [dupError, setDupError]   = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const data = await base44.entities.Employee.list("-created_date");
    setEmployees(data);
    setLoading(false);
  };

  const openNew  = () => { setEditing(null); setForm(EMPTY_EMPLOYEE); setDupError(""); setDialogOpen(true); };
  const openEdit = (emp) => {
    setDupError("");
    setEditing(emp);
    setForm({
      full_name:  emp.full_name  || "",
      email:      emp.email      || "",
      phone:      emp.phone      || "",
      role:       emp.role       || "other",
      department: emp.department || "",
      status:     emp.status     || "active",
      notes:      emp.notes      || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setDupError("");
    const normName  = form.full_name.trim().toLowerCase();
    const normEmail = form.email?.trim().toLowerCase();
    const dup = employees.find((emp) =>
      emp.id !== editing?.id && (
        emp.full_name.trim().toLowerCase() === normName ||
        (normEmail && emp.email?.trim().toLowerCase() === normEmail)
      )
    );
    if (dup) {
      setDupError(dup.full_name.trim().toLowerCase() === normName
        ? `A team member named "${dup.full_name}" already exists.`
        : `A team member with email "${dup.email}" already exists.`);
      return;
    }
    if (editing) await base44.entities.Employee.update(editing.id, form);
    else         await base44.entities.Employee.create(form);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Remove this team member?")) { await base44.entities.Employee.delete(id); load(); }
  };

  const filtered = employees.filter(emp =>
    (emp.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (emp.email     || "").toLowerCase().includes(search.toLowerCase()) ||
    (emp.role      || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…" className="pl-9 h-9 text-sm" />
        </div>
        <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500">
          <Plus className="w-4 h-4 mr-1" /> Add Member
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No team members yet. Add your first one.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Department</th>
                <th className="px-5 py-3 text-left">Contact</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-amber-600">{(emp.full_name || "?")[0].toUpperCase()}</span>
                      </div>
                      <span className="font-medium text-slate-900">{emp.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3"><RoleBadge roleKey={emp.role} /></td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{emp.department || "—"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {emp.email && <p>{emp.email}</p>}
                    {emp.phone && <p>{emp.phone}</p>}
                    {!emp.email && !emp.phone && "—"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                      emp.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {emp.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(emp)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(emp.id)} className="p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Team Member" : "Add Team Member"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div><Label className="text-xs">Full Name *</Label>
              <Input value={form.full_name} onChange={e => { setDupError(""); setForm(f => ({ ...f, full_name: e.target.value })); }} required className="mt-1 h-9 text-sm" />
              {dupError && !dupError.includes("email") && <p className="text-xs text-rose-600 mt-1">{dupError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => { setDupError(""); setForm(f => ({ ...f, email: e.target.value })); }} className="mt-1 h-9 text-sm" />
                {dupError && dupError.includes("email") && <p className="text-xs text-rose-600 mt-1">{dupError}</p>}
              </div>
              <div><Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1 h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Role</Label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                  {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Status</Label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div><Label className="text-xs">Department</Label>
              <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="e.g. Field, Office, Sales" /></div>
            <div><Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 text-sm" rows={2} /></div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500">
                {editing ? "Update" : "Add"} Member
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Permissions tab ─────────────────────────────────────────────────────────

function PermissionsTab() {
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_profiles').select('id, settings').limit(1).single();
      if (data?.settings?.role_permissions) {
        const merged = {};
        for (const role of ROLES) {
          merged[role.key] = { ...DEFAULT_PERMISSIONS[role.key], ...data.settings.role_permissions[role.key] };
        }
        setPermissions(merged);
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (roleKey, moduleKey) => {
    if (roleKey === "admin") return;
    setPermissions(prev => ({
      ...prev,
      [roleKey]: { ...prev[roleKey], [moduleKey]: !prev[roleKey][moduleKey] },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { data } = await supabase.from('company_profiles').select('id, settings').limit(1).single();
    if (data) {
      await supabase.from('company_profiles').update({
        settings: { ...(data.settings || {}), role_permissions: permissions },
      }).eq('id', data.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Check which modules each role can access. <span className="font-medium text-slate-700">Admin</span> always has full access.
        </p>
        <Button onClick={handleSave} disabled={saving} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 min-w-[110px]">
          {saved ? <><Check className="w-4 h-4 mr-1" /> Saved</> : saving ? "Saving…" : <><Save className="w-4 h-4 mr-1" /> Save Changes</>}
        </Button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-52">Module</th>
                {ROLES.map(role => (
                  <th key={role.key} className="px-4 py-3 text-center min-w-[110px]">
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", role.color)}>{role.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, i) => (
                <tr key={mod.key} className={cn("border-b border-slate-100", i % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 text-sm">{mod.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{mod.description}</p>
                  </td>
                  {ROLES.map(role => {
                    const allowed = permissions[role.key]?.[mod.key] ?? false;
                    const isAdmin = role.key === "admin";
                    return (
                      <td key={role.key} className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggle(role.key, mod.key)}
                          disabled={isAdmin}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center mx-auto transition-all",
                            isAdmin ? "bg-rose-500 border-rose-500 cursor-default"
                              : allowed ? "bg-amber-500 border-amber-500 hover:bg-amber-600 cursor-pointer"
                              : "bg-white border-slate-300 hover:border-amber-400 cursor-pointer"
                          )}
                        >
                          {(isAdmin || allowed) && <Check className="w-3 h-3 text-white" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        These permissions control UI visibility. Supabase Row Level Security provides additional server-side enforcement.
      </p>
    </div>
  );
}

// ─── Invite & Logins tab ─────────────────────────────────────────────────────

function InviteTab() {
  const [inviteEmail, setInviteEmail]               = useState("");
  const [inviteFullName, setInviteFullName]         = useState("");
  const [inviteRole, setInviteRole]                 = useState("user");
  const [inviteEmployeeRole, setInviteEmployeeRole] = useState("laborer");
  const [createEmployee, setCreateEmployee]         = useState(true);
  const [inviting, setInviting]                     = useState(false);
  const [success, setSuccess]                       = useState(false);
  const [error, setError]                           = useState("");

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, full_name: inviteFullName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invite failed.");
      if (createEmployee) {
        const existing = await base44.entities.Employee.filter({ email: inviteEmail });
        if (existing.length === 0) {
          await base44.entities.Employee.create({
            full_name: inviteFullName || inviteEmail.split("@")[0],
            email: inviteEmail,
            role: inviteEmployeeRole,
            status: "active",
          });
        }
      }
      setSuccess(true);
      setInviteEmail("");
      setInviteFullName("");
    } catch (err) {
      setError(err.message || "Invite could not be sent.");
    }
    setInviting(false);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Invite to App</p>
            <p className="text-xs text-slate-500">Send a login invitation by email</p>
          </div>
        </div>
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Full Name</Label>
            <Input value={inviteFullName} onChange={e => setInviteFullName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Email Address</Label>
            <Input type="email" required value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); setSuccess(false); setError(""); }} placeholder="colleague@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">App Role</Label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Employee Role</Label>
              <select value={inviteEmployeeRole} onChange={e => setInviteEmployeeRole(e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={createEmployee} onChange={e => setCreateEmployee(e.target.checked)} />
            Also add as employee
          </label>
          {success && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
              <Check className="w-4 h-4" /> Invitation sent!
            </div>
          )}
          {error && (
            <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}
          <Button type="submit" disabled={inviting} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
            {inviting ? "Sending…" : "Send Invitation"}
          </Button>
        </form>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">Tip</p>
        <p className="text-xs leading-relaxed">
          You can also invite users directly in <strong>Supabase → Authentication → Users → Invite User</strong>. After they sign in, add them as an employee here to assign them to projects.
        </p>
      </div>
    </div>
  );
}

// ─── Calendar Feed tab ───────────────────────────────────────────────────────

function CalendarFeedTab() {
  const [userId, setUserId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const feedUrl = `${typeof window !== "undefined" ? window.location.origin : "https://clardy.io"}/api/calendar`;

  const copy = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Apple / Google Calendar Feed</h2>
        <p className="text-sm text-slate-500 mt-1">
          Subscribe to this URL in any calendar app to see all Clardy.io events automatically sync.
        </p>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
        <code className="text-xs text-slate-700 flex-1 break-all">{feedUrl}</code>
        <button
          onClick={copy}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          {copied ? <><CheckCheck className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-sm text-amber-800">
        <p className="font-semibold">How to subscribe in Apple Calendar (Mac):</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Copy the URL above</li>
          <li>Open <strong>Calendar → File → New Calendar Subscription</strong></li>
          <li>Paste the URL and click Subscribe</li>
          <li>Set <strong>Auto-refresh: Every 5 minutes</strong></li>
          <li>Click OK</li>
        </ol>
        <p className="text-xs mt-2">On iPhone: <strong>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</strong></p>
      </div>
    </div>
  );
}

// ─── Appearance tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, toggleTheme, colorScheme, setColorScheme } = useTheme();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Dark / Light mode */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Mode</h2>
        <div className="flex gap-3">
          {[
            { id: "light", label: "Light", icon: Sun },
            { id: "dark",  label: "Dark",  icon: Moon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { if (theme !== id) toggleTheme(); }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-4 text-sm font-medium transition-all",
                theme === id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Color scheme */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Color Scheme</h2>
        <p className="text-sm text-slate-500 mb-5">Applies to buttons, badges, calendar accents, and sidebar highlights across the entire app.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => setColorScheme(scheme.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                colorScheme === scheme.id
                  ? "border-slate-900 bg-slate-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-400"
              )}
            >
              <div className="flex shrink-0 gap-1">
                {scheme.swatches.map((color, i) => (
                  <span key={i} className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{scheme.label}</p>
                <p className="truncate text-xs text-slate-500">{scheme.description}</p>
              </div>
              {colorScheme === scheme.id && <Check className="ml-auto h-4 w-4 shrink-0 text-slate-900" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DocuSign tab (admin only) ────────────────────────────────────────────────

function DocuSignTab() {
  const [docusign, setDocusign]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const CLIENT_ID = import.meta.env.VITE_DOCUSIGN_CLIENT_ID;
  const DS_BASE   = import.meta.env.VITE_DOCUSIGN_ENV === "production"
    ? "https://account.docusign.com"
    : "https://account-d.docusign.com";

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    const { data } = await supabase
      .from("company_profiles")
      .select("id, settings")
      .limit(1)
      .single();
    setDocusign(data?.settings?.docusign || null);
    setLoading(false);
  };

  const handleConnect = () => {
    const redirectUri = encodeURIComponent(`${window.location.origin}/DocuSignCallback`);
    const scope       = encodeURIComponent("signature");
    window.location.href = `${DS_BASE}/oauth/auth?response_type=code&scope=${scope}&client_id=${CLIENT_ID}&redirect_uri=${redirectUri}`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect DocuSign? You will need to reconnect to send documents.")) return;
    setDisconnecting(true);
    const { data } = await supabase
      .from("company_profiles")
      .select("id, settings")
      .limit(1)
      .single();
    if (data) {
      const { docusign: _removed, ...rest } = data.settings || {};
      await supabase.from("company_profiles").update({ settings: rest }).eq("id", data.id);
    }
    setDocusign(null);
    setDisconnecting(false);
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#1A2B3C]">
            <FileSignature className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">DocuSign Integration</p>
            <p className="text-xs text-slate-500">Link your DocuSign account to send documents for signature</p>
          </div>
          {docusign && (
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Connected
            </span>
          )}
        </div>

        {docusign ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
              {[
                { label: "Account",   value: docusign.account_name },
                { label: "User",      value: docusign.user_name },
                { label: "Email",     value: docusign.email },
                { label: "Connected", value: docusign.connected_at ? new Date(docusign.connected_at).toLocaleDateString() : null },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-medium text-slate-900">{value}</span>
                </div>
              ) : null)}
            </div>
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              variant="outline"
              className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              {disconnecting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <X className="w-4 h-4 mr-2" />}
              Disconnect DocuSign
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Connect your DocuSign account to send documents for signature directly from the Documents portal.
            </p>
            {!CLIENT_ID && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Environment Variable Missing</p>
                <p>
                  Add <code className="font-mono bg-amber-100 px-1 rounded">VITE_DOCUSIGN_CLIENT_ID</code> to
                  your <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file before connecting.
                </p>
              </div>
            )}
            <Button
              onClick={handleConnect}
              disabled={!CLIENT_ID}
              className="w-full bg-[#1A2B3C] hover:bg-[#243647] text-white"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              Connect DocuSign Account
            </Button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-2">Setup Instructions</p>
        <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
          <li>Create a DocuSign developer account at <strong>developers.docusign.com</strong></li>
          <li>Create an integration (app) and copy the <strong>Integration Key</strong></li>
          <li>
            Add <strong>{window.location.origin}/DocuSignCallback</strong> as a Redirect URI in your DocuSign app
          </li>
          <li>
            Set <code className="font-mono bg-amber-100 px-1 rounded">VITE_DOCUSIGN_CLIENT_ID</code> = Integration Key in your <code>.env</code>
          </li>
          <li>
            Set <code className="font-mono bg-amber-100 px-1 rounded">DOCUSIGN_CLIENT_ID</code> and{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">DOCUSIGN_CLIENT_SECRET</code> in your Vercel environment variables
          </li>
          <li>For production, set <code className="font-mono bg-amber-100 px-1 rounded">VITE_DOCUSIGN_ENV=production</code></li>
        </ol>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { key: "organization", label: "Organization",        icon: Building2,      adminOnly: false },
  { key: "team",         label: "Team Members",        icon: Users,          adminOnly: false },
  { key: "permissions",  label: "Roles & Permissions", icon: ShieldCheck,    adminOnly: false },
  { key: "companies",    label: "Companies",           icon: Building2,      adminOnly: false },
  { key: "invite",       label: "Invite & Logins",     icon: UserPlus,       adminOnly: false },
  { key: "calendar",     label: "Calendar Feed",       icon: CalendarDays,   adminOnly: false },
  { key: "appearance",   label: "Appearance",          icon: Palette,        adminOnly: false },
  { key: "docusign",     label: "DocuSign",            icon: FileSignature,  adminOnly: false },
];

export default function Settings() {
  const { user }        = useAuth();
  const isAdmin         = user?.role === "admin";
  const [activeTab, setActiveTab] = useState("team");

  const visibleTabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Settings</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your team, companies, roles, and app access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                activeTab === key
                  ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "organization" && <OrganizationTab />}
      {activeTab === "team"        && <TeamTab />}
      {activeTab === "permissions" && <PermissionsTab />}
      {activeTab === "companies"   && <CompanyManager />}
      {activeTab === "invite"      && <InviteTab />}
      {activeTab === "calendar"    && <CalendarFeedTab />}
      {activeTab === "appearance"  && <AppearanceTab />}
      {activeTab === "docusign"    && <DocuSignTab />}
    </div>
  );
}
