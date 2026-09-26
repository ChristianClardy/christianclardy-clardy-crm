import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import {
  Plus, Search, Mail, Phone, MapPin, MoreHorizontal, Wrench, ShieldCheck,
  AlertTriangle, Smartphone, FileText, Upload, Loader2, Check, X, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import moment from "moment";
import SubAccessDialog from "@/components/builder/SubAccessDialog";
import { goToSettingsTab } from "@/lib/settingsNav";

// Subcontractor directory: contact info, compliance paperwork (insurance,
// license, W-9, pool barrier policy), pay terms, and Subcontractor Portal access.
// Columns match the live `subcontractors` table (trade, insurance_exp, plus
// 038_subcontractor_details.sql); until 038 is applied, base44Client drops the
// new columns on save so the basics still work.

export const TRADE_LABELS = {
  general: "General",
  pool: "Pool / Spa",
  plaster: "Pool Plaster / Finish",
  fencing: "Fencing / Barriers",
  concrete: "Concrete",
  decking: "Decking",
  pavers: "Pavers / Hardscape",
  masonry: "Masonry / Stone",
  excavation: "Excavation",
  electrical: "Electrical",
  plumbing: "Plumbing",
  gas: "Gas",
  landscaping: "Landscaping",
  irrigation: "Irrigation",
  carpentry: "Carpentry / Framing",
  roofing: "Roofing",
  painting: "Painting",
  tile: "Tile",
  other: "Other",
};

const STATUS = {
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  preferred: { label: "Preferred", cls: "bg-amber-100 text-amber-700" },
  inactive: { label: "Inactive", cls: "bg-slate-100 text-slate-500" },
};

const EMPTY_FORM = {
  name: "", contact_person: "", email: "", phone: "", address: "",
  trade: "general", status: "active",
  license_number: "", license_exp: "", insurance_exp: "", workers_comp_exp: "",
  coi_url: "", w9_on_file: false,
  hourly_rate: "", payment_terms: "", notes: "",
};

const SOON_DAYS = 30;

// "ok" | "soon" | "expired" | "missing" for an expiration date.
function dateState(date) {
  if (!date) return "missing";
  const d = moment(date);
  if (d.isBefore(moment(), "day")) return "expired";
  if (d.isBefore(moment().add(SOON_DAYS, "days"))) return "soon";
  return "ok";
}

// Everything that makes a sub not ready to be on a job, worst first.
function complianceIssues(sub, signed) {
  const issues = [];
  const gl = dateState(sub.insurance_exp);
  const wc = dateState(sub.workers_comp_exp);
  const lic = dateState(sub.license_exp);
  if (gl === "expired") issues.push({ level: "bad", text: "Liability insurance expired" });
  else if (gl === "missing") issues.push({ level: "bad", text: "No liability insurance date" });
  else if (gl === "soon") issues.push({ level: "warn", text: `Liability insurance expires ${moment(sub.insurance_exp).format("MMM D")}` });
  if (wc === "expired") issues.push({ level: "bad", text: "Workers' comp expired" });
  else if (wc === "soon") issues.push({ level: "warn", text: `Workers' comp expires ${moment(sub.workers_comp_exp).format("MMM D")}` });
  if (lic === "expired") issues.push({ level: "bad", text: "License expired" });
  else if (lic === "soon") issues.push({ level: "warn", text: `License expires ${moment(sub.license_exp).format("MMM D")}` });
  if (!signed) issues.push({ level: "bad", text: "Barrier policy not signed" });
  if (!sub.w9_on_file) issues.push({ level: "warn", text: "No W-9 on file" });
  return issues;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "insurance", label: "Insurance expiring / expired" },
  { key: "unsigned", label: "Barrier policy unsigned" },
  { key: "nologin", label: "No app login" },
];

