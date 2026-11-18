import { supabase } from "@/lib/supabase";

function missingColumn(error) {
  const msg = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return /PGRST204|PGRST205|42703|schema cache|does not exist|Could not find the/i.test(msg);
}

// Null when the scope is not one company. columnsReady is false until
// migration 067 has been applied. This does not write.
export async function loadCompanyOperations(companyId) {
  if (!companyId || companyId === "all" || companyId === "none") return null;
  const withFlags = await supabase
    .from("company_profiles")
    .select("id, name, address, organization_id, operations_enabled, operations_distribution")
    .eq("id", companyId)
    .maybeSingle();
  if (!withFlags.error) {
    return {
      id: companyId,
      name: withFlags.data?.name || "",
      address: withFlags.data?.address || "",
      organization_id: withFlags.data?.organization_id || null,
      operations_enabled: withFlags.data?.operations_enabled === true,
      operations_distribution: withFlags.data?.operations_distribution === true,
      columnsReady: true,
      found: !!withFlags.data,
    };
  }
  if (!missingColumn(withFlags.error)) throw withFlags.error;
  const basic = await supabase
    .from("company_profiles")
    .select("id, name, address, organization_id")
    .eq("id", companyId)
    .maybeSingle();
  if (basic.error) throw basic.error;
  return {
    id: companyId,
    name: basic.data?.name || "",
    address: basic.data?.address || "",
    organization_id: basic.data?.organization_id || null,
    operations_enabled: false,
    operations_distribution: false,
    columnsReady: false,
    found: !!basic.data,
  };
}

export async function operationsColumnsReady() {
  const { error } = await supabase.from("company_profiles").select("operations_enabled").limit(1);
  if (!error) return true;
  if (missingColumn(error)) return false;
  return false;
}

export async function saveCompanyOperations(companyId, { operations_enabled, operations_distribution }) {
  const { error } = await supabase
    .from("company_profiles")
    .update({
      operations_enabled: !!operations_enabled,
      operations_distribution: !!operations_enabled && !!operations_distribution,
    })
    .eq("id", companyId);
  if (error) {
    if (missingColumn(error)) {
      throw new Error("Apply supabase/migrations/067_company_operations.sql before turning Operations on. That file has not been run.");
    }
    throw error;
  }
}
