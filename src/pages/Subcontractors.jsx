import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  MoreHorizontal,
  Wrench,
  ChevronRight,
  ShieldCheck,
  AlertTriangle
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
import moment from "moment";

const TRADE_LABELS = {
  general: "General",
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
  framing: "Framing",
  roofing: "Roofing",
  concrete: "Concrete",
  masonry: "Masonry",
  drywall: "Drywall",
  painting: "Painting",
  flooring: "Flooring",
  landscaping: "Landscaping",
  excavation: "Excavation",
  insulation: "Insulation",
  windows_doors: "Windows & Doors",
  tile: "Tile",
  cabinets: "Cabinets",
  other: "Other",
};

const TRADE_COLORS = {
  electrical: "bg-yellow-100 text-yellow-700",
  plumbing: "bg-blue-100 text-blue-700",
  hvac: "bg-cyan-100 text-cyan-700",
  framing: "bg-orange-100 text-orange-700",
  roofing: "bg-slate-100 text-slate-700",
  concrete: "bg-stone-100 text-stone-700",
  masonry: "bg-amber-100 text-amber-700",
  drywall: "bg-purple-100 text-purple-700",
  painting: "bg-pink-100 text-pink-700",
  flooring: "bg-lime-100 text-lime-700",
  landscaping: "bg-green-100 text-green-700",
  excavation: "bg-brown-100 text-yellow-800",
  insulation: "bg-red-100 text-red-700",
  windows_doors: "bg-indigo-100 text-indigo-700",
  tile: "bg-teal-100 text-teal-700",
  cabinets: "bg-amber-100 text-amber-800",
  general: "bg-slate-100 text-slate-600",
  other: "bg-slate-100 text-slate-500",
};

const statusStyles = {
  active: { label: "Active", class: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Inactive", class: "bg-slate-100 text-slate-600" },
  preferred: { label: "Preferred", class: "bg-amber-100 text-amber-700" },
};

const EMPTY_FORM = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  trade_type: "general",
  license_number: "",
  insurance_expiry: "",
  hourly_rate: "",
  status: "active",
  notes: "",
};

