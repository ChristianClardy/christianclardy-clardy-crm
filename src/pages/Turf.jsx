import { useEffect, useState } from "react";
import { fetchMyCompanyAccess } from "@/lib/companyAccess";
import { canSeeTurf, DEFAULT_SETTINGS, DISTRIBUTION_MODULE, INSTALL_MODULE, TURF_COMPANY_ID } from "@/lib/turf/constants";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/lib/TenantContext";
import { applyCustomer, applyJob, applyOrder, applyPayment, applyProduct, applyPurchase, applySettings, removePurchase } from "@/lib/turf/model";
import { isMissingTurfSchema, loadTurf, persistSchedulePatch, recordPayment, saveCustomer, saveJob, saveOrder, saveProduct, savePurchase, deletePurchase, saveSettings } from "@/lib/turf/queries";
import { applySchedulePatch } from "@/lib/turf/schedule";
import { useRolePermissions } from "@/lib/useRolePermissions";
import TurfWorkspace from "@/components/turf/TurfWorkspace";

export default function Turf() {
  const { readOnly, loading: roleLoading } = useRolePermissions();
  const tenant = useTenant();
  const moduleEnabled = typeof tenant.moduleEnabled === "function" ? tenant.moduleEnabled : () => true;
  const modules = { install: moduleEnabled(INSTALL_MODULE), distribution: moduleEnabled(DISTRIBUTION_MODULE) };
  const [access, setAccess] = useState(undefined);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = async () => {
    const data = await loadTurf();
    setModel({ ...data, settings: data.settings || { ...DEFAULT_SETTINGS } });
  };

  useEffect(() => {
    let live = true;
    (async () => {
      const [mine, company] = await Promise.all([
        fetchMyCompanyAccess(),
        supabase.from("company_profiles").select("id").eq("id", TURF_COMPANY_ID).maybeSingle(),
      ]);
      if (!live) return;
      const visible = !!company.data;
      setAccess(visible
        ? { isOwner: !!mine?.isOwner, companyIds: Array.from(new Set([...(mine?.companyIds || []), TURF_COMPANY_ID])) }
        : { isOwner: false, companyIds: [] });
      if (!visible) return;
      try {
        const data = await loadTurf();
        if (!live) return;
        setModel({ ...data, settings: data.settings || { ...DEFAULT_SETTINGS } });
      } catch (err) {
        if (!live) return;
        if (isMissingTurfSchema(err)) setPending(true);
        else setError(err?.message || "Could not load Turf'n Texas.");
      }
    })();
    return () => { live = false; };
  }, []);

  if (access === undefined || roleLoading) return <Spinner />;
  if (!canSeeTurf(access)) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Turf&apos;n Texas is not on your account</h1>
        <p className="mt-2 text-sm text-slate-500">Only people assigned to Turf&apos;n Texas, and the owner, can open this.</p>
      </div>
    );
  }
  if (!modules.install && !modules.distribution) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Install and distribution are turned off</h1>
        <p className="mt-2 text-sm text-slate-500">An admin can turn those modules on in Settings → Workspace. Install is the crew board. Distribution is wholesale orders and deliveries.</p>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <h1 className="text-lg font-semibold text-slate-900">Turf&apos;n Texas is not in the database yet</h1>
        <p className="mt-2 text-sm text-slate-600">Apply <span className="font-medium">065_multi_tenant_foundation.sql</span> first, then <span className="font-medium">066_turf_texas.sql</span>. Neither file has been run. After both are approved, this page loads the catalog and the Midland order.</p>
      </div>
    );
  }
  if (error) return <div className="mx-auto max-w-xl p-10 text-sm text-red-700">{error}</div>;
  if (!model) return <Spinner />;

  const run = async (work) => {
    setError("");
    try {
      await work();
      await refresh();
    } catch (err) {
      setError(err?.message || "That change did not save.");
    }
  };

  return (
    <>
      {error && <div className="mx-auto mt-4 max-w-screen-2xl px-6 text-sm text-red-700">{error}</div>}
      {model.schemaReady === false && <div className="mx-auto mt-4 max-w-screen-2xl px-6 text-sm text-amber-800">The schedule is reading Turf&apos;n Texas projects and sold leads already in the database. Wholesale orders, the price catalog, and saved schedule edits wait on migration 066, which has not been applied.</div>}
      {!model.company && <div className="mx-auto mt-4 max-w-screen-2xl px-6 text-sm text-amber-800">The Turf&apos;n Texas company id was not found on company profiles. New rows cannot be saved until that company exists.</div>}
      <TurfWorkspace
        model={model}
        readOnly={readOnly}
        modules={modules}
        onSchedulePatch={(entry, patch) => run(() => persistSchedulePatch(model, entry, patch))}
        onSaveJob={(job) => run(() => saveJob(job))}
        onSaveOrder={(order, lines) => run(() => saveOrder(order, lines))}
        onSaveCustomer={(customer) => run(() => saveCustomer(customer))}
        onSaveProduct={(product) => run(() => saveProduct(product))}
        onSavePurchase={(purchase) => run(() => savePurchase(purchase))}
        onDeletePurchase={(id) => run(() => deletePurchase(id))}
        onSaveSettings={(settings) => run(() => saveSettings(settings))}
        onRecordPayment={(payload) => run(() => recordPayment(payload))}
      />
    </>
  );
}

function Spinner() {
  return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
}

export function previewHandlers(setModel) {
  return {
    onSchedulePatch: (entry, patch) => setModel((model) => applySchedulePatch(model, entry, patch)),
    onSaveJob: (job) => setModel((model) => applyJob(model, job)),
    onSaveOrder: (order, lines) => setModel((model) => applyOrder(model, order, lines)),
    onSaveCustomer: (customer) => setModel((model) => applyCustomer(model, customer)),
    onSaveProduct: (product) => setModel((model) => applyProduct(model, product)),
    onSavePurchase: (purchase) => setModel((model) => applyPurchase(model, purchase)),
    onDeletePurchase: (id) => setModel((model) => removePurchase(model, id)),
    onSaveSettings: (settings) => setModel((model) => applySettings(model, settings)),
    onRecordPayment: (payload) => setModel((model) => applyPayment(model, {
      amount_received: Number(payload.amount) || 0,
      payment_date: payload.date || null,
      payment_method: payload.method || "Check",
      reference_number: payload.reference || "",
      notes: payload.notes || "",
      linked_job_id: payload.projectId || null,
      turf_order_id: payload.orderId || null,
      turf_install_job_id: payload.installJobId || null,
    })),
  };
}
