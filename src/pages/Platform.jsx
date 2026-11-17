import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/lib/TenantContext";
import { tenantDemo } from "@/lib/tenantPreview";
import { ShieldOff } from "lucide-react";

function StatusPill({ status }) {
  const tone = {
    comped: "bg-emerald-100 text-emerald-800",
    active: "bg-emerald-100 text-emerald-800",
    trialing: "bg-amber-100 text-amber-800",
    past_due: "bg-rose-100 text-rose-800",
    canceled: "bg-slate-200 text-slate-600",
  }[status] || "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{status || "—"}</span>;
}

export default function Platform() {
  const demo = tenantDemo();
  const { isPlatformAdmin, loading } = useTenant();
  const allowed = demo ? true : isPlatformAdmin;
  const [rows, setRows] = useState(demo?.directory || []);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo || !allowed) return;
    supabase.rpc("platform_tenant_directory").then(({ data, error: err }) => {
      if (err) setError(err.message);
      else setRows(data || []);
    });
  }, [allowed, demo]);

  if (!demo && loading) {
    return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShieldOff className="mx-auto h-8 w-8 text-slate-300" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Platform operators only</h1>
        <p className="mt-1 text-sm text-slate-500">This page lists workspaces, plans, and status. It does not open another company's jobs or payments.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Clardy.io</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Workspaces</h1>
      <p className="mt-1 text-sm text-slate-500">Every subscribing company. Plans and status only.</p>
      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Workspace</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">People</th>
              <th className="px-4 py-3 font-semibold">Modules</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.organization_id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-400">{row.slug}</p>
                </td>
                <td className="px-4 py-3 capitalize text-slate-700">{row.plan_key || "—"}</td>
                <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                <td className="px-4 py-3 text-slate-700">{row.member_count}</td>
                <td className="px-4 py-3 text-slate-700">{row.enabled_modules}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No workspaces yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
