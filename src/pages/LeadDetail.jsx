import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, Mail, Pencil, Phone, TrendingUp, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LeadFormDialog from "@/components/crm/LeadFormDialog";
import LeadFollowUpPanel from "@/components/crm/LeadFollowUpPanel";
import ContactHistoryPanel from "@/components/crm/ContactHistoryPanel";
import NextStepsPanel from "@/components/scheduling/NextStepsPanel";
import { promoteLeadToProspect, setLeadStatus } from "@/lib/leadConversion";
import { LEAD_STAGES } from "@/lib/leadStages";

const funnelSteps = LEAD_STAGES;

export default function LeadDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get("id");
  const [lead, setLead] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const loadData = async () => {
    if (!leadId) return;
    try {
      const [leadRows, followUpRows] = await Promise.all([
        base44.entities.Lead.filter({ id: leadId }),
        base44.entities.LeadFollowUp.filter({ lead_id: leadId }, "-created_date", 200),
      ]);
      const leadRow = leadRows[0] || null;
      setLead(leadRow);
      setFollowUps(followUpRows || []);
    } catch (err) {
      console.error("Failed to load lead:", err?.message);
    } finally {
      setLoading(false);
    }
  };

  const isProspect = Boolean(lead?.is_prospect);

  const handleConvertToProspect = async () => {
    setConverting(true);
    try {
      await promoteLeadToProspect(lead);
      await loadData();
    } catch (err) {
      console.error("Failed to promote lead to prospect:", err?.message);
      alert("Could not promote this lead to a prospect. Please try again.");
    } finally {
      setConverting(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubLead = base44.entities.Lead.subscribe((event) => {
      if (event?.id === leadId || event?.data?.id === leadId) loadData();
    });
    const unsubFollowUps = base44.entities.LeadFollowUp.subscribe((event) => {
      if (event?.data?.lead_id === leadId || event?.old_data?.lead_id === leadId) loadData();
    });
    return () => {
      unsubLead();
      unsubFollowUps();
    };
  }, [leadId]);

  const activeStepIndex = useMemo(() => Math.max(funnelSteps.indexOf(lead?.status || "New Lead"), 0), [lead]);

  const updateStatus = async (value) => {
    await setLeadStatus(lead, value).catch(err => {
      console.error("Status update failed:", err?.message);
      alert(`Could not set status "${value}".\n\nRun this in Supabase SQL editor:\nALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS '${value}';`);
    });
    loadData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" /></div>;
  }

  if (!lead) {
    return <div className="p-8 text-slate-500">Lead not found.</div>;
  }

  return (
    <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
      <Link to="/CRM?tab=leads" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Sales funnel</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-slate-900">{lead.full_name}</h1>
              {isProspect && (
                <Badge className="bg-amber-100 text-amber-700">Prospect</Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              {lead.phone && <span className="flex items-center gap-2"><Phone className="h-4 w-4" />{lead.phone}</span>}
              {lead.email && <span className="flex items-center gap-2"><Mail className="h-4 w-4" />{lead.email}</span>}
              {lead.assigned_sales_rep && <span className="flex items-center gap-2"><UserRound className="h-4 w-4" />{lead.assigned_sales_rep}</span>}
              {lead.follow_up_date && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{lead.follow_up_date}</span>}
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 xl:max-w-xs">
            <Button onClick={handleConvertToProspect} disabled={converting || isProspect}>
              <TrendingUp className="mr-2 h-4 w-4" />
              {converting ? "Promoting..." : isProspect ? "Prospect" : "Promote to Prospect"}
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Lead
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate(`/Calendar?mode=calendar&new=task&clientId=${lead.linked_contact_id || lead.id}`)}>
                Add Task
              </Button>
            </div>
            <p className="text-sm font-medium text-slate-600">Current stage</p>
            <Select value={lead.status || "New Lead"} onValueChange={updateStatus}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {funnelSteps.map((step) => <SelectItem key={step} value={step}>{step}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {funnelSteps.map((step, index) => {
            const active = index <= activeStepIndex;
            return (
              <div key={step} className={`rounded-2xl border p-3 text-sm ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Step {index + 1}</p>
                <p className="mt-2 font-medium">{step}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Lead source</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{lead.lead_source || "—"}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Project type</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{lead.project_type || "—"}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Next action</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{lead.next_action || "—"}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Estimated budget</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {lead.estimated_budget != null && lead.estimated_budget !== "" ? `$${Number(lead.estimated_budget).toLocaleString()}` : "—"}
          </p>
        </div>
      </div>

      {(lead.project_description || lead.notes) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Project description</h2>
              {lead.project_type && <Badge variant="outline">{lead.project_type}</Badge>}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{lead.project_description || "No project description yet."}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Lead notes</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{lead.notes || "No notes yet."}</p>
          </div>
        </div>
      )}

      <LeadFollowUpPanel lead={lead} followUps={followUps} onRefresh={loadData} />
      <NextStepsPanel title="Lead Tasks / Next Steps" linkedClientId={lead.linked_contact_id || lead.id} />

      <ContactHistoryPanel
        title="Communication & History"
        contactName={lead.full_name || ""}
        linkedLeadId={lead.id}
        linkedClientId={lead.linked_contact_id || ""}
        sourceEntity="lead"
      />

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} onCreated={loadData} />
    </div>
  );
}