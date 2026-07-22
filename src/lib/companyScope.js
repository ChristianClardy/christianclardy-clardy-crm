import { useState, useEffect } from "react";

const STORAGE_KEY = "constructiq_selected_company_scope";
const EVENT_NAME = "company-scope-changed";

export function getSelectedCompanyScope() {
  if (typeof window === "undefined") return "all";
  return window.localStorage.getItem(STORAGE_KEY) || "all";
}

export function setSelectedCompanyScope(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value || "all");
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: value || "all" }));
}

export function subscribeToCompanyScope(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(getSelectedCompanyScope());
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

// Reusable read-side hook — call once per page, then filter whatever list(s)
// it loaded. Instant on scope switch (no refetch) since it just re-renders.
export function useCompanyScope() {
  const [scope, setScope] = useState(getSelectedCompanyScope());
  useEffect(() => subscribeToCompanyScope(setScope), []);
  return scope;
}

export function scopeFilter(list, scope, key = "company_id") {
  if (scope === "all" || !Array.isArray(list)) return list;
  return list.filter(item => item?.[key] === scope);
}