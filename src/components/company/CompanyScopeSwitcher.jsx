import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSelectedCompanyScope, setSelectedCompanyScope } from "@/lib/companyScope";

export default function CompanyScopeSwitcher() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(getSelectedCompanyScope());

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    const data = await base44.entities.CompanyProfile.list("name", 200);
    setCompanies(data);
  };

  const active = companies.filter((company) => company.is_active !== false);
  const archived = companies.filter((company) => company.is_active === false);
  const isArchived = (id) => archived.some((company) => company.id === id);

  if (active.length === 0) return null;

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
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
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