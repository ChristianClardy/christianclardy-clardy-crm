import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";
import ClientWorkflowControl from "@/components/clients/ClientWorkflowControl";

const statusStyles = {
  planning:        { label: "Planning",     bg: "#ede6dd", color: "#5a4f48" },
  in_progress:     { label: "In Progress",  bg: "#e8dfc8", color: "#7a5c20" },
  on_hold:         { label: "On Hold",      bg: "#f0dcd8", color: "#8a3a2a" },
  completed:       { label: "Completed",    bg: "#d8e8dc", color: "#2a5a3a" },
  cancelled:       { label: "Cancelled",    bg: "#e8e4e0", color: "#7a6e66" },
};

const typeColors = {
  residential:     "#b5965a",
  commercial:      "#7a8a6a",
  renovation:      "#a07060",
  new_construction:"#6a7a8a",
  infrastructure:  "#8a7a6a",
};

export default function ProjectCard({ project, client }) {
  const status = statusStyles[project.status] || statusStyles.planning;
  const accentColor = typeColors[project.project_type] || typeColors.residential;
  const clientName = client?.name || "";

  return (
    <Link 
      to={createPageUrl(`ProjectDetail?id=${project.id}`)}
      className="block group"
    >
      <div
        className="rounded overflow-hidden transition-all duration-300 group-hover:-translate-y-0.5"
        style={{ backgroundColor: "#fff", border: "1px solid #ddd5c8", boxShadow: "0 1px 4px rgba(61,53,48,0.06)" }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(61,53,48,0.12)"}
        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 4px rgba(61,53,48,0.06)"}
      >
        {/* Color accent bar */}
        <div className="h-1" style={{ backgroundColor: accentColor }} />
        
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4 gap-2">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5965a", letterSpacing: "0.1em" }}>{clientName}</p>
                <ClientWorkflowControl client={client} className="p-0 border-0 bg-transparent hover:bg-transparent" />
              </div>
              <h3 className="font-semibold transition-colors leading-snug" style={{ color: "#3d3530", fontFamily: "'Georgia', serif", fontSize: "0.95rem" }}>
                {project.name}
              </h3>
              {project.address && (
                <p className="text-xs mt-0.5 truncate" style={{ color: "#9a8e86" }}>
                  {project.address}
                </p>
              )}
            </div>
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-sm whitespace-nowrap tracking-wide flex-shrink-0"
              style={{ backgroundColor: status.bg, color: status.color, letterSpacing: "0.04em" }}
            >
              {status.label}
            </span>
          </div>

          {/* Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span style={{ color: "#7a6e66" }}>Progress</span>
              <span className="font-semibold" style={{ color: "#b5965a" }}>{project.percent_complete || 0}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "#ede6dd" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${project.percent_complete || 0}%`, backgroundColor: "#b5965a" }}
              />
            </div>
          </div>

          {/* Meta info */}
          <div className="space-y-1.5">
            {project.start_date && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "#7a6e66" }}>
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#b5965a" }} />
                <span>{moment(project.start_date).format("MMM D")} – {project.end_date ? moment(project.end_date).format("MMM D, YYYY") : "Ongoing"}</span>
              </div>
            )}
            {project.project_manager && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "#7a6e66" }}>
                <User className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#b5965a" }} />
                <span>{project.project_manager}</span>
              </div>
            )}
          </div>

          {/* Contract value */}
          {project.contract_value > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #ede6dd" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "#7a6e66" }}>Contract Value</span>
                <span className="font-semibold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>
                  ${project.contract_value?.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}