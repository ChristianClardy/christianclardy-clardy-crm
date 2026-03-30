import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";

export default function OperationsDashboard() {
  const [projects, setProjects] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = () => {
      Promise.all([
        base44.entities.Project.list("-updated_date", 2000),
        base44.entities.SiteVisit.list("-scheduled_date", 2000),
      ]).then(([projectData, visitData]) => {
        setProjects(projectData);
        setVisits(visitData);
        setLoading(false);
      });
    };

    loadData();
    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubVisits = base44.entities.SiteVisit.subscribe(() => loadData());

    return () => {
      unsubProjects();
      unsubVisits();
    };
  }, []);

  const jobsByStatus = useMemo(() => projects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, {}), [projects]);

  const awaitingPermit = projects.filter((project) => ["Needed", "Submitted", "Delayed"].includes(project.permit_status)).length;
  const waitingMaterials = projects.filter((project) => ["Not Ordered", "Partially Ordered", "Delayed"].includes(project.material_status)).length;
  const activeJobs = projects.filter((project) => ["in_progress", "scheduling", "ready_to_start", "pre_construction"].includes(project.status)).length;
  const punchListJobs = projects.filter((project) => project.status === "punch_list").length;
  const delayedJobs = projects.filter((project) => project.schedule_status === "Delayed" || project.permit_status === "Delayed" || project.material_status === "Delayed").length;
  const upcomingVisits = visits.filter((visit) => (visit.scheduled_date || "") >= new Date().toISOString().slice(0, 10)).slice(0, 8);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Operations Dashboard</h1>
        <p className="mt-1 text-slate-500">Production visibility across permits, materials, visits, and active jobs.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Jobs Awaiting Permit" value={awaitingPermit} />
        <MetricCard label="Jobs Waiting on Materials" value={waitingMaterials} />
        <MetricCard label="Active Jobs" value={activeJobs} accent="text-emerald-700" />
        <MetricCard label="Punch List Jobs" value={punchListJobs} accent="text-amber-700" />
        <MetricCard label="Delayed Jobs" value={delayedJobs} accent="text-rose-700" />
        <MetricCard label="Upcoming Site Visits" value={upcomingVisits.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Jobs by Status</h2>
          <div className="mt-4 space-y-2">
            {Object.entries(jobsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-600">{status}</span>
                <span className="font-semibold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming Site Visits</h2>
          <div className="mt-4 space-y-2">
            {upcomingVisits.map((visit) => (
              <div key={visit.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{visit.visit_type}</p>
                <p className="text-slate-500">{visit.scheduled_date || "Unscheduled"} · {visit.assigned_to || "Unassigned"}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}