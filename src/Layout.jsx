import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileBarChart2,
  HardHat,
  Menu,
  X,
  Wrench,
  Package,
  FileText,
  Building2,
  CheckSquare,
  Receipt,
  DollarSign,
  FolderOpen,
  CalendarDays,
  Sun,
  Moon,
  ShieldCheck,
  BarChart3,
  Kanban,
  Phone,
  Activity,
  ChevronDown,
  ClipboardList,
  Lock,
  Eye,
} from "lucide-react";
import { useState } from "react";
import NotificationBell from "@/components/notifications/NotificationBell";
import OverdueAppointmentGate from "@/components/scheduling/OverdueAppointmentGate";
import CompanyScopeSwitcher from "@/components/company/CompanyScopeSwitcher";
import InstallAppButton from "@/components/app/InstallAppButton";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/ThemeContext";
import { useTenant } from "@/lib/TenantContext";
import { useRolePermissions, exitPreview } from "@/lib/useRolePermissions";
import { ROLES } from "@/lib/permissions";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { organization } = useTenant();

  const crmPages = new Set(["CRM", "Pipeline", "CRMContacts", "CRMCompanies", "CRMActivities", "CRMDashboard"]);
  const [crmOpen, setCrmOpen] = useState(() => crmPages.has(currentPageName));

  // Every link shows for everyone; one whose module the role doesn't have
  // (Settings → Roles & Permissions, src/lib/permissions.js) is dimmed with a
  // lock and opens the "no access" page (ModuleGate).
  const { can, loading: permsLoading, previewing, readOnly } = useRolePermissions();
  const previewLabel = previewing ? ROLES.find((r) => r.key === previewing)?.label || previewing : null;
  const locked = (item) => !!item.module && !permsLoading && !can(item.module);
  const LockMark = ({ item }) => (locked(item) ? <Lock className="w-3.5 h-3.5 ml-auto opacity-70" aria-label="No access" /> : null);

  const navigation = [
    { name: "Dashboard", href: createPageUrl("Dashboard"), icon: LayoutDashboard, module: "dashboard" },
    { name: "Sales Dashboard", href: createPageUrl("SalesDashboard"), icon: CheckSquare, module: "sales_dashboard" },
    { name: "Projects", href: createPageUrl("Projects"), icon: FolderKanban, module: "projects" },
    { name: "Builder Portal", href: createPageUrl("Builder"), icon: ClipboardList, module: "builder_portal" },
    { name: "Subcontractor Portal", href: createPageUrl("BuilderPortal"), icon: HardHat, module: "subcontractors" },
    {
      name: "CRM",
      href: createPageUrl("CRM"),
      icon: Users,
      module: "crm",
      children: [
        { name: "Pipeline", href: createPageUrl("Pipeline"), icon: Kanban },
        { name: "Contacts", href: createPageUrl("CRMContacts"), icon: Phone },
        { name: "Companies", href: createPageUrl("CRMCompanies"), icon: Building2 },
        { name: "Activities", href: createPageUrl("CRMActivities"), icon: Activity },
        { name: "CRM Dashboard", href: createPageUrl("CRMDashboard"), icon: BarChart3 },
      ],
    },
    { name: "Calendar", href: createPageUrl("Calendar"), icon: CalendarDays, module: "calendar" },
    { name: "Municipalities", href: createPageUrl("Municipalities"), icon: Building2, module: "municipalities" },
    { name: "Estimates", href: createPageUrl("Estimates"), icon: Receipt, module: "estimates" },
    { name: "Payments", href: createPageUrl("Payments"), icon: DollarSign, module: "payments" },
    { name: "Finance", href: createPageUrl("FinanceDashboard"), icon: FileBarChart2, module: "finance" },
    { name: "Documents", href: createPageUrl("Documents"), icon: FolderOpen, module: "documents" },
    { name: "Reports", href: createPageUrl("Reports"), icon: FileText, module: "reports" },
    { name: "Material Library", href: createPageUrl("MaterialLibrary"), icon: Package },
    { name: "Workspace Items", href: createPageUrl("WorkplaceItems"), icon: Wrench, module: "workspace_items" },
    { name: "Settings", href: createPageUrl("Settings"), icon: ShieldCheck, module: "settings" },
  ];

  const isActive = (href) => {
    const pageName = href.split('/').pop();
    return currentPageName === pageName || location.pathname === href;
  };

  const SidebarContent = ({ showCloseButton = false }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-20 flex items-center px-6" style={{ borderBottom: "1px solid var(--brand-sidebar-border)" }}>
        <div className="flex flex-col items-start gap-0.5 flex-1">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: "var(--brand-gold)" }}>
              <HardHat className="w-4 h-4" style={{ color: "#f5f0eb" }} />
            </div>
            <div>
              <span className="text-sm font-bold" style={{ color: "#f5f0eb", letterSpacing: "0.08em" }}>Clardy.io</span>
              {organization?.name && (
                <p className="text-xs truncate max-w-[140px]" style={{ color: "var(--brand-gold-light)", opacity: 0.75 }}>{organization.name}</p>
              )}
            </div>
          </div>
        </div>
        {showCloseButton && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden p-1.5 rounded"
            style={{ color: "var(--brand-gold-light)" }}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <CompanyScopeSwitcher />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {navigation.map((item) => {
          if (item.children) {
            const groupActive = crmPages.has(currentPageName);
            return (
              <div key={item.name}>
                <div className="flex items-center">
                  <Link
                    to={item.href}
                    state={{ picked: true }}
                    onClick={() => setSidebarOpen(false)}
                    className={cn("flex flex-1 items-center gap-3 px-4 py-3 rounded-l text-sm tracking-wide transition-all duration-200", locked(item) && "opacity-50")}
                    style={isActive(item.href)
                      ? { backgroundColor: "var(--brand-gold)", color: "#f5f0eb", fontWeight: 600 }
                      : groupActive
                        ? { color: "#f5f0eb", fontWeight: 500 }
                        : { color: "var(--brand-sidebar-text)", fontWeight: 400 }
                    }
                    onMouseEnter={e => { if (!isActive(item.href)) { e.currentTarget.style.backgroundColor = "var(--brand-sidebar-hover)"; e.currentTarget.style.color = "#f5f0eb"; }}}
                    onMouseLeave={e => { if (!isActive(item.href)) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = groupActive ? "#f5f0eb" : "var(--brand-sidebar-text)"; }}}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                    <LockMark item={item} />
                  </Link>
                  <button
                    onClick={() => setCrmOpen(o => !o)}
                    className="px-2 py-3 rounded-r text-sm transition-all duration-200"
                    style={{ color: groupActive ? "#f5f0eb" : "var(--brand-sidebar-text)" }}
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", crmOpen ? "rotate-0" : "-rotate-90")} />
                  </button>
                </div>
                {crmOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-3" style={{ borderColor: "var(--brand-sidebar-border)" }}>
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        to={child.href}
                        state={{ picked: true }}
                        onClick={() => setSidebarOpen(false)}
                        className={cn("flex items-center gap-3 px-3 py-2 rounded text-sm tracking-wide transition-all duration-200", locked(item) && "opacity-50")}
                        style={isActive(child.href)
                          ? { backgroundColor: "var(--brand-gold)", color: "#f5f0eb", fontWeight: 600 }
                          : { color: "var(--brand-sidebar-text)", fontWeight: 400 }
                        }
                        onMouseEnter={e => { if (!isActive(child.href)) { e.currentTarget.style.backgroundColor = "var(--brand-sidebar-hover)"; e.currentTarget.style.color = "#f5f0eb"; }}}
                        onMouseLeave={e => { if (!isActive(child.href)) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--brand-sidebar-text)"; }}}
                      >
                        <child.icon className="w-3.5 h-3.5" />
                        {child.name}
                        <LockMark item={item} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.name}
              to={item.href}
              state={{ picked: true }}
              onClick={() => setSidebarOpen(false)}
              className={cn("flex items-center gap-3 px-4 py-3 rounded text-sm tracking-wide transition-all duration-200", locked(item) && "opacity-50")}
              style={isActive(item.href)
                ? { backgroundColor: "var(--brand-gold)", color: "#f5f0eb", fontWeight: 600 }
                : { color: "var(--brand-sidebar-text)", fontWeight: 400 }
              }
              onMouseEnter={e => { if (!isActive(item.href)) { e.currentTarget.style.backgroundColor = "var(--brand-sidebar-hover)"; e.currentTarget.style.color = "#f5f0eb"; }}}
              onMouseLeave={e => { if (!isActive(item.href)) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--brand-sidebar-text)"; }}}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
              <LockMark item={item} />
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4" style={{ borderTop: "1px solid var(--brand-sidebar-border)" }}>
        <InstallAppButton
          className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded text-xs tracking-wide transition-colors"
          style={{ border: "1px solid var(--brand-sidebar-border)", color: "var(--brand-gold-light)" }}
        />
        <div className="px-4 py-2 flex items-center justify-between rounded" style={{ backgroundColor: "var(--brand-sidebar-footer)" }}>
          <div>
            <p className="text-xs tracking-widest uppercase" style={{ color: "var(--brand-gold)", letterSpacing: "0.12em" }}>Clardy.io</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-charcoal-light)" }}>v1.0</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded transition-colors duration-200"
              style={{ color: "var(--brand-gold-light)" }}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--brand-bg)", fontFamily: "'Georgia', serif" }}>
      {/* Rendered once per Layout mount (not inside SidebarContent, which
          renders twice for the mobile/desktop asides) so it never shows the
          blocking modal more than once. */}
      <OverdueAppointmentGate />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: "var(--brand-overlay)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 transform transition-transform duration-300 ease-out lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ backgroundColor: "var(--brand-sidebar)", borderRight: "1px solid var(--brand-sidebar-border)" }}
      >
        <SidebarContent showCloseButton />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:block fixed top-0 left-0 z-50 h-full w-64"
        style={{ backgroundColor: "var(--brand-sidebar)", borderRight: "1px solid var(--brand-sidebar-border)" }}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 h-16 flex items-center px-4" style={{ backgroundColor: "var(--brand-sidebar)", borderBottom: "1px solid var(--brand-sidebar-border)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded"
            style={{ color: "var(--brand-sidebar-text)" }}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 ml-4 flex-1">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ backgroundColor: "var(--brand-gold)" }}>
              <HardHat className="w-4 h-4" style={{ color: "#f5f0eb" }} />
            </div>
            <span className="font-bold tracking-widest uppercase text-sm" style={{ color: "#f5f0eb" }}>Clardy.io</span>
          </div>
          <div className="flex items-center gap-2">
            <InstallAppButton label="" className="p-1.5 rounded" style={{ color: "var(--brand-gold-light)" }} />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded"
              style={{ color: "var(--brand-gold-light)" }}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)] lg:min-h-screen overflow-x-hidden" style={{ backgroundColor: "var(--brand-bg)" }}>
          {previewLabel && (
            <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-white shadow">
              <span><strong>Previewing as {previewLabel}.</strong> The sidebar, pages and project tabs are what this role sees. {readOnly ? "Saving is blocked in this tab, like it is for them." : "Data is still yours."}</span>
              <button type="button" onClick={exitPreview} className="rounded-md bg-white/20 px-3 py-1 font-semibold hover:bg-white/30">Exit preview</button>
            </div>
          )}
          {readOnly && !previewLabel && (
            <div className="sticky top-0 z-40 flex items-center gap-2 bg-indigo-600 px-4 py-2 text-sm text-white shadow">
              <Eye className="w-4 h-4 shrink-0" />
              <span><strong>View-only access.</strong> You can see everything your role allows, but changes won't be saved.</span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
