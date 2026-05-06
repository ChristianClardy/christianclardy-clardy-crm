import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls, Sky, Environment, ContactShadows,
  Html, GizmoHelper, GizmoViewport,
} from "@react-three/drei";
import * as THREE from "three";
import {
  ArrowLeft, Save, Check, Loader2, Trash2, Copy,
  Sun, Layers, Fence, UtensilsCrossed, Waves, TreePine, Compass,
  ChevronDown, RulerIcon, Maximize2, Map, RotateCcw,
  Eye, EyeOff, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOT_W = 80;  // feet
const DEFAULT_LOT_D = 100; // feet

function haversineDistFt(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Structure catalog ────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: "shade", label: "Shade Structures", icon: Sun,
    items: [
      { type: "pergola",      label: "Pergola",       w: 16, d: 12, color: "#8B6914", accent: "#A0785A" },
      { type: "patio_cover",  label: "Patio Cover",   w: 20, d: 16, color: "#7A9DC0", accent: "#5A7EA0" },
      { type: "cabana",       label: "Cabana",        w: 14, d: 14, color: "#C8A96E", accent: "#9A7A4A" },
      { type: "shade_sail",   label: "Shade Sail",    w: 15, d: 15, color: "#E8C88A", accent: "#C8A060" },
    ],
  },
  {
    key: "water", label: "Water Features", icon: Waves,
    items: [
      { type: "pool_rect",    label: "Pool (Rect)",   w: 24, d: 12, color: "#2299CC", accent: "#1177AA" },
      { type: "pool_freeform",label: "Pool (Freeform)",w: 22, d: 14, color: "#1E88E5", accent: "#0D66C2" },
      { type: "spa",          label: "Spa / Hot Tub", w: 8,  d: 8,  color: "#4DB8D4", accent: "#2A9BB8" },
      { type: "water_wall",   label: "Water Wall",    w: 8,  d: 1,  color: "#64B5F6", accent: "#1E88E5" },
    ],
  },
  {
    key: "kitchen", label: "Outdoor Kitchen", icon: UtensilsCrossed,
    items: [
      { type: "kitchen_island", label: "Kitchen Island", w: 16, d: 4, color: "#78909C", accent: "#546E7A" },
      { type: "bbq_grill",      label: "BBQ / Grill",   w: 5,  d: 3, color: "#37474F", accent: "#263238" },
      { type: "pizza_oven",     label: "Pizza Oven",    w: 5,  d: 5, color: "#8D6E63", accent: "#5D4037" },
      { type: "outdoor_bar",    label: "Outdoor Bar",   w: 14, d: 3, color: "#6D4C41", accent: "#4E342E" },
      { type: "fridge",         label: "Outdoor Fridge",w: 3,  d: 2, color: "#90A4AE", accent: "#607D8B" },
    ],
  },
  {
    key: "hardscape", label: "Hardscape", icon: Layers,
    items: [
      { type: "patio",          label: "Patio / Deck",   w: 24, d: 18, color: "#D4C4A0", accent: "#B8A880" },
      { type: "pavers",         label: "Paver Walkway",  w: 4,  d: 20, color: "#BCAAA4", accent: "#9C8A80" },
      { type: "retaining_wall", label: "Retaining Wall", w: 20, d: 2,  color: "#8D7B6A", accent: "#6D5B4A" },
      { type: "driveway",       label: "Driveway",       w: 12, d: 24, color: "#B0B0B0", accent: "#909090" },
      { type: "fire_table",     label: "Fire Table",     w: 5,  d: 5,  color: "#BF360C", accent: "#870000" },
    ],
  },
  {
    key: "landscaping", label: "Landscaping", icon: TreePine,
    items: [
      { type: "tree_palm",    label: "Palm Tree",     w: 6,  d: 6,  color: "#2E7D32", accent: "#1B5E20" },
      { type: "tree_shade",   label: "Shade Tree",    w: 10, d: 10, color: "#388E3C", accent: "#2E7D32" },
      { type: "shrub",        label: "Shrub / Hedge", w: 4,  d: 4,  color: "#558B2F", accent: "#33691E" },
      { type: "flower_bed",   label: "Flower Bed",    w: 8,  d: 4,  color: "#E91E63", accent: "#880E4F" },
      { type: "lawn",         label: "Lawn Area",     w: 20, d: 16, color: "#66BB6A", accent: "#43A047" },
      { type: "golf_green",   label: "Golf Green",    w: 24, d: 18, color: "#2E7D32", accent: "#1B5E20" },
    ],
  },
  {
    key: "amenities", label: "Amenities", icon: Compass,
    items: [
      { type: "firepit",      label: "Fire Pit",       w: 6,  d: 6,  color: "#E64A19", accent: "#BF360C" },
      { type: "seating",      label: "Seating Group",  w: 10, d: 10, color: "#A1887F", accent: "#795548" },
      { type: "dining_set",   label: "Dining Set",     w: 8,  d: 8,  color: "#8D6E63", accent: "#5D4037" },
      { type: "putting_green",label: "Putting Green",  w: 10, d: 16, color: "#388E3C", accent: "#2E7D32" },
      { type: "bocce_court",  label: "Bocce Court",    w: 8,  d: 30, color: "#D4A76A", accent: "#B8864A" },
      { type: "outdoor_tv",   label: "Outdoor TV",     w: 4,  d: 0.5, color: "#212121", accent: "#424242" },
    ],
  },
];

