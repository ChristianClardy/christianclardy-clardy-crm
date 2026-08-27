import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Designers are a shared, company-wide list managed from Settings → Designers,
// not derived from the Team/Employee roster (a designer here may not need a
// full employee record — e.g. an outside contract designer). They live on the
// same single deterministic anchor row as custom lead sources — see
// leadSources.js for why (oldest company_profiles row, ordered explicitly).
async function loadCompanySettings() {
  const { data, error } = await supabase
    .from("company_profiles")
    .select("id, settings")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) {
    console.error("Failed to load company profile for designers:", error.message);
    return null;
  }
  return data || null;
}

export async function fetchDesigners() {
  const data = await loadCompanySettings();
  return data?.settings?.designers || [];
}

export async function addDesigner(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Enter a name for the new designer.");

  const data = await loadCompanySettings();
  if (!data) throw new Error("No company profile found.");

  const existing = data.settings?.designers || [];
  if (existing.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`"${trimmed}" already exists.`);
  }

  const updated = [...existing, trimmed];
  const { error } = await supabase.from("company_profiles").update({
    settings: { ...(data.settings || {}), designers: updated },
  }).eq("id", data.id);
  if (error) throw new Error(error.message || "Could not save the new designer.");

  return updated;
}

export async function removeDesigner(name) {
  const data = await loadCompanySettings();
  if (!data) throw new Error("No company profile found.");

  const existing = data.settings?.designers || [];
  const updated = existing.filter((d) => d !== name);
  const { error } = await supabase.from("company_profiles").update({
    settings: { ...(data.settings || {}), designers: updated },
  }).eq("id", data.id);
  if (error) throw new Error(error.message || "Could not remove the designer.");

  return updated;
}

// Live list (from Settings → Designers), for the designer-assignment dropdown.
export function useDesigners() {
  const [designers, setDesigners] = useState([]);

  useEffect(() => {
    fetchDesigners().then(setDesigners).catch(() => {});
  }, []);

  return designers;
}
