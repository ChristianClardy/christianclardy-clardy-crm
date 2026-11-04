import { supabase } from "@/lib/supabase";

// Who the signed-in person can see. Backed by organization_members.is_owner
// and employee_company_assignments (see 062_employee_company_access.sql).
// Returns null when that migration isn't in the database yet, so the sidebar
// keeps today's behavior until it is.
export async function fetchMyCompanyAccess() {
  const { data, error } = await supabase.rpc("my_company_access");
  if (error) return null;
  const companyIds = Array.isArray(data?.company_ids) ? data.company_ids : [];
  return { isOwner: !!data?.is_owner, companyIds };
}

export async function fetchCompanyAssignments() {
  const { data, error } = await supabase
    .from("employee_company_assignments")
    .select("employee_id, company_id");
  if (error) throw error;
  return data || [];
}

// Replaces one person's brands. Only the owner can write this table.
export async function saveCompanyAssignments(employeeId, companyIds) {
  const { error: deleteError } = await supabase
    .from("employee_company_assignments")
    .delete()
    .eq("employee_id", employeeId);
  if (deleteError) throw deleteError;
  if (!companyIds?.length) return;
  const { error } = await supabase.from("employee_company_assignments").insert(
    companyIds.map((company_id) => ({ employee_id: employeeId, company_id }))
  );
  if (error) throw error;
}
