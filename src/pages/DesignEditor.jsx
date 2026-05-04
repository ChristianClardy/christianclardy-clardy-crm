import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Stage, Layer, Rect, Ellipse, Line, Text, Transformer, Group, Image as KonvaImage } from "react-konva";
import {
  ArrowLeft, Save, Trash2, RotateCcw, ZoomIn, ZoomOut, Grid3X3,
  Maximize2, Check, Loader2, Copy, FlipHorizontal, ChevronDown,
  Sun, Layers, Fence, UtensilsCrossed, Waves, TreePine, Compass,
  Square, Circle, Minus, Move, MousePointer, Receipt, LayoutPanelLeft,
  ChevronRight, RulerIcon, Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Structure catalog ────────────────────────────────────────────────────────

const STRUCTURES = [
  {
    category: "Shade Structures",
    items: [
      { type: "pergola",        label: "Pergola",        shape: "rect",    color: "#a78a7f", defaultW: 200, defaultH: 160, icon: Sun },
      { type: "patio_cover",    label: "Patio Cover",    shape: "rect",    color: "#8faacc", defaultW: 240, defaultH: 180, icon: Layers },
      { type: "cabana",         label: "Cabana",         shape: "rect",    color: "#b5965a", defaultW: 160, defaultH: 160, icon: Fence },
      { type: "shade_sail",     label: "Shade Sail",     shape: "polygon", color: "#c8a97a", defaultW: 180, defaultH: 180, icon: Sun },
    ],
  },
  {
    category: "Water Features",
    items: [
      { type: "pool_rect",      label: "Pool (Rect)",    shape: "rect",    color: "#5ba3c9", defaultW: 300, defaultH: 160, icon: Waves },
      { type: "pool_oval",      label: "Pool (Oval)",    shape: "ellipse", color: "#5ba3c9", defaultW: 300, defaultH: 160, icon: Waves },
      { type: "spa",            label: "Spa / Hot Tub",  shape: "ellipse", color: "#7ab8d3", defaultW: 100, defaultH: 100, icon: Waves },
      { type: "water_feature",  label: "Water Feature",  shape: "ellipse", color: "#82c4dc", defaultW: 80,  defaultH: 80,  icon: Waves },
    ],
  },
  {
    category: "Outdoor Kitchen",
    items: [
      { type: "outdoor_kitchen", label: "Kitchen Island", shape: "rect",   color: "#6b7280", defaultW: 200, defaultH: 80,  icon: UtensilsCrossed },
      { type: "bbq_grill",       label: "BBQ / Grill",    shape: "rect",   color: "#4b5563", defaultW: 80,  defaultH: 60,  icon: UtensilsCrossed },
      { type: "pizza_oven",      label: "Pizza Oven",     shape: "ellipse", color: "#78502a", defaultW: 70,  defaultH: 70,  icon: UtensilsCrossed },
      { type: "bar",             label: "Outdoor Bar",    shape: "rect",   color: "#5d4037", defaultW: 200, defaultH: 60,  icon: UtensilsCrossed },
    ],
  },
  {
    category: "Landscaping",
    items: [
      { type: "lawn",           label: "Lawn Area",      shape: "rect",    color: "#86c98c", defaultW: 280, defaultH: 200, icon: TreePine },
      { type: "garden_bed",     label: "Garden Bed",     shape: "ellipse", color: "#6aaa6e", defaultW: 160, defaultH: 80,  icon: TreePine },
      { type: "tree",           label: "Tree",           shape: "ellipse", color: "#4a8a4e", defaultW: 60,  defaultH: 60,  icon: TreePine },
      { type: "golf_green",     label: "Golf Green",     shape: "rect",    color: "#3d7a41", defaultW: 300, defaultH: 240, icon: TreePine },
      { type: "putting_hole",   label: "Putting Hole",   shape: "ellipse", color: "#2d5a30", defaultW: 24,  defaultH: 24,  icon: TreePine },
    ],
  },
  {
    category: "Hardscape",
    items: [
      { type: "patio",          label: "Patio / Deck",   shape: "rect",    color: "#d4c4a0", defaultW: 300, defaultH: 200, icon: Layers },
      { type: "concrete",       label: "Concrete Slab",  shape: "rect",    color: "#c0b898", defaultW: 240, defaultH: 180, icon: Layers },
      { type: "pavers",         label: "Paver Area",     shape: "rect",    color: "#c8b48a", defaultW: 200, defaultH: 160, icon: Layers },
      { type: "driveway",       label: "Driveway",       shape: "rect",    color: "#b0a890", defaultW: 120, defaultH: 280, icon: Layers },
      { type: "walkway",        label: "Walkway",        shape: "rect",    color: "#c4b89a", defaultW: 60,  defaultH: 200, icon: Layers },
      { type: "retaining_wall", label: "Retaining Wall", shape: "rect",    color: "#8d7b6a", defaultW: 200, defaultH: 24,  icon: Fence },
    ],
  },
  {
    category: "Amenities",
    items: [
      { type: "firepit",        label: "Fire Pit",       shape: "ellipse", color: "#e07050", defaultW: 80,  defaultH: 80,  icon: Sun },
      { type: "fireplace",      label: "Fireplace",      shape: "rect",    color: "#c45a30", defaultW: 80,  defaultH: 60,  icon: Sun },
      { type: "seating",        label: "Seating Area",   shape: "ellipse", color: "#d4a870", defaultW: 120, defaultH: 100, icon: Fence },
      { type: "dining",         label: "Dining Area",    shape: "rect",    color: "#c89a60", defaultW: 120, defaultH: 100, icon: Fence },
      { type: "game_area",      label: "Game Area",      shape: "rect",    color: "#9a8a78", defaultW: 160, defaultH: 120, icon: Compass },
    ],
  },
];

const STRUCTURE_MAP = Object.fromEntries(
  STRUCTURES.flatMap(cat => cat.items).map(s => [s.type, s])
);

// ─── Pixels-per-foot scale control ───────────────────────────────────────────

const DEFAULT_SCALE = 4; // px per foot
const GRID_FT = 10;      // grid lines every 10 feet

function pxToFt(px, scale) { return Math.round(px / scale); }
function ftToPx(ft, scale) { return ft * scale; }

// ─── Individual element on canvas ────────────────────────────────────────────

function CanvasElement({ el, scale, selected, onSelect, onChange, onDragEnd }) {
  const shapeRef  = useRef();
  const trRef     = useRef();
  const isDragging = useRef(false);

  useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selected]);

  const commonProps = {
    ref: shapeRef,
    x: el.x,
    y: el.y,
    fill: el.color + "99",
    stroke: el.color,
    strokeWidth: selected ? 2 : 1,
    draggable: true,
    onClick: (e) => { e.cancelBubble = true; onSelect(el.id); },
    onTap:   (e) => { e.cancelBubble = true; onSelect(el.id); },
    onDragStart: () => { isDragging.current = true; },
    onDragEnd: (e) => {
      isDragging.current = false;
      onDragEnd(el.id, { x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: () => {
      const node = shapeRef.current;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onChange(el.id, {
        x: node.x(), y: node.y(),
        width:  Math.max(20, node.width()  * scaleX),
        height: Math.max(20, node.height() * scaleY),
      });
    },
  };

  const wPx = el.width;
  const hPx = el.height;
  const wFt = pxToFt(wPx, scale);
  const hFt = pxToFt(hPx, scale);

  return (
    <>
      {el.shape === "ellipse" ? (
        <Ellipse {...commonProps} radiusX={wPx / 2} radiusY={hPx / 2}
          offsetX={-wPx / 2} offsetY={-hPx / 2} />
      ) : (
        <Rect {...commonProps} width={wPx} height={hPx} cornerRadius={4} />
      )}

      {/* Label */}
      <Text
        x={el.x + 4}
        y={el.y + 4}
        text={`${el.label}\n${wFt}′ × ${hFt}′`}
        fontSize={10}
        fill="#1e293b"
        fontFamily="system-ui, sans-serif"
        listening={false}
        lineHeight={1.4}
      />

      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 20 || newBox.height < 20 ? oldBox : newBox
          }
        />
      )}
    </>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ element, scale, onUpdate, onDelete, onDuplicate }) {
  if (!element) return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-slate-400 space-y-2">
      <MousePointer className="w-6 h-6" />
      <p className="text-xs">Select an element to edit its properties</p>
    </div>
  );

  const wFt = pxToFt(element.width,  scale);
  const hFt = pxToFt(element.height, scale);
  const sqft = wFt * hFt;

  return (
    <div className="p-3 space-y-4 overflow-y-auto flex-1">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Selected Element</p>
        <p className="text-sm font-semibold text-slate-800">{element.label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{element.type.replace(/_/g, " ")}</p>
      </div>

      {/* Dimensions */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Dimensions</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">Width (ft)</Label>
            <Input
              type="number"
              min={1}
              value={wFt}
              onChange={e => onUpdate(element.id, { width: ftToPx(Number(e.target.value) || 1, scale) })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">Depth (ft)</Label>
            <Input
              type="number"
              min={1}
              value={hFt}
              onChange={e => onUpdate(element.id, { height: ftToPx(Number(e.target.value) || 1, scale) })}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">{sqft.toLocaleString()} sq ft</p>
      </div>

      {/* Label */}
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Label</Label>
        <Input
          value={element.label}
          onChange={e => onUpdate(element.id, { label: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      {/* Color */}
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={element.color}
            onChange={e => onUpdate(element.id, { color: e.target.value })}
            className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
          />
          <span className="text-xs font-mono text-slate-500">{element.color}</span>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Notes</Label>
        <textarea
          value={element.notes || ""}
          onChange={e => onUpdate(element.id, { notes: e.target.value })}
          placeholder="Material specs, client preferences…"
          rows={3}
          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-amber-400 text-slate-700"
        />
      </div>

      {/* Position */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Position</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">X (ft)</Label>
            <Input
              type="number"
              value={pxToFt(element.x, scale)}
              onChange={e => onUpdate(element.id, { x: ftToPx(Number(e.target.value), scale) })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">Y (ft)</Label>
            <Input
              type="number"
              value={pxToFt(element.y, scale)}
              onChange={e => onUpdate(element.id, { y: ftToPx(Number(e.target.value), scale) })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <button
          onClick={() => onDuplicate(element.id)}
          className="flex items-center gap-2 w-full text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <button
          onClick={() => onDelete(element.id)}
          className="flex items-center gap-2 w-full text-xs font-medium text-rose-500 hover:text-rose-700 px-2 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── Palette sidebar ──────────────────────────────────────────────────────────

function Palette({ onAdd }) {
  const [expanded, setExpanded] = useState({ "Shade Structures": true });

  return (
    <div className="overflow-y-auto flex-1 py-2">
      {STRUCTURES.map(cat => (
        <div key={cat.category}>
          <button
            onClick={() => setExpanded(e => ({ ...e, [cat.category]: !e[cat.category] }))}
            className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
          >
            {cat.category}
            <ChevronDown className={cn("w-3 h-3 transition-transform", expanded[cat.category] && "rotate-180")} />
          </button>
          {expanded[cat.category] && (
            <div className="px-2 pb-2 space-y-1">
              {cat.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    onClick={() => onAdd(item)}
                    className="flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all group"
                  >
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.color + "40", border: `1px solid ${item.color}80` }}
                    >
                      <Icon className="w-3 h-3" style={{ color: item.color }} />
                    </div>
                    <span className="text-xs font-medium text-slate-700 group-hover:text-amber-800">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Haversine distance in feet ───────────────────────────────────────────────

function haversineDistFt(lat1, lon1, lat2, lon2) {
  const R = 20902231; // Earth radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Lot setup dialog ─────────────────────────────────────────────────────────

function LotSetup({ lotW, lotH, scale, designAddress, onApply, onClose }) {
  const [w, setW] = useState(pxToFt(lotW, scale) || 80);
  const [h, setH] = useState(pxToFt(lotH, scale) || 100);
  const [address, setAddress] = useState(designAddress || "");
  const [lookupStatus, setLookupStatus] = useState(null);
  const [lookupInfo, setLookupInfo] = useState(null);
  const [foundCoords, setFoundCoords] = useState(null); // { lat, lon }

  const lookupAddress = async () => {
    if (!address.trim()) return;
    setLookupStatus("loading");
    setLookupInfo(null);
    try {
      // Step 1: Geocode the address
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.trim())}&addressdetails=1&limit=1`,
        { headers: { "Accept-Language": "en-US,en" } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) { setLookupStatus("notfound"); return; }

      const { lat, lon, boundingbox, display_name } = geoData[0];
      const numLat = parseFloat(lat);
      const numLon = parseFloat(lon);

      // Step 2: Query Overpass for parcel / residential lot polygon
      const overpassQuery = `[out:json][timeout:15];(way(around:40,${numLat},${numLon})[landuse~"residential|grass|garden"];way(around:40,${numLat},${numLon})["boundary"="lot"];);out geom;`;
      let widthFt, depthFt, source = "property bounds";

      try {
        const ovRes = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: overpassQuery,
        });
        const ovData = await ovRes.json();

        if (ovData.elements?.length > 0) {
          const geom = ovData.elements[0].geometry;
          if (geom?.length > 2) {
            const lats = geom.map(p => p.lat);
            const lons = geom.map(p => p.lon);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLon = Math.min(...lons), maxLon = Math.max(...lons);
            widthFt = Math.round(haversineDistFt(numLat, minLon, numLat, maxLon));
            depthFt = Math.round(haversineDistFt(minLat, numLon, maxLat, numLon));
            source = "parcel data";
          }
        }
      } catch {
        // Overpass failed — fall through to bounding box
      }

      // Fall back to geocoder bounding box if parcel not found
      if (!widthFt || !depthFt) {
        const [south, north, west, east] = boundingbox.map(Number);
        const cLat = (south + north) / 2;
        widthFt = Math.round(haversineDistFt(cLat, west, cLat, east));
        depthFt = Math.round(haversineDistFt(south, numLon, north, numLon));
        source = "address bounding box";
      }

      // Clamp to reasonable lot sizes (10–500 ft)
      widthFt = Math.max(10, Math.min(widthFt, 500));
      depthFt = Math.max(10, Math.min(depthFt, 500));

      setW(widthFt);
      setH(depthFt);
      setFoundCoords({ lat: numLat, lon: numLon });
      setLookupInfo({ display_name, source, widthFt, depthFt });
      setLookupStatus("found");
    } catch {
      setLookupStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div>
          <p className="font-bold text-slate-900">Lot / Yard Dimensions</p>
          <p className="text-xs text-slate-500 mt-0.5">Look up an address to auto-fill lot size, or enter dimensions manually.</p>
        </div>

        {/* Address lookup */}
        <div>
          <Label className="text-xs text-slate-500 mb-1.5 block">Property Address</Label>
          <div className="flex gap-2">
            <Input
              value={address}
              onChange={e => { setAddress(e.target.value); setLookupStatus(null); }}
              onKeyDown={e => e.key === "Enter" && lookupAddress()}
              placeholder="123 Main St, City, TX 75001"
              className="h-9 text-sm flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={lookupAddress}
              disabled={lookupStatus === "loading" || !address.trim()}
              className="bg-slate-800 text-white hover:bg-slate-700 shrink-0 h-9 px-3"
            >
              {lookupStatus === "loading"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <><Maximize2 className="w-3.5 h-3.5 mr-1" />Look Up</>
              }
            </Button>
          </div>

          {/* Lookup result feedback */}
          {lookupStatus === "found" && lookupInfo && (
            <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-0.5">
              <p className="font-semibold text-emerald-800">
                Found: {lookupInfo.widthFt}′ wide × {lookupInfo.depthFt}′ deep
                <span className="font-normal text-emerald-600 ml-1">via {lookupInfo.source}</span>
              </p>
              <p className="text-emerald-600 truncate">{lookupInfo.display_name}</p>
            </div>
          )}
          {lookupStatus === "notfound" && (
            <p className="mt-2 text-xs text-amber-600">Address not found. Try adding city, state, or zip code.</p>
          )}
          {lookupStatus === "error" && (
            <p className="mt-2 text-xs text-rose-500">Lookup failed — check your connection and try again.</p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Manual Override</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1.5 block">Width (ft)</Label>
              <Input type="number" min={10} value={w} onChange={e => setW(Number(e.target.value))} className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1.5 block">Depth (ft)</Label>
              <Input type="number" min={10} value={h} onChange={e => setH(Number(e.target.value))} className="h-9" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">{(w * h).toLocaleString()} sq ft total</p>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onApply(ftToPx(w, scale), ftToPx(h, scale), foundCoords)}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function DesignEditor() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const designId      = params.get("id");

  const [design, setDesign]       = useState(null);
  const [elements, setElements]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showGrid, setShowGrid]   = useState(true);
  const [scale, setScale]         = useState(DEFAULT_SCALE);
  const [lotW, setLotW]           = useState(ftToPx(80, DEFAULT_SCALE));
  const [lotH, setLotH]           = useState(ftToPx(100, DEFAULT_SCALE));
  const [showLotSetup, setShowLotSetup] = useState(false);
  const [stagePos, setStagePos]   = useState({ x: 60, y: 60 });
  const [activePanel, setActivePanel] = useState("palette"); // "palette" | "props"
  const [geoCoords, setGeoCoords] = useState(null); // { lat, lon }
  const [showSatellite, setShowSatellite] = useState(false);
  const [satImg, setSatImg] = useState(null);
  const [satLoading, setSatLoading] = useState(false);

  const stageRef  = useRef();
  const layerRef  = useRef();

  // ── Satellite imagery ───────────────────────────────────────────────────────

  const buildSatUrl = useCallback((lat, lon, wPx, hPx) => {
    const lotWFt = pxToFt(wPx, scale);
    const lotHFt = pxToFt(hPx, scale);
    const latDegPerFt = 1 / 364000;
    const lonDegPerFt = 1 / (364000 * Math.cos(lat * Math.PI / 180));
    const halfW = (lotWFt / 2) * lonDegPerFt;
    const halfH = (lotHFt / 2) * latDegPerFt;
    const west = lon - halfW, east = lon + halfW;
    const south = lat - halfH, north = lat + halfH;
    const imgW = Math.min(Math.round(wPx * 2), 2048);
    const imgH = Math.min(Math.round(hPx * 2), 2048);
    return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${west},${south},${east},${north}&bboxSR=4326&size=${imgW},${imgH}&imageSR=4326&format=png&f=image`;
  }, [scale]);

  useEffect(() => {
    if (!geoCoords || !showSatellite) return;
    setSatLoading(true);
    setSatImg(null);
    const url = buildSatUrl(geoCoords.lat, geoCoords.lon, lotW, lotH);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { setSatImg(img); setSatLoading(false); };
    img.onerror = () => { setSatImg(null); setSatLoading(false); };
    img.src = url;
  }, [geoCoords, showSatellite, lotW, lotH, buildSatUrl]);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!designId) { setLoading(false); return; }
    base44.entities.Design.get(designId).then(d => {
      setDesign(d);
      if (d.canvas_data) {
        setElements(d.canvas_data.elements || []);
        setLotW(d.canvas_data.lotW || ftToPx(80, DEFAULT_SCALE));
        setLotH(d.canvas_data.lotH || ftToPx(100, DEFAULT_SCALE));
        setScale(d.canvas_data.scale || DEFAULT_SCALE);
        if (d.canvas_data.geoCoords) setGeoCoords(d.canvas_data.geoCoords);
      } else {
        // New canvas — open lot setup so user can look up address
        setShowLotSetup(true);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [designId]);

  // Auto-switch to props panel when something is selected
  useEffect(() => {
    if (selectedId) setActivePanel("props");
  }, [selectedId]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!designId) return;
    setSaving(true);
    await base44.entities.Design.update(designId, {
      canvas_data: { elements, lotW, lotH, scale, geoCoords },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [designId, elements, lotW, lotH, scale, geoCoords]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
          setElements(prev => prev.filter(el => el.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, selectedId]);

  // ── Add element ────────────────────────────────────────────────────────────

  const addElement = (item) => {
    const id = `el_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newEl = {
      id,
      type:   item.type,
      label:  item.label,
      shape:  item.shape,
      color:  item.color,
      x:      60,
      y:      60,
      width:  item.defaultW,
      height: item.defaultH,
      notes:  "",
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const updateElement = (id, patch) =>
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));

  const deleteElement = (id) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedId(null);
  };

  const duplicateElement = (id) => {
    const src = elements.find(el => el.id === id);
    if (!src) return;
    const newId = `el_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setElements(prev => [...prev, { ...src, id: newId, x: src.x + 20, y: src.y + 20 }]);
    setSelectedId(newId);
  };

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const zoom = (dir) => {
    setScale(prev => {
      const next = dir > 0 ? Math.min(prev + 1, 12) : Math.max(prev - 1, 2);
      const factor = next / prev;
      setLotW(w => Math.round(w * factor));
      setLotH(h => Math.round(h * factor));
      setElements(els => els.map(el => ({
        ...el,
        x: Math.round(el.x * factor),
        y: Math.round(el.y * factor),
        width:  Math.round(el.width  * factor),
        height: Math.round(el.height * factor),
      })));
      return next;
    });
  };

  // ── Grid lines ────────────────────────────────────────────────────────────

  const gridLines = () => {
    if (!showGrid) return null;
    const lines = [];
    const gridPx = ftToPx(GRID_FT, scale);
    const cols = Math.ceil(lotW / gridPx);
    const rows = Math.ceil(lotH / gridPx);
    const stroke = showSatellite ? "rgba(255,255,255,0.12)" : "#00000015";
    for (let i = 0; i <= cols; i++) {
      const x = i * gridPx;
      lines.push(<Line key={`v${i}`} points={[x, 0, x, lotH]} stroke={stroke} strokeWidth={1} listening={false} />);
    }
    for (let i = 0; i <= rows; i++) {
      const y = i * gridPx;
      lines.push(<Line key={`h${i}`} points={[0, y, lotW, y]} stroke={stroke} strokeWidth={1} listening={false} />);
    }
    return lines;
  };

  const selectedEl = elements.find(el => el.id === selectedId) || null;

  const totalSqFt = elements.reduce((sum, el) => {
    return sum + pxToFt(el.width, scale) * pxToFt(el.height, scale);
  }, 0);

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-100 overflow-hidden" style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shrink-0 z-10">
        <button
          onClick={() => navigate(createPageUrl("DesignPortal"))}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="w-px h-5 bg-slate-200" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{design?.title || "Untitled Design"}</p>
          {design?.client_name && <p className="text-xs text-slate-400 truncate">{design.client_name}</p>}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-1 py-0.5">
          <button onClick={() => zoom(-1)} className="p-1 rounded hover:bg-slate-200 transition-colors"><ZoomOut className="w-3.5 h-3.5 text-slate-600" /></button>
          <span className="text-xs font-mono text-slate-600 w-12 text-center">{scale * 25}%</span>
          <button onClick={() => zoom(1)}  className="p-1 rounded hover:bg-slate-200 transition-colors"><ZoomIn  className="w-3.5 h-3.5 text-slate-600" /></button>
        </div>

        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid(g => !g)}
          className={cn("p-1.5 rounded-lg transition-colors", showGrid ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}
          title="Toggle grid"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>

        {/* Satellite toggle */}
        <button
          onClick={() => {
            if (!geoCoords) { setShowLotSetup(true); return; }
            setShowSatellite(s => !s);
          }}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
            showSatellite && geoCoords
              ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          )}
          title={geoCoords ? "Toggle satellite view" : "Look up address first to enable satellite view"}
        >
          <Map className="w-3.5 h-3.5" />
          {satLoading ? "Loading…" : "Satellite"}
        </button>

        {/* Lot setup */}
        <button
          onClick={() => setShowLotSetup(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors"
        >
          <RulerIcon className="w-3.5 h-3.5" />
          {pxToFt(lotW, scale)}′ × {pxToFt(lotH, scale)}′
        </button>

        {/* Save */}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className={cn("gap-1.5 min-w-[80px]", saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-to-r from-amber-500 to-orange-500")}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save</>}
        </Button>

        {/* Open estimate */}
        {design?.estimate_id && (
          <button
            onClick={() => navigate(createPageUrl(`EstimateDetail?id=${design.estimate_id}`))}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" /> View Estimate
          </button>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ───────────────────────────────────────────────────── */}
        <div className="w-52 bg-white border-r border-slate-200 flex flex-col shrink-0">
          {/* Panel tabs */}
          <div className="flex border-b border-slate-200 shrink-0">
            {[
              { key: "palette", label: "Elements", icon: LayoutPanelLeft },
              { key: "props",   label: "Properties", icon: MousePointer },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActivePanel(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  activePanel === key
                    ? "text-amber-700 border-b-2 border-amber-500"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {activePanel === "palette" && <Palette onAdd={addElement} />}

          {activePanel === "props" && (
            <PropertiesPanel
              element={selectedEl}
              scale={scale}
              onUpdate={updateElement}
              onDelete={deleteElement}
              onDuplicate={duplicateElement}
            />
          )}
        </div>

        {/* ── Canvas area ──────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-auto bg-slate-300 relative"
          style={{ backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)", backgroundSize: "20px 20px" }}
          onClick={() => setSelectedId(null)}
        >
          <div style={{ padding: 60, display: "inline-block" }}>
            <Stage
              ref={stageRef}
              width={lotW + 80}
              height={lotH + 80}
              onMouseDown={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
            >
              <Layer ref={layerRef}>
                {/* Satellite imagery (below everything) */}
                {showSatellite && satImg && (
                  <KonvaImage
                    x={40} y={40}
                    width={lotW} height={lotH}
                    image={satImg}
                    listening={false}
                  />
                )}

                {/* Lot boundary */}
                <Rect
                  x={40} y={40}
                  width={lotW} height={lotH}
                  fill={showSatellite ? undefined : "#f8f5f0"}
                  stroke={showSatellite ? "rgba(255,255,255,0.6)" : "#94a3b8"}
                  strokeWidth={2}
                  dash={[8, 4]}
                  listening={false}
                />

                {/* Lot label */}
                <Text
                  x={44} y={44}
                  text={`Lot: ${pxToFt(lotW, scale)}′ × ${pxToFt(lotH, scale)}′  (${(pxToFt(lotW, scale) * pxToFt(lotH, scale)).toLocaleString()} sq ft)`}
                  fontSize={10}
                  fill={showSatellite ? "rgba(255,255,255,0.75)" : "#94a3b8"}
                  fontFamily="system-ui"
                  listening={false}
                />

                {/* Grid inside lot */}
                <Group x={40} y={40} clipWidth={lotW} clipHeight={lotH}>
                  {gridLines()}
                </Group>

                {/* Elements */}
                <Group x={40} y={40}>
                  {elements.map(el => (
                    <CanvasElement
                      key={el.id}
                      el={el}
                      scale={scale}
                      selected={selectedId === el.id}
                      onSelect={setSelectedId}
                      onChange={updateElement}
                      onDragEnd={(id, pos) => updateElement(id, pos)}
                    />
                  ))}
                </Group>
              </Layer>
            </Stage>
          </div>
        </div>

        {/* ── Right stats strip ─────────────────────────────────────────────── */}
        <div className="w-36 bg-white border-l border-slate-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Summary</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400">Elements</p>
                <p className="text-xl font-bold text-slate-800">{elements.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Area</p>
                <p className="text-base font-bold text-slate-800">{totalSqFt.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">sq ft designed</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Lot Size</p>
                <p className="text-sm font-semibold text-slate-600">{(pxToFt(lotW, scale) * pxToFt(lotH, scale)).toLocaleString()} sq ft</p>
              </div>
            </div>
          </div>

          {/* Elements list */}
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 py-2">Layers</p>
            {elements.length === 0 && (
              <p className="text-[10px] text-slate-300 px-1">No elements yet. Click items in the Elements panel to add them.</p>
            )}
            {[...elements].reverse().map(el => (
              <button
                key={el.id}
                onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); setActivePanel("props"); }}
                className={cn(
                  "flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg text-[10px] transition-colors",
                  selectedId === el.id ? "bg-amber-50 text-amber-800" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: el.color }} />
                <span className="truncate font-medium">{el.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="h-6 bg-slate-800 flex items-center px-4 gap-4 shrink-0">
        <span className="text-[10px] text-slate-400">
          Scale: 1ft = {scale}px &nbsp;·&nbsp; Grid: {GRID_FT}ft
        </span>
        {selectedEl && (
          <span className="text-[10px] text-amber-400">
            {selectedEl.label} — {pxToFt(selectedEl.width, scale)}′ × {pxToFt(selectedEl.height, scale)}′ &nbsp;({(pxToFt(selectedEl.width, scale) * pxToFt(selectedEl.height, scale)).toLocaleString()} sq ft)
          </span>
        )}
        <span className="text-[10px] text-slate-500 ml-auto">⌘S to save · Delete to remove selected</span>
      </div>

      {/* ── Lot setup modal ─────────────────────────────────────────────────── */}
      {showLotSetup && (
        <LotSetup
          lotW={lotW} lotH={lotH} scale={scale}
          designAddress={design?.address || ""}
          onApply={(w, h, coords) => {
            setLotW(w); setLotH(h);
            if (coords) { setGeoCoords(coords); setShowSatellite(true); }
            setShowLotSetup(false);
          }}
          onClose={() => setShowLotSetup(false)}
        />
      )}
    </div>
  );
}
