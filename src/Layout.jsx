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
  FileText,
  Building2,
  CheckSquare,
  Receipt,
  DollarSign,
  FolderOpen,
  CalendarDays,
  Sun,
  Moon
} from "lucide-react";
import { useState } from "react";
import NotificationBell from "@/components/notifications/NotificationBell";
import CompanyScopeSwitcher from "@/components/company/CompanyScopeSwitcher";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/ThemeContext";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const navigation = [
    { name: "Dashboard", href: createPageUrl("Dashboard"), icon: LayoutDashboard },
    { name: "Sales Dashboard", href: createPageUrl("SalesDashboard"), icon: CheckSquare },
    { name: "Projects", href: createPageUrl("Projects"), icon: FolderKanban },
    { name: "CRM", href: createPageUrl("CRM"), icon: Users },
    { name: "Calendar", href: createPageUrl("Calendar"), icon: CalendarDays },
    { name: "Subcontractors", href: createPageUrl("Subcontractors"), icon: Wrench },
    { name: "Municipalities", href: createPageUrl("Municipalities"), icon: Building2 },
    { name: "Estimates", href: createPageUrl("Estimates"), icon: Receipt },
    { name: "Payments", href: createPageUrl("Payments"), icon: DollarSign },
    { name: "Documents", href: createPageUrl("Documents"), icon: FolderOpen },
    { name: "WIP Report", href: createPageUrl("WIPReport"), icon: FileBarChart2 },
    { name: "Reports", href: createPageUrl("Reports"), icon: FileText },
    { name: "Workspace Items", href: createPageUrl("WorkplaceItems"), icon: Wrench },
    { name: "Company", href: createPageUrl("Company"), icon: Building2 },
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
            <span className="text-sm font-bold" style={{ color: "#f5f0eb", letterSpacing: "0.08em" }}>ConstructIQ</span>
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
      <nav className="flex-1 px-4 py-2 space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded text-sm tracking-wide transition-all duration-200"
            style={isActive(item.href)
              ? { backgroundColor: "var(--brand-gold)", color: "#f5f0eb", fontWeight: 600 }
              : { color: "var(--brand-sidebar-text)", fontWeight: 400 }
            }
            onMouseEnter={e => { if (!isActive(item.href)) { e.currentTarget.style.backgroundColor = "var(--brand-sidebar-hover)"; e.currentTarget.style.color = "#f5f0eb"; }}}
            onMouseLeave={e => { if (!isActive(item.href)) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--brand-sidebar-text)"; }}}
          >
            <item.icon className="w-4 h-4" />
            {item.name}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4" style={{ borderTop: "1px solid var(--brand-sidebar-border)" }}>
        <div className="px-4 py-2 flex items-center justify-between rounded" style={{ backgroundColor: "var(--brand-sidebar-footer)" }}>
          <div>
            <p className="text-xs tracking-widest uppercase" style={{ color: "var(--brand-gold)", letterSpacing: "0.12em" }}>Construction Manager</p>
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
            <span className="font-bold tracking-widest uppercase text-sm" style={{ color: "#f5f0eb" }}>ConstructIQ</span>
          </div>
          <div className="flex items-center gap-2">
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
        <main className="min-h-[calc(100vh-4rem)] lg:min-h-screen" style={{ backgroundColor: "var(--brand-bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
