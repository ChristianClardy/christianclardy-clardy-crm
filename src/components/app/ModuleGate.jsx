import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { PAGE_MODULE, LANDING_ORDER } from "@/lib/permissions";
import { PAGE_TENANT_MODULE } from "@/lib/tenantCatalog";
import { useTenant } from "@/lib/TenantContext";
import { createPageUrl } from "@/utils";

// Wraps every staff page (App.jsx LayoutWrapper): a page whose module the
// person's role doesn't have (Settings → Roles & Permissions) isn't shown.
// Their start page sends them on to the first page they can open, unless
// they picked it from the sidebar (where locked pages still show).
export default function ModuleGate({ page, children }) {
  const { can, loading } = useRolePermissions();
  const { moduleEnabled, subscription } = useTenant();
  const location = useLocation();
  const tenantModule = PAGE_TENANT_MODULE[page];
  if (tenantModule && !moduleEnabled(tenantModule)) {
    const lapsed = subscription && !["trialing", "active", "comped"].includes(subscription.status);
    return (
      <div className="max-w-md mx-auto p-10 text-center space-y-3">
        <ShieldOff className="w-8 h-8 mx-auto text-slate-300" />
        <h1 className="text-lg font-semibold text-slate-900">{lapsed ? "This workspace's subscription is paused" : "This module is turned off"}</h1>
        <p className="text-sm text-slate-500">{lapsed ? "An admin can update the plan in Settings → Billing." : "An admin can turn it on in Settings → Workspace."}</p>
        <Link to={lapsed ? "/Settings?tab=billing" : "/Settings?tab=workspace"} className="inline-block text-sm font-medium text-amber-700 hover:underline">Open settings</Link>
      </div>
    );
  }
  const module = PAGE_MODULE[page];
  if (!module) return children;
  if (loading) {
    return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }
  if (can(module)) return children;

  const landing = LANDING_ORDER.find((p) => !PAGE_MODULE[p] || can(PAGE_MODULE[p]));
  if (page === "Dashboard" && !location.state?.picked && landing && landing !== "Dashboard") return <Navigate to={createPageUrl(landing)} replace />;
  return (
    <div className="max-w-md mx-auto p-10 text-center space-y-3">
      <ShieldOff className="w-8 h-8 mx-auto text-slate-300" />
      <h1 className="text-lg font-semibold text-slate-900">You don't have access to this page</h1>
      <p className="text-sm text-slate-500">Your role doesn't include it. An admin can change that in Settings → Roles &amp; Permissions.</p>
      {landing && <a href={createPageUrl(landing)} className="inline-block text-sm font-medium text-amber-700 hover:underline">Go to {landing === "MyTodos" ? "My To-dos" : landing}</a>}
    </div>
  );
}
