import { useMemo } from "react";
import moment from "moment";
import { Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const taskStatusColors = {
  not_started: { bg: "bg-slate-100", text: "text-slate-600", icon: Clock },
  in_progress: { bg: "bg-amber-100", text: "text-amber-600", icon: AlertCircle },
  completed: { bg: "bg-emerald-100", text: "text-emerald-600", icon: CheckCircle2 },
  blocked: { bg: "bg-rose-100", text: "text-rose-600", icon: AlertCircle },
};

export default function ProjectTimeline({ project, tasks = [] }) {
  const timelineData = useMemo(() => {
    if (!project.start_date) return null;

    const startDate = moment(project.start_date);
    const endDate = project.end_date ? moment(project.end_date) : startDate.clone().add(30, 'days');
    const totalDays = endDate.diff(startDate, 'days') + 1;
    const today = moment();

    // Get task milestones
    const milestones = tasks
      .filter(t => t.end_date)
      .map(task => ({
        ...task,
        dayOffset: moment(task.end_date).diff(startDate, 'days'),
        isCompleted: task.status === 'completed',
      }))
      .filter(m => m.dayOffset >= 0 && m.dayOffset <= totalDays);

    // Calculate current progress (days elapsed)
    const daysElapsed = Math.max(0, Math.min(totalDays, today.diff(startDate, 'days')));
    const progressPercent = (daysElapsed / totalDays) * 100;

    return {
      startDate,
      endDate,
      today,
      totalDays,
      daysElapsed,
      progressPercent,
      milestones,
      isOverdue: today.isAfter(endDate),
      daysRemaining: Math.max(0, endDate.diff(today, 'days')),
    };
  }, [project, tasks]);

  if (!timelineData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">No project timeline data available</p>
      </div>
    );
  }

  const { startDate, endDate, today, totalDays, daysElapsed, progressPercent, milestones, isOverdue, daysRemaining } = timelineData;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Start Date</p>
          <p className="text-lg font-semibold text-slate-900">{startDate.format('MMM D, YYYY')}</p>
          <p className="text-xs text-slate-400 mt-1">{startDate.fromNow()}</p>
        </div>
        <div className={cn(
          "rounded-2xl border p-4",
          isOverdue
            ? "bg-rose-50 border-rose-200"
            : "bg-white border-slate-200"
        )}>
          <p className="text-xs uppercase tracking-wider mb-1 font-medium" style={{ color: isOverdue ? "#dc2626" : "#64748b" }}>
            {isOverdue ? "Overdue" : "End Date"}
          </p>
          <p className="text-lg font-semibold" style={{ color: isOverdue ? "#dc2626" : "#0f172a" }}>
            {endDate.format('MMM D, YYYY')}
          </p>
          <p className="text-xs mt-1" style={{ color: isOverdue ? "#991b1b" : "#94a3b8" }}>
            {isOverdue ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days remaining`}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Progress</p>
          <p className="text-lg font-semibold text-slate-900">{project.percent_complete || 0}%</p>
          <p className="text-xs text-slate-400 mt-1">{daysElapsed} of {totalDays} days</p>
        </div>
      </div>

      {/* Timeline Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4 text-sm">Project Timeline</h3>
        
        {/* Month labels */}
        <div className="mb-2 flex justify-between text-xs text-slate-500 font-medium px-1">
          <span>{startDate.format('MMM YYYY')}</span>
          <span>{endDate.format('MMM YYYY')}</span>
        </div>

        {/* Main timeline bar */}
        <div className="relative h-20 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
          {/* Timeline background gradient */}
          <div className="absolute inset-0 flex">
            {/* Completed section */}
            <div
              className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Remaining section */}
            <div className="flex-1 bg-gradient-to-r from-slate-100 to-slate-50" />
          </div>

          {/* Start marker */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-900" />

          {/* End marker */}
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-slate-900" />

          {/* Today marker */}
          {!isOverdue && today.isBetween(startDate, endDate) && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
              style={{ left: `${progressPercent}%` }}
            >
              <div className="absolute -top-6 -left-4 text-xs font-medium text-amber-600 whitespace-nowrap">
                Today
              </div>
            </div>
          )}

          {/* Labels */}
          <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-medium text-slate-700">
            <span>{startDate.format('MMM D')}</span>
            <span>{endDate.format('MMM D')}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-emerald-400 to-emerald-500" />
            <span className="text-slate-600">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-300" />
            <span className="text-slate-600">Remaining</span>
          </div>
        </div>
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4 text-sm">Key Milestones ({milestones.length})</h3>
          <div className="space-y-3">
            {milestones.map((milestone) => {
              const StatusIcon = taskStatusColors[milestone.status].icon;
              return (
                <div key={milestone.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  {/* Timeline position */}
                  <div className="w-16 flex-shrink-0">
                    <div className="relative h-12 flex items-center">
                      <div className="w-full h-1 bg-slate-200 rounded-full" />
                      <div
                        className="absolute w-3 h-3 bg-amber-500 border-2 border-white rounded-full shadow-sm"
                        style={{
                          left: `${(milestone.dayOffset / timelineData.totalDays) * 100}%`,
                          transform: 'translateX(-50%)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Milestone info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <StatusIcon className={cn(
                        "w-4 h-4 flex-shrink-0 mt-0.5",
                        taskStatusColors[milestone.status].text
                      )} />
                      <p className={cn(
                        "font-medium",
                        milestone.isCompleted ? "text-slate-500 line-through" : "text-slate-900"
                      )}>
                        {milestone.name}
                      </p>
                    </div>
                    {milestone.description && (
                      <p className="text-sm text-slate-500 ml-6">{milestone.description}</p>
                    )}
                    <div className="flex gap-3 mt-2 ml-6 text-xs text-slate-400">
                      <span>Due: {moment(milestone.end_date).format('MMM D')}</span>
                      {milestone.assigned_to && <span>•</span>}
                      {milestone.assigned_to && <span>Assigned to: {milestone.assigned_to}</span>}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 whitespace-nowrap",
                    taskStatusColors[milestone.status].bg,
                    taskStatusColors[milestone.status].text
                  )}>
                    {milestone.status.replace('_', ' ').charAt(0).toUpperCase() + milestone.status.slice(1).replace('_', ' ')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No milestones message */}
      {milestones.length === 0 && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 text-sm">No task milestones with due dates yet. Add tasks with end dates to see them on the timeline.</p>
        </div>
      )}
    </div>
  );
}