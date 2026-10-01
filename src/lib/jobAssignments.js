import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";

// Saving the jobs picked in JobPicker when a subcontractor or builder is
// created or edited. Only the difference between what was assigned when the
// form opened (initialIds) and what's picked now (selectedIds) is written, so
// jobs the picker didn't show are never touched.

const diff = (initialIds, selectedIds) => {
  const before = new Set(initialIds || []);
  const after = new Set(selectedIds || []);
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
};

// Subcontractors: rows in project_subcontractors (what the Subcontractor
// Portal and Settings → Job Assignments use).
export async function saveSubJobs(subcontractorId, initialIds, selectedIds) {
  const { added, removed } = diff(initialIds, selectedIds);
  if (added.length) {
    const { error } = await supabase
      .from("project_subcontractors")
      .upsert(added.map((project_id) => ({ project_id, subcontractor_id: subcontractorId })), { onConflict: "project_id,subcontractor_id", ignoreDuplicates: true });
    if (error) throw new Error(`Saved, but couldn't assign jobs: ${error.message}`);
  }
  if (removed.length) {
    const { error } = await supabase.from("project_subcontractors").delete()
      .eq("subcontractor_id", subcontractorId).in("project_id", removed);
    if (error) throw new Error(`Saved, but couldn't remove jobs: ${error.message}`);
  }
  return { added: added.length, removed: removed.length };
}

export async function loadSubJobIds(subcontractorId) {
  if (!subcontractorId) return [];
  const { data } = await supabase.from("project_subcontractors").select("project_id").eq("subcontractor_id", subcontractorId);
  return (data || []).map((r) => r.project_id);
}

// Builders (project managers): a job is theirs when projects.project_manager
// is their name, which is also what a Builder Portal login checks
// (pm_can_access_project, 040). Picking a job makes them its PM (replacing
// any other PM); unpicking clears it. If their name changed, jobs they keep
// are updated to the new name.
export async function savePmJobs(name, initialIds, selectedIds, { renamedFrom } = {}) {
  const pm = (name || "").trim();
  if (!pm) return { added: 0, removed: 0 };
  const { added, removed } = diff(initialIds, selectedIds);
  const kept = renamedFrom && renamedFrom.trim() !== pm ? (selectedIds || []).filter((id) => (initialIds || []).includes(id)) : [];
  for (const id of [...added, ...kept]) await base44.entities.Project.update(id, { project_manager: pm });
  for (const id of removed) await base44.entities.Project.update(id, { project_manager: null });
  return { added: added.length, removed: removed.length };
}

export async function loadPmJobIds(name) {
  const pm = (name || "").trim().toLowerCase();
  if (!pm) return [];
  const projects = await base44.entities.Project.list("-created_date", 1000).catch(() => []);
  return projects.filter((p) => (p.project_manager || "").trim().toLowerCase() === pm).map((p) => p.id);
}
