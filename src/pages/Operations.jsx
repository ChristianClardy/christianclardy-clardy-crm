import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Turf from "@/pages/Turf";
import TurfWorkspace from "@/components/turf/TurfWorkspace";
import { useCompanyScope } from "@/lib/companyScope";
import { distributionSection, operationsVariant, showOperationsNav } from "@/lib/operations/access";
import { loadCompanyOperations } from "@/lib/operations/company";
import {
  deleteDistributionPurchase,
  loadOperations,
  persistOperationsSchedule,
  recordOperationsPayment,
  saveDistributionCustomer,
  saveDistributionOrder,
  saveDistributionProduct,
  saveDistributionPurchase,
  saveDistributionSettings,
  saveOperationsJob,
} from "@/lib/operations/queries";
import { DISTRIBUTION_MODULE, INSTALL_MODULE } from "@/lib/turf/constants";
import { useTenant } from "@/lib/TenantContext";
import { useRolePermissions } from "@/lib/useRolePermissions";

export default function Operations() {
  const scope = useCompanyScope();
  const { readOnly, loading: roleLoading } = useRolePermissions();
  const tenant = useTenant();
  const moduleEnabled = typeof tenant.moduleEnabled === "function" ? tenant.moduleEnabled : () => true;
  const [company, setCompany] = useState(undefined);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");

  const variant = operationsVariant(scope);
  const turfModulesOn = moduleEnabled(INSTALL_MODULE) || moduleEnabled(DISTRIBUTION_MODULE);
  const allowed = company
    ? showOperationsNav({
      companyId: scope,
      enabled: company.operations_enabled,
      columnsReady: company.columnsReady,
      turfModulesOn,
    })
    : false;

  useEffect(() => {
    let live = true;
    setCompany(undefined);
    setModel(null);
    setError("");
    if (!scope || scope === "all" || scope === "none") {
      setCompany(null);
      return undefined;
    }
    loadCompanyOperations(scope)
      .then((row) => { if (live) setCompany(row); })
      .catch((err) => { if (live) setError(err?.message || "Could not load this company."); });
    return () => { live = false; };
  }, [scope]);

  useEffect(() => {
    if (!allowed || variant === "turf" || !company?.id) return undefined;
    let live = true;
    const distribution = distributionSection({
      companyId: company.id,
      operationsDistribution: company.operations_distribution,
      distributionModule: false,
    });
    loadOperations(company.id, { distribution, company })
      .then((data) => { if (live) setModel(data); })
      .catch((err) => { if (live) setError(err?.message || "Could not load Operations."); });
    return () => { live = false; };
  }, [allowed, variant, company]);

  if (scope === "all" || scope === "none" || !scope) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Pick a company</h1>
        <p className="mt-2 text-sm text-slate-500">Operations is a company view. Choose one company in the sidebar. It does not open on All companies.</p>
      </div>
    );
  }
  if (error && !company) return <div className="mx-auto max-w-xl p-10 text-sm text-red-700">{error}</div>;
  if (company === undefined || roleLoading) return <Spinner />;
  if (!company?.found && company?.columnsReady !== false) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">That company was not found</h1>
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Operations is off for {company?.name || "this company"}</h1>
        <p className="mt-2 text-sm text-slate-500">An admin can turn it on for this company in Settings → Companies. It is not added to every company.</p>
        <Link to="/Settings?tab=companies" className="mt-3 inline-block text-sm font-medium text-amber-800 hover:underline">Open Companies</Link>
      </div>
    );
  }
  if (variant === "turf") {
    return <Turf presentation="operations" companyName={company.name || "Turf'n Texas"} />;
  }
  if (!model) {
    if (error) return <div className="mx-auto max-w-xl p-10 text-sm text-red-700">{error}</div>;
    return <Spinner />;
  }

  const distribution = company.operations_distribution === true;
  const run = async (work) => {
    setError("");
    try {
      await work();
      const next = await loadOperations(company.id, { distribution, company });
      setModel(next);
    } catch (err) {
      setError(err?.message || "That change did not save.");
    }
  };
  const org = model.organizationId;

  return (
    <>
      {error && <div className="mx-auto mt-4 max-w-screen-2xl px-6 text-sm text-red-700">{error}</div>}
      {model.schemaReady === false && (
        <div className="mx-auto mt-4 max-w-screen-2xl px-6 text-sm text-amber-800">
          The schedule is reading this company&apos;s projects and sold leads. Saving a date needs migration 067_company_operations.sql, which has not been applied.
        </div>
      )}
      {distribution && model.distributionReady === false && (
        <div className="mx-auto mt-4 max-w-screen-2xl px-6 text-sm text-amber-800">
          Distribution is turned on for this company. Orders and products wait on migration 067_company_operations.sql, which has not been applied.
        </div>
      )}
      <TurfWorkspace
        key={company.id}
        model={model}
        readOnly={readOnly}
        modules={{ install: true, distribution }}
        brand="generic"
        companyName={company.name || "This company"}
        eyebrow={company.name || "Operations"}
        title="Operations"
        description="Schedule, unscheduled jobs, and distribution for this company. Distribution lists this company's orders and products. Payments recorded here are the money collected. A price that is not on file stays blank."
        onSchedulePatch={(entry, patch) => run(() => persistOperationsSchedule(model, entry, patch))}
        onSaveJob={(job) => run(() => saveOperationsJob(company.id, job, org))}
        onSaveOrder={(order, lines) => run(() => saveDistributionOrder(company.id, order, lines, org))}
        onSaveCustomer={(customer) => run(() => saveDistributionCustomer(company.id, customer, org))}
        onSaveProduct={(product) => run(() => saveDistributionProduct(company.id, product, org))}
        onSavePurchase={(purchase) => run(() => saveDistributionPurchase(company.id, purchase, org))}
        onDeletePurchase={(id) => run(() => deleteDistributionPurchase(company.id, id))}
        onSaveSettings={(settings) => run(() => saveDistributionSettings(company.id, settings, org))}
        onRecordPayment={(payload) => run(() => recordOperationsPayment(company.id, payload, org))}
      />
    </>
  );
}

function Spinner() {
  return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
}
