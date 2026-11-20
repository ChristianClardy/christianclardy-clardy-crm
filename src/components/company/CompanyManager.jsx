import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Edit2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { TURF_COMPANY_ID } from "@/lib/turf/constants";
import { operationsColumnsReady, saveCompanyOperations } from "@/lib/operations/company";
import CompanyStripePanel, { StripeSetupNote } from "@/components/company/CompanyStripePanel";
import { stripeCall } from "@/lib/stripeInvoicing";

const emptyForm = { name: "", code: "", color: "", notes: "", is_active: true };

export default function CompanyManager() {
  const [companies, setCompanies] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [columnsReady, setColumnsReady] = useState(false);
  const [flagError, setFlagError] = useState("");
  const [stripeStatus, setStripeStatus] = useState(null);
  const [stripeNotice, setStripeNotice] = useState("");

  const loadStripe = () => {
    stripeCall("status").then(setStripeStatus).catch((err) => setStripeNotice(err.message));
  };

  useEffect(() => {
    loadCompanies();
    operationsColumnsReady().then(setColumnsReady).catch(() => setColumnsReady(false));
    loadStripe();
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    if (stripe === "connected") setStripeNotice("Stripe is connected for this company. Invoices are created as drafts until you finalize and send.");
    else if (stripe === "denied") setStripeNotice("Stripe connect was cancelled.");
    else if (stripe === "live_key") setStripeNotice("A live Stripe key was refused. Use the test client id and a test secret key.");
    else if (stripe) setStripeNotice("Stripe connect did not finish. Try Connect Stripe again.");
  }, []);

  const loadCompanies = async () => {
    const data = await base44.entities.CompanyProfile.list("name", 200);
    setCompanies(data);
  };

  const openCreate = () => {
    setEditingCompany(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (company) => {
    setEditingCompany(company);
    setForm({
      name: company.name || "",
      code: company.code || "",
      color: company.color || "",
      notes: company.notes || "",
      is_active: company.is_active !== false,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingCompany) {
      await base44.entities.CompanyProfile.update(editingCompany.id, form);
    } else {
      await base44.entities.CompanyProfile.create(form);
    }
    setDialogOpen(false);
    loadCompanies();
  };

  const handleDelete = async (id) => {
    if (!await confirmAction("Delete this company?")) return;
    await base44.entities.CompanyProfile.delete(id);
    loadCompanies();
  };

  const setOperations = async (company, patch) => {
    setFlagError("");
    const operations_enabled = patch.operations_enabled ?? company.operations_enabled === true;
    const operations_distribution = patch.operations_distribution ?? company.operations_distribution === true;
    try {
      await saveCompanyOperations(company.id, { operations_enabled, operations_distribution });
      await loadCompanies();
    } catch (err) {
      setFlagError(err?.message || "Could not save that switch.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#b5965a] text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Companies</p>
            <p className="text-xs text-slate-500">Manage which company each project belongs to.</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-[#3d3530] text-[#f5f0eb] hover:bg-[#b5965a]">
          <Plus className="mr-2 h-4 w-4" /> Add Company
        </Button>
      </div>

      {!columnsReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The Operations switches save to <span className="font-medium">supabase/migrations/067_company_operations.sql</span>. That file has not been applied. Turf&apos;n Texas still opens Operations from its own company in the sidebar. Nothing is written until the migration is approved and a backup is taken.
        </div>
      )}
      {flagError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{flagError}</div>}
      <StripeSetupNote status={stripeStatus} />
      {stripeNotice && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{stripeNotice}</div>}

      {companies.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">No companies added yet.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {companies.map((company) => (
            <div key={company.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{company.name}</p>
                    {company.code && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{company.code}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{company.is_active === false ? "Inactive" : "Active"}</p>
                  {company.notes && <p className="mt-2 text-sm text-slate-600">{company.notes}</p>}
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <Flag
                      label="Operations"
                      detail="Shows the Operations tab only while this company is selected."
                      checked={company.operations_enabled === true}
                      disabled={!columnsReady}
                      onChange={(value) => setOperations(company, { operations_enabled: value, operations_distribution: value ? company.operations_distribution === true : false })}
                    />
                    {company.id === TURF_COMPANY_ID ? (
                      <p className="text-xs text-slate-500">Distribution on this company reads the existing turf orders and products, including the Midland draft. The section is labeled Distribution.</p>
                    ) : (
                      <Flag
                        label="Distribution"
                        detail="Orders, products, and customers for this company. Off until you turn it on."
                        checked={company.operations_distribution === true}
                        disabled={!columnsReady || company.operations_enabled !== true}
                        onChange={(value) => setOperations(company, { operations_enabled: true, operations_distribution: value })}
                      />
                    )}
                  </div>
                  <CompanyStripePanel
                    company={company}
                    connection={(stripeStatus?.companies || []).find((row) => row.company_id === company.id)}
                    migrationRequired={stripeStatus?.migration_required === true}
                    configured={stripeStatus?.configured}
                    missing={stripeStatus?.missing}
                    onChange={loadStripe}
                  />
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(company)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(company.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit Company" : "Add Company"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className="mt-1.5" required />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))} className="mt-1.5" placeholder="Optional short code" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">{editingCompany ? "Save Changes" : "Add Company"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Flag({ label, detail, checked, disabled, onChange }) {
  return (
    <label className={`flex items-start justify-between gap-3 ${disabled ? "opacity-60" : ""}`}>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-slate-900" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}