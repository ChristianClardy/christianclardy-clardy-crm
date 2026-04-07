import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import moment from "moment";
import {
  FileBarChart2,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const formatCurrency = (value) => {
  if (value === undefined || value === null) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export default function WIPReport() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [expandedClients, setExpandedClients] = useState(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projectsData, clientsData] = await Promise.all([
        base44.entities.Project.list("-created_date"),
        base44.entities.Client.list(),
      ]);
      setProjects(projectsData);
      setClients(clientsData);
      // Expand all clients by default
      setExpandedClients(new Set(clientsData.map((c) => c.id)));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const clientMap = useMemo(() => 
    clients.reduce((acc, c) => ({ ...acc, [c.id]: c }), {}), 
    [clients]
  );

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return projects;
    if (statusFilter === "active") {
      return projects.filter((p) => ["planning", "in_progress"].includes(p.status));
    }
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  // Group projects by client
  const projectsByClient = useMemo(() => {
    const grouped = {};
    filteredProjects.forEach((project) => {
      const clientId = project.client_id;
      if (!grouped[clientId]) {
        grouped[clientId] = [];
      }
      grouped[clientId].push(project);
    });
    return grouped;
  }, [filteredProjects]);

  // Calculate WIP metrics for a project
  const calculateProjectWIP = (project) => {
    const contractValue = project.contract_value || 0;
    const costsToDate = project.costs_to_date || 0;
    const percentComplete = project.percent_complete || 0;
    const billedToDate = project.billed_to_date || 0;

    // Earned revenue = contract value * percent complete
    const earnedRevenue = contractValue * (percentComplete / 100);
    
    // Over/Under billing = earned revenue - billed to date
    // Positive = under-billed (asset), Negative = over-billed (liability)
    const overUnderBilling = earnedRevenue - billedToDate;

    // Estimated total cost (using percent complete)
    const estimatedTotalCost = percentComplete > 0 ? (costsToDate / percentComplete) * 100 : costsToDate;
    
    // Projected profit
    const projectedProfit = contractValue - estimatedTotalCost;
    const profitMargin = contractValue > 0 ? (projectedProfit / contractValue) * 100 : 0;

    return {
      contractValue,
      costsToDate,
      percentComplete,
      billedToDate,
      earnedRevenue,
      overUnderBilling,
      estimatedTotalCost,
      projectedProfit,
      profitMargin,
    };
  };

  // Calculate client totals
  const calculateClientTotals = (clientProjects) => {
    return clientProjects.reduce(
      (totals, project) => {
        const wip = calculateProjectWIP(project);
        return {
          contractValue: totals.contractValue + wip.contractValue,
          costsToDate: totals.costsToDate + wip.costsToDate,
          billedToDate: totals.billedToDate + wip.billedToDate,
          earnedRevenue: totals.earnedRevenue + wip.earnedRevenue,
          overUnderBilling: totals.overUnderBilling + wip.overUnderBilling,
          projectedProfit: totals.projectedProfit + wip.projectedProfit,
        };
      },
      { contractValue: 0, costsToDate: 0, billedToDate: 0, earnedRevenue: 0, overUnderBilling: 0, projectedProfit: 0 }
    );
  };

  // Grand totals
  const grandTotals = useMemo(() => {
    return Object.values(projectsByClient).reduce(
      (totals, clientProjects) => {
        const clientTotals = calculateClientTotals(clientProjects);
        return {
          contractValue: totals.contractValue + clientTotals.contractValue,
          costsToDate: totals.costsToDate + clientTotals.costsToDate,
          billedToDate: totals.billedToDate + clientTotals.billedToDate,
          earnedRevenue: totals.earnedRevenue + clientTotals.earnedRevenue,
          overUnderBilling: totals.overUnderBilling + clientTotals.overUnderBilling,
          projectedProfit: totals.projectedProfit + clientTotals.projectedProfit,
          projectCount: totals.projectCount + clientProjects.length,
        };
      },
      { contractValue: 0, costsToDate: 0, billedToDate: 0, earnedRevenue: 0, overUnderBilling: 0, projectedProfit: 0, projectCount: 0 }
    );
  }, [projectsByClient]);

  const toggleClient = (clientId) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

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
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <FileBarChart2 className="w-8 h-8 text-amber-500" />
            WIP Report
          </h1>
          <p className="text-slate-500 mt-1">Work in Progress analysis by client</p>
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm text-slate-500">Total Contract Value</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(grandTotals.contractValue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-slate-500">Earned Revenue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(grandTotals.earnedRevenue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              grandTotals.overUnderBilling >= 0 ? "bg-emerald-100" : "bg-rose-100"
            )}>
              {grandTotals.overUnderBilling >= 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-rose-600" />
              )}
            </div>
            <span className="text-sm text-slate-500">Net Over/Under Billing</span>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            grandTotals.overUnderBilling >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>
            {formatCurrency(Math.abs(grandTotals.overUnderBilling))}
            <span className="text-sm font-normal ml-1">
              {grandTotals.overUnderBilling >= 0 ? "(under)" : "(over)"}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm text-slate-500">Projected Profit</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(grandTotals.projectedProfit)}</p>
        </div>
      </div>

      {/* WIP Table by Client */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[280px]">Client / Project</TableHead>
                <TableHead className="text-right">Contract Value</TableHead>
                <TableHead className="text-right">Costs to Date</TableHead>
                <TableHead className="text-right">% Complete</TableHead>
                <TableHead className="text-right">Earned Revenue</TableHead>
                <TableHead className="text-right">Billed to Date</TableHead>
                <TableHead className="text-right">Over/(Under)</TableHead>
                <TableHead className="text-right">Proj. Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(projectsByClient).map(([clientId, clientProjects]) => {
                const client = clientMap[clientId];
                const clientTotals = calculateClientTotals(clientProjects);
                const isExpanded = expandedClients.has(clientId);

                return (
                  <Collapsible key={clientId} open={isExpanded} asChild>
                    <>
                      {/* Client Row */}
                      <CollapsibleTrigger asChild>
                        <TableRow 
                          className="bg-slate-50 hover:bg-slate-100 cursor-pointer font-medium"
                          onClick={() => toggleClient(clientId)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                              <Building2 className="w-4 h-4 text-amber-500" />
                              {client ? (
                                <Link
                                  to={createPageUrl(`ClientDetail?id=${clientId}`)}
                                  className="hover:text-amber-600"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {client.name}
                                </Link>
                              ) : (
                                <span>Total Active Projects</span>
                              )}
                              <Badge variant="secondary" className="ml-2">
                                {clientProjects.length}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(clientTotals.contractValue)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(clientTotals.costsToDate)}
                          </TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(clientTotals.earnedRevenue)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(clientTotals.billedToDate)}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-semibold",
                            clientTotals.overUnderBilling >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {clientTotals.overUnderBilling >= 0 ? "" : "("}
                            {formatCurrency(Math.abs(clientTotals.overUnderBilling))}
                            {clientTotals.overUnderBilling >= 0 ? "" : ")"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600">
                            {formatCurrency(clientTotals.projectedProfit)}
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>

                      {/* Project Rows */}
                      <CollapsibleContent asChild>
                        <>
                          {clientProjects.map((project) => {
                            const wip = calculateProjectWIP(project);
                            return (
                              <TableRow key={project.id} className="hover:bg-amber-50/50">
                                <TableCell>
                                  <Link 
                                    to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                    className="pl-8 flex items-center gap-2 text-slate-600 hover:text-amber-600"
                                  >
                                    <span>{project.name}</span>
                                    {wip.profitMargin < 10 && wip.percentComplete > 0 && (
                                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    )}
                                  </Link>
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(wip.contractValue)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(wip.costsToDate)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Progress value={wip.percentComplete} className="w-16 h-2" />
                                    <span className="w-10 text-right">{wip.percentComplete}%</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(wip.earnedRevenue)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(wip.billedToDate)}</TableCell>
                                <TableCell className={cn(
                                  "text-right",
                                  wip.overUnderBilling >= 0 ? "text-emerald-600" : "text-rose-600"
                                )}>
                                  {wip.overUnderBilling >= 0 ? "" : "("}
                                  {formatCurrency(Math.abs(wip.overUnderBilling))}
                                  {wip.overUnderBilling >= 0 ? "" : ")"}
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right",
                                  wip.projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                                )}>
                                  {formatCurrency(wip.projectedProfit)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}

              {/* Grand Total Row */}
              {Object.keys(projectsByClient).length > 0 && (
                <TableRow className="bg-slate-900 text-white font-semibold">
                  <TableCell>
                    <span className="pl-6">GRAND TOTAL ({grandTotals.projectCount} projects)</span>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(grandTotals.contractValue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(grandTotals.costsToDate)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">{formatCurrency(grandTotals.earnedRevenue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(grandTotals.billedToDate)}</TableCell>
                  <TableCell className={cn(
                    "text-right",
                    grandTotals.overUnderBilling >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {grandTotals.overUnderBilling >= 0 ? "" : "("}
                    {formatCurrency(Math.abs(grandTotals.overUnderBilling))}
                    {grandTotals.overUnderBilling >= 0 ? "" : ")"}
                  </TableCell>
                  <TableCell className="text-right text-emerald-400">
                    {formatCurrency(grandTotals.projectedProfit)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {Object.keys(projectsByClient).length === 0 && (
          <div className="p-12 text-center">
            <FileBarChart2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="font-semibold text-slate-900 mb-2">No projects to display</h3>
            <p className="text-slate-500">Create some projects to see your WIP report</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-3">Understanding the WIP Report</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-700">Earned Revenue</p>
            <p className="text-slate-500">Contract Value × % Complete</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Over/(Under) Billing</p>
            <p className="text-slate-500">
              <span className="text-emerald-600">Under-billed (positive)</span> = revenue earned but not yet billed. 
              <span className="text-rose-600 ml-2">Over-billed (negative)</span> = billed more than earned.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Projected Profit</p>
            <p className="text-slate-500">Contract Value - Estimated Total Cost</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">⚠️ Warning Flag</p>
            <p className="text-slate-500">Projects with profit margin below 10%</p>
          </div>
        </div>
      </div>
    </div>
  );
}