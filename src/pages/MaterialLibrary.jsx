import MaterialLibraryComponent from "@/components/workspace/MaterialLibrary";
import { useRolePermissions } from "@/lib/useRolePermissions";

export default function MaterialLibrary() {
  const { can, loading } = useRolePermissions();

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Workspace</p>
        <h1 className="text-3xl font-bold text-slate-900">Material Library</h1>
        <p className="text-sm text-slate-500">Manage materials, labor rates, pricing, and vendor costs.</p>
      </div>
      {!loading && (
        <MaterialLibraryComponent canManage={can("material_library")} />
      )}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