const ALL_ITEMS = CATEGORIES.flatMap(c => c.items);
const ITEM_MAP = Object.fromEntries(ALL_ITEMS.map(i => [i.type, i]));

// ─── 3D Structure renderers ───────────────────────────────────────────────────

function PergolaMesh({ color, accent, w, d }) {
  const postH = 10, beamH = 0.4, postSize = 0.5;
  const posts = [[-w/2+postSize/2, -d/2+postSize/2], [w/2-postSize/2, -d/2+postSize/2],
                 [-w/2+postSize/2,  d/2-postSize/2], [w/2-postSize/2,  d/2-postSize/2]];
  return (
    <group>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, postH/2, pz]} castShadow>
          <boxGeometry args={[postSize, postH, postSize]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
      {/* Main beams */}
      {[-w/2+postSize, w/2-postSize].map((px, i) => (
        <mesh key={`b${i}`} position={[px, postH, 0]} castShadow>
          <boxGeometry args={[postSize, beamH, d-postSize]} />
          <meshStandardMaterial color={accent} roughness={0.7} />
        </mesh>
      ))}
      {/* Cross slats */}
      {Array.from({length: Math.floor(w/2)}, (_, i) => {
        const x = -w/2 + postSize + i * 2 + 1;
        return (
          <mesh key={`s${i}`} position={[x, postH + beamH/2, 0]} castShadow>
            <boxGeometry args={[0.2, beamH, d - postSize]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

function PatioCoverMesh({ color, accent, w, d }) {
  const postH = 10;
  const posts = [[-w/2+0.3, -d/2+0.3], [w/2-0.3, -d/2+0.3],
                 [-w/2+0.3,  d/2-0.3], [w/2-0.3,  d/2-0.3]];
  return (
    <group>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, postH/2, pz]} castShadow>
          <boxGeometry args={[0.4, postH, 0.4]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, postH + 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.3, d]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.1} />
      </mesh>
    </group>
  );
}

function PoolMesh({ color, w, d }) {
  return (
    <group>
      {/* Pool basin */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <boxGeometry args={[w, 1.2, d]} />
        <meshStandardMaterial color="#1a5276" roughness={0.3} />
      </mesh>
      {/* Water surface */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[w - 0.2, 0.05, d - 0.2]} />
        <meshStandardMaterial color={color} transparent opacity={0.85} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* Coping */}
      {[[-w/2-0.2, 0, 0, w+0.4, 0.3, 0.4],
        [ w/2+0.2, 0, 0, 0.4, 0.3, d+0.4],
        [0, 0, -d/2-0.2, w+0.4, 0.3, 0.4],
        [0, 0,  d/2+0.2, 0.4, 0.3, d+0.4]].map(([x,y,z,bw,bh,bd], i) => (
        <mesh key={i} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[bw, bh, bd]} />
          <meshStandardMaterial color="#E8E0D0" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function SpaMesh({ color }) {
  return (
    <group>
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[3.5, 3.5, 0.9, 16]} />
        <meshStandardMaterial color="#2C3E50" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[3.2, 3.2, 0.1, 16]} />
        <meshStandardMaterial color={color} transparent opacity={0.88} roughness={0.05} />
      </mesh>
    </group>
  );
}

function TreeMesh({ type, color, accent }) {
  if (type === "tree_palm") {
    return (
      <group>
        <mesh position={[0, 5, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.45, 10, 8]} />
          <meshStandardMaterial color="#A0854C" roughness={0.9} />
        </mesh>
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const rad = deg * Math.PI / 180;
          return (
            <mesh key={i} position={[Math.sin(rad)*2, 10.5, Math.cos(rad)*2]}
              rotation={[0.4, rad, 0.3]} castShadow>
              <boxGeometry args={[0.3, 0.1, 4]} />
              <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
          );
        })}
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.5, 6, 8]} />
        <meshStandardMaterial color="#5D4037" roughness={0.9} />
      </mesh>
      <mesh position={[0, 8, 0]} castShadow>
        <sphereGeometry args={[3.5, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function FirepitMesh({ color }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[2.5, 2.8, 0.6, 16]} />
        <meshStandardMaterial color="#7B7B7B" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[1.8, 1.8, 0.2, 16]} />
        <meshStandardMaterial color="#1A1A1A" roughness={0.8} />
      </mesh>
      {/* Flame */}
      <mesh position={[0, 1.2, 0]}>
        <coneGeometry args={[0.7, 1.5, 8]} />
        <meshStandardMaterial color="#FF6F00" emissive="#FF3D00" emissiveIntensity={1.5} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[0.35, 1.0, 8]} />
        <meshStandardMaterial color="#FFCA28" emissive="#FF6F00" emissiveIntensity={2} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function KitchenMesh({ color, accent, w, d }) {
  return (
    <group>
      {/* Counter base */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 3, d]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
      </mesh>
      {/* Countertop */}
      <mesh position={[0, 3.1, 0]} castShadow>
        <boxGeometry args={[w + 0.2, 0.2, d + 0.2]} />
        <meshStandardMaterial color="#E8E8E8" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Grill grates */}
      {Array.from({length: 4}, (_, i) => (
        <mesh key={i} position={[-w/4 + i * (w/4), 3.25, 0]}>
          <boxGeometry args={[0.1, 0.05, d * 0.8]} />
          <meshStandardMaterial color="#222" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function GenericMesh({ color, accent, w, d, type }) {
  const h = type === "retaining_wall" ? 3
    : type === "outdoor_bar" ? 3.5
    : type === "driveway" || type === "patio" || type === "pavers" || type === "lawn" || type === "flower_bed" ? 0.2
    : type === "golf_green" || type === "putting_green" || type === "bocce_court" ? 0.25
    : type === "dining_set" || type === "seating" ? 2
    : type === "outdoor_tv" ? 3
    : 2;

  return (
    <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={type === "outdoor_tv" ? 0.6 : 0} />
    </mesh>
  );
}

function StructureMesh({ el }) {
  const cfg = ITEM_MAP[el.type] || {};
  const w = el.w ?? cfg.w ?? 10;
  const d = el.d ?? cfg.d ?? 10;
  const color = el.color ?? cfg.color ?? "#888";
  const accent = cfg.accent ?? color;

  switch (el.type) {
    case "pergola":     return <PergolaMesh color={color} accent={accent} w={w} d={d} />;
    case "patio_cover": return <PatioCoverMesh color={color} accent={accent} w={w} d={d} />;
    case "pool_rect":
    case "pool_freeform": return <PoolMesh color={color} w={w} d={d} />;
    case "spa":           return <SpaMesh color={color} />;
    case "tree_palm":
    case "tree_shade":    return <TreeMesh type={el.type} color={color} accent={accent} />;
    case "firepit":       return <FirepitMesh color={color} />;
    case "kitchen_island":
    case "bbq_grill":     return <KitchenMesh color={color} accent={accent} w={w} d={d} />;
    default:              return <GenericMesh color={color} accent={accent} w={w} d={d} type={el.type} />;
  }
}

// ─── Draggable element in 3D scene ────────────────────────────────────────────

function Element3D({ el, selected, onSelect, onMove }) {
  const mesh = useRef();
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragOffset = useRef(new THREE.Vector3());

  const onPointerDown = (e) => {
    e.stopPropagation();
    onSelect(el.id);
    dragging.current = true;
    gl.domElement.style.cursor = "grabbing";

    const intersection = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersection);
    dragOffset.current.set(el.x - intersection.x, 0, el.z - intersection.z);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const intersection = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersection);
    onMove(el.id, {
      x: intersection.x + dragOffset.current.x,
      z: intersection.z + dragOffset.current.z,
    });
  };

  const onPointerUp = () => {
    dragging.current = false;
    gl.domElement.style.cursor = "auto";
  };

  return (
    <group
      position={[el.x, 0, el.z]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <StructureMesh el={el} />

      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(el.w ?? 8, el.d ?? 8) * 0.55, Math.max(el.w ?? 8, el.d ?? 8) * 0.6, 32]} />
          <meshBasicMaterial color="#F59E0B" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Label */}
      <Html position={[0, 12, 0]} center distanceFactor={80} zIndexRange={[10, 0]}>
        <div className={cn(
          "px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap pointer-events-none",
          selected ? "bg-amber-500 text-white" : "bg-black/60 text-white"
        )}>
          {el.label}
        </div>
      </Html>
    </group>
  );
}

// ─── Ground with satellite texture ───────────────────────────────────────────

function Ground({ satTexture, lotW, lotD }) {
  return (
    <group>
      {/* Satellite image mapped to lot */}
      {satTexture ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[lotW, lotD]} />
          <meshStandardMaterial map={satTexture} roughness={0.9} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[lotW * 3, lotD * 3]} />
          <meshStandardMaterial color="#4a7c59" roughness={0.95} />
        </mesh>
      )}
      {/* Extended ground beyond lot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[lotW * 6, lotD * 6]} />
        <meshStandardMaterial color="#3d6b4a" roughness={0.95} />
      </mesh>
      {/* Lot boundary */}
      <lineSegments position={[0, 0.05, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(lotW, 0.01, lotD)]} />
        <lineBasicMaterial color="#F59E0B" linewidth={2} />
      </lineSegments>
    </group>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ elements, selectedId, onSelect, onMove, satTexture, lotW, lotD }) {
  return (
    <>
      <Sky sunPosition={[100, 80, 100]} turbidity={0.5} rayleigh={0.3} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[lotW, 60, lotD]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={300}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={200} blur={2} far={20} />

      <Ground satTexture={satTexture} lotW={lotW} lotD={lotD} />

      {elements.map(el => (
        <Element3D
          key={el.id}
          el={el}
          selected={selectedId === el.id}
          onSelect={onSelect}
          onMove={onMove}
        />
      ))}

      <OrbitControls
        makeDefault
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2.05}
        enableDamping
        dampingFactor={0.08}
      />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </>
  );
}

