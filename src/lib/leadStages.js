import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Single source of truth for the Lead pipeline. Previously LeadDetail.jsx and
// LeadList.jsx each hardcoded their own overlapping stage lists that drifted
// out of sync with each other.
export const LEAD_STAGES = [
  "New Lead",
  "Contact Attempted",
  "Contacted",
  "Appointment Scheduled",
  "Site Visit Complete",
  "Design Appointment Scheduled",
  "In Design",
  "Estimate In Progress",
  "Quote Delivered/Price Locked",
  "In Financing",
  "Negotiating/Revising Scope",
  "Contract Signed/Deposit Collected (Won)",
  "Lost/No Decision",
];

// A lead becomes a Prospect the moment it reaches this stage or later.
export const PROSPECT_THRESHOLD_STAGE = "In Design";

// Reaching this stage wins the deal — leadConversion.js pushes it into the
// Pipeline board (Deal entity) as a Closed Won deal.
export const WON_STATUS = "Contract Signed/Deposit Collected (Won)";

export const DEAD_LEAD_STATUSES = ["Lost/No Decision"];

// Saved stages from pipeline_stages, falling back to LEAD_STAGES when the
// table isn't there yet (migration 065) or the tenant has none. The seeded
// labels match LEAD_STAGES, so nothing moves until someone edits them.
export function usePipelineStages() {
  const [stages, setStages] = useState(LEAD_STAGES);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pipeline_stages")
      .select("label, sort_order, is_active")
      .eq("pipeline_key", "leads")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (cancelled || error || !data?.length) return;
        setStages(data.map((row) => row.label));
      });
    return () => { cancelled = true; };
  }, []);
  return stages;
}

// Fixed reason codes captured when a lead is marked Lost/No Decision, so the
// archived pipeline can be filtered and reported on by why deals were lost.
export const LOST_REASON_CODES = [
  "Price too high",
  "Went with a competitor",
  "Chose to DIY",
  "Timing not right",
  "Unresponsive / went dark",
  "Budget mismatch",
  "Outside service area",
  "Project cancelled",
  "Other",
];
