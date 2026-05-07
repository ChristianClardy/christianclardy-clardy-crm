import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  ArrowLeft, Save, Check, Loader2, Trash2, Copy, RotateCw,
  Sun, Layers, Fence, UtensilsCrossed, Waves, TreePine, Compass,
  ChevronDown, RulerIcon, Maximize2, Map, DollarSign, FileText,
  Grid3x3, Eye, Satellite, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Haversine ──────────────────────────────────────────────────────────────
function haversineDistFt(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Cost Rates (per element type) ─────────────────────────────────────────
const COST_RATES = {
  pergola:         { unit: "each",  base: 9500,  labor: 3500,  label: "Pergola" },
  patio_cover:     { unit: "sqft",  base: 38,    labor: 14,    label: "Patio Cover" },
  cabana:          { unit: "each",  base: 18000, labor: 6000,  label: "Cabana" },
  shade_sail:      { unit: "each",  base: 1800,  labor: 600,   label: "Shade Sail" },
  pool_rect:       { unit: "sqft",  base: 165,   labor: 55,    label: "Rectangular Pool" },
  pool_freeform:   { unit: "sqft",  base: 185,   labor: 65,    label: "Freeform Pool" },
  spa:             { unit: "each",  base: 14000, labor: 4000,  label: "Spa / Hot Tub" },
  water_wall:      { unit: "lnft",  base: 650,   labor: 250,   label: "Water Wall" },
  kitchen_island:  { unit: "lnft",  base: 1200,  labor: 400,   label: "Outdoor Kitchen" },
  bbq_grill:       { unit: "each",  base: 3500,  labor: 800,   label: "BBQ / Grill" },
  pizza_oven:      { unit: "each",  base: 4500,  labor: 1200,  label: "Pizza Oven" },
  outdoor_bar:     { unit: "lnft",  base: 950,   labor: 350,   label: "Outdoor Bar" },
  patio:           { unit: "sqft",  base: 22,    labor: 10,    label: "Patio / Deck" },
  pavers:          { unit: "sqft",  base: 18,    labor: 12,    label: "Paver Walkway" },
  retaining_wall:  { unit: "lnft",  base: 85,    labor: 45,    label: "Retaining Wall" },
  fire_table:      { unit: "each",  base: 2800,  labor: 500,   label: "Fire Table" },
  tree_palm:       { unit: "each",  base: 850,   labor: 250,   label: "Palm Tree" },
  tree_shade:      { unit: "each",  base: 650,   labor: 200,   label: "Shade Tree" },
  shrub:           { unit: "each",  base: 120,   labor: 60,    label: "Shrub / Hedge" },
  lawn:            { unit: "sqft",  base: 3.5,   labor: 1.5,   label: "Sod / Lawn" },
  firepit:         { unit: "each",  base: 2200,  labor: 800,   label: "Fire Pit" },
  seating:         { unit: "each",  base: 3800,  labor: 0,     label: "Seating Group" },
  dining_set:      { unit: "each",  base: 4200,  labor: 0,     label: "Dining Set" },
  putting_green:   { unit: "sqft",  base: 28,    labor: 12,    label: "Putting Green" },
  bocce_court:     { unit: "sqft",  base: 18,    labor: 8,     label: "Bocce Court" },
  outdoor_tv:      { unit: "each",  base: 5500,  labor: 1200,  label: "Outdoor TV Mount" },
  driveway:        { unit: "sqft",  base: 14,    labor: 7,     label: "Driveway" },
  golf_green:      { unit: "sqft",  base: 32,    labor: 14,    label: "Golf Green" },
};

function calcElementCost(el) {
  const rate = COST_RATES[el.type];
  if (!rate) return { materials: 0, labor: 0, total: 0 };
  const w = el.w || 10, d = el.d || 10;
  let qty = 1;
  if (rate.unit === "sqft") qty = w * d;
  else if (rate.unit === "lnft") qty = w;
  const materials = Math.round(rate.base * qty);
  const labor     = Math.round(rate.labor * qty);
  return { materials, labor, total: materials + labor, qty, unit: rate.unit };
}

// ─── Structure catalog ──────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "shade",       label: "Shade Structures",  icon: Sun,           items: [
    { type: "pergola",       label: "Pergola",        w: 16, d: 12, color: 0x8B6914 },
    { type: "patio_cover",   label: "Patio Cover",    w: 20, d: 16, color: 0x8B7355 },
    { type: "cabana",        label: "Cabana",         w: 14, d: 14, color: 0xC8A96E },
    { type: "shade_sail",    label: "Shade Sail",     w: 15, d: 15, color: 0xE8C88A },
  ]},
  { key: "water",       label: "Water Features",     icon: Waves,         items: [
    { type: "pool_rect",     label: "Pool (Rect)",    w: 32, d: 16, color: 0x1E88E5 },
    { type: "pool_freeform", label: "Pool (Freeform)",w: 28, d: 18, color: 0x2299CC },
    { type: "spa",           label: "Spa / Hot Tub",  w: 8,  d: 8,  color: 0x4DB8D4 },
    { type: "water_wall",    label: "Water Wall",     w: 8,  d: 1,  color: 0x64B5F6 },
  ]},
  { key: "kitchen",     label: "Outdoor Kitchen",    icon: UtensilsCrossed, items: [
    { type: "kitchen_island",label: "Kitchen Island", w: 16, d: 4,  color: 0x607D8B },
    { type: "bbq_grill",     label: "BBQ / Grill",   w: 5,  d: 3,  color: 0x37474F },
    { type: "pizza_oven",    label: "Pizza Oven",     w: 5,  d: 5,  color: 0x8D6E63 },
    { type: "outdoor_bar",   label: "Outdoor Bar",    w: 14, d: 3,  color: 0x6D4C41 },
  ]},
  { key: "hardscape",   label: "Hardscape",          icon: Layers,        items: [
    { type: "patio",         label: "Patio / Deck",   w: 24, d: 18, color: 0xBCAA94 },
    { type: "pavers",        label: "Paver Walkway",  w: 4,  d: 20, color: 0xA8968A },
    { type: "retaining_wall",label: "Retaining Wall", w: 20, d: 2,  color: 0x8D7B6A },
    { type: "driveway",      label: "Driveway",       w: 12, d: 24, color: 0x9E9E9E },
    { type: "fire_table",    label: "Fire Table",     w: 5,  d: 5,  color: 0xBF360C },
  ]},
  { key: "landscaping", label: "Landscaping",        icon: TreePine,      items: [
    { type: "tree_palm",     label: "Palm Tree",      w: 6,  d: 6,  color: 0x2E7D32 },
    { type: "tree_shade",    label: "Shade Tree",     w: 12, d: 12, color: 0x388E3C },
    { type: "shrub",         label: "Shrub / Hedge",  w: 4,  d: 4,  color: 0x558B2F },
    { type: "lawn",          label: "Lawn Area",      w: 20, d: 16, color: 0x66BB6A },
    { type: "putting_green", label: "Golf Green",     w: 24, d: 18, color: 0x2E7D32 },
  ]},
  { key: "amenities",   label: "Amenities",          icon: Compass,       items: [
    { type: "firepit",       label: "Fire Pit",       w: 6,  d: 6,  color: 0xE64A19 },
    { type: "seating",       label: "Seating Group",  w: 10, d: 10, color: 0xA1887F },
    { type: "dining_set",    label: "Dining Set",     w: 10, d: 8,  color: 0x8D6E63 },
    { type: "bocce_court",   label: "Bocce Court",    w: 8,  d: 30, color: 0xD4A76A },
    { type: "outdoor_tv",    label: "Outdoor TV",     w: 5,  d: 1,  color: 0x212121 },
  ]},
];
const ALL_ITEMS = CATEGORIES.flatMap(c => c.items);
const ITEM_MAP  = Object.fromEntries(ALL_ITEMS.map(i => [i.type, i]));

