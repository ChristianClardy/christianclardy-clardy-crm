import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Edit2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const emptyForm = { name: "", code: "", color: "", notes: "", is_active: true };

export default function CompanyManager() {
  const [companies, setCompanies] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadCompanies();
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
    if (!confirm("Delete this company?")) return;
    await base44.entities.CompanyProfile.delete(id);
    loadCompanies();
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

      {companies.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">No companies added yet.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {companies.map((company) => (
            <div key={company.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{company.name}</p>
                    {company.code && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{company.code}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{company.is_active === false ? "Inactive" : "Active"}</p>
                  {company.notes && <p className="mt-2 text-sm text-slate-600">{company.notes}</p>}
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