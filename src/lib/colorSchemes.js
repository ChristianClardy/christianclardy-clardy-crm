export const COLOR_SCHEMES = [
  {
    id: "amber",
    label: "Amber",
    description: "Warm amber & orange (default)",
    swatches: ["#f59e0b", "#f97316"],
    brandGold: "#b5965a",
    brandGoldLight: "#c9ac76",
    brandGoldDark: "#8a7040",
  },
  {
    id: "blue",
    label: "Ocean Blue",
    description: "Professional navy & indigo",
    swatches: ["#3b82f6", "#6366f1"],
    brandGold: "#3b82f6",
    brandGoldLight: "#60a5fa",
    brandGoldDark: "#2563eb",
  },
  {
    id: "green",
    label: "Forest Green",
    description: "Fresh emerald & teal",
    swatches: ["#10b981", "#0d9488"],
    brandGold: "#10b981",
    brandGoldLight: "#34d399",
    brandGoldDark: "#059669",
  },
  {
    id: "purple",
    label: "Royal Purple",
    description: "Elegant violet & fuchsia",
    swatches: ["#8b5cf6", "#a855f7"],
    brandGold: "#8b5cf6",
    brandGoldLight: "#a78bfa",
    brandGoldDark: "#6d28d9",
  },
  {
    id: "rose",
    label: "Rose",
    description: "Bold rose & crimson",
    swatches: ["#f43f5e", "#e11d48"],
    brandGold: "#f43f5e",
    brandGoldLight: "#fb7185",
    brandGoldDark: "#be123c",
  },
  {
    id: "slate",
    label: "Slate",
    description: "Classic charcoal & steel",
    swatches: ["#475569", "#334155"],
    brandGold: "#64748b",
    brandGoldLight: "#94a3b8",
    brandGoldDark: "#334155",
  },
];

// Calendar event type color classes per scheme
export const CALENDAR_EVENT_COLORS = {
  amber: {
    meeting:    "bg-slate-700 hover:bg-slate-800",
    estimate:   "bg-purple-500 hover:bg-purple-600",
    build:      "bg-amber-500 hover:bg-amber-600",
    inspection: "bg-cyan-500 hover:bg-cyan-600",
    task:       "bg-blue-500 hover:bg-blue-600",
    admin:      "bg-indigo-500 hover:bg-indigo-600",
    personal:   "bg-pink-500 hover:bg-pink-600",
    other:      "bg-slate-500 hover:bg-slate-600",
  },
  blue: {
    meeting:    "bg-slate-700 hover:bg-slate-800",
    estimate:   "bg-violet-500 hover:bg-violet-600",
    build:      "bg-blue-500 hover:bg-blue-600",
    inspection: "bg-sky-500 hover:bg-sky-600",
    task:       "bg-indigo-500 hover:bg-indigo-600",
    admin:      "bg-sky-700 hover:bg-sky-800",
    personal:   "bg-pink-500 hover:bg-pink-600",
    other:      "bg-slate-500 hover:bg-slate-600",
  },
  green: {
    meeting:    "bg-slate-700 hover:bg-slate-800",
    estimate:   "bg-teal-500 hover:bg-teal-600",
    build:      "bg-emerald-500 hover:bg-emerald-600",
    inspection: "bg-cyan-500 hover:bg-cyan-600",
    task:       "bg-green-500 hover:bg-green-600",
    admin:      "bg-teal-700 hover:bg-teal-800",
    personal:   "bg-pink-500 hover:bg-pink-600",
    other:      "bg-slate-500 hover:bg-slate-600",
  },
  purple: {
    meeting:    "bg-slate-700 hover:bg-slate-800",
    estimate:   "bg-fuchsia-500 hover:bg-fuchsia-600",
    build:      "bg-violet-500 hover:bg-violet-600",
    inspection: "bg-purple-400 hover:bg-purple-500",
    task:       "bg-indigo-500 hover:bg-indigo-600",
    admin:      "bg-purple-700 hover:bg-purple-800",
    personal:   "bg-pink-500 hover:bg-pink-600",
    other:      "bg-slate-500 hover:bg-slate-600",
  },
  rose: {
    meeting:    "bg-slate-700 hover:bg-slate-800",
    estimate:   "bg-orange-500 hover:bg-orange-600",
    build:      "bg-rose-500 hover:bg-rose-600",
    inspection: "bg-red-400 hover:bg-red-500",
    task:       "bg-rose-600 hover:bg-rose-700",
    admin:      "bg-pink-600 hover:bg-pink-700",
    personal:   "bg-fuchsia-500 hover:bg-fuchsia-600",
    other:      "bg-slate-500 hover:bg-slate-600",
  },
  slate: {
    meeting:    "bg-slate-800 hover:bg-slate-900",
    estimate:   "bg-slate-600 hover:bg-slate-700",
    build:      "bg-slate-500 hover:bg-slate-600",
    inspection: "bg-slate-400 hover:bg-slate-500",
    task:       "bg-slate-600 hover:bg-slate-700",
    admin:      "bg-slate-700 hover:bg-slate-800",
    personal:   "bg-slate-500 hover:bg-slate-600",
    other:      "bg-slate-400 hover:bg-slate-500",
  },
};

export function getColorScheme(id) {
  return COLOR_SCHEMES.find(s => s.id === id) || COLOR_SCHEMES[0];
}

export function getCalendarColors(id) {
  return CALENDAR_EVENT_COLORS[id] || CALENDAR_EVENT_COLORS.amber;
}

export function applyColorScheme(id) {
  const scheme = getColorScheme(id);
  const root = document.documentElement;
  root.setAttribute("data-color-scheme", id);
  root.style.setProperty("--brand-gold", scheme.brandGold);
  root.style.setProperty("--brand-gold-light", scheme.brandGoldLight);
  root.style.setProperty("--brand-gold-dark", scheme.brandGoldDark);
  localStorage.setItem("app-color-scheme", id);
}

export function getStoredColorScheme() {
  return localStorage.getItem("app-color-scheme") || "amber";
}
