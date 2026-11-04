import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSelectedCompanyScope, setSelectedCompanyScope } from "@/lib/companyScope";
import { fetchMyCompanyAccess } from "@/lib/companyAccess";

export default function CompanyScopeSwitcher() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(getSelectedCompanyScope());
  // undefined while loading, null if company access isn't in the database yet.
  const [access, setAccess] = useState(undefined);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    const [data, mine] = await Promise.all([
      base44.entities.CompanyProfile.list("name", 200),
      fetchMyCompanyAccess(),
    ]);
    const isOwner = mine ? mine.isOwner : true;
    const allowed = new Set(mine?.companyIds || []);
    const visible = mine && !isOwner ? data.filter((company) => allowed.has(company.id)) : data;
    setAccess(mine);
    setCompanies(visible);

    const saved = getSelectedCompanyScope();
    const known = new Set(visible.map((company) => company.id));
    const savedOk = saved === "all" ? isOwner : known.has(saved);
    if (savedOk) {
      setSelected(saved);
      return;
    }
    const next = visible.find((company) => company.is_active !== false)?.id
      || visible[0]?.id
      || "none";
    setSelected(next);
    setSelectedCompanyScope(next);
    // Pages read the saved scope once. Reload so they don't stay on "All"
    // after this login lost that option.
    if (saved !== next) window.location.reload();
  };

  const isOwner = access ? access.isOwner : access === null;
  const active = companies.filter((company) => company.is_active !== false);
  const archived = companies.filter((company) => company.is_active === false);
  const isArchived = (id) => archived.some((company) => company.id === id);

  if (access === undefined) return null;
  if (!isOwner && active.length === 0 && archived.length === 0) {
    return (
      <div className="px-4 pb-4">
        <div className="rounded-xl bg-[#2e2520] p-3 text-xs text-[#d9c7a6]">
          You aren't assigned to a company yet. Ask the owner to add you in Settings → Team.
        </div>
      </div>
    );
  }
  if (active.length === 0 && archived.length === 0) return null;

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl bg-[#2e2520] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[#b5965a]">
          <Building2 className="h-3.5 w-3.5" /> Company Scope
        </div>
        <Select
          value={selected}
          onValueChange={(value) => {
            const reload = isArchived(value) || isArchived(selected);
            setSelected(value);
            setSelectedCompanyScope(value);
            // Archived records are left out at fetch time (base44Client), so
            // entering or leaving an archived company needs a fresh load.
            if (reload) window.location.reload();
          }}
        >
          <SelectTrigger className="border-[#5a4f48] bg-[#3d3530] text-[#f5f0eb]">
            <SelectValue placeholder={isOwner ? "All companies" : "Company"} />
          </SelectTrigger>
          <SelectContent>
            {isOwner && <SelectItem value="all">All companies</SelectItem>}
            {active.map((company) => (
              <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
            ))}
            {archived.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-xs text-slate-400">Archived</SelectLabel>
                  {archived.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
