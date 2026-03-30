import { cn } from "@/lib/utils";

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp, className }) {
  return (
    <div
      className={cn("rounded p-6 transition-all duration-300", className)}
      style={{ backgroundColor: "#fff", border: "1px solid #ddd5c8", boxShadow: "0 1px 4px rgba(61,53,48,0.06)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase" style={{ color: "#7a6e66", letterSpacing: "0.12em" }}>{title}</p>
          <p className="text-3xl font-bold mt-2 tracking-tight" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>{value}</p>
          {subtitle && (
            <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>{subtitle}</p>
          )}
          {trend && (
            <p className={cn("text-sm mt-2 font-medium")} style={{ color: trendUp ? "#4a7c5c" : "#9b3a3a" }}>
              {trendUp ? "↑" : "↓"} {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-11 h-11 rounded flex items-center justify-center" style={{ backgroundColor: "#f5f0eb", border: "1px solid #ddd5c8" }}>
            <Icon className="w-5 h-5" style={{ color: "#b5965a" }} />
          </div>
        )}
      </div>
    </div>
  );
}