export default function Subcontractors() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [dupError, setDupError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await base44.entities.Subcontractor.list("-created_date");
    setSubs(data);
    setLoading(false);
  };

  const filteredSubs = subs.filter((sub) => {
    const matchesSearch =
      sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTrade = tradeFilter === "all" || sub.trade_type === tradeFilter;
    return matchesSearch && matchesTrade;
  });

  // Group by trade type
  const groupedByTrade = filteredSubs.reduce((acc, sub) => {
    const trade = sub.trade_type || "other";
    if (!acc[trade]) acc[trade] = [];
    acc[trade].push(sub);
    return acc;
  }, {});

  const openNewDialog = () => {
    setEditingSub(null);
    setFormData(EMPTY_FORM);
    setDupError("");
    setIsDialogOpen(true);
  };

  const openEditDialog = (sub) => {
    setDupError("");
    setEditingSub(sub);
    setFormData({
      name: sub.name,
      contact_person: sub.contact_person || "",
      email: sub.email || "",
      phone: sub.phone || "",
      address: sub.address || "",
      trade_type: sub.trade_type || "general",
      license_number: sub.license_number || "",
      insurance_expiry: sub.insurance_expiry || "",
      hourly_rate: sub.hourly_rate || "",
      status: sub.status || "active",
      notes: sub.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDupError("");

    const normName  = formData.name.trim().toLowerCase();
    const normEmail = formData.email?.trim().toLowerCase();

    const dup = subs.find((s) =>
      s.id !== editingSub?.id && (
        s.name.trim().toLowerCase() === normName ||
        (normEmail && s.email?.trim().toLowerCase() === normEmail)
      )
    );

    if (dup) {
      setDupError(
        dup.name.trim().toLowerCase() === normName
          ? `A subcontractor named "${dup.name}" already exists.`
          : `A subcontractor with email "${dup.email}" already exists.`
      );
      return;
    }

    const data = {
      ...formData,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
    };
    if (editingSub) {
      await base44.entities.Subcontractor.update(editingSub.id, data);
    } else {
      await base44.entities.Subcontractor.create(data);
    }
    setIsDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this subcontractor?")) {
      await base44.entities.Subcontractor.delete(id);
      loadData();
    }
  };

  const isInsuranceExpiringSoon = (date) => {
    if (!date) return false;
    return moment(date).isBefore(moment().add(30, "days"));
  };

  const isInsuranceExpired = (date) => {
    if (!date) return false;
    return moment(date).isBefore(moment());
  };

  const activeTrades = [...new Set(subs.map((s) => s.trade_type))].filter(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Subcontractors
          </h1>
          <p className="text-slate-500 mt-1">Manage your subcontractor network by trade</p>
        </div>
        <Button
          onClick={openNewDialog}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-orange-500/25"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Subcontractor
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search subcontractors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-slate-200 rounded-xl h-11"
          />
        </div>
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-white border-slate-200 rounded-xl h-11">
            <SelectValue placeholder="All Trades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {activeTrades.map((trade) => (
              <SelectItem key={trade} value={trade}>
                {TRADE_LABELS[trade] || trade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Trade Summary Pills */}
      {tradeFilter === "all" && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(groupedByTrade).map(([trade, tradeSubs]) => (
            <button
              key={trade}
              onClick={() => setTradeFilter(trade)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105",
                TRADE_COLORS[trade] || "bg-slate-100 text-slate-600"
              )}
            >
              {TRADE_LABELS[trade] || trade} ({tradeSubs.length})
            </button>
          ))}
        </div>
      )}

      {/* Content - grouped by trade */}
      {filteredSubs.length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedByTrade).map(([trade, tradeSubs]) => (
            <div key={trade}>
              <div className="flex items-center gap-3 mb-4">
                <span className={cn("px-3 py-1 rounded-full text-sm font-semibold", TRADE_COLORS[trade] || "bg-slate-100 text-slate-600")}>
                  {TRADE_LABELS[trade] || trade}
                </span>
                <span className="text-sm text-slate-400">{tradeSubs.length} subcontractor{tradeSubs.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tradeSubs.map((sub) => {
                  const status = statusStyles[sub.status] || statusStyles.active;
                  const expired = isInsuranceExpired(sub.insurance_expiry);
                  const expiringSoon = !expired && isInsuranceExpiringSoon(sub.insurance_expiry);

                  return (
                    <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", TRADE_COLORS[sub.trade_type] || "bg-slate-100")}>
                            <Wrench className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900">{sub.name}</h3>
                            {sub.contact_person && (
                              <p className="text-sm text-slate-500">{sub.contact_person}</p>
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
                            <DropdownMenuItem onClick={() => openEditDialog(sub)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(sub.id)} className="text-rose-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="space-y-2 mb-4">
                        {sub.email && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Mail className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{sub.email}</span>
                          </div>
                        )}
                        {sub.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Phone className="w-4 h-4 flex-shrink-0" />
                            <span>{sub.phone}</span>
                          </div>
                        )}
                        {sub.address && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{sub.address}</span>
                          </div>
                        )}
                      </div>

                      {/* Insurance & License */}
                      <div className="space-y-2 mb-4">
                        {sub.license_number && (
                          <div className="flex items-center gap-2 text-sm">
                            <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="text-slate-500">Lic: {sub.license_number}</span>
                          </div>
                        )}
                        {sub.insurance_expiry && (
                          <div className={cn("flex items-center gap-2 text-sm", expired ? "text-rose-600" : expiringSoon ? "text-amber-600" : "text-slate-500")}>
                            {(expired || expiringSoon) ? (
                              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                            )}
                            <span>
                              Ins. {expired ? "Expired" : expiringSoon ? "Expires soon:"  : "Exp:"} {moment(sub.insurance_expiry).format("MMM D, YYYY")}
                            </span>
                          </div>
                        )}
                        {sub.hourly_rate && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <span className="w-4 text-center font-medium text-slate-400">$</span>
                            <span>${sub.hourly_rate}/hr</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <Badge className={cn("font-medium", status.class)}>{status.label}</Badge>
                        <Badge className={cn("font-medium text-xs", TRADE_COLORS[sub.trade_type] || "bg-slate-100 text-slate-600")}>
                          {TRADE_LABELS[sub.trade_type] || sub.trade_type}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">No subcontractors found</h3>
          <p className="text-slate-500 mb-4">
            {searchQuery || tradeFilter !== "all" ? "Try adjusting your filters" : "Add your first subcontractor to get started"}
          </p>
          {!searchQuery && tradeFilter === "all" && (
            <Button onClick={openNewDialog} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
              <Plus className="w-4 h-4 mr-2" />
              Add Subcontractor
            </Button>
          )}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSub ? "Edit Subcontractor" : "Add Subcontractor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input value={formData.name} onChange={(e) => { setDupError(""); setFormData({ ...formData, name: e.target.value }); }} required className="mt-1.5" />
              {dupError && !dupError.includes("email") && <p className="text-sm text-rose-600 mt-1">{dupError}</p>}
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Trade Type *</Label>
              <Select value={formData.trade_type} onValueChange={(v) => setFormData({ ...formData, trade_type: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRADE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => { setDupError(""); setFormData({ ...formData, email: e.target.value }); }} className="mt-1.5" />
                {dupError && dupError.includes("email") && <p className="text-sm text-rose-600 mt-1">{dupError}</p>}
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>License Number</Label>
                <Input value={formData.license_number} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Hourly Rate ($)</Label>
                <Input type="number" value={formData.hourly_rate} onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Insurance Expiry Date</Label>
              <Input type="date" value={formData.insurance_expiry} onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="mt-1.5" rows={3} />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                {editingSub ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}