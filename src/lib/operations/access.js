import { TURF_COMPANY_ID } from "../turf/constants.js";

// The Operations tab is a company view. "All companies" and an empty
// scope never show it. Other companies need the per-company switch.
// Turf'n Texas shows it before migration 067 is applied, and only while
// that company is the one selected.
export function showOperationsNav({ companyId, enabled, columnsReady, turfModulesOn }) {
  if (!companyId || companyId === "all" || companyId === "none") return false;
  if (enabled === true) return true;
  if (companyId === TURF_COMPANY_ID && columnsReady === false && turfModulesOn) return true;
  return false;
}

// Turf'n Texas keeps the turf tables. Every other company uses the
// generic distribution tables from migration 067.
export function operationsVariant(companyId) {
  return companyId === TURF_COMPANY_ID ? "turf" : "generic";
}

// Distribution is optional. For Turf'n Texas it stays available while the
// org distribution module is on, so the Midland order is not hidden by the
// generic switch. Other companies get the section only from their switch.
export function distributionSection({ companyId, operationsDistribution, distributionModule }) {
  if (companyId === TURF_COMPANY_ID) return !!(distributionModule || operationsDistribution);
  return operationsDistribution === true;
}