export default function SubcontractorsTab() {
  const [subs, setSubs] = useState([]);
  const [acks, setAcks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [portalUsers, setPortalUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [trade, setTrade] = useState("all");
  const [filter, setFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState(null); // null | "new" | sub
  const [accessSub, setAccessSub] = useState(null);

  const load = async () => {
    const [s, a, pu, ackRes] = await Promise.all([
      base44.entities.Subcontractor.list("name", 1000).catch(() => []),
      base44.entities.ProjectSubcontractor.list().catch(() => []),
      base44.entities.SubcontractorPortalUser.list("email").catch(() => []),
      // Straight from Supabase so the sidebar company filter doesn't hide
      // acknowledgments: subs are shared across companies.
      supabase.from("subcontractor_barrier_acknowledgments").select("subcontractor_id, signed_date"),
    ]);
    setSubs(s);
    setAssignments(a);
    setPortalUsers(pu);
    setAcks(ackRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const signedBySub = useMemo(() => {
    const m = {};
    for (const a of acks) {
      if (a.subcontractor_id && (!m[a.subcontractor_id] || (a.signed_date || "") > m[a.subcontractor_id])) m[a.subcontractor_id] = a.signed_date || "on file";
    }
    return m;
  }, [acks]);

  const rows = useMemo(() => subs.map((s) => ({
    sub: s,
    issues: complianceIssues(s, signedBySub[s.id]),
    jobs: assignments.filter((a) => a.subcontractor_id === s.id).length,
    logins: portalUsers.filter((u) => u.subcontractor_id === s.id && u.active).length,
  })), [subs, signedBySub, assignments, portalUsers]);

  const active = rows.filter((r) => r.sub.status !== "inactive");
  const counts = {
    all: active.length,
    attention: active.filter((r) => r.issues.some((i) => i.level === "bad")).length,
    insurance: active.filter((r) => ["expired", "soon", "missing"].includes(dateState(r.sub.insurance_exp)) || ["expired", "soon"].includes(dateState(r.sub.workers_comp_exp))).length,
    unsigned: active.filter((r) => !signedBySub[r.sub.id]).length,
    nologin: active.filter((r) => r.logins === 0).length,
  };

  const visible = rows.filter(({ sub, issues, logins }) => {
    if (!showInactive && sub.status === "inactive") return false;
    if (trade !== "all" && (sub.trade || "other") !== trade) return false;
    const q = search.trim().toLowerCase();
    if (q && ![sub.name, sub.contact_person, sub.email, sub.phone].some((v) => v?.toLowerCase().includes(q))) return false;
    if (filter === "attention") return issues.some((i) => i.level === "bad");
    if (filter === "insurance") return ["expired", "soon", "missing"].includes(dateState(sub.insurance_exp)) || ["expired", "soon"].includes(dateState(sub.workers_comp_exp));
    if (filter === "unsigned") return !signedBySub[sub.id];
    if (filter === "nologin") return logins === 0;
    return true;
  });

  const tradesInUse = [...new Set(subs.map((s) => s.trade || "other"))].sort();

  const setStatus = async (sub, status) => {
    await base44.entities.Subcontractor.update(sub.id, { status });
    load();
  };

  const remove = async ({ sub, jobs, logins }) => {
    const extra = [
      jobs ? `${jobs} job assignment${jobs !== 1 ? "s" : ""}` : null,
      logins ? `${logins} app login${logins !== 1 ? "s" : ""} (they'll lose access)` : null,
    ].filter(Boolean).join(" and ");
    const msg = `Delete ${sub.name}?${extra ? `\n\nThis also removes ${extra} and their signed barrier acknowledgments.` : ""}\n\nTo keep the history, choose "Mark inactive" instead.`;
    if (!confirm(msg)) return;
    await base44.entities.Subcontractor.delete(sub.id);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Subcontractors</h2>
          <p className="text-sm text-slate-500">Contacts, insurance and paperwork, and Subcontractor Portal access for every sub.</p>
        </div>
        <Button onClick={() => setEditing("new")} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <Plus className="w-4 h-4 mr-1.5" /> Add subcontractor
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              key !== "all" && counts[key] > 0 && filter !== key && "border-amber-300 text-amber-800"
            )}
          >
            {label} <span className="opacity-70">({counts[key]})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact, phone…" className="pl-9 h-9 text-sm" />
        </div>
        <select value={trade} onChange={(e) => setTrade(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
          <option value="all">All trades</option>
          {tradesInUse.map((t) => <option key={t} value={t}>{TRADE_LABELS[t] || t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:ml-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {subs.length === 0 ? "No subcontractors yet. Add your first one." : "No subcontractors match these filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {visible.map((row) => (
            <SubRow
              key={row.sub.id}
              row={row}
              signed={signedBySub[row.sub.id]}
              onEdit={() => setEditing(row.sub)}
              onAccess={() => setAccessSub(row.sub)}
              onStatus={(status) => setStatus(row.sub, status)}
              onDelete={() => remove(row)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SubFormDialog
          sub={editing === "new" ? null : editing}
          allSubs={subs}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {accessSub && (
        <SubAccessDialog
          sub={accessSub}
          onOpenChange={(open) => { if (!open) { setAccessSub(null); load(); } }}
          assignments={assignments}
          portalUsers={portalUsers}
          onPortalUsersChange={setPortalUsers}
        />
      )}
    </div>
  );
}

function SubRow({ row, signed, onEdit, onAccess, onStatus, onDelete }) {
  const { sub, issues, jobs, logins } = row;
  const status = STATUS[sub.status] || STATUS.active;
  const bad = issues.filter((i) => i.level === "bad");
  const warn = issues.filter((i) => i.level === "warn");

  return (
    <div className={cn("flex flex-col lg:flex-row lg:items-center gap-3 px-4 py-3", sub.status === "inactive" && "opacity-60")}>
      <button onClick={onEdit} className="flex items-center gap-3 min-w-0 lg:w-72 text-left">
        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
          <Wrench className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate hover:underline">{sub.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {TRADE_LABELS[sub.trade] || sub.trade || "Other"}{sub.contact_person ? ` · ${sub.contact_person}` : ""}
          </p>
        </div>
      </button>

      <div className="flex flex-col gap-0.5 text-xs text-slate-500 lg:w-56 min-w-0">
        {sub.phone && <a href={`tel:${sub.phone}`} className="flex items-center gap-1.5 hover:text-slate-800"><Phone className="w-3.5 h-3.5" />{sub.phone}</a>}
        {sub.email && <a href={`mailto:${sub.email}`} className="flex items-center gap-1.5 hover:text-slate-800 truncate"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{sub.email}</span></a>}
        {!sub.phone && !sub.email && <span className="text-amber-700">No phone or email</span>}
      </div>

      <div className="flex-1 flex flex-wrap gap-1.5">
        {bad.length === 0 && warn.length === 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><ShieldCheck className="w-3 h-3" /> Compliant</span>
        )}
        {bad.map((i) => (
          <span key={i.text} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"><AlertTriangle className="w-3 h-3" />{i.text}</span>
        ))}
        {warn.map((i) => (
          <span key={i.text} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{i.text}</span>
        ))}
        {signed && signed !== "on file" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500">Barrier policy signed {moment(signed).format("M/D/YY")}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", status.cls)}>{status.label}</span>
        <Button size="sm" variant="outline" onClick={onAccess} title="App logins and text / email invites">
          <Smartphone className="w-4 h-4 mr-1" />
          {logins ? `${logins} login${logins !== 1 ? "s" : ""}` : "Invite"}
          <span className="ml-1 text-slate-400">· {jobs} job{jobs !== 1 ? "s" : ""}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit details</DropdownMenuItem>
            <DropdownMenuItem onClick={onAccess}>App access & invites</DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettingsTab("jobAssignments", { sub: sub.id })}>
              <Briefcase className="w-4 h-4 mr-2" /> Assign jobs
            </DropdownMenuItem>
            {sub.coi_url && (
              <DropdownMenuItem onClick={() => window.open(sub.coi_url, "_blank", "noopener")}>
                <FileText className="w-4 h-4 mr-2" /> View insurance certificate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {sub.status !== "preferred" && <DropdownMenuItem onClick={() => onStatus("preferred")}>Mark preferred</DropdownMenuItem>}
            {sub.status !== "active" && <DropdownMenuItem onClick={() => onStatus("active")}>Mark active</DropdownMenuItem>}
            {sub.status !== "inactive" && <DropdownMenuItem onClick={() => onStatus("inactive")}>Mark inactive</DropdownMenuItem>}
            <DropdownMenuItem onClick={onDelete} className="text-rose-600">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={className}>
      <Label className="text-xs text-slate-600">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DateField({ label, value, onChange }) {
  const state = value ? dateState(value) : null;
  return (
    <Field label={label}>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
      {state === "expired" && <p className="text-xs text-rose-600 mt-1">Expired</p>}
      {state === "soon" && <p className="text-xs text-amber-700 mt-1">Expires within {SOON_DAYS} days</p>}
    </Field>
  );
}

function SubFormDialog({ sub, allSubs, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (!sub) return EMPTY_FORM;
    const f = { ...EMPTY_FORM };
    for (const k of Object.keys(EMPTY_FORM)) if (sub[k] !== null && sub[k] !== undefined) f[k] = sub[k];
    f.trade = sub.trade || "other";
    f.hourly_rate = sub.hourly_rate ?? "";
    return f;
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (k) => (v) => { setError(""); setForm((f) => ({ ...f, [k]: v })); };
  const bind = (k) => ({ value: form[k] ?? "", onChange: (e) => set(k)(e.target.value) });

  const uploadCoi = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("coi_url")(file_url);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim().toLowerCase();
    const email = form.email.trim().toLowerCase();
    const dup = allSubs.find((s) => s.id !== sub?.id && (s.name?.trim().toLowerCase() === name || (email && s.email?.trim().toLowerCase() === email)));
    if (dup) {
      setError(dup.name?.trim().toLowerCase() === name ? `"${dup.name}" already exists.` : `${dup.name} already uses ${dup.email}.`);
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        hourly_rate: form.hourly_rate === "" ? null : Number(form.hourly_rate),
      };
      if (sub) await base44.entities.Subcontractor.update(sub.id, data);
      else await base44.entities.Subcontractor.create(data);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save.");
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub ? `Edit ${sub.name}` : "Add subcontractor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6">
          <Section title="Company">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company name *" className="sm:col-span-2">
                <Input required {...bind("name")} className="h-9 text-sm" />
              </Field>
              <Field label="Trade">
                <select {...bind("trade")} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                  {Object.entries(TRADE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  {form.trade && !TRADE_LABELS[form.trade] && <option value={form.trade}>{form.trade}</option>}
                </select>
              </Field>
              <Field label="Status">
                <select {...bind("status")} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                  <option value="active">Active</option>
                  <option value="preferred">Preferred</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Main contact" hint="The mobile number is what text invites to the Subcontractor Portal go to.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Contact person"><Input {...bind("contact_person")} className="h-9 text-sm" /></Field>
              <Field label="Mobile phone"><Input type="tel" {...bind("phone")} placeholder="(555) 555-5555" className="h-9 text-sm" /></Field>
              <Field label="Email"><Input type="email" {...bind("email")} className="h-9 text-sm" /></Field>
              <Field label="Address">
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input {...bind("address")} className="h-9 text-sm pl-8" />
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Insurance & compliance" hint={`Anything expired or expiring within ${SOON_DAYS} days is flagged on the list.`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <DateField label="General liability expires" value={form.insurance_exp || ""} onChange={set("insurance_exp")} />
              <DateField label="Workers' comp expires" value={form.workers_comp_exp || ""} onChange={set("workers_comp_exp")} />
              <DateField label="License expires" value={form.license_exp || ""} onChange={set("license_exp")} />
              <Field label="License number"><Input {...bind("license_number")} className="h-9 text-sm" /></Field>
              <Field label="Certificate of insurance" className="sm:col-span-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {form.coi_url ? (
                    <>
                      <a href={form.coi_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-amber-700 hover:underline">
                        <FileText className="w-4 h-4" /> View certificate
                      </a>
                      <button type="button" onClick={() => set("coi_url")("")} className="text-xs text-slate-500 hover:text-rose-600 inline-flex items-center gap-0.5">
                        <X className="w-3 h-3" /> Remove
                      </button>
                    </>
                  ) : (
                    <label className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 h-9 text-sm text-slate-600 cursor-pointer hover:border-amber-400">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? "Uploading…" : "Upload PDF or photo"}
                      <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => uploadCoi(e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              </Field>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={!!form.w9_on_file} onChange={(e) => set("w9_on_file")(e.target.checked)} />
              <span>
                W-9 received
                <span className="block text-xs text-slate-500">Keep the W-9 itself in your accounting system. It has their tax ID, so it isn't uploaded here.</span>
              </span>
            </label>
            <p className="text-xs text-slate-500">
              The pool barrier policy signature is recorded in Subcontractor Portal → Subcontractor Compliance, or the sub signs it in their app.
            </p>
          </Section>

          <Section title="Pay">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Hourly rate ($)"><Input type="number" min="0" step="0.01" {...bind("hourly_rate")} className="h-9 text-sm" /></Field>
              <Field label="Payment terms"><Input {...bind("payment_terms")} placeholder="e.g. Net 30, per draw" className="h-9 text-sm" /></Field>
            </div>
          </Section>

          <Section title="Notes">
            <Textarea rows={3} {...bind("notes")} className="text-sm" />
          </Section>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || uploading} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              {sub ? "Save changes" : "Add subcontractor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