// ─── Procedural textures ────────────────────────────────────────────────────
function woodTexture(hex) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  const base = "#" + hex.toString(16).padStart(6,"0");
  ctx.fillStyle = base; ctx.fillRect(0,0,256,256);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random()*0.08})`;
    ctx.lineWidth = Math.random()*2+0.5;
    ctx.beginPath();
    const y0 = Math.random()*256;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(64, y0+(-20+Math.random()*40), 192, y0+(-20+Math.random()*40), 256, y0+(-10+Math.random()*20));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2,2); return t;
}

function concreteTexture(hex) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#" + hex.toString(16).padStart(6,"0"); ctx.fillRect(0,0,256,256);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},0.015)`;
    ctx.fillRect(Math.random()*256, Math.random()*256, Math.random()*4+1, Math.random()*4+1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,4); return t;
}

function waterTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0,0,256,256);
  grad.addColorStop(0,"#1a6fa0"); grad.addColorStop(0.5,"#2299CC"); grad.addColorStop(1,"#1565C0");
  ctx.fillStyle = grad; ctx.fillRect(0,0,256,256);
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(Math.random()*256, Math.random()*256, 20+Math.random()*40, 5+Math.random()*10, Math.random()*Math.PI, 0, Math.PI*2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3,3); return t;
}

function grassTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5a9e6f"; ctx.fillRect(0,0,256,256);
  const colors = ["#4a8a5f","#6aae7f","#3a7a4f","#70b47e"];
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random()*colors.length)];
    ctx.fillRect(Math.random()*256, Math.random()*256, Math.random()*3+1, Math.random()*6+2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8,8); return t;
}

// ─── 3D mesh builders (return THREE.Group) ─────────────────────────────────
function buildPergola(w, d, hex) {
  const g = new THREE.Group();
  const wt = woodTexture(hex);
  const mat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.85 });
  const postH = 10, ps = 0.5;
  [[-w/2+ps,-d/2+ps],[w/2-ps,-d/2+ps],[-w/2+ps,d/2-ps],[w/2-ps,d/2-ps]].forEach(([px,pz]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ps,postH,ps), mat);
    m.position.set(px,postH/2,pz); m.castShadow=true; g.add(m);
  });
  const beamMat = new THREE.MeshStandardMaterial({ map: woodTexture(Math.max(0,hex-0x111111)), roughness:0.8 });
  [[-w/2+ps],[w/2-ps]].forEach(([px]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(ps,0.5,d-ps), beamMat);
    b.position.set(px,postH,0); b.castShadow=true; g.add(b);
  });
  for (let i=0;i<Math.floor(w/2);i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.3,d-ps), mat);
    s.position.set(-w/2+ps+i*2+1,postH+0.2,0); s.castShadow=true; g.add(s);
  }
  return g;
}

function buildPatioCover(w, d, hex) {
  const g = new THREE.Group();
  const wt = woodTexture(hex);
  const mat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.8 });
  const postH = 10;
  [[-w/2+0.3,-d/2+0.3],[w/2-0.3,-d/2+0.3],[-w/2+0.3,d/2-0.3],[w/2-0.3,d/2-0.3]].forEach(([px,pz]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4,postH,0.4), mat);
    p.position.set(px,postH/2,pz); p.castShadow=true; g.add(p);
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7A9DC0, roughness:0.5, metalness:0.2 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w,0.3,d), roofMat);
  roof.position.y = postH+0.15; roof.castShadow=true; roof.receiveShadow=true; g.add(roof);
  return g;
}

function buildPool(w, d, _hex) {
  const g = new THREE.Group();
  const wt = waterTexture();
  const basin = new THREE.Mesh(new THREE.BoxGeometry(w,1.4,d), new THREE.MeshStandardMaterial({ color:0x0d4a6e, roughness:0.2 }));
  basin.position.y=-0.7; basin.receiveShadow=true; g.add(basin);
  const water = new THREE.Mesh(new THREE.BoxGeometry(w-0.3,0.06,d-0.3), new THREE.MeshStandardMaterial({ map:wt, transparent:true, opacity:0.88, roughness:0.05, metalness:0.15 }));
  water.position.y=0.03; g.add(water);
  const copMat = new THREE.MeshStandardMaterial({ map:concreteTexture(0xE8E0D0), roughness:0.6 });
  [[-(w/2+0.25),0,0,w+0.5,0.35,0.5],[w/2+0.25,0,0,0.5,0.35,d+0.5],
   [0,0,-(d/2+0.25),w+0.5,0.35,0.5],[0,0,d/2+0.25,0.5,0.35,d+0.5]].forEach(([x,y,z,bw,bh,bd]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd), copMat);
    m.position.set(x,y,z); m.receiveShadow=true; g.add(m);
  });
  return g;
}

function buildSpa(_hex) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(3.8,4.2,1.0,20), new THREE.MeshStandardMaterial({ color:0x37474F, roughness:0.4 }));
  shell.position.y=0.5; shell.castShadow=true; g.add(shell);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.4,0.08,20), new THREE.MeshStandardMaterial({ map:waterTexture(), transparent:true, opacity:0.9, roughness:0.05 }));
  water.position.y=0.94; g.add(water);
  return g;
}

