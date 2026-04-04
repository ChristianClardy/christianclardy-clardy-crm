import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Plus, Search, Phone, Mail, CalendarDays, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LeadFormDialog from "@/components/crm/LeadFormDialog";

const funnelBuckets = [
  { key: "new", label: "New", match: ["New Lead"] },
  { key: "contacted", label: "Contacted", match: ["Contact Attempted", "Contacted", "Follow Up"] },
  { key: "appointment", label: "Appointment", match: ["Appointment Scheduled", "Site Visit Complete"] },
  { key: "estimate", label: "Estimate", match: ["Estimate In Progress", "Estimate Sent", "Negotiation"] },
  { key: "won_lost", label: "Won / Lost", match: ["Won", "Lost", "On Hold"] },
];

const statusStyles = {
  "New Lead": "bg-slate-100 text-slate-700",
  "Contact Attempted": "bg-amber-100 text-amber-700",
  Contacted: "bg-blue-100 text-blue-700",
  "Appointment Scheduled": "bg-purple-100 text-purple-700",
  "Site Visit Complete": "bg-violet-100 text-violet-700",
  "Estimate In Progress": "bg-indigo-100 text-indigo-700",
  "Estimate Sent": "bg-cyan-100 text-cyan-700",
  "Follow Up": "bg-orange-100 text-orange-700",
  Negotiation: "bg-yellow-100 text-yellow-700",
  Won: "bg-emerald-100 text-emerald-700",
  Lost: "bg-rose-100 text-rose-700",
  "On Hold": "bg-slate-200 text-slate-700",
};

const DEAD_STATUSES = ["Lost"];

export default function LeadList({ archived = false }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadLeads = async () => {
    try {
      const data = await base44.entities.Lead.list("-created_date", 500);
      setLeads(data || []);
    } catch (err) {
      console.error("Failed to load leads:", err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
    const unsubscribe = base44.entities.Lead.subscribe(() => loadLeads());
    return unsubscribe;
  }, []);

  const visibleLeads = useMemo(() =>
    leads.filter((lead) =>
      archived
        ? DEAD_STATUSES.includes(lead.status)
        : !DEAD_STATUSES.includes(lead.status)
    ), [leads, archived]);

  const filteredLeads = useMemo(() => visibleLeads.filter((lead) => {
    const value = search.toLowerCase();
    return !value ||
      (lead.full_name || "").toLowerCase().includes(value) ||
      (lead.email || "").toLowerCase().includes(value) ||
      (lead.phone || "").toLowerCase().includes(value) ||
      (lead.project_description || "").toLowerCase().includes(value);
  }), [visibleLeads, search]);

  const funnelCounts = useMemo(() => funnelBuckets.map((bucket) => ({
    ...bucket,
    count: visibleLeads.filter((lead) => bucket.match.includes(lead.status || "New Lead")).length,
  })), [visibleLeads]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" /></div>;
  }

  return (
    <div className="space-y-6 px-6 pb-6 lg:px-8 lg:pb-8">
      {!archived && (
        <div className="grid gap-3 md:grid-cols-5">
          {funnelCounts.map((bucket) => (
            <div key={bucket.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{bucket.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{bucket.count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={archived ? "Search archived leads..." : "Search leads..."} className="pl-9" />
        </div>
        {!archived && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredLeads.map((lead) => (
          <div key={lead.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{lead.full_name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge className={statusStyles[lead.status] || "bg-slate-100 text-slate-700"}>{lead.status || "New Lead"}</Badge>
                  {lead.project_type && <Badge variant="outline">{lead.project_type}</Badge>}
                  {lead.lead_source && <Badge variant="outline">{lead.lead_source}</Badge>}
                </div>
              </div>
              <Link to={`/LeadDetail?id=${lead.id}`} className="text-sm font-medium text-slate-900 underline-offset-4 hover:underline">
                Open
              </Link>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-500">
              {lead.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{lead.phone}</div>}
              {lead.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" />{lead.email}</div>}
              {lead.assigned_sales_rep && <div className="flex items-center gap-2"><UserRound className="h-4 w-4" />{lead.assigned_sales_rep}</div>}
              {lead.follow_up_date && <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Next follow up {lead.follow_up_date}</div>}
            </div>

            {lead.project_description && (
              <p className="mt-4 line-clamp-3 text-sm text-slate-600">{lead.project_description}</p>
            )}
          </div>
        ))}
      </div>

      {!filteredLeads.length && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {archived ? "No archived leads." : "No leads found."}
        </div>
      )}

      <LeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={loadLeads} />
    </div>
  );
}