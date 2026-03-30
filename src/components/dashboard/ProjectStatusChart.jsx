import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const STATUS_CONFIG = {
  planning:    { label: "Planning",     color: "#94a3b8" },
  in_progress: { label: "In Progress",  color: "#b5965a" },
  on_hold:     { label: "On Hold",      color: "#f59e0b" },
  completed:   { label: "Completed",    color: "#22c55e" },
  cancelled:   { label: "Cancelled",    color: "#ef4444" },
};

export default function ProjectStatusChart({ projects }) {
  const counts = {};
  projects.forEach(p => {
    counts[p.status] = (counts[p.status] || 0) + 1;
  });

  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: STATUS_CONFIG[key]?.label || key,
      value,
      color: STATUS_CONFIG[key]?.color || "#cbd5e1",
    }));

  if (!data.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-base font-semibold mb-4" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Status Breakdown</h2>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="w-full sm:w-44 h-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={46}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [value, name]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-2 w-full">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-slate-600">{d.name}</span>
              </div>
              <span className="font-semibold text-slate-800">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}