// ─── Lot / address setup dialog ───────────────────────────────────────────────

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
          const g = od.elements[0].geometry;
          const lats = g.map(p => p.lat), lons = g.map(p => p.lon);
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
          <p className="text-xs text-slate-500 mt-0.5">Enter the property address to load satellite imagery and auto-detect lot dimensions.</p>
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
              <p className="font-semibold text-emerald-800">Found: {info.widthFt}′ wide × {info.depthFt}′ deep <span className="font-normal text-emerald-600">via {info.source}</span></p>
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
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">Apply</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ el, onUpdate, onDelete, onDuplicate }) {
  if (!el) return (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-xs text-slate-400 text-center">Click any element on the canvas to select it</p>
    </div>
  );

  const cfg = ITEM_MAP[el.type] || {};

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
            <div>
              <Label className="text-[10px] text-slate-500 mb-1 block">Width (ft)</Label>
              <Input type="number" min={1} value={el.w ?? cfg.w ?? 10}
                onChange={e => onUpdate(el.id, { w: Number(e.target.value) })} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={1} value={el.d ?? cfg.d ?? 10}
                onChange={e => onUpdate(el.id, { d: Number(e.target.value) })} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">Color</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={el.color ?? cfg.color ?? "#888888"}
                onChange={e => onUpdate(el.id, { color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-slate-200" />
              <span className="text-xs text-slate-500">{el.color ?? cfg.color ?? "#888888"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-slate-500 mb-1 block">X position (ft)</Label>
              <Input type="number" value={Math.round(el.x ?? 0)}
                onChange={e => onUpdate(el.id, { x: Number(e.target.value) })} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500 mb-1 block">Z position (ft)</Label>
              <Input type="number" value={Math.round(el.z ?? 0)}
                onChange={e => onUpdate(el.id, { z: Number(e.target.value) })} className="h-8 text-xs" />
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

// ─── Element palette ──────────────────────────────────────────────────────────

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
              className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span className="flex items-center gap-1.5"><Icon className="w-3 h-3" />{cat.label}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", expanded[cat.key] && "rotate-180")} />
            </button>
            {expanded[cat.key] && (
              <div className="px-2 pb-2 space-y-1">
                {cat.items.map(item => (
                  <button key={item.type} onClick={() => onAdd(item)}
                    className="flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all group">
                    <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-xs font-medium text-slate-700 group-hover:text-amber-800">{item.label}</span>
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

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function DesignEditor() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const designId = params.get("id");

  const [design, setDesign]         = useState(null);
  const [elements, setElements]     = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lotW, setLotW]             = useState(DEFAULT_LOT_W);
  const [lotD, setLotD]             = useState(DEFAULT_LOT_D);
  const [geoCoords, setGeoCoords]   = useState(null);
  const [satTexture, setSatTexture] = useState(null);
  const [showSat, setShowSat]       = useState(false);
  const [showLotSetup, setShowLotSetup] = useState(false);
  const [activePanel, setActivePanel]   = useState("palette");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  // ── Load design ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!designId) { setLoading(false); return; }
    base44.entities.Design.get(designId).then(d => {
      setDesign(d);
      if (d.canvas_data) {
        setElements(d.canvas_data.elements || []);
        setLotW(d.canvas_data.lotW || DEFAULT_LOT_W);
        setLotD(d.canvas_data.lotD || DEFAULT_LOT_D);
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

  // ── Satellite texture ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!geoCoords || !showSat) { setSatTexture(null); return; }
    const latDPF = 1 / 364000;
    const lonDPF = 1 / (364000 * Math.cos(geoCoords.lat * Math.PI / 180));
    const halfW = (lotW / 2) * lonDPF, halfD = (lotD / 2) * latDPF;
    const bbox = `${geoCoords.lon - halfW},${geoCoords.lat - halfD},${geoCoords.lon + halfW},${geoCoords.lat + halfD}`;
    const url = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&size=1024,1024&imageSR=4326&format=png&f=image`;
    const loader = new THREE.TextureLoader();
    loader.load(url, tex => { tex.flipY = true; setSatTexture(tex); }, undefined, () => setSatTexture(null));
  }, [geoCoords, showSat, lotW, lotD]);

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!designId) return;
    setSaving(true);
    try {
      await base44.entities.Design.update(designId, {
        canvas_data: { elements, lotW, lotD, geoCoords },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }, [designId, elements, lotW, lotD, geoCoords]);

  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId
        && document.activeElement.tagName !== "INPUT") {
        setElements(prev => prev.filter(el => el.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, selectedId]);

  // ── Element operations ───────────────────────────────────────────────────────

  const addElement = (item) => {
    const id = `el_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setElements(prev => [...prev, {
      id, type: item.type, label: item.label,
      color: item.color, w: item.w, d: item.d,
      x: (Math.random() - 0.5) * (lotW * 0.5),
      z: (Math.random() - 0.5) * (lotD * 0.5),
    }]);
    setSelectedId(id);
    setActivePanel("props");
  };

  const updateElement = (id, patch) =>
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));

  const deleteElement = (id) => { setElements(prev => prev.filter(el => el.id !== id)); setSelectedId(null); };

  const duplicateElement = (id) => {
    const src = elements.find(el => el.id === id);
    if (!src) return;
    const newId = `el_${Date.now()}`;
    setElements(prev => [...prev, { ...src, id: newId, x: src.x + 4, z: src.z + 4 }]);
    setSelectedId(newId);
  };

  const selectedEl = elements.find(el => el.id === selectedId) || null;

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* ── Top bar ── */}
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

        {/* Satellite toggle */}
        <button
          onClick={() => { if (!geoCoords) { setShowLotSetup(true); return; } setShowSat(s => !s); }}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            showSat && geoCoords ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}
        >
          <Map className="w-3.5 h-3.5" /> Satellite
        </button>

        {/* Lot dimensions */}
        <button onClick={() => setShowLotSetup(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">
          <RulerIcon className="w-3.5 h-3.5" />
          {lotW}′ × {lotD}′
        </button>

        {/* Save */}
        <Button size="sm" onClick={handleSave} disabled={saving}
          className={cn("gap-1.5 min-w-[80px]", saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-to-r from-amber-500 to-orange-500")}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <><Check className="w-3.5 h-3.5" /> Saved</>
            : <><Save className="w-3.5 h-3.5" /> Save</>}
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
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
          <div className="flex-1 overflow-hidden flex flex-col" style={{ color: "#fff" }}>
            {activePanel === "palette"
              ? <Palette onAdd={addElement} />
              : <PropertiesPanel element={selectedEl} onUpdate={updateElement} onDelete={deleteElement} onDuplicate={duplicateElement} />
            }
          </div>
        </div>

        {/* ── 3D Canvas ── */}
        <div className="flex-1 relative bg-slate-800">
          <Canvas
            shadows
            camera={{ position: [0, 60, 80], fov: 45 }}
            onPointerMissed={() => setSelectedId(null)}
            style={{ width: "100%", height: "100%" }}
          >
            <Suspense fallback={null}>
              <Scene
                elements={elements}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); setActivePanel("props"); }}
                onMove={(id, pos) => updateElement(id, pos)}
                satTexture={showSat ? satTexture : null}
                lotW={lotW}
                lotD={lotD}
              />
            </Suspense>
          </Canvas>

          {/* Camera hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-3 py-1.5 rounded-full pointer-events-none">
            Left drag: rotate · Right drag: pan · Scroll: zoom
          </div>
        </div>

        {/* ── Right summary ── */}
        <div className="w-36 bg-slate-900 border-l border-slate-700 flex flex-col shrink-0 text-white">
          <div className="p-3 border-b border-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Summary</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400">Elements</p>
                <p className="text-2xl font-bold text-white">{elements.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Lot Size</p>
                <p className="text-sm font-semibold text-slate-200">{(lotW * lotD).toLocaleString()} sq ft</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 py-2">Layers</p>
            {[...elements].reverse().map(el => (
              <button key={el.id} onClick={() => { setSelectedId(el.id); setActivePanel("props"); }}
                className={cn("flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors",
                  selectedId === el.id ? "bg-amber-900/50 text-amber-300" : "text-slate-400 hover:bg-slate-800")}>
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: el.color ?? "#888" }} />
                <span className="truncate font-medium">{el.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lot setup modal */}
      {showLotSetup && (
        <LotSetup
          lotW={lotW} lotD={lotD}
          designAddress={design?.address || ""}
          onApply={(w, d, coords) => {
            setLotW(w); setLotD(d);
            if (coords) { setGeoCoords(coords); setShowSat(true); }
            setShowLotSetup(false);
          }}
          onClose={() => setShowLotSetup(false)}
        />
      )}
    </div>
  );
}
