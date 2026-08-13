import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const DEFAULT_LEAD_SOURCE_OPTIONS = [
  "Website",
  "Referral",
  "Facebook",
  "Google",
  "Yard Sign",
  "Repeat Customer",
  "Realtor",
  "Other",
];

// Static default list — used where a live/custom-aware list isn't available
// (e.g. the unauthenticated public lead capture form).
export const LEAD_SOURCE_OPTIONS = DEFAULT_LEAD_SOURCE_OPTIONS;

function mergeSources(custom) {
  const merged = DEFAULT_LEAD_SOURCE_OPTIONS.filter((s) => s !== "Other");
  for (const source of custom || []) {
    if (source && !merged.includes(source)) merged.push(source);
  }
  merged.push("Other");
  return merged;
}

async function loadCompanySettings() {
  const { data } = await supabase.from("company_profiles").select("id, settings").limit(1).single();
  return data || null;
}

export async function fetchCustomLeadSources() {
  const data = await loadCompanySettings();
  return data?.settings?.custom_lead_sources || [];
}

export async function fetchAllLeadSources() {
  return mergeSources(await fetchCustomLeadSources());
}

export async function addCustomLeadSource(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Enter a name for the new lead source.");

  const data = await loadCompanySettings();
  if (!data) throw new Error("No company profile found.");

  const existingCustom = data.settings?.custom_lead_sources || [];
  const allExisting = mergeSources(existingCustom);
  if (allExisting.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`"${trimmed}" already exists.`);
  }

  const updatedCustom = [...existingCustom, trimmed];
  await supabase.from("company_profiles").update({
    settings: { ...(data.settings || {}), custom_lead_sources: updatedCustom },
  }).eq("id", data.id);

  return mergeSources(updatedCustom);
}

export async function removeCustomLeadSource(name) {
  const data = await loadCompanySettings();
  if (!data) throw new Error("No company profile found.");

  const existingCustom = data.settings?.custom_lead_sources || [];
  const updatedCustom = existingCustom.filter((s) => s !== name);
  await supabase.from("company_profiles").update({
    settings: { ...(data.settings || {}), custom_lead_sources: updatedCustom },
  }).eq("id", data.id);

  return mergeSources(updatedCustom);
}

// Live list (defaults + custom sources from Settings), for authenticated app views.
export function useLeadSources() {
  const [sources, setSources] = useState(DEFAULT_LEAD_SOURCE_OPTIONS);

  const reload = () => {
    fetchAllLeadSources().then(setSources).catch(() => {});
  };

  useEffect(() => {
    reload();
  }, []);

  return sources;
}

export function getLeadSourceFromQuery(value) {
  const normalized = String(value || "").trim().toLowerCase();

  const sourceMap = {
    website: "Website",
    referral: "Referral",
    facebook: "Facebook",
    google: "Google",
    "yard sign": "Yard Sign",
    "yard-sign": "Yard Sign",
    yardsign: "Yard Sign",
    "repeat customer": "Repeat Customer",
    "repeat-customer": "Repeat Customer",
    repeatcustomer: "Repeat Customer",
    realtor: "Realtor",
    other: "Other",
  };

  return sourceMap[normalized] || "Website";
}
