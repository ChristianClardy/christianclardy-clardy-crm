import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  ArrowLeft, Save, Check, Loader2, Trash2, Copy,
  Sun, Layers, Fence, UtensilsCrossed, Waves, TreePine, Compass,
  ChevronDown, RulerIcon, Maximize2, Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_LOT_W = 80;
const DEFAULT_LOT_D = 100;
const FT_TO_SCENE = 1; // 1 foot = 1 Three.js unit

function haversineDistFt(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const CATEGORIES = [
  {
    key: "shade", label: "Shade Structures", icon: Sun,
    items: [
      { type: "pergola",     label: "Pergola",     w: 16, d: 12, color: 0x8B6914 },
      { type: "patio_cover", label: "Patio Cover",  w: 20, d: 16, color: 0x7A9DC0 },
      { type: "cabana",      label: "Cabana",       w: 14, d: 14, color: 0xC8A96E },
      { type: "shade_sail",  label: "Shade Sail",   w: 15, d: 15, color: 0xE8C88A },
    ],
  },
  {
    key: "water", label: "Water Features", icon: Waves,
    items: [
      { type: "pool_rect",    label: "Pool (Rect)",    w: 24, d: 12, color: 0x2299CC },
      { type: "pool_freeform",label: "Pool (Freeform)", w: 22, d: 14, color: 0x1E88E5 },
      { type: "spa",          label: "Spa / Hot Tub",  w: 8,  d: 8,  color: 0x4DB8D4 },
      { type: "water_wall",   label: "Water Wall",     w: 8,  d: 1,  color: 0x64B5F6 },
    ],
  },
  {
    key: "kitchen", label: "Outdoor Kitchen", icon: UtensilsCrossed,
    items: [
      { type: "kitchen_island", label: "Kitchen Island",  w: 16, d: 4, color: 0x78909C },
      { type: "bbq_grill",      label: "BBQ / Grill",    w: 5,  d: 3, color: 0x37474F },
      { type: "pizza_oven",     label: "Pizza Oven",     w: 5,  d: 5, color: 0x8D6E63 },
      { type: "outdoor_bar",    label: "Outdoor Bar",    w: 14, d: 3, color: 0x6D4C41 },
    ],
  },
  {
    key: "hardscape", label: "Hardscape", icon: Layers,
    items: [
      { type: "patio",          label: "Patio / Deck",   w: 24, d: 18, color: 0xD4C4A0 },
      { type: "pavers",         label: "Paver Walkway",  w: 4,  d: 20, color: 0xBCAAA4 },
      { type: "retaining_wall", label: "Retaining Wall", w: 20, d: 2,  color: 0x8D7B6A },
      { type: "fire_table",     label: "Fire Table",     w: 5,  d: 5,  color: 0xBF360C },
    ],
  },
  {
    key: "landscaping", label: "Landscaping", icon: TreePine,
    items: [
      { type: "tree_palm",  label: "Palm Tree",    w: 6,  d: 6,  color: 0x2E7D32 },
      { type: "tree_shade", label: "Shade Tree",   w: 10, d: 10, color: 0x388E3C },
      { type: "shrub",      label: "Shrub / Hedge",w: 4,  d: 4,  color: 0x558B2F },
      { type: "lawn",       label: "Lawn Area",    w: 20, d: 16, color: 0x66BB6A },
    ],
  },
  {
    key: "amenities", label: "Amenities", icon: Compass,
    items: [
      { type: "firepit",       label: "Fire Pit",      w: 6,  d: 6,  color: 0xE64A19 },
      { type: "seating",       label: "Seating Group", w: 10, d: 10, color: 0xA1887F },
      { type: "dining_set",    label: "Dining Set",    w: 8,  d: 8,  color: 0x8D6E63 },
      { type: "putting_green", label: "Putting Green", w: 10, d: 16, color: 0x388E3C },
      { type: "bocce_court",   label: "Bocce Court",   w: 8,  d: 30, color: 0xD4A76A },
      { type: "outdoor_tv",    label: "Outdoor TV",    w: 4,  d: 1,  color: 0x212121 },
    ],
  },
];

const ALL_ITEMS = CATEGORIES.flatMap(c => c.items);
const ITEM_MAP = Object.fromEntries(ALL_ITEMS.map(i => [i.type, i]));

// ─── Imperative 3D mesh builders ───────────────────────────────────────────

function buildPergola(w, d, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.85), roughness: 0.7 });
  const postH = 10, postSize = 0.5;
  [[-w/2+postSize, -d/2+postSize], [w/2-postSize, -d/2+postSize],
   [-w/2+postSize,  d/2-postSize], [w/2-postSize,  d/2-postSize]].forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, postH, postSize), mat);
    post.position.set(px, postH/2, pz); post.castShadow = true; g.add(post);
  });
  [[-w/2+postSize, w/2-postSize]].forEach((_, i) => {
    [[-w/2+postSize], [w/2-postSize]].forEach(([px]) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(postSize, 0.4, d - postSize), accentMat);
      beam.position.set(px, postH, 0); beam.castShadow = true; g.add(beam);
    });
  });
  for (let i = 0; i < Math.floor(w/2); i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, d - postSize), mat);
    slat.position.set(-w/2 + postSize + i*2 + 1, postH + 0.2, 0); slat.castShadow = true; g.add(slat);
  }
  return g;
}

