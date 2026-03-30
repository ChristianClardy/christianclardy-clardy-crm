import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { materialToEstimateLineItem } from "@/components/estimates/materialEstimateUtils";

const PRICE_BOOK = {
  Pergola: {
    basis: "SF",
    base: { good: 78, better: 92, best: 118 },
    addOns: [
      { name: "Stain / seal", unit: "SF", good: 6, better: 8, best: 11 },
      { name: "Electrical package", unit: "EA", good: 2200, better: 3200, best: 4600 },
      { name: "Concrete pad", unit: "SF", good: 16, better: 20, best: 26 },
      { name: "Privacy wall", unit: "LF", good: 115, better: 145, best: 185 },
      { name: "Footings / engineering", unit: "LS", good: 1800, better: 2600, best: 3800 },
    ],
  },
  "Covered Patio": {
    basis: "SF",
    base: { good: 118, better: 145, best: 182 },
    addOns: [
      { name: "T&G ceiling", unit: "SF", good: 18, better: 24, best: 32 },
      { name: "Recessed lights", unit: "EA", good: 195, better: 245, best: 325 },
      { name: "Ceiling fan install", unit: "EA", good: 420, better: 520, best: 680 },
      { name: "Concrete flatwork", unit: "SF", good: 16, better: 21, best: 28 },
      { name: "Roof upgrade", unit: "SF", good: 12, better: 18, best: 26 },
    ],
  },
  "Outdoor Kitchen": {
    basis: "LF",
    base: { good: 1250, better: 1580, best: 2100 },
    addOns: [
      { name: "Stone / brick veneer", unit: "LF", good: 165, better: 220, best: 295 },
      { name: "Countertop upgrade", unit: "LF", good: 195, better: 265, best: 360 },
      { name: "Grill/appliance allowance", unit: "EA", good: 4200, better: 6800, best: 9800 },
      { name: "Sink & plumbing", unit: "EA", good: 2200, better: 2900, best: 3900 },
      { name: "Electrical / outlets", unit: "EA", good: 950, better: 1350, best: 1950 },
    ],
  },
  "Cabana / Pool House": {
    basis: "SF",
    base: { good: 225, better: 285, best: 365 },
    addOns: [
      { name: "Bathroom package", unit: "EA", good: 9200, better: 12800, best: 18500 },
      { name: "Sliding / accordion door", unit: "EA", good: 6800, better: 10800, best: 16800 },
      { name: "Mini-split HVAC", unit: "EA", good: 3800, better: 5200, best: 7200 },
      { name: "Interior finish upgrade", unit: "SF", good: 26, better: 38, best: 54 },
      { name: "Plumbing rough-in", unit: "LS", good: 4500, better: 6500, best: 9200 },
    ],
  },
  "Concrete / Hardscape": {
    basis: "SF",
    base: { good: 24, better: 32, best: 44 },
    addOns: [
      { name: "Broom finish upgrade", unit: "SF", good: 2, better: 3, best: 4 },
      { name: "Stamped finish", unit: "SF", good: 9, better: 12, best: 16 },
      { name: "Seat wall", unit: "LF", good: 135, better: 178, best: 235 },
      { name: "Drainage package", unit: "LF", good: 30, better: 40, best: 54 },
      { name: "Demo / haul off", unit: "LS", good: 2600, better: 3600, best: 5200 },
    ],
  },
  "Backyard Revamp": {
    basis: "SF",
    base: { good: 72, better: 98, best: 138 },
    addOns: [
      { name: "Landscape lighting", unit: "EA", good: 350, better: 480, best: 680 },
      { name: "Drainage improvements", unit: "LF", good: 38, better: 50, best: 68 },
      { name: "Planting package", unit: "LS", good: 5200, better: 9200, best: 16500 },
      { name: "Paver patio area", unit: "SF", good: 24, better: 32, best: 46 },
      { name: "Premium finish carpentry", unit: "LS", good: 4200, better: 6500, best: 9800 },
    ],
  },
  "Remodel / Addition": {
    basis: "SF",
    base: { good: 185, better: 238, best: 315 },
    addOns: [
      { name: "Structural modifications", unit: "LS", good: 6800, better: 10800, best: 16800 },
      { name: "Premium windows / doors", unit: "EA", good: 2200, better: 3600, best: 6200 },
      { name: "Interior finish package", unit: "SF", good: 28, better: 42, best: 62 },
      { name: "HVAC extension", unit: "EA", good: 3200, better: 4600, best: 6800 },
      { name: "Electrical / panel upgrades", unit: "LS", good: 4200, better: 6200, best: 9400 },
    ],
  },
  Pool: {
    basis: "SF",
    base: { good: 355, better: 455, best: 595 },
    addOns: [
      { name: "Pool equipment package", unit: "EA", good: 11800, better: 17800, best: 27500 },
      { name: "Water feature package", unit: "EA", good: 5200, better: 9200, best: 16500 },
      { name: "Pool lighting package", unit: "EA", good: 2400, better: 3600, best: 5600 },
      { name: "Decking allowance", unit: "SF", good: 24, better: 34, best: 48 },
      { name: "Excavation / haul off risk", unit: "LS", good: 6800, better: 10400, best: 15800 },
    ],
  },
  Spa: {
    basis: "EA",
    base: { good: 24000, better: 33500, best: 47500 },
    addOns: [
      { name: "Raised spillway", unit: "EA", good: 2400, better: 3600, best: 5400 },
      { name: "Jet upgrade package", unit: "EA", good: 1600, better: 2400, best: 3600 },
      { name: "Heater integration", unit: "EA", good: 3600, better: 5200, best: 7200 },
      { name: "Premium finish upgrade", unit: "EA", good: 3200, better: 4600, best: 7200 },
      { name: "Automation controls", unit: "EA", good: 2400, better: 3600, best: 5400 },
    ],
  },
  "Pool Decking": {
    basis: "SF",
    base: { good: 24, better: 34, best: 48 },
    addOns: [
      { name: "Deck drains", unit: "LF", good: 24, better: 32, best: 44 },
      { name: "Premium coping tie-in", unit: "LF", good: 48, better: 68, best: 92 },
      { name: "Travertine upgrade", unit: "SF", good: 16, better: 24, best: 34 },
      { name: "Demo / prep", unit: "LS", good: 2600, better: 3800, best: 5400 },
      { name: "Drainage allowance", unit: "LS", good: 2200, better: 3400, best: 5200 },
    ],
  },
  "Pool Water Features": {
    basis: "EA",
    base: { good: 5200, better: 9200, best: 16500 },
    addOns: [
      { name: "Sheer descent", unit: "EA", good: 2400, better: 3600, best: 5400 },
      { name: "Deck jet", unit: "EA", good: 900, better: 1250, best: 1800 },
      { name: "Bubbler", unit: "EA", good: 780, better: 1120, best: 1650 },
      { name: "Fire-water feature", unit: "EA", good: 6200, better: 9800, best: 14800 },
      { name: "Hydraulic upgrade", unit: "LS", good: 3200, better: 4800, best: 7200 },
    ],
  },
  "Pool Equipment": {
    basis: "EA",
    base: { good: 11800, better: 17800, best: 27500 },
    addOns: [
      { name: "Heater package", unit: "EA", good: 4800, better: 6800, best: 9800 },
      { name: "Chiller package", unit: "EA", good: 6500, better: 9200, best: 13800 },
      { name: "Automation panel", unit: "EA", good: 3200, better: 5200, best: 8200 },
      { name: "Salt system", unit: "EA", good: 1800, better: 2600, best: 3800 },
      { name: "Premium filter / pump", unit: "EA", good: 2600, better: 3900, best: 5800 },
    ],
  },
  "Pool Side Structures": {
    basis: "SF",
    base: { good: 178, better: 238, best: 315 },
    addOns: [
      { name: "Shade structure upgrade", unit: "SF", good: 24, better: 36, best: 52 },
      { name: "Outdoor bath rough-in", unit: "EA", good: 5200, better: 8200, best: 12800 },
      { name: "Bar / serving counter", unit: "LF", good: 650, better: 980, best: 1450 },
      { name: "Mini split package", unit: "EA", good: 3800, better: 5200, best: 7200 },
      { name: "Premium finish package", unit: "SF", good: 24, better: 36, best: 54 },
    ],
  },
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function defaultQty(unit, basisQty, width, depth) {
  if (unit === "SF") return basisQty;
  if (unit === "LF") return width || 0;
  if (unit === "EA" || unit === "LS") return 1;
  return depth || 0;
}

function sumLineItems(items) {
  return items.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.unit_cost) || 0)), 0);
}

