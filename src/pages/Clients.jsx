import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  MoreHorizontal,
  User,
  Building2,
  ChevronRight,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ClientWorkflowControl from "@/components/clients/ClientWorkflowControl";

const statusStyles = {
  active:   { label: "Active",   class: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Inactive", class: "bg-slate-100 text-slate-600" },
  prospect: { label: "Prospect", class: "bg-blue-100 text-blue-700" },
};

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients]       = useState([]);
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("__all__");
  const [isDialogOpen, setIsDialogOpen]   = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [duplicateError, setDuplicateError] = useState("");

  const [formData, setFormData] = useState({
    name: "", contact_person: "", email: "", phone: "",
    address: "", notes: "", status: "active", company: "",
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [clientsData, projectsData] = await Promise.all([
        base44.entities.Client.list("-created_date"),
        base44.entities.Project.list(),
      ]);
      setClients(clientsData);
      setProjects(projectsData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getClientProjectCount = (clientId) =>
    projects.filter((p) => p.client_id === clientId).length;

  // Unique, sorted companies derived from client data
  const companies = useMemo(() => {
    const set = new Set(clients.map(c => (c.company || "").trim()).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return clients.filter(c => {
      const matchesSearch =
        c.name?.toLowerCase().includes(q) ||
        c.contact_person?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q);
      const matchesCompany =
        selectedCompany === "__all__" ||
        (selectedCompany === "__none__" ? !c.company?.trim() : (c.company || "").trim() === selectedCompany);
      return matchesSearch && matchesCompany;
    });
  }, [clients, searchQuery, selectedCompany]);

  // When viewing "all", group by company then unassigned
  const groups = useMemo(() => {
    if (selectedCompany !== "__all__") {
      return [{ company: null, items: filtered }];
    }
    const map = new Map();
    for (const c of filtered) {
      const key = (c.company || "").trim() || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    const result = [];
    for (const co of companies) {
      if (map.has(co)) result.push({ company: co, items: map.get(co) });
    }
    if (map.has("__none__")) result.push({ company: null, items: map.get("__none__") });
    return result;
  }, [filtered, companies, selectedCompany]);

  const openNewDialog = () => {
    setDuplicateError("");
    setEditingClient(null);
    setFormData({
      name: "", contact_person: "", email: "", phone: "",
      address: "", notes: "", status: "active",
      company: selectedCompany !== "__all__" && selectedCompany !== "__none__" ? selectedCompany : "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (client) => {
    setDuplicateError("");
    setEditingClient(client);
    setFormData({
      name: client.name,
      contact_person: client.contact_person || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || "",
      status: client.status || "active",
      company: client.company || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDuplicateError("");
    const normalizedName  = formData.name.trim().toLowerCase();
    const normalizedEmail = formData.email?.trim().toLowerCase();
    const duplicate = clients.find((c) => c.id !== editingClient?.id && (
      c.name.trim().toLowerCase() === normalizedName ||
      (normalizedEmail && c.email?.trim().toLowerCase() === normalizedEmail)
    ));
    if (duplicate) {
      setDuplicateError(
        duplicate.name.trim().toLowerCase() === normalizedName
          ? `A contact named "${duplicate.name}" already exists.`
          : `A contact with email "${duplicate.email}" already exists.`
      );
      return;
    }
    if (editingClient) {
      await base44.entities.Client.update(editingClient.id, { ...formData, sync_locked: true });
    } else {
      await base44.entities.Client.create({ ...formData, sync_locked: true });
    }
    setIsDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this contact?")) {
      await base44.entities.Client.delete(id);
      loadData();
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Contacts</h1>
          <p className="text-slate-500 mt-1">{clients.length} total contacts</p>
        </div>
        <Button
          onClick={openNewDialog}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-orange-500/25"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-slate-200 rounded-xl h-11"
        />
      </div>

      {/* Company filter pills */}
      {companies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCompany("__all__")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all",
              selectedCompany === "__all__"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            )}
          >
            <Users className="w-3.5 h-3.5" /> All People
            <span className="ml-0.5 text-xs opacity-70">({clients.length})</span>
          </button>
          {companies.map(co => {
            const count = clients.filter(c => (c.company || "").trim() === co).length;
            return (
              <button
                key={co}
                onClick={() => setSelectedCompany(co)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all",
                  selectedCompany === co
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"
                )}
              >
                <Building2 className="w-3.5 h-3.5" /> {co}
                <span className="ml-0.5 text-xs opacity-70">({count})</span>
              </button>
            );
          })}
          {clients.some(c => !c.company?.trim()) && (
            <button
              onClick={() => setSelectedCompany("__none__")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all",
                selectedCompany === "__none__"
                  ? "bg-slate-500 text-white border-slate-500"
                  : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
              )}
            >
              No Company
              <span className="ml-0.5 text-xs opacity-70">({clients.filter(c => !c.company?.trim()).length})</span>
            </button>
          )}
        </div>
      )}

      {/* Contact groups */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No contacts found</h3>
          <p className="text-slate-500 mb-4">
            {searchQuery ? "Try a different search term" : "Add your first contact to get started"}
          </p>
          {!searchQuery && (
            <Button onClick={openNewDialog} className="bg-gradient-to-r from-amber-500 to-orange-500">
              <Plus className="w-4 h-4 mr-2" /> Add Contact
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ company, items }) => (
            <div key={company ?? "__none__"}>
              {/* Company header (only when showing "All People") */}
              {selectedCompany === "__all__" && (
                <div className="flex items-center gap-2 mb-3">
                  {company ? (
                    <>
                      <Building2 className="w-4 h-4 text-amber-500" />
                      <h2 className="text-sm font-semibold text-slate-700">{company}</h2>
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4 text-slate-400" />
                      <h2 className="text-sm font-semibold text-slate-400">No Company</h2>
                    </>
                  )}
                  <span className="text-xs text-slate-400">({items.length})</span>
                  <div className="flex-1 h-px bg-slate-100 ml-1" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((client) => {
                  const status = statusStyles[client.status] || statusStyles.active;
                  const projectCount = getClientProjectCount(client.id);
                  return (
                    <div
                      key={client.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 group"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-amber-600">
                              {client.name?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900 leading-tight">{client.name}</h3>
                            {client.company && selectedCompany === "__all__" && (
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3" />{client.company}
                              </p>
                            )}
                            {client.contact_person && (
                              <p className="text-xs text-slate-400 mt-0.5">{client.contact_person}</p>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(client)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(client.id)} className="text-rose-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="space-y-2 mb-4">
                        {client.email && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Mail className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Phone className="w-4 h-4 flex-shrink-0" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{client.address}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn("font-medium", status.class)}>{status.label}</Badge>
                          <ClientWorkflowControl client={client} onUpdated={loadData} />
                        </div>
                        <Link
                          to={createPageUrl(`ClientDetail?id=${client.id}`)}
                          className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium"
                        >
                          {projectCount} project{projectCount !== 1 ? "s" : ""}
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit Contact" : "Add New Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Contact Name *</Label>
              <Input
                placeholder="e.g. John Smith"
                value={formData.name}
                onChange={(e) => { setDuplicateError(""); setFormData({ ...formData, name: e.target.value }); }}
                required
                className="mt-1.5"
              />
              {duplicateError && !duplicateError.includes("email") && (
                <p className="text-sm text-rose-600 mt-1">{duplicateError}</p>
              )}
            </div>
            <div>
              <Label className="text-slate-500">Company <span className="font-normal text-slate-400">(optional)</span></Label>
              {/* Offer autocomplete from existing companies */}
              <Input
                placeholder="e.g. Acme Corp"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                list="company-suggestions"
                className="mt-1.5"
              />
              {companies.length > 0 && (
                <datalist id="company-suggestions">
                  {companies.map(co => <option key={co} value={co} />)}
                </datalist>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => { setDuplicateError(""); setFormData({ ...formData, email: e.target.value }); }}
                  className="mt-1.5"
                />
                {duplicateError && duplicateError.includes("email") && (
                  <p className="text-sm text-rose-600 mt-1">{duplicateError}</p>
                )}
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500">
                {editingClient ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