function buildPool(w, d, color) {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), new THREE.MeshStandardMaterial({ color: 0x1a5276, roughness: 0.3 }));
  basin.position.y = -0.6; basin.receiveShadow = true; g.add(basin);
  const water = new THREE.Mesh(new THREE.BoxGeometry(w-0.2, 0.05, d-0.2), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.1 }));
  water.position.y = 0.02; g.add(water);
  const copingMat = new THREE.MeshStandardMaterial({ color: 0xE8E0D0, roughness: 0.7 });
  [[-(w/2+0.2), 0, 0, w+0.4, 0.3, 0.4], [w/2+0.2, 0, 0, 0.4, 0.3, d+0.4],
   [0, 0, -(d/2+0.2), w+0.4, 0.3, 0.4], [0, 0, d/2+0.2, 0.4, 0.3, d+0.4]].forEach(([x,y,z,bw,bh,bd]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd), copingMat);
    c.position.set(x,y,z); c.receiveShadow = true; g.add(c);
  });
  return g;
}

function buildTree(type, color) {
  const g = new THREE.Group();
  if (type === "tree_palm") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 10, 8), new THREE.MeshStandardMaterial({ color: 0xA0854C, roughness: 0.9 }));
    trunk.position.y = 5; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const rad = (i * 60) * Math.PI / 180;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      frond.position.set(Math.sin(rad)*2, 10.5, Math.cos(rad)*2);
      frond.rotation.set(0.4, rad, 0.3); frond.castShadow = true; g.add(frond);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 6, 8), new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 }));
    trunk.position.y = 3; trunk.castShadow = true; g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    canopy.position.y = 8; canopy.castShadow = true; g.add(canopy);
  }
  return g;
}

function buildFirepit(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x7B7B7B, roughness: 0.9 }));
  ring.position.y = 0.3; ring.castShadow = true; g.add(ring);
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x1A1A1A }));
  ember.position.y = 0.7; g.add(ember);
  const flame1 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0xFF6F00, emissive: new THREE.Color(0xFF3D00), emissiveIntensity: 1.5, transparent: true, opacity: 0.85 }));
  flame1.position.y = 1.4; g.add(flame1);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0xFFCA28, emissive: new THREE.Color(0xFF6F00), emissiveIntensity: 2, transparent: true, opacity: 0.7 }));
  flame2.position.y = 1.9; g.add(flame2);
  return g;
}

function buildGeneric(type, w, d, color) {
  const h = ["retaining_wall","outdoor_bar"].includes(type) ? 3
    : ["patio","pavers","lawn","patio_cover"].includes(type) ? 0.25
    : ["pool_rect","pool_freeform"].includes(type) ? 0.4
    : ["dining_set","seating"].includes(type) ? 2
    : ["outdoor_tv"].includes(type) ? 3
    : type === "shade_sail" ? 0.15
    : 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: type === "outdoor_tv" ? 0.6 : 0 })
  );
  mesh.position.y = h / 2;
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh); return g;
}

