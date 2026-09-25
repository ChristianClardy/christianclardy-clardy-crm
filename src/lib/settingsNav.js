// Switch Settings tabs from anywhere on the Settings page (e.g. a link inside
// one tab pointing at another) without a full reload: Settings listens for
// popstate and re-reads ?tab=. `extra` adds query params the tab reads, like
// { people: "subcontractors" } or { sub: "<subcontractor id>" }.
export function goToSettingsTab(key, extra = {}) {
  const url = new URL(window.location.origin + "/Settings");
  url.searchParams.set("tab", key);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
