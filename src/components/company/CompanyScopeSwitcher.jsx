import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSelectedCompanyScope, setSelectedCompanyScope } from "@/lib/companyScope";

export default function CompanyScopeSwitcher() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(getSelectedCompanyScope());

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    const data = await base44.entities.CompanyProfile.list("name", 200);
    setCompanies(data.filter((company) => company.is_active !== false));
  };

  if (companies.length === 0) return null;

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl bg-[#2e2520] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[#b5965a]">
          <Building2 className="h-3.5 w-3.5" /> Company Scope
        </div>
        <Select
          value={selected}
          onValueChange={(value) => {
            setSelected(value);
            setSelectedCompanyScope(value);
          }}
        >
          <SelectTrigger className="border-[#5a4f48] bg-[#3d3530] text-[#f5f0eb]">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}