function buildTree(type, hex) {
  const g = new THREE.Group();
  if (type==="tree_palm") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.5,12,10), new THREE.MeshStandardMaterial({ map:woodTexture(0xA0854C), roughness:0.9 }));
    trunk.position.y=6; trunk.castShadow=true; g.add(trunk);
    for (let i=0;i<7;i++) {
      const r=i*(360/7)*Math.PI/180;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.08,5), new THREE.MeshStandardMaterial({ color:hex, roughness:0.85 }));
      frond.position.set(Math.sin(r)*2.5,12.5,Math.cos(r)*2.5);
      frond.rotation.set(0.45,r,0.25); frond.castShadow=true; g.add(frond);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.55,7,10), new THREE.MeshStandardMaterial({ map:woodTexture(0x5D4037), roughness:0.9 }));
    trunk.position.y=3.5; trunk.castShadow=true; g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(4.5,14,14), new THREE.MeshStandardMaterial({ color:hex, roughness:0.9 }));
    canopy.position.y=9.5; canopy.castShadow=true; g.add(canopy);
    const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(3.5,14,14), new THREE.MeshStandardMaterial({ color:new THREE.Color(hex).multiplyScalar(0.85), roughness:0.9 }));
    canopy2.position.set(2.5,8.5,1); canopy2.castShadow=true; g.add(canopy2);
  }
  return g;
}

function buildFirepit(_hex) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(2.6,3.0,0.7,16), new THREE.MeshStandardMaterial({ map:concreteTexture(0x7B7B7B), roughness:0.95 }));
  stone.position.y=0.35; stone.castShadow=true; g.add(stone);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.9,1.9,0.25,16), new THREE.MeshStandardMaterial({ color:0x1A1A1A }));
  inner.position.y=0.82; g.add(inner);
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.75,1.6,8), new THREE.MeshStandardMaterial({ color:0xFF6F00, emissive:new THREE.Color(0xFF3D00), emissiveIntensity:2, transparent:true, opacity:0.85 }));
  f1.position.y=1.5; g.add(f1);
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.4,1.1,8), new THREE.MeshStandardMaterial({ color:0xFFCA28, emissive:new THREE.Color(0xFF6F00), emissiveIntensity:2.5, transparent:true, opacity:0.75 }));
  f2.position.y=2.0; g.add(f2);
  const ptLight = new THREE.PointLight(0xFF6600, 2, 15); ptLight.position.y=2; g.add(ptLight);
  return g;
}

function buildKitchen(w, d, hex) {
  const g = new THREE.Group();
  const ct = concreteTexture(hex);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w,3,d), new THREE.MeshStandardMaterial({ map:ct, roughness:0.6 }));
  base.position.y=1.5; base.castShadow=true; base.receiveShadow=true; g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w+0.2,0.15,d+0.2), new THREE.MeshStandardMaterial({ color:0xE8E8E8, roughness:0.15, metalness:0.4 }));
  top.position.y=3.07; top.castShadow=true; g.add(top);
  const grillMat = new THREE.MeshStandardMaterial({ color:0x333333, roughness:0.3, metalness:0.8 });
  for (let i=0;i<4;i++) {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.04,d*0.8), grillMat);
    gr.position.set(-w/4+i*(w/4),3.22,0); g.add(gr);
  }
  return g;
}