function distributeByPercent(totalAmount, rows) {
  return rows.map((row) => ({
    ...row,
    unit_cost: roundCurrency((totalAmount * row.percent) / (Number(row.qty) || 1)),
  }));
}

function buildBaseLines(projectType, level, width, depth, basisQty) {
  const baseTotal = basisQty * PRICE_BOOK[projectType].base[level];
  const postCount = basisQty <= 180 ? 4 : basisQty <= 300 ? 6 : 8;
  const beamLf = Math.max((Number(width) || 0) * 2, 1);
  const rafterCount = Math.max(Math.ceil((Number(width) || 0) / 2) + 1, 4);
  const rafterLf = Math.max(rafterCount * (Number(depth) || 0), 1);

  if (projectType === "Pergola") {
    return distributeByPercent(baseTotal, [
      { description: "Structural posts", qty: postCount, unit: "EA", percent: 0.2 },
      { description: "Beams / headers", qty: beamLf, unit: "LF", percent: 0.22 },
      { description: "Rafters / slats", qty: rafterLf, unit: "LF", percent: 0.2 },
      { description: "Hardware / connectors", qty: 1, unit: "LS", percent: 0.1 },
      { description: "Concrete footings", qty: postCount, unit: "EA", percent: 0.1 },
      { description: "Carpentry labor / installation", qty: 1, unit: "LS", percent: 0.18 },
    ]);
  }

  if (projectType === "Covered Patio") {
    const roofSf = Math.max(basisQty, 1);
    return distributeByPercent(baseTotal, [
      { description: "Posts / structural columns", qty: postCount, unit: "EA", percent: 0.16 },
      { description: "Beams / headers", qty: beamLf, unit: "LF", percent: 0.16 },
      { description: "Roof framing", qty: roofSf, unit: "SF", percent: 0.16 },
      { description: "Roof decking / roofing", qty: roofSf, unit: "SF", percent: 0.18 },
      { description: "Trim / fascia / finish", qty: roofSf, unit: "SF", percent: 0.09 },
      { description: "Labor / installation", qty: 1, unit: "LS", percent: 0.25 },
    ]);
  }

  if (projectType === "Outdoor Kitchen") {
    const runLf = Math.max(Number(width) || 0, 1);
    return distributeByPercent(baseTotal, [
      { description: "Base framing / block structure", qty: runLf, unit: "LF", percent: 0.18 },
      { description: "Sheathing / cement board", qty: runLf, unit: "LF", percent: 0.09 },
      { description: "Stone / finish cladding", qty: runLf, unit: "LF", percent: 0.18 },
      { description: "Countertop system", qty: runLf, unit: "LF", percent: 0.18 },
      { description: "Standard appliance allowance", qty: 1, unit: "LS", percent: 0.15 },
      { description: "Electrical / plumbing rough", qty: 1, unit: "LS", percent: 0.08 },
      { description: "Fabrication / installation labor", qty: 1, unit: "LS", percent: 0.14 },
    ]);
  }

  if (projectType === "Concrete / Hardscape") {
    return distributeByPercent(baseTotal, [
      { description: "Subgrade prep / grading", qty: basisQty, unit: "SF", percent: 0.14 },
      { description: "Base material", qty: basisQty, unit: "SF", percent: 0.12 },
      { description: "Forms / reinforcement", qty: basisQty, unit: "SF", percent: 0.16 },
      { description: "Concrete placement", qty: basisQty, unit: "SF", percent: 0.2 },
      { description: "Finish / saw cuts / joints", qty: basisQty, unit: "SF", percent: 0.12 },
      { description: "Labor / cleanup", qty: 1, unit: "LS", percent: 0.26 },
    ]);
  }

  if (projectType === "Backyard Revamp") {
    return distributeByPercent(baseTotal, [
      { description: "Site prep / demolition", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Hardscape base scope", qty: basisQty, unit: "SF", percent: 0.24 },
      { description: "Landscape / planting prep", qty: basisQty, unit: "SF", percent: 0.14 },
      { description: "Drainage / grading", qty: 1, unit: "LS", percent: 0.12 },
      { description: "Feature carpentry allowance", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Labor / supervision", qty: 1, unit: "LS", percent: 0.22 },
    ]);
  }

  if (projectType === "Remodel / Addition") {
    return distributeByPercent(baseTotal, [
      { description: "Demo / selective removal", qty: 1, unit: "LS", percent: 0.1 },
      { description: "Structural framing", qty: basisQty, unit: "SF", percent: 0.2 },
      { description: "Exterior shell / weatherproofing", qty: basisQty, unit: "SF", percent: 0.18 },
      { description: "MEP rough-ins", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Interior finishes", qty: basisQty, unit: "SF", percent: 0.18 },
      { description: "Labor / supervision", qty: 1, unit: "LS", percent: 0.2 },
    ]);
  }

  if (projectType === "Pool") {
    return distributeByPercent(baseTotal, [
      { description: "Layout / engineering allowance", qty: 1, unit: "LS", percent: 0.06 },
      { description: "Excavation", qty: basisQty, unit: "SF", percent: 0.16 },
      { description: "Steel / rebar shell", qty: basisQty, unit: "SF", percent: 0.14 },
      { description: "Plumbing rough-in", qty: basisQty, unit: "SF", percent: 0.12 },
      { description: "Electrical rough-in", qty: basisQty, unit: "SF", percent: 0.08 },
      { description: "Shotcrete / gunite shell", qty: basisQty, unit: "SF", percent: 0.18 },
      { description: "Tile / coping / finish prep", qty: basisQty, unit: "SF", percent: 0.1 },
      { description: "Startup / supervision / cleanup", qty: 1, unit: "LS", percent: 0.16 },
    ]);
  }

  if (projectType === "Spa") {
    return distributeByPercent(baseTotal, [
      { description: "Spa excavation / layout", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Spa steel / shell", qty: 1, unit: "LS", percent: 0.2 },
      { description: "Jet plumbing / valves", qty: 1, unit: "LS", percent: 0.18 },
      { description: "Electrical / controls", qty: 1, unit: "LS", percent: 0.12 },
      { description: "Interior finish / tile", qty: 1, unit: "LS", percent: 0.16 },
      { description: "Labor / startup", qty: 1, unit: "LS", percent: 0.2 },
    ]);
  }

  if (projectType === "Pool Decking") {
    return distributeByPercent(baseTotal, [
      { description: "Subgrade prep", qty: basisQty, unit: "SF", percent: 0.14 },
      { description: "Base material", qty: basisQty, unit: "SF", percent: 0.12 },
      { description: "Decking material allowance", qty: basisQty, unit: "SF", percent: 0.24 },
      { description: "Coping transitions / edge work", qty: 1, unit: "LS", percent: 0.12 },
      { description: "Drainage / joints", qty: 1, unit: "LS", percent: 0.1 },
      { description: "Labor / cleanup", qty: 1, unit: "LS", percent: 0.28 },
    ]);
  }

  if (projectType === "Pool Water Features") {
    return distributeByPercent(baseTotal, [
      { description: "Feature plumbing rough", qty: 1, unit: "LS", percent: 0.22 },
      { description: "Water feature body / fittings", qty: 1, unit: "LS", percent: 0.28 },
      { description: "Electrical / controls", qty: 1, unit: "LS", percent: 0.12 },
      { description: "Finish / stone coordination", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Labor / startup", qty: 1, unit: "LS", percent: 0.24 },
    ]);
  }

  if (projectType === "Pool Equipment") {
    return distributeByPercent(baseTotal, [
      { description: "Pump / filter package", qty: 1, unit: "LS", percent: 0.34 },
      { description: "Valves / plumbing pad fittings", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Electrical hook-up", qty: 1, unit: "LS", percent: 0.1 },
      { description: "Control / startup package", qty: 1, unit: "LS", percent: 0.14 },
      { description: "Labor / installation", qty: 1, unit: "LS", percent: 0.28 },
    ]);
  }

  if (projectType === "Pool Side Structures") {
    return distributeByPercent(baseTotal, [
      { description: "Structural framing", qty: basisQty, unit: "SF", percent: 0.2 },
      { description: "Roof / ceiling package", qty: basisQty, unit: "SF", percent: 0.2 },
      { description: "Finish carpentry", qty: basisQty, unit: "SF", percent: 0.14 },
      { description: "MEP allowance", qty: 1, unit: "LS", percent: 0.1 },
      { description: "Exterior finish package", qty: basisQty, unit: "SF", percent: 0.14 },
      { description: "Labor / supervision", qty: 1, unit: "LS", percent: 0.22 },
    ]);
  }

  const shellSf = Math.max(basisQty, 1);
  return distributeByPercent(baseTotal, [
    { description: "Foundation / slab / footings", qty: shellSf, unit: "SF", percent: 0.14 },
    { description: "Wall framing package", qty: shellSf, unit: "SF", percent: 0.16 },
    { description: "Roof framing / covering", qty: shellSf, unit: "SF", percent: 0.18 },
    { description: "Exterior cladding / trim", qty: shellSf, unit: "SF", percent: 0.12 },
    { description: "Doors / windows allowance", qty: 1, unit: "LS", percent: 0.1 },
    { description: "Interior finish package", qty: shellSf, unit: "SF", percent: 0.12 },
    { description: "MEP rough-in allowance", qty: 1, unit: "LS", percent: 0.06 },
    { description: "Labor / installation", qty: 1, unit: "LS", percent: 0.12 },
  ]);
}

function buildAddOnLines(projectType, level, selectedAddOns, quantities, width, depth, basisQty) {
  return PRICE_BOOK[projectType].addOns
    .filter((addOn) => selectedAddOns[addOn.name])
    .map((addOn) => ({
      description: addOn.name,
      qty: Number(quantities[addOn.name] ?? defaultQty(addOn.unit, basisQty, Number(width) || 0, Number(depth) || 0)),
      unit: addOn.unit,
      unit_cost: addOn[level],
    }));
}

export default function GoodBetterBestEstimator({ initialProjectType = "Pergola", materials = [], marginPercent = 0, onApply }) {
  const [projectType, setProjectType] = useState(initialProjectType in PRICE_BOOK ? initialProjectType : "Pergola");
  const [width, setWidth] = useState(12);
  const [depth, setDepth] = useState(12);
  const [isTiedIntoHome, setIsTiedIntoHome] = useState(false);
  const [tieInSquareFootage, setTieInSquareFootage] = useState(0);
  const [selectedAddOns, setSelectedAddOns] = useState({});
  const [quantities, setQuantities] = useState({});

  const config = PRICE_BOOK[projectType];
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);
  const baseSquareFootage = useMemo(() => {
    if (config.basis === "SF") return (Number(width) || 0) * (Number(depth) || 0);
    return Number(width) || 0;
  }, [config.basis, width, depth]);

  const tieInExtraSquareFootage = projectType === "Covered Patio" && isTiedIntoHome
    ? Number(tieInSquareFootage) || 0
    : 0;

  const basisQty = baseSquareFootage + tieInExtraSquareFootage;

  const buildLevelItems = (level) => {
    const packageLabel = level.charAt(0).toUpperCase() + level.slice(1);
    return [
      { id: newId(), is_section_header: true, section: `${projectType} - ${packageLabel}` },
      ...buildBaseLines(projectType, level, Number(width) || 0, Number(depth) || 0, basisQty).map((item) => ({
        id: newId(),
        ...item,
      })),
      ...buildAddOnLines(projectType, level, selectedAddOns, quantities, width, depth, basisQty).map((item) => ({
        id: newId(),
        ...item,
      })),
      ...materials
        .filter((material) => selectedMaterialIds.includes(material.id))
        .map((material) => ({
          ...materialToEstimateLineItem(material, marginPercent),
          id: newId(),
          qty: Number(quantities[`material:${material.id}`] ?? 1),
          good_better_best_tier: "All",
        })),
    ];
  };

  const totals = useMemo(() => ({
    good: sumLineItems(buildLevelItems("good").filter((item) => !item.is_section_header)),
    better: sumLineItems(buildLevelItems("better").filter((item) => !item.is_section_header)),
    best: sumLineItems(buildLevelItems("best").filter((item) => !item.is_section_header)),
  }), [projectType, width, depth, basisQty, selectedAddOns, quantities, isTiedIntoHome, tieInSquareFootage]);

  const applyLevel = (level) => {
    const packageLabel = level.charAt(0).toUpperCase() + level.slice(1);
    onApply({
      projectType,
      packageLevel: packageLabel,
      title: `${projectType} - ${packageLabel}`,
      lineItems: buildLevelItems(level),
    });
  };

  const applyWorksheetFramework = () => {
    onApply({
      projectType,
      packageLevel: "Good / Better / Best",
      title: `${projectType} - Good / Better / Best`,
      lineItems: [
        ...buildLevelItems("good"),
        ...buildLevelItems("better"),
        ...buildLevelItems("best"),
      ],
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Good / Better / Best Estimator</h3>
        <p className="mt-1 text-sm text-slate-500">Build a full worksheet-style estimate with material and labor line items.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label className="text-xs text-slate-500">Project Type</Label>
          <Select value={projectType} onValueChange={setProjectType}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(PRICE_BOOK).map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Width (ft)</Label>
          <Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-slate-500">Depth (ft)</Label>
          <Input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} className="mt-1" disabled={config.basis !== "SF"} />
        </div>
      </div>

      {projectType === "Covered Patio" && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center space-x-3">
            <Checkbox checked={isTiedIntoHome} onCheckedChange={(checked) => setIsTiedIntoHome(Boolean(checked))} />
            <div>
              <p className="text-sm font-medium text-slate-900">Patio cover tied into the home</p>
              <p className="text-xs text-slate-500">Adds extra tied-in square footage into the covered patio base pricing.</p>
            </div>
          </div>
          {isTiedIntoHome && (
            <div className="mt-4 max-w-[220px]">
              <Label className="text-xs text-slate-500">Extra tied-in square footage</Label>
              <Input type="number" value={tieInSquareFootage} onChange={(e) => setTieInSquareFootage(e.target.value)} className="mt-1" />
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Pricing basis: <span className="font-medium text-slate-900">{config.basis}</span> · Base quantity: <span className="font-medium text-slate-900">{baseSquareFootage || 0}</span>{tieInExtraSquareFootage > 0 ? <> · Tie-in added: <span className="font-medium text-slate-900">{tieInExtraSquareFootage}</span></> : null} · Total quantity: <span className="font-medium text-slate-900">{basisQty || 0}</span>
      </div>

      <div className="mt-5 space-y-3">
        {config.addOns.map((addOn) => (
          <div key={addOn.name} className="grid items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 md:grid-cols-[auto_1fr_100px]">
            <Checkbox
              checked={Boolean(selectedAddOns[addOn.name])}
              onCheckedChange={(checked) => setSelectedAddOns((prev) => ({ ...prev, [addOn.name]: Boolean(checked) }))}
            />
            <div>
              <p className="text-sm font-medium text-slate-900">{addOn.name}</p>
              <p className="text-xs text-slate-500">Unit: {addOn.unit}</p>
            </div>
            <Input
              type="number"
              value={quantities[addOn.name] ?? defaultQty(addOn.unit, basisQty, Number(width) || 0, Number(depth) || 0)}
              onChange={(e) => setQuantities((prev) => ({ ...prev, [addOn.name]: e.target.value }))}
              disabled={!selectedAddOns[addOn.name]}
            />
          </div>
        ))}
      </div>

      {materials.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-900">Use real materials from your library</p>
            <p className="text-xs text-slate-500">Select saved materials and include them directly in the generated worksheet.</p>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {materials.slice(0, 12).map((material) => (
              <div key={material.id} className="grid items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 md:grid-cols-[auto_1fr_100px]">
                <Checkbox
                  checked={selectedMaterialIds.includes(material.id)}
                  onCheckedChange={(checked) => setSelectedMaterialIds((prev) =>
                    checked ? [...prev, material.id] : prev.filter((id) => id !== material.id)
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">{material.name}</p>
                  <p className="text-xs text-slate-500">{material.category || "Other"} · {(material.unit || "EA").toUpperCase()}</p>
                </div>
                <Input
                  type="number"
                  value={quantities[`material:${material.id}`] ?? 1}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [`material:${material.id}`]: e.target.value }))}
                  disabled={!selectedMaterialIds.includes(material.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Worksheet Framework</p>
          <p className="text-xs text-slate-500">Load Good, Better, and Best into the estimate sheet as separate sections.</p>
        </div>
        <Button onClick={applyWorksheetFramework} className="bg-slate-900 text-white hover:bg-slate-800">
          Load Full Worksheet
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          { key: "good", label: "Good" },
          { key: "better", label: "Better" },
          { key: "best", label: "Best" },
        ].map((option) => (
          <div key={option.key} className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">{option.label}</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">${totals[option.key].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => applyLevel(option.key)}>
              Load {option.label}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}