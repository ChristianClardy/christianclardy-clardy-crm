import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { 
  Target, Phone, Mail, MapPin, FileText,
  ChevronDown, ChevronRight, ExternalLink, Plus, Search, ArrowUpDown,
  Workflow, Calendar, AlertCircle, Download, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import WorkflowBadge, { WORKFLOW_STAGES } from "@/components/prospects/WorkflowBadge";
import WorkflowDrawer from "@/components/prospects/WorkflowDrawer";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

const statusColors = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
  revised: "bg-amber-100 text-amber-700",
};

function fmt(n) {
  if (!n && n !== 0) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Prospects({ initialBucket = "all", showBucketTabs = true }) {
  const bucketTitles = {
    all: "Pipeline",
    leads: "Leads",
    prospects: "Prospects",
    approved: "Approved",
    completed: "Completed",
    closed: "Closed",
    archived: "Archived",
  };
  const [prospects, setProspects] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("az");
  const [workflowProspect, setWorkflowProspect] = useState(null);
  const [bucketFilter, setBucketFilter] = useState(initialBucket);

  useEffect(() => {
    loadData();

    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubClients = base44.entities.Client.subscribe(() => loadData());
    const unsubEstimates = base44.entities.Estimate.subscribe(() => loadData());

    return () => {
      unsubProjects();
      unsubClients();
      unsubEstimates();
    };
  }, []);

  useEffect(() => {
    setBucketFilter(initialBucket || "all");
  }, [initialBucket]);

  const loadData = async () => {
    const [clients, ests, projectData] = await Promise.all([
      base44.entities.Client.list("-created_date", 5000),
      base44.entities.Estimate.list("-created_date", 2000),
      base44.entities.Project.list("-updated_date", 2000),
    ]);
    setProspects(clients);
    setEstimates(ests);
    setProjects(projectData);
    setLoading(false);
  };

  const getProspectIds = (prospectOrId) => {
    if (typeof prospectOrId === "object" && prospectOrId !== null) {
      return prospectOrId.grouped_ids || [prospectOrId.id];
    }
    return [prospectOrId];
  };

  const getLinkedProjects = (prospect) => {
    const ids = getProspectIds(prospect);
    return projects.filter((project) => ids.includes(project.client_id) || (prospect.acculynx_job_id && project.acculynx_job_id === prospect.acculynx_job_id));
  };

  const hasActiveProject = (prospect) => getLinkedProjects(prospect).some((project) => !["closed", "completed", "cancelled"].includes(project.status));
  const hasCompletedProject = (prospect) => getLinkedProjects(prospect).some((project) => ["completed", "substantially_complete"].includes(project.status));
  const hasClosedProject = (prospect) => getLinkedProjects(prospect).some((project) => project.status === "closed");

  const getEstimatesForClient = (prospectOrId) =>
    estimates.filter((e) => getProspectIds(prospectOrId).includes(e.client_id));

  const getPrimaryEstimate = (prospectOrId) => {
    const clientEstimates = getEstimatesForClient(prospectOrId);
    // prefer accepted > sent > most recent
    return (
      clientEstimates.find((e) => e.status === "accepted") ||
      clientEstimates.find((e) => e.status === "sent") ||
      clientEstimates[0] ||
      null
    );
  };

  const getProspectPrimaryTotal = (prospect) => {
    const localPrimaryEstimate = getPrimaryEstimate(prospect.id);
    return localPrimaryEstimate?.total || prospect.lifetime_value || 0;
  };

  const getAccuLynxMilestone = (prospect) => {
    const match = (prospect.notes || "").match(/AccuLynx milestone:\s*(.*)/i);
    return (match?.[1] || "").trim().toLowerCase();
  };

  const isApprovedProspect = (prospect) => {
    const milestone = getAccuLynxMilestone(prospect);
    return prospect.workflow_stage === "approved" || milestone.includes("approved");
  };

  const isCompletedProspect = (prospect) => {
    const milestone = getAccuLynxMilestone(prospect);
    return hasCompletedProject(prospect) || milestone.includes("completed") || milestone.includes("complete");
  };

  const isClosedProspect = (prospect) => {
    const milestone = getAccuLynxMilestone(prospect);
    return hasClosedProject(prospect) || milestone.includes("closed") || milestone.includes("close") || milestone.includes("invoiced");
  };

  const hasAttachedEstimate = (prospect) => {
    return Boolean(getPrimaryEstimate(prospect.id) || prospect.lifetime_value > 0);
  };

  const isArchivedProspect = (prospect) => {
    return (prospect.workflow_stage || "") === "dead_lead";
  };

  const getManualBucket = (stage) => {
    if (stage === "dead_lead") return "archived";
    if (stage === "closed") return "closed";
    if (stage === "completed") return "completed";
    if (stage === "approved") return "approved";
    if (["proposal_sent", "negotiating"].includes(stage)) return "prospects";
    if (["new_lead", "contacted"].includes(stage)) return "leads";
    return null;
  };

  const getBucketForProspect = (prospect) => {
    const manualBucket = prospect.sync_locked ? getManualBucket(prospect.workflow_stage) : null;
    if (manualBucket) return manualBucket;
    if (isArchivedProspect(prospect)) return "archived";
    if (isClosedProspect(prospect)) return "closed";
    if (isCompletedProspect(prospect)) return "completed";
    if (hasActiveProject(prospect) || isApprovedProspect(prospect)) return "approved";
    if (hasAttachedEstimate(prospect)) return "prospects";
    return "leads";
  };

  const getDisplayStage = (prospect) => {
    if (prospect.sync_locked && prospect.workflow_stage) return prospect.workflow_stage;
    if (isArchivedProspect(prospect)) return "dead_lead";
    if (isClosedProspect(prospect)) return "closed";
    if (isCompletedProspect(prospect)) return "completed";
    if (isApprovedProspect(prospect)) return "approved";
    return prospect.workflow_stage || "new_lead";
  };

  const isPipelineRelevant = (prospect) => {
    return Boolean(
      prospect.acculynx_job_id ||
      prospect.linked_lead_id ||
      getLinkedProjects(prospect).length > 0 ||
      getEstimatesForClient(prospect).length > 0 ||
      prospect.status === "prospect" ||
      ["approved", "completed", "closed", "dead_lead", "proposal_sent", "contacted", "negotiating", "new_lead"].includes(prospect.workflow_stage || "")
    );
  };

  const normalizeProspectName = (name) =>
    (name || "").toLowerCase().replace(/\s+/g, " ").trim();

  const getWorkflowRank = (prospect) => {
    const bucket = getBucketForProspect(prospect);
    return {
      archived: 0,
      leads: 1,
      prospects: 2,
      approved: 3,
      completed: 4,
      closed: 5,
    }[bucket] || 0;
  };

  const consolidatedProspects = Object.values(
    prospects.filter(isPipelineRelevant).reduce((acc, prospect) => {
      const key = normalizeProspectName(prospect.name) || prospect.id;
      const existing = acc[key];

      if (!existing) {
        acc[key] = { ...prospect, grouped_ids: [prospect.id] };
        return acc;
      }

      const mergedIds = Array.from(new Set([...(existing.grouped_ids || [existing.id]), prospect.id]));
      const existingRank = getWorkflowRank(existing);
      const currentRank = getWorkflowRank(prospect);
      const shouldReplace =
        currentRank > existingRank ||
        (currentRank === existingRank &&
          new Date(prospect.updated_date || prospect.created_date || 0) >
            new Date(existing.updated_date || existing.created_date || 0));

      acc[key] = shouldReplace
        ? { ...prospect, grouped_ids: mergedIds }
        : { ...existing, grouped_ids: mergedIds };

      return acc;
    }, {})
  );

  const activeApprovedProjectsCount = Array.from(
    new Set(
      consolidatedProspects
        .filter((prospect) => getBucketForProspect(prospect) === "approved")
        .flatMap((prospect) => getLinkedProjects(prospect).filter((project) => !["closed", "completed", "cancelled"].includes(project.status)).map((project) => project.id))
    )
  ).length;

  const toggleExpand = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const today = new Date().toISOString().slice(0, 10);

  const buildExportRows = () =>
    filtered.map((p) => {
      const est = getPrimaryEstimate(p);
      const stage = WORKFLOW_STAGES.find(s => s.key === getDisplayStage(p))?.label || getDisplayStage(p);
      return {
        Name: p.name || "",
        Company: p.company || "",
        Email: p.email || "",
        Phone: p.phone || "",
        Address: p.address || "",
        "Workflow Stage": stage,
        Bucket: getBucketForProspect(p),
        "Follow-up Date": p.follow_up_date || "",
        "Primary Estimate": est?.title || (p.lifetime_value ? "AccuLynx Primary Estimate" : ""),
        "Estimate Status": est?.status || (p.lifetime_value ? "synced" : ""),
        "Estimate Total": est?.total || p.lifetime_value || 0,
        Notes: p.notes || "",
      };
    });

  const exportCSV = () => {
    const rows = buildExportRows();
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "prospects.csv"; a.click();
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(buildExportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prospects");
    XLSX.writeFile(wb, "prospects.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const rows = buildExportRows();
    const cols = ["Name", "Company", "Email", "Phone", "Workflow Stage", "Follow-up Date", "Estimate Total", "Estimate Status"];
    const colWidths = [35, 30, 50, 28, 30, 25, 28, 25];
    const startX = 10;
    let y = 10;

    // Title
    doc.setFontSize(16);
    doc.setTextColor(61, 53, 48);
    doc.text("Prospects Pipeline", startX, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(120, 110, 102);
    doc.text(`Generated: ${new Date().toLocaleDateString()}  ·  ${rows.length} prospects`, startX, y);
    y += 8;

    // Header row
    doc.setFillColor(181, 150, 90);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    let x = startX;
    cols.forEach((col, i) => { doc.rect(x, y, colWidths[i], 7, "F"); doc.text(col, x + 2, y + 5); x += colWidths[i]; });
    y += 7;

    // Data rows
    doc.setFont(undefined, "normal");
    rows.forEach((row, ri) => {
      if (y > 185) { doc.addPage(); y = 10; }
      doc.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 247, ri % 2 === 0 ? 255 : 244);
      doc.setTextColor(61, 53, 48);
      x = startX;
      const vals = [row.Name, row.Company, row.Email, row.Phone, row["Workflow Stage"], row["Follow-up Date"], row["Estimate Total"] ? `$${Number(row["Estimate Total"]).toLocaleString()}` : "—", row["Estimate Status"]];
      vals.forEach((val, i) => {
        doc.rect(x, y, colWidths[i], 7, "F");
        doc.text(String(val || "").substring(0, 20), x + 2, y + 5);
        x += colWidths[i];
      });
      y += 7;
    });
    doc.save("prospects.pdf");
  };

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ current: 0, total: 0 });
    let nextPage = 1;
    let done = false;
    let consecutiveErrors = 0;
    while (!done) {
      try {
        const res = await base44.functions.invoke("syncProspects", { acculynxPage: nextPage, manual: true });
        const data = res.data;
        nextPage = data.nextPage || (nextPage + 1);
        done = data.done || nextPage > (data.totalPages || 1);
        consecutiveErrors = 0;
        setSyncProgress({ current: nextPage - 1, total: data.totalPages || 0 });
        if (!done) await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) break;
        await new Promise(r => setTimeout(r, 4000 * consecutiveErrors));
      }
    }
    setSyncing(false);
    setSyncProgress(null);
    loadData();
  };

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = consolidatedProspects
    .filter((p) => {
      if (bucketFilter !== "all" && getBucketForProspect(p) !== bucketFilter) return false;
      if (!search) return true;
      return (
        (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.company || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.email || "").toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (sortBy === "az") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "za") return (b.name || "").localeCompare(a.name || "");
      const aTotal = getProspectPrimaryTotal(a);
      const bTotal = getProspectPrimaryTotal(b);
      if (sortBy === "price_asc") return aTotal - bTotal;
      if (sortBy === "price_desc") return bTotal - aTotal;
      return 0;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-full space-y-6" style={{ backgroundColor: "#f5f0eb" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "#b5965a", letterSpacing: "0.18em" }}>Pipeline</p>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>{bucketTitles[bucketFilter] || "Pipeline"}</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-px w-8" style={{ backgroundColor: "#b5965a" }} />
            <p className="text-sm" style={{ color: "#7a6e66" }}>
              {consolidatedProspects.filter((p) => getBucketForProspect(p) === "leads").length} leads · {consolidatedProspects.filter((p) => getBucketForProspect(p) === "prospects").length} prospects · {activeApprovedProjectsCount} approved · {consolidatedProspects.filter((p) => getBucketForProspect(p) === "completed").length} completed · {consolidatedProspects.filter((p) => getBucketForProspect(p) === "closed").length} closed · {consolidatedProspects.filter((p) => getBucketForProspect(p) === "archived").length} archived
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-semibold tracking-wide border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all duration-200 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing
              ? syncProgress?.total
                ? `Syncing… page ${syncProgress.current}/${syncProgress.total}`
                : "Syncing…"
              : "Sync AccuLynx"}
          </button>
          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(o => !o)}
              className="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-semibold tracking-wide border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {[
                  { label: "Download CSV", action: exportCSV },
                  { label: "Download Excel", action: exportExcel },
                  { label: "Download PDF", action: exportPDF },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    onClick={() => { action(); setExportOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link
            to={createPageUrl("Clients")}
            className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold tracking-wide transition-all duration-200"
            style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#b5965a"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "#3d3530"}
          >
            <Plus className="w-4 h-4" />
            Add Prospect
          </Link>
        </div>
      </div>

      {/* Summary KPIs */}
      {filtered.length > 0 && (() => {
        const allEstimateIds = filtered.flatMap((prospect) => getProspectIds(prospect));
        const allEstimates = estimates.filter((e) => allEstimateIds.includes(e.client_id));
        const totalPipeline = filtered
          .filter((prospect) => getBucketForProspect(prospect) !== "archived")
          .reduce((sum, prospect) => sum + getProspectPrimaryTotal(prospect), 0);
        const accepted = allEstimates.filter(e => e.status === "accepted").length;
        const sent = allEstimates.filter(e => e.status === "sent").length;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: bucketFilter === "all" ? "Total Pipeline Items" : bucketFilter === "leads" ? "Total Leads" : bucketFilter === "approved" ? "Total Approved Projects" : bucketFilter === "completed" ? "Total Completed" : bucketFilter === "closed" ? "Total Closed" : bucketFilter === "archived" ? "Total Archived" : "Total Prospects", value: bucketFilter === "approved" ? activeApprovedProjectsCount : filtered.length, sub: "in pipeline" },
              { label: "Pipeline Value", value: fmt(totalPipeline), sub: "local + synced primary estimates" },
              { label: "Estimates Sent", value: sent, sub: "awaiting response" },
              { label: "Estimates Accepted", value: accepted, sub: "ready to convert" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#3d3530" }}>{value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {showBucketTabs && (
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "all", label: "All", count: consolidatedProspects.length, activeClass: "border-amber-400 bg-amber-50 text-amber-700" },
            { key: "leads", label: "Leads", count: consolidatedProspects.filter((p) => getBucketForProspect(p) === "leads").length, activeClass: "border-slate-300 bg-slate-100 text-slate-700" },
            { key: "prospects", label: "Prospects", count: consolidatedProspects.filter((p) => getBucketForProspect(p) === "prospects").length, activeClass: "border-blue-300 bg-blue-50 text-blue-700" },
            { key: "approved", label: "Approved", count: activeApprovedProjectsCount, activeClass: "border-emerald-300 bg-emerald-50 text-emerald-700" },
            { key: "completed", label: "Completed", count: consolidatedProspects.filter((p) => getBucketForProspect(p) === "completed").length, activeClass: "border-violet-300 bg-violet-50 text-violet-700" },
            { key: "closed", label: "Closed", count: consolidatedProspects.filter((p) => getBucketForProspect(p) === "closed").length, activeClass: "border-rose-300 bg-rose-50 text-rose-700" },
            { key: "archived", label: "Archived", count: consolidatedProspects.filter((p) => getBucketForProspect(p) === "archived").length, activeClass: "border-slate-400 bg-slate-100 text-slate-700" },
          ].map((bucket) => (
            <button
              key={bucket.key}
              onClick={() => setBucketFilter(bucket.key)}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                bucketFilter === bucket.key ? bucket.activeClass : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              )}
            >
              {bucket.label} <span className="ml-1 opacity-60">({bucket.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Search + Sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search prospects…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm text-slate-600 bg-transparent outline-none cursor-pointer"
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
          </select>
        </div>
      </div>

      {/* Prospect Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <Target className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700">No records in this bucket</h3>
          <p className="text-sm text-slate-400 mt-1">Try another bucket or sync the latest AccuLynx data.</p>
          <Link
            to={createPageUrl("Clients")}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "#b5965a" }}
          >
            Go to Contacts
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((prospect) => {
            const primaryEst = getPrimaryEstimate(prospect);
            const syncedPrimaryTotal = prospect.lifetime_value || 0;
            const linkedProjects = getLinkedProjects(prospect);
            const allClientEstimates = getEstimatesForClient(prospect);
            const isExpanded = expanded[prospect.id];

            return (
              <div key={prospect.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Main Row */}
                <div
                                 className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                 onClick={() => toggleExpand(prospect.id)}
                                 style={prospect.workflow_stage === "dead_lead" ? { opacity: 0.6 } : {}}
                               >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                    style={{ backgroundColor: "#b5965a" }}>
                    {(prospect.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{prospect.name}</span>
                      {prospect.company && (
                        <span className="text-sm text-slate-400">· {prospect.company}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {prospect.email && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />{prospect.email}
                        </span>
                      )}
                      {prospect.phone && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />{prospect.phone}
                        </span>
                      )}
                      {prospect.address && (
                        <span className="text-xs text-slate-500 flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin className="w-3 h-3 flex-shrink-0" />{prospect.address}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Primary Estimate Summary */}
                  <div className="hidden md:flex items-center gap-6 flex-shrink-0">
                    {primaryEst ? (
                      <>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Primary Estimate</p>
                          <p className="font-bold text-slate-800">{fmt(primaryEst.total)}</p>
                        </div>
                        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full capitalize", statusColors[primaryEst.status] || "bg-slate-100 text-slate-600")}>
                          {primaryEst.status}
                        </span>
                      </>
                    ) : syncedPrimaryTotal > 0 ? (
                      <>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Primary Estimate</p>
                          <p className="font-bold text-slate-800">{fmt(syncedPrimaryTotal)}</p>
                        </div>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                          synced
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No estimates</span>
                    )}
                    <span className="text-xs text-slate-300 bg-slate-100 rounded-full px-2 py-0.5">
                      {linkedProjects.length} project{linkedProjects.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-slate-300 bg-slate-100 rounded-full px-2 py-0.5">
                      {allClientEstimates.length} estimate{allClientEstimates.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Follow-up overdue indicator */}
                    {prospect.follow_up_date && prospect.follow_up_date < today && !["approved", "completed", "closed", "archived"].includes(getBucketForProspect(prospect)) && getDisplayStage(prospect) !== "dead_lead" && (
                      <span className="hidden sm:flex items-center gap-1 text-xs text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full font-medium">
                        <AlertCircle className="w-3 h-3" /> Overdue
                      </span>
                    )}
                    {prospect.follow_up_date && prospect.follow_up_date >= today && !["approved", "completed", "closed", "archived"].includes(getBucketForProspect(prospect)) && getDisplayStage(prospect) !== "dead_lead" && (
                      <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                        <Calendar className="w-3 h-3" /> {prospect.follow_up_date}
                      </span>
                    )}
                    <WorkflowBadge stage={getDisplayStage(prospect)} />
                    <button
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                      title="Manage workflow"
                      onClick={e => { e.stopPropagation(); setWorkflowProspect(prospect); }}
                    >
                      <Workflow className="w-4 h-4" />
                    </button>
                    <button className="text-slate-400" onClick={e => { e.stopPropagation(); toggleExpand(prospect.id); }}>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded: All Estimates */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-3">
                    {prospect.notes && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-sm text-slate-600">
                        <span className="font-semibold text-amber-700">Notes: </span>{prospect.notes}
                      </div>
                    )}

                    {linkedProjects.length > 0 && (
                      <>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Projects</h4>
                        <div className="space-y-2">
                          {linkedProjects.map((project) => (
                            <div key={project.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                              <div>
                                <p className="font-medium text-slate-800 text-sm">{project.name}</p>
                                <p className="text-xs text-slate-400 mt-0.5 capitalize">{project.status?.replace(/_/g, " ") || "planning"}</p>
                              </div>
                              <Link
                                to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estimates</h4>
                    {allClientEstimates.length === 0 ? (
                      syncedPrimaryTotal > 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="font-medium text-slate-800 text-sm">AccuLynx Primary Estimate</p>
                            <p className="text-xs text-slate-400 mt-0.5">Synced from AccuLynx</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400">Total</p>
                            <p className="text-sm font-bold text-slate-800">{fmt(syncedPrimaryTotal)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No estimates linked to this prospect.</p>
                      )
                    ) : (
                      <div className="space-y-2">
                        {allClientEstimates.map((est) => (
                          <div key={est.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-slate-800 text-sm truncate">{est.title}</span>
                                  {est.estimate_number && (
                                    <span className="text-xs text-slate-400">#{est.estimate_number}</span>
                                  )}
                                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", statusColors[est.status] || "bg-slate-100 text-slate-600")}>
                                    {est.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                                  {est.issue_date && (
                                    <span className="text-xs text-slate-400">Issued: {est.issue_date}</span>
                                  )}
                                  {est.expiry_date && (
                                    <span className="text-xs text-slate-400">Expires: {est.expiry_date}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6 flex-shrink-0">
                              <div className="text-right">
                                <p className="text-xs text-slate-400">Subtotal</p>
                                <p className="text-sm font-medium text-slate-700">{fmt(est.subtotal)}</p>
                              </div>
                              {est.tax_amount > 0 && (
                                <div className="text-right">
                                  <p className="text-xs text-slate-400">Tax</p>
                                  <p className="text-sm font-medium text-slate-700">{fmt(est.tax_amount)}</p>
                                </div>
                              )}
                              <div className="text-right">
                                <p className="text-xs text-slate-400">Total</p>
                                <p className="text-sm font-bold text-slate-800">{fmt(est.total)}</p>
                              </div>
                              <Link
                                to={createPageUrl(`EstimateDetail?id=${est.id}`)}
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <Link
                        to={createPageUrl(`ClientDetail?id=${prospect.id}`)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        View Contact Profile →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {workflowProspect && (
        <WorkflowDrawer
          prospect={workflowProspect}
          onClose={() => setWorkflowProspect(null)}
          onUpdated={() => { setWorkflowProspect(null); loadData(); }}
        />
      )}
    </div>
  );
}