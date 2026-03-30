import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";

export default function ProjectManagerDashboard() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [selections, setSelections] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = () => {
      Promise.all([
        base44.auth.me(),
        base44.entities.Project.list("-updated_date", 2000),
        base44.entities.Task.list("-due_date", 2000),
        base44.entities.ChangeOrder.list("-updated_date", 2000),
        base44.entities.SelectionAllowance.list("-updated_date", 2000),
      ]).then(([user, projectData, taskData, changeOrderData, selectionData]) => {
        setMe(user);
        setProjects(projectData);
        setTasks(taskData);
        setChangeOrders(changeOrderData);
        setSelections(selectionData);
        setLoading(false);
      });
    };

    loadData();
    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubTasks = base44.entities.Task.subscribe(() => loadData());
    const unsubChangeOrders = base44.entities.ChangeOrder.subscribe(() => loadData());
    const unsubSelections = base44.entities.SelectionAllowance.subscribe(() => loadData());

    return () => {
      unsubProjects();
      unsubTasks();
      unsubChangeOrders();
      unsubSelections();
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const myJobs = projects.filter((project) => [project.project_manager, project.superintendent].includes(me?.full_name));
  const relevantProjects = myJobs.length > 0 ? myJobs : projects;
  const dueToday = tasks.filter((task) => task.due_date === today && task.assigned_to === me?.full_name);
  const overdue = tasks.filter((task) => task.due_date && task.due_date < today && task.status !== "complete" && task.status !== "completed");
  const upcomingMilestones = relevantProjects.filter((project) => project.estimated_completion_date && project.estimated_completion_date >= today).slice(0, 8);
  const openChangeOrders = changeOrders.filter((item) => ["Draft", "Submitted"].includes(item.approval_status));
  const pendingSelections = selections.filter((item) => item.status !== "Installed");

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Project Manager Dashboard</h1>
        <p className="mt-1 text-slate-500">Active jobs, due tasks, change orders, and pending selections.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="My Active Jobs" value={relevantProjects.length} />
        <MetricCard label="Tasks Due Today" value={dueToday.length} accent="text-amber-700" />
        <MetricCard label="Overdue Tasks" value={overdue.length} accent="text-rose-700" />
        <MetricCard label="Open Change Orders" value={openChangeOrders.length} />
        <MetricCard label="Pending Selections" value={pendingSelections.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming Milestones</h2>
          <div className="mt-4 space-y-2">
            {upcomingMilestones.map((project) => (
              <div key={project.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{project.name}</p>
                <p className="text-slate-500">Estimated Completion: {project.estimated_completion_date}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Assigned Tasks</h2>
          <div className="mt-4 space-y-2">
            {tasks.filter((task) => task.assigned_to === me?.full_name).slice(0, 10).map((task) => (
              <div key={task.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{task.name}</p>
                <p className="text-slate-500">Due {task.due_date || "TBD"} · {task.status}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}