// Subcontractor trades. A sub can have several (subcontractors.trades, 045);
// subcontractors.trade stays as the first one for anything that reads a
// single trade. Subs saved before 045 only have `trade`.

export const TRADE_LABELS = {
  general: "General",
  pool: "Pool / Spa",
  plaster: "Pool Plaster / Finish",
  fencing: "Fencing / Barriers",
  concrete: "Concrete",
  decking: "Decking",
  pavers: "Pavers / Hardscape",
  masonry: "Masonry / Stone",
  excavation: "Excavation",
  electrical: "Electrical",
  plumbing: "Plumbing",
  gas: "Gas",
  landscaping: "Landscaping",
  irrigation: "Irrigation",
  carpentry: "Carpentry / Framing",
  roofing: "Roofing",
  painting: "Painting",
  tile: "Tile",
  other: "Other",
};

export const tradeLabel = (key) => TRADE_LABELS[key] || key || "Other";

export function subTrades(sub) {
  const list = Array.isArray(sub?.trades) ? sub.trades.filter(Boolean) : [];
  if (list.length) return list;
  return sub?.trade ? [sub.trade] : [];
}

// "Pool / Spa, Pool Plaster / Finish"
export const subTradeLabels = (sub) => subTrades(sub).map(tradeLabel).join(", ");
