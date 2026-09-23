import { HardHat, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import InstallAppButton from "@/components/app/InstallAppButton";

// Minimal shell for subcontractor logins: no CRM sidebar, just the portal.
export default function SubPortalLayout({ subcontractorName, children }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--brand-bg)", fontFamily: "'Georgia', serif" }}>
      <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4" style={{ backgroundColor: "#3d3530", borderBottom: "1px solid #5a4f48" }}>
        <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: "#b5965a" }}>
          <HardHat className="w-5 h-5" style={{ color: "#f5f0eb" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-wide truncate" style={{ color: "#f5f0eb" }}>Builder Portal</p>
          <p className="text-xs truncate" style={{ color: "#c9ac76" }}>{subcontractorName || user?.email}</p>
        </div>
        <InstallAppButton label="" className="p-2 rounded" style={{ color: "#c9ac76" }} />
        <button onClick={() => logout()} className="p-2 rounded flex items-center gap-1 text-xs" style={{ color: "#c9ac76" }} title="Sign out">
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
