import { Navigate } from "react-router-dom";

// Replaced by the Builder Portal (src/pages/Builder.jsx); kept so old links
// and bookmarks still land somewhere useful.
export default function ProjectManagerDashboard() {
  return <Navigate to="/Builder" replace />;
}
