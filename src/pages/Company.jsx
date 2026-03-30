import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Users, UserPlus, Building2, Mail, Phone, Briefcase,
  Loader2, Trash2, Edit2, Check, X, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import CompanyManager from "@/components/company/CompanyManager";

const ROLE_LABELS = {
  admin: { label: "Admin", color: "bg-purple-100 text-purple-700" },
  project_manager: { label: "Project Manager", color: "bg-blue-100 text-blue-700" },
  foreman: { label: "Foreman", color: "bg-amber-100 text-amber-700" },
  laborer: { label: "Laborer", color: "bg-slate-100 text-slate-600" },
  office: { label: "Office", color: "bg-emerald-100 text-emerald-700" },
  other: { label: "Other", color: "bg-rose-100 text-rose-700" },
};

const TABS = [
  { key: "employees", label: "Employees", icon: Users },
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "invite", label: "Invite & Logins", icon: UserPlus },
];

const EMPTY_FORM = {
  full_name: "", email: "", role: "laborer", phone: "", department: "", status: "active", notes: ""
};

export default function Company() {
  const [activeTab, setActiveTab] = useState("employees");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Invite tab state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteEmployeeRole, setInviteEmployeeRole] = useState("laborer");
  const [inviteFullName, setInviteFullName] = useState("");
  const [createEmployeeOnInvite, setCreateEmployeeOnInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    const data = await base44.entities.Employee.list("-created_date");
    setEmployees(data);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEdit = (emp) => {
    setEditingEmployee(emp);
    setForm({
      full_name: emp.full_name || "",
      email: emp.email || "",
      role: emp.role || "laborer",
      phone: emp.phone || "",
      department: emp.department || "",
      status: emp.status || "active",
      notes: emp.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (editingEmployee) {
      await base44.entities.Employee.update(editingEmployee.id, form);
    } else {
      await base44.entities.Employee.create(form);
    }
    setSaving(false);
    setIsDialogOpen(false);
    loadEmployees();
  };

  const handleDelete = async (id) => {
    if (confirm("Remove this employee?")) {
      await base44.entities.Employee.delete(id);
      loadEmployees();
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setInviteError("");
    setInviteSuccess(false);
    await base44.users.inviteUser(inviteEmail, inviteRole);
    if (createEmployeeOnInvite) {
      const existing = await base44.entities.Employee.filter({ email: inviteEmail });
      if (existing.length === 0) {
        await base44.entities.Employee.create({
          full_name: inviteFullName || inviteEmail.split("@")[0],
          email: inviteEmail,
          role: inviteEmployeeRole,
          status: "active",
        });
        loadEmployees();
      }
    }
    setInviteSuccess(true);
    setInviteEmail("");
    setInviteFullName("");
    setInviting(false);
  };

  const activeEmployees = employees.filter(e => e.status === "active");
  const inactiveEmployees = employees.filter(e => e.status === "inactive");

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8" style={{ backgroundColor: "#f5f0eb", minHeight: "100vh" }}>
      {/* Header */}
      <div>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.18em" }}>Management</p>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Company</h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-px w-8" style={{ backgroundColor: "#b5965a" }} />
          <p className="text-sm" style={{ color: "#7a6e66" }}>Manage your team and app access.</p>
        </div>
      </div>

      <div className="h-px" style={{ backgroundColor: "#ddd5c8" }} />

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === key ? "text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
            style={activeTab === key ? { backgroundColor: "#f5f0eb" } : {}}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Employees Tab */}
      {activeTab === "employees" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#b5965a" }}>
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold" style={{ color: "#3d3530" }}>{employees.length} Team Members</p>
                <p className="text-xs" style={{ color: "#7a6e66" }}>{activeEmployees.length} active</p>
              </div>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#b5965a"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "#3d3530"}
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#b5965a" }} />
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
              <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700">No employees yet</p>
              <p className="text-sm text-slate-400 mt-1">Add team members to assign them to project tasks.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[{ label: "Active", list: activeEmployees }, { label: "Inactive", list: inactiveEmployees }].map(({ label, list }) =>
                list.length > 0 ? (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#7a6e66" }}>{label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {list.map(emp => {
                        const roleInfo = ROLE_LABELS[emp.role] || ROLE_LABELS.other;
                        return (
                          <div key={emp.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-3 group hover:shadow-sm transition-shadow">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ backgroundColor: "#b5965a" }}>
                                {emp.full_name?.charAt(0)?.toUpperCase() || "?"}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 text-sm">{emp.full_name}</p>
                                <p className="text-xs text-slate-500">{emp.email}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", roleInfo.color)}>{roleInfo.label}</span>
                                  {emp.department && <span className="text-xs text-slate-400">{emp.department}</span>}
                                  {emp.phone && (
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                      <Phone className="w-3 h-3" />{emp.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(emp.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "companies" && <CompanyManager />}

      {/* Invite & Logins Tab */}
      {activeTab === "invite" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#b5965a" }}>
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
                <Input
                  value={inviteFullName}
                  onChange={e => setInviteFullName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Email Address</Label>
                <Input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteSuccess(false); setInviteError(""); }}
                  placeholder="colleague@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">App Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Employee Role</Label>
                  <Select value={inviteEmployeeRole} onValueChange={setInviteEmployeeRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={createEmployeeOnInvite}
                  onChange={(e) => setCreateEmployeeOnInvite(e.target.checked)}
                />
                Also create as employee now
              </label>
              {inviteSuccess && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
                  <Check className="w-4 h-4" /> Invitation sent successfully!
                </div>
              )}
              {inviteError && (
                <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
                  <X className="w-4 h-4" /> {inviteError}
                </div>
              )}
              <button
                type="submit"
                disabled={inviting}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
                onMouseEnter={e => { if (!inviting) e.currentTarget.style.backgroundColor = "#b5965a"; }}
                onMouseLeave={e => { if (!inviting) e.currentTarget.style.backgroundColor = "#3d3530"; }}
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {inviting ? "Sending..." : "Send Invitation"}
              </button>
            </form>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-lg">
            <p className="text-sm font-semibold text-amber-800 mb-1">About App Logins</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Inviting someone gives them a login to this app. <strong>User</strong> role grants standard access to view and edit projects. <strong>Admin</strong> role grants full access including settings and user management. Invites are separate from the Employee directory above.
            </p>
          </div>
        </div>
      )}

      {/* Add/Edit Employee Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="mt-1.5" placeholder="e.g. Field Ops" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1.5" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editingEmployee ? "Save Changes" : "Add Employee"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}