function buildStructureGroup(el) {
  const cfg = ITEM_MAP[el.type] || {};
  const w = el.w ?? cfg.w ?? 10;
  const d = el.d ?? cfg.d ?? 10;
  const color = el.color ?? cfg.color ?? 0x888888;
  const hexColor = typeof color === "string" ? parseInt(color.replace("#", ""), 16) : color;

  let meshGroup;
  switch (el.type) {
    case "pergola":     meshGroup = buildPergola(w, d, hexColor); break;
    case "pool_rect":
    case "pool_freeform": meshGroup = buildPool(w, d, hexColor); break;
    case "tree_palm":
    case "tree_shade":  meshGroup = buildTree(el.type, hexColor); break;
    case "firepit":     meshGroup = buildFirepit(hexColor); break;
    default:            meshGroup = buildGeneric(el.type, w, d, hexColor);
  }

  // Selection ring
  const ringGeo = new THREE.RingGeometry(Math.max(w, d) * 0.55, Math.max(w, d) * 0.6, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xF59E0B, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  ring.name = "selection_ring";
  ring.visible = false;
  meshGroup.add(ring);

  meshGroup.userData.elementId = el.id;
  return meshGroup;
}

// ─── Satellite URL ──────────────────────────────────────────────────────────

function buildSatUrl(lat, lon, lotW, lotD) {
  const latDPF = 1 / 364000;
  const lonDPF = 1 / (364000 * Math.cos(lat * Math.PI / 180));
  // Show 1.6x the lot size so you see the house + surroundings
  const halfW = (lotW * 0.8) * lonDPF;
  const halfD = (lotD * 0.8) * latDPF;
  const bbox = `${lon - halfW},${lat - halfD},${lon + halfW},${lat + halfD}`;
  return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&size=2048,2048&imageSR=4326&format=png&f=image`;
}

// ─── Lot Setup Dialog ───────────────────────────────────────────────────────

function LotSetup({ lotW, lotD, designAddress, onApply, onClose }) {
  const [w, setW] = useState(lotW || DEFAULT_LOT_W);
  const [d, setD] = useState(lotD || DEFAULT_LOT_D);
  const [address, setAddress] = useState(designAddress || "");
  const [status, setStatus] = useState(null);
  const [info, setInfo] = useState(null);
  const [coords, setCoords] = useState(null);

  const lookup = async () => {
    if (!address.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.trim())}&addressdetails=1&limit=1`,
        { headers: { "Accept-Language": "en-US,en" } }
      );
      const data = await res.json();
      if (!data.length) { setStatus("notfound"); return; }
      const { lat, lon, boundingbox, display_name } = data[0];
      const numLat = parseFloat(lat), numLon = parseFloat(lon);
      let widthFt, depthFt, source = "address bounds";
      try {
        const q = `[out:json][timeout:15];(way(around:40,${numLat},${numLon})[landuse~"residential|grass|garden"];);out geom;`;
        const ov = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: q });
        const od = await ov.json();
        if (od.elements?.[0]?.geometry?.length > 2) {
          const geom = od.elements[0].geometry;
          const lats = geom.map(p => p.lat), lons = geom.map(p => p.lon);
          widthFt = Math.round(haversineDistFt(numLat, Math.min(...lons), numLat, Math.max(...lons)));
          depthFt = Math.round(haversineDistFt(Math.min(...lats), numLon, Math.max(...lats), numLon));
          source = "parcel data";
        }
      } catch {}
      if (!widthFt) {
        const [s, n, we, e] = boundingbox.map(Number);
        widthFt = Math.round(haversineDistFt((s+n)/2, we, (s+n)/2, e));
        depthFt = Math.round(haversineDistFt(s, numLon, n, numLon));
      }
      widthFt = Math.max(20, Math.min(widthFt, 500));
      depthFt = Math.max(20, Math.min(depthFt, 500));
      setW(widthFt); setD(depthFt);
      setCoords({ lat: numLat, lon: numLon });
      setInfo({ display_name, source, widthFt, depthFt });
      setStatus("found");
    } catch { setStatus("error"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div>
          <p className="font-bold text-slate-900 text-lg">Set Up Your Lot</p>
          <p className="text-xs text-slate-500 mt-0.5">Enter the property address to load the aerial photo and detect lot dimensions.</p>
        </div>
        <div>
          <Label className="text-xs text-slate-500 mb-1.5 block">Property Address</Label>
          <div className="flex gap-2">
            <Input value={address} onChange={e => { setAddress(e.target.value); setStatus(null); }}
              onKeyDown={e => e.key === "Enter" && lookup()}
              placeholder="123 Main St, City, TX 75001" className="h-9 text-sm flex-1" />
            <Button type="button" size="sm" onClick={lookup}
              disabled={status === "loading" || !address.trim()}
              className="bg-slate-800 text-white h-9 shrink-0">
              {status === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Maximize2 className="w-3 h-3 mr-1" />Look Up</>}
            </Button>
          </div>
          {status === "found" && info && (
            <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-0.5">
              <p className="font-semibold text-emerald-800">{info.widthFt}′ wide × {info.depthFt}′ deep <span className="font-normal text-emerald-600">via {info.source}</span></p>
              <p className="text-emerald-600 truncate">{info.display_name}</p>
            </div>
          )}
          {status === "notfound" && <p className="mt-1.5 text-xs text-amber-600">Address not found — try adding city and state.</p>}
          {status === "error" && <p className="mt-1.5 text-xs text-rose-500">Lookup failed — check your connection.</p>}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Lot Dimensions</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-500 mb-1 block">Width (ft)</Label>
              <Input type="number" min={20} value={w} onChange={e => setW(Number(e.target.value))} className="h-9" /></div>
            <div><Label className="text-xs text-slate-500 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={20} value={d} onChange={e => setD(Number(e.target.value))} className="h-9" /></div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">{(w * d).toLocaleString()} sq ft</p>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onApply(w, d, coords)}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">Apply & Load Photo</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Properties Panel ───────────────────────────────────────────────────────

function PropertiesPanel({ el, onUpdate, onDelete, onDuplicate }) {
  if (!el) return (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-xs text-slate-400 text-center">Click any element on the canvas to select it</p>
    </div>
  );
  const cfg = ITEM_MAP[el.type] || {};
  const hexColor = typeof el.color === "number"
    ? "#" + el.color.toString(16).padStart(6, "0")
    : (el.color || "#888888");

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{el.label}</p>
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">Label</Label>
            <Input value={el.label} onChange={e => onUpdate(el.id, { label: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px] text-slate-500 mb-1 block">Width (ft)</Label>
              <Input type="number" min={1} value={el.w ?? cfg.w ?? 10}
                onChange={e => onUpdate(el.id, { w: Number(e.target.value) })} className="h-8 text-xs" /></div>
            <div><Label className="text-[10px] text-slate-500 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={1} value={el.d ?? cfg.d ?? 10}
                onChange={e => onUpdate(el.id, { d: Number(e.target.value) })} className="h-8 text-xs" /></div>
          </div>
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">Color</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={hexColor}
                onChange={e => onUpdate(el.id, { color: parseInt(e.target.value.replace("#",""), 16) })}
                className="w-8 h-8 rounded cursor-pointer border border-slate-200" />
              <span className="text-xs text-slate-500">{hexColor}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <button onClick={() => onDuplicate(el.id)}
          className="flex items-center gap-2 w-full text-xs text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <button onClick={() => onDelete(el.id)}
          className="flex items-center gap-2 w-full text-xs text-rose-500 hover:text-rose-700 px-2 py-1.5 rounded hover:bg-rose-50 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Remove
        </button>
      </div>
    </div>
  );
}

// ─── Palette ────────────────────────────────────────────────────────────────

function Palette({ onAdd }) {
  const [expanded, setExpanded] = useState({ shade: true });
  return (
    <div className="overflow-y-auto flex-1 py-1">
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        return (
          <div key={cat.key}>
            <button
              onClick={() => setExpanded(e => ({ ...e, [cat.key]: !e[cat.key] }))}
              className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-1.5"><Icon className="w-3 h-3" />{cat.label}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", expanded[cat.key] && "rotate-180")} />
            </button>
            {expanded[cat.key] && (
              <div className="px-2 pb-2 space-y-1">
                {cat.items.map(item => (
                  <button key={item.type} onClick={() => onAdd(item)}
                    className="flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-900/30 border border-transparent hover:border-amber-700/40 transition-all group">
                    <div className="w-3.5 h-3.5 rounded shrink-0" style={{ backgroundColor: "#" + item.color.toString(16).padStart(6,"0") }} />
                    <span className="text-xs font-medium text-slate-300 group-hover:text-amber-300">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Editor ────────────────────────────────────────────────────────────

export default function DesignEditor() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const designId = params.get("id");

  const [design, setDesign]       = useState(null);
  const [elements, setElements]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lotW, setLotW]           = useState(DEFAULT_LOT_W);
  const [lotD, setLotD]           = useState(DEFAULT_LOT_D);
  const [geoCoords, setGeoCoords] = useState(null);
  const [showSat, setShowSat]     = useState(false);
  const [showLotSetup, setShowLotSetup] = useState(false);
  const [activePanel, setActivePanel]   = useState("palette");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [loading, setLoading]     = useState(true);

  // Three.js refs — never trigger re-renders
  const mountRef      = useRef(null);
  const sceneRef      = useRef(null);
  const cameraRef     = useRef(null);
  const rendererRef   = useRef(null);
  const controlsRef   = useRef(null);
  const groupsRef     = useRef({});       // elementId → THREE.Group
  const groundRef     = useRef(null);     // ground mesh
  const selectedIdRef = useRef(null);
  const elementsRef   = useRef([]);
  const lotRef        = useRef({ w: DEFAULT_LOT_W, d: DEFAULT_LOT_D });
  const animIdRef     = useRef(null);

  // ── Load design ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!designId) { setLoading(false); return; }
    base44.entities.Design.get(designId).then(d => {
      setDesign(d);
      if (d.canvas_data) {
        const els = d.canvas_data.elements || [];
        setElements(els);
        const lw = d.canvas_data.lotW || DEFAULT_LOT_W;
        const ld = d.canvas_data.lotD || DEFAULT_LOT_D;
        setLotW(lw); setLotD(ld);
        lotRef.current = { w: lw, d: ld };
        if (d.canvas_data.geoCoords) {
          setGeoCoords(d.canvas_data.geoCoords);
          setShowSat(true);
        }
      } else {
        setShowLotSetup(true);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [designId]);

  // ── Three.js Setup ───────────────────────────────────────────────────────

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 300, 800);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(0, 80, 100);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.screenSpacePanning = false;
    controlsRef.current = controls;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8);
    sun.position.set(80, 120, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    scene.add(sun);
    const fill = new THREE.HemisphereLight(0x87CEEB, 0x4a7c59, 0.5);
    scene.add(fill);

    // Initial ground
    rebuildGround(scene, lotRef.current.w, lotRef.current.d, null);

    // Drag state
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragGroupId = null;
    let dragOffset = new THREE.Vector3();

    const toNDC = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getPlanePoint = () => {
      raycaster.setFromCamera(mouse, camera);
      const pt = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, pt);
      return pt;
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      toNDC(e);
      raycaster.setFromCamera(mouse, camera);
      const allMeshes = [];
      Object.values(groupsRef.current).forEach(group => {
        group.traverse(child => { if (child.isMesh && child.name !== "selection_ring") allMeshes.push(child); });
      });
      const hits = raycaster.intersectObjects(allMeshes, false);
      if (hits.length > 0) {
        let hitId = null;
        let obj = hits[0].object;
        while (obj) {
          if (obj.userData?.elementId) { hitId = obj.userData.elementId; break; }
          // Check if any group key matches
          for (const [id, group] of Object.entries(groupsRef.current)) {
            if (obj === group) { hitId = id; break; }
          }
          if (hitId) break;
          obj = obj.parent;
        }
        // Fallback: find which group contains the hit object
        if (!hitId) {
          for (const [id, group] of Object.entries(groupsRef.current)) {
            let o = hits[0].object;
            while (o) { if (o === group) { hitId = id; break; } o = o.parent; }
            if (hitId) break;
          }
        }
        if (hitId) {
          setSelectedId(hitId);
          selectedIdRef.current = hitId;
          setActivePanel("props");
          isDragging = true;
          dragGroupId = hitId;
          controls.enabled = false;
          renderer.domElement.style.cursor = "grabbing";
          const pt = getPlanePoint();
          const group = groupsRef.current[hitId];
          if (pt && group) dragOffset.set(group.position.x - pt.x, 0, group.position.z - pt.z);
        }
      } else {
        setSelectedId(null);
        selectedIdRef.current = null;
      }
    };

    const onMouseMove = (e) => {
      if (!isDragging || !dragGroupId) return;
      toNDC(e);
      const pt = getPlanePoint();
      const group = groupsRef.current[dragGroupId];
      if (pt && group) {
        group.position.x = pt.x + dragOffset.x;
        group.position.z = pt.z + dragOffset.z;
      }
    };

    const onMouseUp = () => {
      if (isDragging && dragGroupId) {
        const group = groupsRef.current[dragGroupId];
        if (group) {
          const x = group.position.x, z = group.position.z;
          setElements(prev => prev.map(el => el.id === dragGroupId ? { ...el, x, z } : el));
        }
      }
      isDragging = false;
      dragGroupId = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = "auto";
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseup", onMouseUp);

    // Resize
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Animation loop
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      controls.update();
      const selId = selectedIdRef.current;
      Object.entries(groupsRef.current).forEach(([id, group]) => {
        const ring = group.getObjectByName("selection_ring");
        if (ring) ring.visible = id === selId;
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mouseup", onMouseUp);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // runs once

  // ── Sync elements → scene ────────────────────────────────────────────────

  useEffect(() => {
    elementsRef.current = elements;
    const scene = sceneRef.current;
    if (!scene) return;
    const existing = new Set(Object.keys(groupsRef.current));
    const current = new Set(elements.map(el => el.id));

    // Remove deleted
    existing.forEach(id => {
      if (!current.has(id)) {
        scene.remove(groupsRef.current[id]);
        delete groupsRef.current[id];
      }
    });

    // Add new
    elements.forEach(el => {
      if (!groupsRef.current[el.id]) {
        const group = buildStructureGroup(el);
        group.position.set(el.x ?? 0, 0, el.z ?? 0);
        scene.add(group);
        groupsRef.current[el.id] = group;
      }
    });
  }, [elements]);

  // ── Rebuild ground when lot/sat changes ──────────────────────────────────

  function rebuildGround(scene, w, d, satTexture) {
    if (groundRef.current) {
      scene.remove(groundRef.current);
      groundRef.current.geometry.dispose();
      if (groundRef.current.material.map) groundRef.current.material.map.dispose();
      groundRef.current.material.dispose();
    }
    // Extended base ground
    const baseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 8, d * 8),
      new THREE.MeshStandardMaterial({ color: 0x4a7c59, roughness: 0.95 })
    );
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = -0.02;
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);

    // Lot surface (satellite photo or grass)
    const lotMat = satTexture
      ? new THREE.MeshStandardMaterial({ map: satTexture, roughness: 0.85 })
      : new THREE.MeshStandardMaterial({ color: 0x5a9e6f, roughness: 0.9 });
    const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lotMat);
    lotMesh.rotation.x = -Math.PI / 2;
    lotMesh.position.y = -0.01;
    lotMesh.receiveShadow = true;
    scene.add(lotMesh);
    groundRef.current = lotMesh;

    // Lot boundary line
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xF59E0B, linewidth: 2 });
    const boundary = new THREE.LineSegments(edges, lineMat);
    boundary.position.y = 0.05;
    scene.add(boundary);
  }

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    lotRef.current = { w: lotW, d: lotD };

    if (showSat && geoCoords) {
      const url = buildSatUrl(geoCoords.lat, geoCoords.lon, lotW, lotD);
      new THREE.TextureLoader().load(url, tex => {
        tex.flipY = false;
        rebuildGround(scene, lotW, lotD, tex);
      }, undefined, () => rebuildGround(scene, lotW, lotD, null));
    } else {
      rebuildGround(scene, lotW, lotD, null);
    }
  }, [lotW, lotD, geoCoords, showSat]);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!designId) return;
    setSaving(true);
    try {
      await base44.entities.Design.update(designId, {
        canvas_data: { elements: elementsRef.current, lotW, lotD, geoCoords },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }, [designId, lotW, lotD, geoCoords]);

  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
      if (["Delete", "Backspace"].includes(e.key) && selectedIdRef.current && document.activeElement.tagName !== "INPUT") {
        const id = selectedIdRef.current;
        setElements(prev => prev.filter(el => el.id !== id));
        setSelectedId(null); selectedIdRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  // ── Element ops ─────────────────────────────────────────────────────────

  const addElement = (item) => {
    const id = `el_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const lw = lotRef.current.w, ld = lotRef.current.d;
    const newEl = {
      id, type: item.type, label: item.label,
      color: item.color, w: item.w, d: item.d,
      x: (Math.random() - 0.5) * lw * 0.5,
      z: (Math.random() - 0.5) * ld * 0.5,
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id); selectedIdRef.current = id;
    setActivePanel("props");
  };

  const updateElement = (id, patch) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));
    // Rebuild mesh when structural props change
    if (patch.color !== undefined || patch.w !== undefined || patch.d !== undefined) {
      const scene = sceneRef.current;
      if (!scene || !groupsRef.current[id]) return;
      scene.remove(groupsRef.current[id]);
      delete groupsRef.current[id];
    }
  };

  const deleteElement = (id) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedId(null); selectedIdRef.current = null;
  };

  const duplicateElement = (id) => {
    const src = elementsRef.current.find(el => el.id === id);
    if (!src) return;
    const newId = `el_${Date.now()}`;
    const dup = { ...src, id: newId, x: src.x + 5, z: src.z + 5 };
    setElements(prev => [...prev, dup]);
    setSelectedId(newId); selectedIdRef.current = newId;
  };

  const selectedEl = elements.find(el => el.id === selectedId) || null;

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-900" style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* Top bar */}
      <div className="h-12 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-3 shrink-0 z-20">
        <button onClick={() => navigate(createPageUrl("DesignPortal"))}
          className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="w-px h-5 bg-slate-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{design?.title || "Untitled Design"}</p>
          {design?.client_name && <p className="text-xs text-slate-400 truncate">{design.client_name}</p>}
        </div>

        <button
          onClick={() => { if (!geoCoords) { setShowLotSetup(true); return; } setShowSat(s => !s); }}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            showSat && geoCoords ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}
        >
          <Map className="w-3.5 h-3.5" /> {showSat && geoCoords ? "Aerial On" : "Load Aerial"}
        </button>

        <button onClick={() => setShowLotSetup(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">
          <RulerIcon className="w-3.5 h-3.5" /> {lotW}′ × {lotD}′
        </button>

        <Button size="sm" onClick={handleSave} disabled={saving}
          className={cn("gap-1.5 min-w-[80px]", saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-to-r from-amber-500 to-orange-500")}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <><Check className="w-3.5 h-3.5" /> Saved</>
            : <><Save className="w-3.5 h-3.5" /> Save</>}
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-52 bg-slate-900 border-r border-slate-700 flex flex-col shrink-0 z-10">
          <div className="flex border-b border-slate-700 shrink-0">
            {[{ key: "palette", label: "Elements" }, { key: "props", label: "Properties" }].map(({ key, label }) => (
              <button key={key} onClick={() => setActivePanel(key)}
                className={cn("flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  activePanel === key ? "text-amber-400 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-300")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden flex flex-col text-white">
            {activePanel === "palette"
              ? <Palette onAdd={addElement} />
              : <PropertiesPanel el={selectedEl} onUpdate={updateElement} onDelete={deleteElement} onDuplicate={duplicateElement} />
            }
          </div>
        </div>

        {/* 3D Canvas */}
        <div className="flex-1 relative">
          <div ref={mountRef} className="w-full h-full" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-3 py-1.5 rounded-full pointer-events-none select-none">
            Left drag: rotate · Right drag: pan · Scroll: zoom · Click element to select &amp; drag
          </div>
        </div>

        {/* Right layers panel */}
        <div className="w-36 bg-slate-900 border-l border-slate-700 flex flex-col shrink-0 text-white">
          <div className="p-3 border-b border-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Summary</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400">Elements</p>
                <p className="text-2xl font-bold text-white">{elements.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Lot</p>
                <p className="text-sm font-semibold text-slate-200">{(lotW * lotD).toLocaleString()} ft²</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 py-2">Layers</p>
            {[...elements].reverse().map(el => (
              <button key={el.id} onClick={() => { setSelectedId(el.id); selectedIdRef.current = el.id; setActivePanel("props"); }}
                className={cn("flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors",
                  selectedId === el.id ? "bg-amber-900/50 text-amber-300" : "text-slate-400 hover:bg-slate-800")}>
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "#" + (typeof el.color === "number" ? el.color : parseInt((el.color||"888888").replace("#",""),16)).toString(16).padStart(6,"0") }} />
                <span className="truncate font-medium">{el.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showLotSetup && (
        <LotSetup
          lotW={lotW} lotD={lotD}
          designAddress={design?.address || ""}
          onApply={(w, d, coords) => {
            setLotW(w); setLotD(d);
            lotRef.current = { w, d };
            if (coords) { setGeoCoords(coords); setShowSat(true); }
            setShowLotSetup(false);
          }}
          onClose={() => setShowLotSetup(false)}
        />
      )}
    </div>
  );
}