function buildPatio(w, d, hex) {
  const g = new THREE.Group();
  const ct = concreteTexture(hex);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w,0.3,d), new THREE.MeshStandardMaterial({ map:ct, roughness:0.75 }));
  slab.position.y=0.15; slab.receiveShadow=true; g.add(slab);
  // Grout lines
  const lineMat = new THREE.LineBasicMaterial({ color:0xBBB0A0 });
  const spacing = 2;
  for (let x=-w/2;x<=w/2;x+=spacing) {
    const pts = [new THREE.Vector3(x,0.31,-d/2), new THREE.Vector3(x,0.31,d/2)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }
  for (let z=-d/2;z<=d/2;z+=spacing) {
    const pts = [new THREE.Vector3(-w/2,0.31,z), new THREE.Vector3(w/2,0.31,z)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }
  return g;
}

function buildGeneric(type, w, d, hex) {
  const h = type==="retaining_wall"||type==="outdoor_bar" ? 3.5
    : type==="seating"||type==="dining_set" ? 2.5
    : type==="outdoor_tv" ? 3
    : type==="water_wall" ? 5
    : 0.3;
  const mat = type==="outdoor_tv"
    ? new THREE.MeshStandardMaterial({ color:0x111111, roughness:0.1, metalness:0.9 })
    : new THREE.MeshStandardMaterial({ map:concreteTexture(hex), roughness:0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  mesh.position.y=h/2; mesh.castShadow=true; mesh.receiveShadow=true;
  const g = new THREE.Group(); g.add(mesh); return g;
}

function buildStructureGroup(el) {
  const cfg = ITEM_MAP[el.type] || {};
  const w   = el.w ?? cfg.w ?? 10;
  const d   = el.d ?? cfg.d ?? 10;
  const hex = typeof el.color==="number" ? el.color : (parseInt((el.color||"888888").replace("#",""),16)||0x888888);

  let mg;
  switch(el.type) {
    case "pergola":       mg = buildPergola(w,d,hex); break;
    case "patio_cover":   mg = buildPatioCover(w,d,hex); break;
    case "cabana":        mg = buildPatioCover(w,d,hex); break;
    case "pool_rect":
    case "pool_freeform": mg = buildPool(w,d,hex); break;
    case "spa":           mg = buildSpa(hex); break;
    case "tree_palm":
    case "tree_shade":    mg = buildTree(el.type,hex); break;
    case "firepit":
    case "fire_table":    mg = buildFirepit(hex); break;
    case "kitchen_island":
    case "bbq_grill":
    case "outdoor_bar":   mg = buildKitchen(w,d,hex); break;
    case "patio":
    case "pavers":
    case "driveway":
    case "lawn":
    case "putting_green":
    case "golf_green":
    case "bocce_court":   mg = buildPatio(w,d,hex); break;
    default:              mg = buildGeneric(el.type,w,d,hex);
  }

  // Selection ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(w,d)*0.55, Math.max(w,d)*0.62, 40),
    new THREE.MeshBasicMaterial({ color:0xF59E0B, side:THREE.DoubleSide, transparent:true, opacity:0.9 })
  );
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.12; ring.name = "selection_ring"; ring.visible = false;
  mg.add(ring);

  mg.userData.elementId = el.id;
  mg.rotation.y = (el.rotation || 0) * Math.PI / 180;
  return mg;
}

// ─── Lot Setup Dialog ───────────────────────────────────────────────────────
function LotSetup({ lotW, lotD, designAddress, onApply, onClose }) {
  const [w, setW]         = useState(lotW || 80);
  const [d, setD]         = useState(lotD || 100);
  const [address, setAddr] = useState(designAddress || "");
  const [status, setStatus] = useState(null);
  const [info, setInfo]   = useState(null);
  const [coords, setCoords] = useState(null);

  const lookup = async () => {
    if (!address.trim()) return;
    setStatus("loading");
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, { headers:{"Accept-Language":"en-US"} });
      const data = await res.json();
      if (!data.length) { setStatus("notfound"); return; }
      const { lat, lon, boundingbox, display_name } = data[0];
      const numLat = parseFloat(lat), numLon = parseFloat(lon);
      let widthFt, depthFt, source = "bounding box";
      try {
        const q = `[out:json][timeout:15];(way(around:50,${numLat},${numLon})[landuse~"residential|grass|garden"];);out geom;`;
        const ov = await fetch("https://overpass-api.de/api/interpreter", { method:"POST", body:q });
        const od = await ov.json();
        if (od.elements?.[0]?.geometry?.length > 2) {
          const geom = od.elements[0].geometry;
          const lats = geom.map(p=>p.lat), lons = geom.map(p=>p.lon);
          widthFt = Math.round(haversineDistFt(numLat,Math.min(...lons),numLat,Math.max(...lons)));
          depthFt = Math.round(haversineDistFt(Math.min(...lats),numLon,Math.max(...lats),numLon));
          source = "parcel data";
        }
      } catch {}
      if (!widthFt) {
        const [s,n,we,e] = boundingbox.map(Number);
        widthFt = Math.round(haversineDistFt((s+n)/2,we,(s+n)/2,e));
        depthFt = Math.round(haversineDistFt(s,numLon,n,numLon));
      }
      widthFt = Math.max(30,Math.min(widthFt,600)); depthFt = Math.max(30,Math.min(depthFt,600));
      setW(widthFt); setD(depthFt); setCoords({lat:numLat,lon:numLon});
      setInfo({display_name,source,widthFt,depthFt});
      setStatus("found");
    } catch { setStatus("error"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div>
          <p className="font-bold text-slate-900 text-xl">Property Setup</p>
          <p className="text-sm text-slate-500 mt-1">Enter the address to load the real aerial photo of the property and auto-detect lot dimensions.</p>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Property Address</Label>
          <div className="flex gap-2">
            <Input value={address} onChange={e=>{setAddr(e.target.value);setStatus(null);}}
              onKeyDown={e=>e.key==="Enter"&&lookup()}
              placeholder="123 Main St, Austin, TX 78701" className="flex-1" />
            <Button type="button" onClick={lookup} disabled={status==="loading"||!address.trim()} className="bg-slate-800 text-white shrink-0">
              {status==="loading"?<Loader2 className="w-4 h-4 animate-spin"/>:<><Maximize2 className="w-3.5 h-3.5 mr-1"/>Look Up</>}
            </Button>
          </div>
          {status==="found"&&info&&(
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
              <p className="font-semibold text-emerald-800">Found: {info.widthFt}′ wide × {info.depthFt}′ deep <span className="font-normal text-emerald-600 text-xs">({info.source})</span></p>
              <p className="text-emerald-600 text-xs mt-0.5 truncate">{info.display_name}</p>
            </div>
          )}
          {status==="notfound"&&<p className="mt-1.5 text-sm text-amber-600">Address not found — try including city and state.</p>}
          {status==="error"&&<p className="mt-1.5 text-sm text-rose-500">Lookup failed — check connection and try again.</p>}
        </div>
        <div className="border-t pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Lot Dimensions</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs text-slate-500 mb-1 block">Width (ft)</Label>
              <Input type="number" min={30} value={w} onChange={e=>setW(Number(e.target.value))} /></div>
            <div><Label className="text-xs text-slate-500 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={30} value={d} onChange={e=>setD(Number(e.target.value))} /></div>
            <div className="flex flex-col justify-end pb-1">
              <p className="text-sm font-semibold text-slate-700">{(w*d).toLocaleString()} ft²</p>
              <p className="text-xs text-slate-400">{((w*d)/43560).toFixed(2)} acres</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={()=>onApply(w,d,coords)} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-2">
            <Map className="w-4 h-4"/> Apply &amp; Load Aerial Photo
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Estimate Panel ─────────────────────────────────────────────────────────
function EstimatePanel({ elements, designId, designTitle, clientName, onEstimateCreated }) {
  const [creating, setCreating] = useState(false);
  const items = elements.map(el => ({ ...el, ...calcElementCost(el) }));
  const totalMat   = items.reduce((s,i)=>s+i.materials,0);
  const totalLabor = items.reduce((s,i)=>s+i.labor,0);
  const totalCost  = totalMat + totalLabor;

  const createEstimate = async () => {
    setCreating(true);
    try {
      const est = await base44.entities.Estimate.create({
        title: designTitle ? `${designTitle} — Design Estimate` : "Design Estimate",
        client_name: clientName || "",
        status: "draft",
        notes: `Auto-generated from Design: ${designTitle || designId}`,
      });
      for (const item of items) {
        const rate = COST_RATES[item.type];
        if (!rate || item.total === 0) continue;
        await base44.entities.LineItem.create({
          estimate_id: est.id,
          description: item.label,
          quantity: item.qty || 1,
          unit: rate.unit,
          unit_price: rate.base,
          amount: item.materials,
          category: "material",
        }).catch(()=>{});
        if (item.labor > 0) {
          await base44.entities.LineItem.create({
            estimate_id: est.id,
            description: `${item.label} — Labor`,
            quantity: item.qty || 1,
            unit: rate.unit,
            unit_price: rate.labor,
            amount: item.labor,
            category: "labor",
          }).catch(()=>{});
        }
      }
      onEstimateCreated(est.id);
    } catch (err) {
      alert("Failed to create estimate: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-700">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimate Preview</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.length === 0 && (
          <p className="text-xs text-slate-500 p-2 text-center">Add elements to see cost breakdown</p>
        )}
        {items.map(item => (
          <div key={item.id} className="rounded-lg bg-slate-800 px-2.5 py-2">
            <p className="text-[10px] font-semibold text-slate-300 truncate">{item.label}</p>
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-slate-500">
                {item.unit==="sqft" ? `${(item.w||10)*(item.d||10)} ft²` : item.unit==="lnft" ? `${item.w||10} lnft` : "ea"}
              </span>
              <span className="text-[10px] font-bold text-amber-400">${item.total.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-slate-700 space-y-2">
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span className="text-slate-400">Materials</span><span className="text-slate-300">${totalMat.toLocaleString()}</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-400">Labor</span><span className="text-slate-300">${totalLabor.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm font-bold border-t border-slate-600 pt-1.5 mt-1"><span className="text-white">Total Est.</span><span className="text-amber-400">${totalCost.toLocaleString()}</span></div>
        </div>
        <Button onClick={createEstimate} disabled={creating||elements.length===0}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-2 text-xs">
          {creating?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<><FileText className="w-3.5 h-3.5"/>Generate Estimate</>}
        </Button>
      </div>
    </div>
  );
}

// ─── Properties Panel ───────────────────────────────────────────────────────
function PropertiesPanel({ el, onUpdate, onDelete, onDuplicate }) {
  if (!el) return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 gap-2">
      <Compass className="w-8 h-8 text-slate-600" />
      <p className="text-xs text-slate-400 text-center">Select an element on the canvas to edit its properties</p>
    </div>
  );
  const cfg = ITEM_MAP[el.type] || {};
  const hexStr = typeof el.color==="number"
    ? "#"+el.color.toString(16).padStart(6,"0")
    : (el.color||"#888888");
  const cost = calcElementCost(el);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{el.label}</p>
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] text-slate-400 mb-1 block">Label</Label>
            <Input value={el.label} onChange={e=>onUpdate(el.id,{label:e.target.value})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px] text-slate-400 mb-1 block">Width (ft)</Label>
              <Input type="number" min={1} value={el.w??cfg.w??10} onChange={e=>onUpdate(el.id,{w:Number(e.target.value)})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" /></div>
            <div><Label className="text-[10px] text-slate-400 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={1} value={el.d??cfg.d??10} onChange={e=>onUpdate(el.id,{d:Number(e.target.value)})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" /></div>
          </div>
          <div>
            <Label className="text-[10px] text-slate-400 mb-1 block">Rotation (°)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={el.rotation||0} onChange={e=>onUpdate(el.id,{rotation:Number(e.target.value)})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white flex-1" />
              <button onClick={()=>onUpdate(el.id,{rotation:((el.rotation||0)+45)%360})}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-slate-400 mb-1 block">Color</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={hexStr} onChange={e=>onUpdate(el.id,{color:parseInt(e.target.value.replace("#",""),16)})} className="w-8 h-7 rounded cursor-pointer border border-slate-600 bg-slate-800" />
              <span className="text-[10px] text-slate-400 font-mono">{hexStr.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Cost preview for this element */}
      <div className="rounded-lg bg-slate-800/80 p-2.5 space-y-1 border border-slate-700">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cost Preview</p>
        <div className="flex justify-between text-[10px]"><span className="text-slate-400">Materials</span><span className="text-slate-300">${cost.materials.toLocaleString()}</span></div>
        <div className="flex justify-between text-[10px]"><span className="text-slate-400">Labor</span><span className="text-slate-300">${cost.labor.toLocaleString()}</span></div>
        <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-600"><span className="text-slate-300">Total</span><span className="text-amber-400">${cost.total.toLocaleString()}</span></div>
      </div>
      <div className="space-y-1.5 border-t border-slate-700 pt-2">
        <button onClick={()=>onDuplicate(el.id)} className="flex items-center gap-2 w-full text-xs text-slate-300 hover:text-white px-2 py-1.5 rounded hover:bg-slate-700 transition-colors">
          <Copy className="w-3.5 h-3.5"/> Duplicate
        </button>
        <button onClick={()=>onDelete(el.id)} className="flex items-center gap-2 w-full text-xs text-rose-400 hover:text-rose-300 px-2 py-1.5 rounded hover:bg-rose-900/30 transition-colors">
          <Trash2 className="w-3.5 h-3.5"/> Remove
        </button>
      </div>
    </div>
  );
}

// ─── Palette ────────────────────────────────────────────────────────────────
function Palette({ onAdd }) {
  const [exp, setExp] = useState({shade:true});
  return (
    <div className="overflow-y-auto flex-1 py-1">
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        return (
          <div key={cat.key}>
            <button onClick={()=>setExp(e=>({...e,[cat.key]:!e[cat.key]}))}
              className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors">
              <span className="flex items-center gap-1.5"><Icon className="w-3 h-3"/>{cat.label}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform",exp[cat.key]&&"rotate-180")}/>
            </button>
            {exp[cat.key]&&(
              <div className="px-2 pb-2 space-y-0.5">
                {cat.items.map(item=>(
                  <button key={item.type} onClick={()=>onAdd(item)}
                    className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-900/30 hover:border-amber-700/40 border border-transparent transition-all group">
                    <div className="w-3 h-3 rounded-sm shrink-0 border border-white/10" style={{backgroundColor:"#"+item.color.toString(16).padStart(6,"0")}}/>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-300 group-hover:text-amber-300 truncate">{item.label}</p>
                      <p className="text-[9px] text-slate-500">{COST_RATES[item.type]?.unit==="each"?"$"+COST_RATES[item.type]?.base?.toLocaleString():COST_RATES[item.type]?"$"+COST_RATES[item.type]?.base+"/"+COST_RATES[item.type]?.unit:""}</p>
                    </div>
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
const DEFAULT_LOT_W = 80, DEFAULT_LOT_D = 100;

// Load satellite image as a THREE.Texture via fetch+blob (reliable cross-origin)
async function fetchSatTexture(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("satellite fetch failed");
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      URL.revokeObjectURL(objUrl);
      res(tex);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); rej(); };
    img.src = objUrl;
  });
}

export default function DesignEditor() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const designId = params.get("id");

  const [design, setDesign]             = useState(null);
  const [elements, setElements]         = useState([]);
  const [selectedId, setSelectedId]     = useState(null);
  const [lotW, setLotW]                 = useState(DEFAULT_LOT_W);
  const [lotD, setLotD]                 = useState(DEFAULT_LOT_D);
  const [geoCoords, setGeoCoords]       = useState(null);
  const [showLotSetup, setShowLotSetup] = useState(false);
  const [activePanel, setActivePanel]   = useState("elements");
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [loading, setLoading]           = useState(true);
  const [snapGrid, setSnapGrid]         = useState(false);
  const [viewMode, setViewMode]         = useState("top");   // "top" | "3d"
  const [satLoading, setSatLoading]     = useState(false);
  const [satLoaded, setSatLoaded]       = useState(false);

  const mountRef       = useRef(null);
  const rendererRef    = useRef(null);
  const sceneRef       = useRef(null);
  const cameraRef      = useRef(null);
  const controlsRef    = useRef(null);
  const groupsRef      = useRef({});
  const groundGroupRef = useRef(null);
  const satMeshRef     = useRef(null);
  const selectedIdRef  = useRef(null);
  const elementsRef    = useRef([]);
  const lotRef         = useRef({w:DEFAULT_LOT_W,d:DEFAULT_LOT_D});
  const animIdRef      = useRef(null);
  const snapRef        = useRef(false);

  useEffect(()=>{ snapRef.current=snapGrid; },[snapGrid]);

  // ── Load design ───────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!designId){setLoading(false);return;}
    base44.entities.Design.get(designId).then(d=>{
      setDesign(d);
      if(d.canvas_data){
        const els=d.canvas_data.elements||[];
        setElements(els); elementsRef.current=els;
        const lw=d.canvas_data.lotW||DEFAULT_LOT_W, ld=d.canvas_data.lotD||DEFAULT_LOT_D;
        setLotW(lw); setLotD(ld); lotRef.current={w:lw,d:ld};
        if(d.canvas_data.geoCoords) setGeoCoords(d.canvas_data.geoCoords);
      } else { setShowLotSetup(true); }
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[designId]);

  // ── Three.js init (runs once on mount) ───────────────────────────────────
  useEffect(()=>{
    const mount = mountRef.current;
    if(!mount) return;

    // Scene with sky background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 500, 1500);
    sceneRef.current = scene;

    // Single perspective camera — avoids orthographic degenerate-direction issues
    const W = mount.clientWidth || mount.offsetWidth || 800;
    const H = mount.clientHeight || mount.offsetHeight || 600;
    const camera = new THREE.PerspectiveCamera(50, W/H, 0.5, 5000);
    camera.position.set(0, 200, 180);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.setSize(W, H, false);  // false = don't set canvas CSS size
    mount.appendChild(renderer.domElement);
    // Force canvas to fill mount div regardless of pixel size
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.zoomSpeed = 1.4;
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
    sun.position.set(120, 200, 100); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left=-250; sun.shadow.camera.right=250;
    sun.shadow.camera.top=250;  sun.shadow.camera.bottom=-250;
    sun.shadow.camera.far=600;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x87CEEB, 0x4a7c59, 0.4));

    buildAndAddGround(scene, DEFAULT_LOT_W, DEFAULT_LOT_D);

    // Drag / click
    const dragPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let dragging=false, dragId=null;
    const dragOffset = new THREE.Vector3();

    const ndc = e => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX-r.left)/r.width )*2-1;
      mouse.y = -((e.clientY-r.top )/r.height)*2+1;
    };
    const planeHit = () => {
      raycaster.setFromCamera(mouse, camera);
      const pt = new THREE.Vector3();
      return raycaster.ray.intersectPlane(dragPlane, pt) ? pt : null;
    };

    const onPointerDown = e => {
      if(e.button!==0) return;
      ndc(e);
      raycaster.setFromCamera(mouse, camera);
      const meshes=[];
      Object.values(groupsRef.current).forEach(g=>g.traverse(c=>{if(c.isMesh&&c.name!=="selection_ring")meshes.push(c);}));
      const hits = raycaster.intersectObjects(meshes, false);
      if(hits.length){
        let hitId=null, obj=hits[0].object;
        while(obj){
          if(obj.userData?.elementId){hitId=obj.userData.elementId;break;}
          for(const[id,gr] of Object.entries(groupsRef.current)){if(obj===gr){hitId=id;break;}}
          if(hitId)break; obj=obj.parent;
        }
        if(!hitId){
          outer: for(const[id,gr] of Object.entries(groupsRef.current)){
            const q=[gr];
            while(q.length){const n=q.shift();if(n===hits[0].object){hitId=id;break outer;}q.push(...n.children);}
          }
        }
        if(hitId){
          setSelectedId(hitId); selectedIdRef.current=hitId; setActivePanel("props");
          dragging=true; dragId=hitId; controls.enabled=false;
          renderer.domElement.style.cursor="grabbing";
          const pt=planeHit(); const gr=groupsRef.current[hitId];
          if(pt&&gr) dragOffset.set(gr.position.x-pt.x, 0, gr.position.z-pt.z);
        }
      } else { setSelectedId(null); selectedIdRef.current=null; }
    };
    const onPointerMove = e => {
      if(!dragging||!dragId) return; ndc(e);
      const pt=planeHit(); const gr=groupsRef.current[dragId];
      if(pt&&gr){
        let nx=pt.x+dragOffset.x, nz=pt.z+dragOffset.z;
        if(snapRef.current){const s=2;nx=Math.round(nx/s)*s;nz=Math.round(nz/s)*s;}
        gr.position.x=nx; gr.position.z=nz;
      }
    };
    const onPointerUp = () => {
      if(dragging&&dragId){
        const gr=groupsRef.current[dragId];
        if(gr) setElements(prev=>prev.map(el=>el.id===dragId?{...el,x:gr.position.x,z:gr.position.z}:el));
      }
      dragging=false; dragId=null; controls.enabled=true;
      renderer.domElement.style.cursor="auto";
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup",   onPointerUp);

    const onResize = () => {
      const W2=mount.clientWidth||mount.offsetWidth||800;
      const H2=mount.clientHeight||mount.offsetHeight||600;
      if(!W2||!H2) return;
      camera.aspect = W2/H2; camera.updateProjectionMatrix();
      renderer.setSize(W2, H2, false);
    };
    window.addEventListener("resize", onResize);
    // Trigger once in case initial size was wrong
    setTimeout(onResize, 100);

    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      controls.update();
      const sel=selectedIdRef.current;
      Object.entries(groupsRef.current).forEach(([id,g])=>{
        const ring=g.getObjectByName("selection_ring");
        if(ring) ring.visible = id===sel;
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup",   onPointerUp);
      controls.dispose(); renderer.dispose();
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  },[]);

  // ── Top / 3D view preset ─────────────────────────────────────────────────
  useEffect(()=>{
    const cam=cameraRef.current; const controls=controlsRef.current;
    if(!cam||!controls) return;
    const {w,d}=lotRef.current;
    const dist=Math.max(w,d);
    if(viewMode==="top"){
      // High angle looking straight down-ish (slight tilt to avoid gimbal)
      cam.position.set(0, dist*2.8, dist*0.3);
      cam.lookAt(0,0,0);
    } else {
      // 45° angle for full 3D view
      cam.position.set(0, dist*1.2, dist*1.6);
      cam.lookAt(0,0,0);
    }
    controls.target.set(0,0,0);
    controls.update();
  },[viewMode]);

  // ── Ground builder ────────────────────────────────────────────────────────
  function buildAndAddGround(scene, w, d){
    if(groundGroupRef.current){
      groundGroupRef.current.traverse(o=>{if(o.isMesh||o.isLine){o.geometry?.dispose();o.material?.dispose();}});
      scene.remove(groundGroupRef.current);
    }
    const g=new THREE.Group();
    // Visible grass ground
    const gMesh=new THREE.Mesh(new THREE.PlaneGeometry(w*30,d*30),new THREE.MeshLambertMaterial({color:0x3a5c2a}));
    gMesh.rotation.x=-Math.PI/2; gMesh.position.y=-0.1; gMesh.receiveShadow=true; g.add(gMesh);
    // Invisible hit plane for raycasting
    const hit=new THREE.Mesh(new THREE.PlaneGeometry(w*30,d*30),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
    hit.rotation.x=-Math.PI/2; g.add(hit);
    // Lot boundary line
    const pts=[new THREE.Vector3(-w/2,.2,-d/2),new THREE.Vector3(w/2,.2,-d/2),new THREE.Vector3(w/2,.2,d/2),new THREE.Vector3(-w/2,.2,d/2),new THREE.Vector3(-w/2,.2,-d/2)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xF59E0B})));
    // Corner posts
    [[w/2,-d/2],[w/2,d/2],[-w/2,-d/2],[-w/2,d/2]].forEach(([cx,cz])=>{
      const m=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,3,8),new THREE.MeshBasicMaterial({color:0xF59E0B}));
      m.position.set(cx,1.5,cz); g.add(m);
    });
    scene.add(g); groundGroupRef.current=g;
  }

  // ── Load satellite image into scene ───────────────────────────────────────
  useEffect(()=>{
    const scene=sceneRef.current;
    if(!scene||!geoCoords) return;
    setSatLoading(true); setSatLoaded(false);
    const url=`/api/satellite?lat=${geoCoords.lat}&lon=${geoCoords.lon}&w=${lotW}&d=${lotD}`;
    const latDPF=1/364000;
    const lonDPF=1/(364000*Math.cos(geoCoords.lat*Math.PI/180));
    const planeW=(Math.max(lotW*1.5*lonDPF,0.0012)*2)/lonDPF;
    const planeD=(Math.max(lotD*1.5*latDPF,0.0012)*2)/latDPF;
    fetchSatTexture(url).then(tex=>{
      if(satMeshRef.current){scene.remove(satMeshRef.current);satMeshRef.current.geometry?.dispose();satMeshRef.current.material?.dispose();}
      const mesh=new THREE.Mesh(
        new THREE.PlaneGeometry(planeW,planeD),
        new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide})
      );
      mesh.rotation.x=-Math.PI/2; mesh.position.y=0; mesh.name="satellite_plane";
      scene.add(mesh); satMeshRef.current=mesh;
      // Frame camera on satellite coverage
      const cam=cameraRef.current; const controls=controlsRef.current;
      if(cam&&controls){
        const dist=Math.max(planeW,planeD);
        cam.position.set(0,dist*1.5,dist*0.4);
        cam.lookAt(0,0,0);
        controls.target.set(0,0,0); controls.update();
      }
      setSatLoaded(true);
    }).catch(()=>setSatLoaded(false)).finally(()=>setSatLoading(false));
  },[geoCoords,lotW,lotD]);

  // ── Sync lot → scene ─────────────────────────────────────────────────────
  useEffect(()=>{
    const scene=sceneRef.current; if(!scene) return;
    lotRef.current={w:lotW,d:lotD};
    buildAndAddGround(scene,lotW,lotD);
    const cam=cameraRef.current; const controls=controlsRef.current;
    if(cam&&controls&&!satMeshRef.current){
      const dist=Math.max(lotW,lotD);
      cam.position.set(0,dist*2,dist*1.5);
      cam.lookAt(0,0,0); controls.target.set(0,0,0); controls.update();
    }
  },[lotW,lotD]);

  // ── Sync elements → scene ─────────────────────────────────────────────────
  useEffect(()=>{
    elementsRef.current=elements;
    const scene=sceneRef.current; if(!scene) return;
    const cur=new Set(elements.map(e=>e.id));
    Object.keys(groupsRef.current).forEach(id=>{
      if(!cur.has(id)){scene.remove(groupsRef.current[id]); delete groupsRef.current[id];}
    });
    elements.forEach(el=>{
      if(!groupsRef.current[el.id]){
        const gr=buildStructureGroup(el);
        gr.position.set(el.x??0, 0, el.z??0);
        gr.rotation.y=(el.rotation||0)*Math.PI/180;
        scene.add(gr); groupsRef.current[el.id]=gr;
      } else {
        groupsRef.current[el.id].rotation.y=(el.rotation||0)*Math.PI/180;
      }
    });
  },[elements]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave=useCallback(async()=>{
    if(!designId) return;
    setSaving(true);
    try {
      await base44.entities.Design.update(designId,{
        canvas_data:{elements:elementsRef.current,lotW,lotD,geoCoords},
      });
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    } finally{ setSaving(false); }
  },[designId,lotW,lotD,geoCoords]);

  useEffect(()=>{
    const fn=e=>{
      if((e.metaKey||e.ctrlKey)&&e.key==="s"){e.preventDefault();handleSave();}
      if(["Delete","Backspace"].includes(e.key)&&selectedIdRef.current&&document.activeElement.tagName!=="INPUT"){
        const id=selectedIdRef.current;
        setElements(prev=>prev.filter(el=>el.id!==id));
        setSelectedId(null); selectedIdRef.current=null;
      }
    };
    window.addEventListener("keydown",fn);
    return ()=>window.removeEventListener("keydown",fn);
  },[handleSave]);

  // ── Element ops ───────────────────────────────────────────────────────────
  const addElement=item=>{
    const id=`el_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {w,d}=lotRef.current;
    const el={id,type:item.type,label:item.label,color:item.color,w:item.w,d:item.d,rotation:0,
      x:(Math.random()-0.5)*w*0.4, z:(Math.random()-0.5)*d*0.4};
    setElements(prev=>[...prev,el]);
    setSelectedId(id); selectedIdRef.current=id; setActivePanel("props");
  };

  const updateElement=(id,patch)=>{
    setElements(prev=>prev.map(el=>el.id===id?{...el,...patch}:el));
    if(patch.color!==undefined||patch.w!==undefined||patch.d!==undefined){
      const scene=sceneRef.current;
      if(scene&&groupsRef.current[id]){scene.remove(groupsRef.current[id]); delete groupsRef.current[id];}
    }
  };

  const deleteElement=id=>{
    setElements(prev=>prev.filter(el=>el.id!==id));
    setSelectedId(null); selectedIdRef.current=null;
    const scene=sceneRef.current;
    if(scene&&groupsRef.current[id]){scene.remove(groupsRef.current[id]); delete groupsRef.current[id];}
  };

  const duplicateElement=id=>{
    const src=elementsRef.current.find(el=>el.id===id); if(!src) return;
    const newId=`el_${Date.now()}`;
    setElements(prev=>[...prev,{...src,id:newId,x:src.x+5,z:src.z+5}]);
    setSelectedId(newId); selectedIdRef.current=newId;
  };

  const selectedEl=elements.find(el=>el.id===selectedId)||null;
  const totalCost=elements.reduce((s,el)=>s+calcElementCost(el).total,0);

  const PANELS=[
    {key:"elements", label:"Elements", icon:Compass},
    {key:"props",    label:"Properties", icon:Fence},
    {key:"estimate", label:"Estimate",  icon:DollarSign},
  ];

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-900" style={{fontFamily:"system-ui,sans-serif"}}>

      {/* Top bar */}
      <div className="h-13 bg-slate-950 border-b border-slate-700 flex items-center px-4 gap-2 shrink-0 z-20">
        <button onClick={()=>navigate(createPageUrl("DesignPortal"))}
          className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4"/> Back
        </button>
        <div className="w-px h-5 bg-slate-700"/>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{design?.title||"Untitled Design"}</p>
          {design?.client_name&&<p className="text-[10px] text-slate-400 truncate">{design.client_name} · {design.address||""}</p>}
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
          <button onClick={()=>setViewMode("top")}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
              viewMode==="top"?"bg-amber-500 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
            <Eye className="w-3.5 h-3.5"/> Top View
          </button>
          <button onClick={()=>setViewMode("3d")}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-slate-600",
              viewMode==="3d"?"bg-amber-500 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
            <Box className="w-3.5 h-3.5"/> 3D View
          </button>
        </div>

        <button onClick={()=>setSnapGrid(s=>!s)}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            snapGrid?"bg-blue-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
          <Grid3x3 className="w-3.5 h-3.5"/> Snap
        </button>

        <button onClick={()=>setShowLotSetup(true)}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            geoCoords&&satLoaded?"bg-emerald-700 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
          <RulerIcon className="w-3.5 h-3.5"/>
          {satLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : null}
          {geoCoords&&satLoaded ? "Aerial ✓" : geoCoords ? "Aerial…" : `${lotW}′×${lotD}′`}
        </button>

        {totalCost>0&&(
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-900/30 px-2.5 py-1.5 rounded-lg border border-amber-800/40">
            <DollarSign className="w-3.5 h-3.5"/> ${totalCost.toLocaleString()}
          </div>
        )}

        <Button size="sm" onClick={handleSave} disabled={saving}
          className={cn("gap-1.5 min-w-[80px] shrink-0",saved?"bg-emerald-500 hover:bg-emerald-600":"bg-gradient-to-r from-amber-500 to-orange-500")}>
          {saving?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:saved?<><Check className="w-3.5 h-3.5"/>Saved</>:<><Save className="w-3.5 h-3.5"/>Save</>}
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-56 bg-slate-950 border-r border-slate-700 flex flex-col shrink-0 z-10">
          <div className="flex border-b border-slate-700 shrink-0">
            {PANELS.map(({key,label,icon:Icon})=>(
              <button key={key} onClick={()=>setActivePanel(key)}
                className={cn("flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors text-[9px] font-bold uppercase tracking-wider",
                  activePanel===key?"text-amber-400 border-b-2 border-amber-500 bg-slate-900/50":"text-slate-500 hover:text-slate-300")}>
                <Icon className="w-3.5 h-3.5"/>{label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {activePanel==="elements"&&<Palette onAdd={addElement}/>}
            {activePanel==="props"&&<PropertiesPanel el={selectedEl} onUpdate={updateElement} onDelete={deleteElement} onDuplicate={duplicateElement}/>}
            {activePanel==="estimate"&&<EstimatePanel elements={elements} designId={designId} designTitle={design?.title} clientName={design?.client_name} onEstimateCreated={id=>navigate(createPageUrl(`InvoiceDesigner?id=${id}`))}/>}
          </div>
        </div>

        {/* Canvas viewport */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={mountRef} className="w-full h-full"/>
          {loading&&(
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-30">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500"/>
            </div>
          )}
          {satLoading&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin"/>Loading aerial photo…
            </div>
          )}
          {!geoCoords&&!satLoading&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-slate-300 text-xs px-3 py-1.5 rounded-full pointer-events-none select-none">
              Click the lot button above to enter an address and load the aerial photo
            </div>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-4 py-1.5 rounded-full pointer-events-none select-none backdrop-blur-sm">
            {viewMode==="top"
              ? "Scroll to zoom · Drag to pan · Click palette to add elements · Drag elements to move"
              : "Scroll to zoom · Left drag to orbit · Right drag to pan · Click elements to select"}
          </div>
        </div>

        {/* Right layers */}
        <div className="w-40 bg-slate-950 border-l border-slate-700 flex flex-col shrink-0 text-white">
          <div className="p-3 border-b border-slate-700 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Project</p>
            <div><p className="text-[10px] text-slate-500">Elements</p><p className="text-xl font-bold">{elements.length}</p></div>
            <div><p className="text-[10px] text-slate-500">Lot</p><p className="text-xs font-semibold text-slate-300">{lotW}′ × {lotD}′</p></div>
            {totalCost>0&&<div><p className="text-[10px] text-slate-500">Est. Total</p><p className="text-xs font-bold text-amber-400">${totalCost.toLocaleString()}</p></div>}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-1 py-1.5">Layers</p>
            {[...elements].reverse().map(el=>(
              <button key={el.id} onClick={()=>{setSelectedId(el.id);selectedIdRef.current=el.id;setActivePanel("props");}}
                className={cn("flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors",
                  selectedId===el.id?"bg-amber-900/40 text-amber-300":"text-slate-400 hover:bg-slate-800")}>
                <div className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/10"
                  style={{backgroundColor:"#"+(typeof el.color==="number"?el.color:parseInt((el.color||"888888").replace("#",""),16)).toString(16).padStart(6,"0")}}/>
                <span className="truncate font-medium">{el.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showLotSetup&&(
        <LotSetup lotW={lotW} lotD={lotD} designAddress={design?.address||""}
          onApply={(w,d,coords)=>{
            setLotW(w); setLotD(d); lotRef.current={w,d};
            if(coords) setGeoCoords(coords);
            setShowLotSetup(false);
          }}
          onClose={()=>setShowLotSetup(false)}
        />
      )}
    </div>
  );
}
