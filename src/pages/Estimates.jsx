import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Plus, Search, FileText, Send, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  draft:    { label: "Draft",    className: "bg-slate-100 text-slate-600",   icon: Clock },
  sent:     { label: "Sent",     className: "bg-blue-100 text-blue-700",     icon: Send },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-700",    icon: XCircle },
  revised:  { label: "Revised",  className: "bg-amber-100 text-amber-700",  icon: RefreshCw },
};

export default function Estimates() {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [estData, clientData] = await Promise.all([
      base44.entities.Estimate.list("-created_date"),
      base44.entities.Client.list(),
    ]);
    setEstimates(estData);
    setClients(clientData);
    setLoading(false);
  };

  const clientMap = clients.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});

  const filtered = estimates.filter(e =>
    e.title?.toLowerCase().includes(search.toLowerCase()) ||
    clientMap[e.client_id]?.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.estimate_number?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Estimates</h1>
          <p className="text-slate-500 mt-1">{estimates.length} total estimates</p>
        </div>
        <div className="flex flex-wrap gap-2">
<Button
            onClick={() => navigate(createPageUrl("EstimateDetail?new=true"))}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Estimate
          </Button>
        </div>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search estimates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-white border-slate-200 rounded-xl h-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="font-semibold text-slate-900 mb-1">No estimates yet</h3>
          <p className="text-slate-500 text-sm mb-6">Create your first estimate to send to a client.</p>
          <Button onClick={() => navigate(createPageUrl("EstimateDetail?new=true"))} className="bg-gradient-to-r from-amber-500 to-orange-500">
            <Plus className="w-4 h-4 mr-2" /> New Estimate
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left">Estimate #</th>
                <th className="px-5 py-3 text-left">Title</th>
                <th className="px-5 py-3 text-left">Client</th>
                <th className="px-5 py-3 text-left">Issue Date</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(est => {
                const st = STATUS_STYLES[est.status] || STATUS_STYLES.draft;
                const Icon = st.icon;
                return (
                  <tr
                    key={est.id}
                    className="border-b border-slate-100 hover:bg-amber-50/40 cursor-pointer transition-colors"
                    onClick={() => navigate(createPageUrl(`EstimateDetail?id=${est.id}`))}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{est.estimate_number || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{est.title}</span>
                        {est.acculynx_estimate_id && <Badge variant="outline" className="text-[10px]">AccuLynx</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{clientMap[est.client_id]?.name || "—"}</td>
                    <td className="px-5 py-3 text-slate-500">{est.issue_date || "—"}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">
                      ${Number(est.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full", st.className)}>
                        <Icon className="w-3 h-3" /> {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}