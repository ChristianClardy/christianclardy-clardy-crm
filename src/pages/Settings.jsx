import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import {
  Users, ShieldCheck, Plus, Edit2, Trash2, Search,
  Save, Check, X, ChevronDown, CalendarDays, Copy, CheckCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
      const reason = dup.full_name.trim().toLowerCase() === normName
        ? `A team member named "${dup.full_name}" already exists.`
        : `A team member with email "${dup.email}" already exists.`;
      setDupError(reason);
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

      {/* Add / Edit Dialog */}
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
        // Merge saved permissions over defaults so new roles/modules get defaults
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
    if (roleKey === "admin") return; // admin is always full access
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
                          title={isAdmin ? "Admin always has full access" : allowed ? "Click to revoke" : "Click to grant"}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center mx-auto transition-all",
                            isAdmin
                              ? "bg-rose-500 border-rose-500 cursor-default"
                              : allowed
                                ? "bg-amber-500 border-amber-500 hover:bg-amber-600 cursor-pointer"
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

// ─── Calendar Feed tab ───────────────────────────────────────────────────────

function CalendarFeedTab() {
  const [userId, setUserId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const base = typeof window !== "undefined" ? window.location.origin : "https://clardy.io";
  const feedUrl = userId ? `${base}/api/calendar?uid=${userId}` : null;

  const copy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Your Personal Calendar Feed</h2>
        <p className="text-sm text-slate-500 mt-1">
          Subscribe to this URL in Apple Calendar (or any calendar app) to see your events automatically.
          It only shows events assigned to you.
        </p>
      </div>

      {feedUrl ? (
        <>
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
              <li>Open <strong>Calendar</strong> → <strong>File → New Calendar Subscription</strong></li>
              <li>Paste the URL and click Subscribe</li>
              <li>Set <strong>Auto-refresh: Every 5 minutes</strong></li>
              <li>Click OK</li>
            </ol>
            <p className="text-xs mt-2">On iPhone: <strong>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</strong></p>
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-400">Loading your calendar link…</div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "team",        label: "Team Members",       icon: Users },
  { key: "permissions", label: "Roles & Permissions", icon: ShieldCheck },
  { key: "calendar",    label: "Calendar Feed",       icon: CalendarDays },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("team");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Settings</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Team & Permissions</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your team members and control what each role can access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ key, label, icon: Icon }) => (
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

      {activeTab === "team"        && <TeamTab />}
      {activeTab === "permissions" && <PermissionsTab />}
      {activeTab === "calendar"    && <CalendarFeedTab />}
    </div>
  );
}
