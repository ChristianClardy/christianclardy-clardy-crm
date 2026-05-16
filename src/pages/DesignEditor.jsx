import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass }     from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass }       from "three/examples/jsm/postprocessing/SSAOPass.js";
import { SMAAPass }       from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass }     from "three/examples/jsm/postprocessing/OutputPass.js";
import { Sky }            from "three/examples/jsm/objects/Sky.js";
import {
  ArrowLeft, Save, Check, Loader2, Trash2, Copy, RotateCw,
  Sun, Layers, Fence, UtensilsCrossed, Waves, TreePine, Compass,
  ChevronDown, RulerIcon, Maximize2, Map, DollarSign, FileText,
  Grid3x3, Eye, Satellite, Box, Camera, RotateCcw, Download, Plus,
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
  sunroom:         { unit: "sqft",  base: 120,   labor: 45,    label: "Sunroom" },
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
  house_ranch:     { unit: "each",  base: 0,     labor: 0,     label: "Ranch House (existing)" },
  house_colonial:  { unit: "each",  base: 0,     labor: 0,     label: "Colonial House (existing)" },
  house_modern:    { unit: "each",  base: 0,     labor: 0,     label: "Modern House (existing)" },
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
    { type: "sunroom",       label: "Sunroom",        w: 18, d: 14, color: 0xE8E4DC },
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
  { key: "building",    label: "House / Building",    icon: Box,           items: [
    { type: "room",           label: "Room / Space",     w: 20, d: 16, color: 0xF2EDE0 },
    { type: "house_ranch",    label: "Ranch House",      w: 42, d: 28, color: 0xF2EDE0 },
    { type: "house_colonial", label: "Colonial House",   w: 38, d: 26, color: 0xE8E0D0 },
    { type: "house_modern",   label: "Modern House",     w: 46, d: 32, color: 0xD0CCC4 },
    { type: "garage",         label: "Garage",           w: 22, d: 24, color: 0xD8D4CC },
  ]},
  { key: "amenities",   label: "Amenities",          icon: Compass,       items: [
    { type: "firepit",       label: "Fire Pit",       w: 6,  d: 6,  color: 0xE64A19 },
    { type: "fireplace",     label: "Fireplace",      w: 6,  d: 2,  color: 0x8A7A6A },
    { type: "seating",       label: "Seating Group",  w: 10, d: 10, color: 0xA1887F },
    { type: "dining_set",    label: "Dining Set",     w: 10, d: 8,  color: 0x8D6E63 },
    { type: "bocce_court",   label: "Bocce Court",    w: 8,  d: 30, color: 0xD4A76A },
    { type: "outdoor_tv",    label: "Outdoor TV",     w: 5,  d: 1,  color: 0x212121 },
  ]},
];
const ALL_ITEMS = CATEGORIES.flatMap(c => c.items);
const ITEM_MAP  = Object.fromEntries(ALL_ITEMS.map(i => [i.type, i]));

const KITCHEN_ELEMENT_TYPES = new Set(['kitchen_island', 'bbq_grill', 'outdoor_bar']);

const APPLIANCE_CATALOG = [
  { id: 'big_green_egg',  label: 'Big Green Egg',   widthIn: 18, depthIn: 18 },
  { id: 'kamado_lg',      label: 'Kamado (Large)',   widthIn: 22, depthIn: 22 },
  { id: 'grill_36',       label: 'Gas Grill 36"',    widthIn: 36, depthIn: 20 },
  { id: 'grill_30',       label: 'Gas Grill 30"',    widthIn: 30, depthIn: 20 },
  { id: 'grill_24',       label: 'Gas Grill 24"',    widthIn: 24, depthIn: 20 },
  { id: 'burner',         label: 'Side Burner',      widthIn: 15, depthIn: 20 },
  { id: 'pizza_oven',     label: 'Pizza Oven',       widthIn: 24, depthIn: 24 },
  { id: 'fridge_15',      label: 'Fridge 15"',       widthIn: 15, depthIn: 24 },
  { id: 'fridge_24',      label: 'Fridge 24"',       widthIn: 24, depthIn: 24 },
  { id: 'ice_maker',      label: 'Ice Maker',        widthIn: 15, depthIn: 24 },
  { id: 'trash_pullout',  label: 'Trash Pull-Out',   widthIn: 15, depthIn: 22 },
];

function fmtIn(inches) {
  const ft = Math.floor(inches / 12);
  const i  = Math.round(inches % 12);
  return ft > 0 ? (i > 0 ? `${ft}′${i}″` : `${ft}′`) : `${i}″`;
}

// ─── Default build configs per element type ────────────────────────────────
const DEFAULT_BUILD_CONFIGS = {
  pergola: {
    postMaterial: 'cedar', postSizeIn: 6,
    frontHeightFt: 10, backHeightFt: 10,
    beamDepthIn: 8, rafterSpacingIn: 16,
    crossMemberSpacingIn: 0,
    shade: 'none', fans: 0, lights: 0,
  },
  patio_cover: {
    roofShape: 'gable', roofMaterial: 'shingle',
    attachment: 'detached',
    frontHeightFt: 10, backHeightFt: 10, ridgeRiseFt: 2, ridgeAxis: 'x',
    postMaterial: 'wood', postSizeIn: 6,
    wall: 'open', privacyWalls: [], tvWall: 'none',
    wallWidthFt: 0.5, tvWallWidthFt: 0, tvMountHeightFt: 5,
    exteriorFinish: 'stucco', interiorFinish: 'drywall',
    ceiling: 'open_beam', fans: 1, lights: 4, outlets: 2,
  },
  cabana: {
    roofShape: 'hip', roofMaterial: 'tile',
    attachment: 'detached',
    frontHeightFt: 10, backHeightFt: 10, ridgeRiseFt: 2, ridgeAxis: 'x',
    postMaterial: 'wood', postSizeIn: 6,
    wall: 'screen', privacyWalls: [], tvWall: 'none',
    wallWidthFt: 0.5, tvWallWidthFt: 0, tvMountHeightFt: 5,
    exteriorFinish: 'stucco', interiorFinish: 'tongue_groove',
    ceiling: 'tongue_groove', fans: 1, lights: 4, outlets: 4,
  },
  sunroom: {
    roofStyle: 'gable', roofMaterial: 'shingle',
    frontHeightFt: 9, backHeightFt: 9,
    doorType: 'french', doorSide: 'front',
    windows: 3, ceiling: 'drywall',
    hvac: 'mini_split', foundation: 'slab',
    fans: 1, lights: 4, outlets: 4,
  },
  pool_rect: {
    finish: 'pebble_blue', copingMaterial: 'travertine', copingWidthIn: 12,
    spa: false, sunShelf: false, waterfall: false, numLeds: 2,
    pump: 'variable', heater: 'heat_pump', automation: false,
    deckMaterial: 'travertine', deckWidthFt: 4, fence: false,
    shallowDepthFt: 3.5, deepDepthFt: 6.0,
  },
  pool_freeform: {
    finish: 'pebble_blue', copingMaterial: 'travertine', copingWidthIn: 12,
    spa: false, sunShelf: false, waterfall: false, numLeds: 2,
    pump: 'variable', heater: 'heat_pump', automation: false,
    deckMaterial: 'travertine', deckWidthFt: 4, fence: false,
    shallowDepthFt: 3.5, deepDepthFt: 6.0,
  },
  spa: {
    finish: 'pebble_grey', seats: 6, jets: 12,
    heater: 'gas', pump: 'variable', lights: 2,
  },
  patio: {
    material: 'travertine', pattern: 'random', border: 'soldier_course',
    sealer: true, baseType: 'gravel_sand',
  },
  pavers: {
    material: 'concrete_pavers', pattern: 'running_bond', border: 'none',
    sealer: false, baseType: 'gravel_sand',
  },
  driveway: {
    material: 'concrete', pattern: 'straight', border: 'none',
    sealer: false, baseType: 'concrete',
  },
  firepit: {
    shape: 'round', fuelType: 'gas', material: 'block',
    capMaterial: 'bluestone', diameterFt: 4, seating: 'chairs', seatCount: 4,
  },
  fire_table: {
    shape: 'square', fuelType: 'gas', material: 'concrete',
    capMaterial: 'granite', seating: 'none', seatCount: 0,
  },
  retaining_wall: {
    material: 'block', heightFt: 3, footing: true, cap: true,
  },
  lawn: {
    sodType: 'st_augustine', irrigation: false,
  },
  room: {
    heightFt: 9, wallThicknessIn: 6,
    roofStyle: 'gable', roofMaterial: 'shingle', ridgeRiseFt: 3,
    exteriorFinish: 'stucco', interiorFinish: 'drywall',
    floorMaterial: 'wood', ceilingFinish: 'drywall',
    hvac: 'central_air', outlets: 8, lights: 8, fans: 0,
    fireplaceWall: 'none', fireplaceStyle: 'traditional', fireplaceFuel: 'gas', fireplaceSurround: 'stone',
    doors: [{ wall: 'front', xFt: 0, widthFt: 3, heightFt: 6.8, type: 'single' }],
    windows: [
      { wall: 'front', xFt: -4, widthFt: 3, heightFt: 3.5, sillFt: 2.5 },
      { wall: 'front', xFt:  4, widthFt: 3, heightFt: 3.5, sillFt: 2.5 },
    ],
  },
  garage: {
    heightFt: 10, wallThicknessIn: 6,
    roofStyle: 'gable', roofMaterial: 'shingle', ridgeRiseFt: 3,
    exteriorFinish: 'stucco', interiorFinish: 'drywall',
    floorMaterial: 'concrete', ceilingFinish: 'drywall',
    hvac: 'none', outlets: 4, lights: 4, fans: 0,
    fireplaceWall: 'none',
    doors: [{ wall: 'front', xFt: 0, widthFt: 16, heightFt: 7, type: 'garage' }],
    windows: [{ wall: 'left', xFt: 0, widthFt: 2, heightFt: 2, sillFt: 5 }],
  },
  house_ranch: {
    heightFt: 9, wallThicknessIn: 6,
    roofStyle: 'hip', roofMaterial: 'shingle', ridgeRiseFt: 4,
    exteriorFinish: 'hardie_board', interiorFinish: 'drywall',
    floorMaterial: 'wood', ceilingFinish: 'drywall',
    hvac: 'central_air', outlets: 16, lights: 16, fans: 3,
    fireplaceWall: 'back', fireplaceStyle: 'traditional', fireplaceFuel: 'gas', fireplaceSurround: 'stone',
    doors: [
      { wall: 'front', xFt: 0, widthFt: 3.5, heightFt: 8, type: 'entry' },
      { wall: 'back',  xFt: 0, widthFt: 6, heightFt: 8, type: 'sliding' },
    ],
    windows: [
      { wall: 'front', xFt: -8, widthFt: 4, heightFt: 4, sillFt: 3 },
      { wall: 'front', xFt:  8, widthFt: 4, heightFt: 4, sillFt: 3 },
      { wall: 'left',  xFt:  0, widthFt: 3, heightFt: 4, sillFt: 3 },
      { wall: 'right', xFt:  0, widthFt: 3, heightFt: 4, sillFt: 3 },
      { wall: 'back',  xFt: -6, widthFt: 4, heightFt: 4, sillFt: 3 },
      { wall: 'back',  xFt:  6, widthFt: 4, heightFt: 4, sillFt: 3 },
    ],
  },
  house_colonial: {
    heightFt: 10, wallThicknessIn: 6,
    roofStyle: 'gable', roofMaterial: 'shingle', ridgeRiseFt: 5,
    exteriorFinish: 'brick', interiorFinish: 'drywall',
    floorMaterial: 'wood', ceilingFinish: 'drywall',
    hvac: 'central_air', outlets: 16, lights: 16, fans: 2,
    fireplaceWall: 'back', fireplaceStyle: 'traditional', fireplaceFuel: 'gas', fireplaceSurround: 'brick',
    doors: [
      { wall: 'front', xFt: 0, widthFt: 4, heightFt: 8, type: 'double' },
      { wall: 'back',  xFt: 0, widthFt: 3, heightFt: 7, type: 'single' },
    ],
    windows: [
      { wall: 'front', xFt: -7, widthFt: 2.5, heightFt: 5, sillFt: 3 },
      { wall: 'front', xFt:  7, widthFt: 2.5, heightFt: 5, sillFt: 3 },
      { wall: 'left',  xFt: -4, widthFt: 2.5, heightFt: 4, sillFt: 3 },
      { wall: 'left',  xFt:  4, widthFt: 2.5, heightFt: 4, sillFt: 3 },
      { wall: 'right', xFt: -4, widthFt: 2.5, heightFt: 4, sillFt: 3 },
      { wall: 'right', xFt:  4, widthFt: 2.5, heightFt: 4, sillFt: 3 },
    ],
  },
  house_modern: {
    heightFt: 10, wallThicknessIn: 8,
    roofStyle: 'flat', roofMaterial: 'flat', ridgeRiseFt: 0,
    exteriorFinish: 'stucco_smooth', interiorFinish: 'drywall',
    floorMaterial: 'concrete', ceilingFinish: 'drywall',
    hvac: 'central_air', outlets: 20, lights: 20, fans: 2,
    fireplaceWall: 'back', fireplaceStyle: 'modern', fireplaceFuel: 'gas', fireplaceSurround: 'tile',
    doors: [
      { wall: 'front', xFt: -6, widthFt: 3.5, heightFt: 8, type: 'entry' },
      { wall: 'back',  xFt:  0, widthFt: 10,  heightFt: 9, type: 'sliding' },
    ],
    windows: [
      { wall: 'front', xFt:  6, widthFt: 8, heightFt: 6, sillFt: 2 },
      { wall: 'left',  xFt:  0, widthFt: 4, heightFt: 7, sillFt: 1.5 },
      { wall: 'right', xFt:  0, widthFt: 4, heightFt: 7, sillFt: 1.5 },
    ],
  },
  fireplace: {
    style: 'traditional', fuel: 'gas',
    surroundMaterial: 'stone', hearthMaterial: 'stone', mantleStyle: 'wood',
    widthFt: 5, heightFt: 7,
    chimneyBreast: true, hasTV: false,
  },
};

// ─── Per-element line-item cost engine ─────────────────────────────────────
function getLineItems(el) {
  const cfg = el.buildConfig || {};
  const w = el.w || 10, d = el.d || 10;
  const sqft = w * d;
  const perim = 2 * (w + d);

  switch (el.type) {
    case 'pergola': {
      const pm = cfg.postMaterial || 'cedar';
      const ps = cfg.postSizeIn || 6;
      const ph = cfg.postHeightFt || 10;
      const postMat = { cedar: 85, redwood: 120, aluminum: 210, steel: 340 }[pm] || 85;
      const postCnt = 4 + (w > 20 ? 2 : 0) + (d > 16 ? 2 : 0);
      const beamLF = 2 * d + w;
      const rafterLF = Math.ceil(w / ((cfg.rafterSpacingIn || 16) / 12)) * d;
      const beamMat = { cedar: 6.5, redwood: 9, aluminum: 14, steel: 22 }[pm] || 6.5;
      const items = [
        { description: `Posts (${ps}×${ps}" ${pm}, ${ph}′)`, qty: postCnt, unit: 'ea', unitPrice: postMat * ph * (ps/4), total: Math.round(postCnt * postMat * ph * (ps/4)), category: 'material' },
        { description: 'Post anchor hardware', qty: postCnt, unit: 'ea', unitPrice: 28, total: postCnt * 28, category: 'material' },
        { description: `Double beams (${pm})`, qty: Math.round(beamLF), unit: 'LF', unitPrice: beamMat * 2, total: Math.round(beamLF * beamMat * 2), category: 'material' },
        { description: `2×6 rafters (${cfg.rafterSpacingIn || 16}" OC)`, qty: Math.round(rafterLF), unit: 'LF', unitPrice: beamMat * 0.8, total: Math.round(rafterLF * beamMat * 0.8), category: 'material' },
        { description: 'Structural hardware & bolts', qty: 1, unit: 'lot', unitPrice: Math.round(sqft * 2.5), total: Math.round(sqft * 2.5), category: 'material' },
      ];
      if (cfg.shade === 'fabric') items.push({ description: 'Shade sail fabric', qty: sqft, unit: 'SF', unitPrice: 4.5, total: Math.round(sqft * 4.5), category: 'material' });
      if (cfg.shade === 'louvers') items.push({ description: 'Motorized aluminum louvers', qty: sqft, unit: 'SF', unitPrice: 38, total: Math.round(sqft * 38), category: 'material' });
      if (cfg.fans > 0) items.push({ description: `Outdoor ceiling fan${cfg.fans > 1 ? 's' : ''}`, qty: cfg.fans, unit: 'ea', unitPrice: 420, total: cfg.fans * 420, category: 'material' });
      if (cfg.lights > 0) items.push({ description: 'Recessed LED fixtures', qty: cfg.lights, unit: 'ea', unitPrice: 185, total: cfg.lights * 185, category: 'material' });
      items.push({ description: 'Installation labor', qty: sqft, unit: 'SF', unitPrice: 12, total: Math.round(sqft * 12), category: 'labor' });
      items.push({ description: 'Permit & inspections', qty: 1, unit: 'ea', unitPrice: 650, total: 650, category: 'permit' });
      return items;
    }
    case 'patio_cover':
    case 'cabana': {
      const postCnt = 4 + (w > 18 ? 2 : 0);
      const pm2 = cfg.postMaterial || 'wood';
      const postCost = { wood: 280, aluminum: 480, steel: 720 }[pm2] || 280;
      const roofMat = { tile: 18, shingle: 12, metal: 22, polycarbonate: 14, wood: 16 }[cfg.roofMaterial || 'tile'] || 18;
      const ceilRate = { none: 0, open_beam: 8, tongue_groove: 16, drywall: 12 }[cfg.ceiling || 'open_beam'] || 8;
      const wallRate = { open: 0, screen: 9, partial: 18, full: 32 }[cfg.wall || 'open'] || 0;
      const fans = cfg.fans || 1, lights = cfg.lights || 2, outlets = cfg.outlets || 2;
      const items = [
        { description: `${pm2} posts (${cfg.postSizeIn || 6}×${cfg.postSizeIn || 6}", ${cfg.postHeightFt || 10}′)`, qty: postCnt, unit: 'ea', unitPrice: postCost, total: postCnt * postCost, category: 'material' },
        { description: 'Beam & header framing', qty: Math.round(perim), unit: 'LF', unitPrice: 14, total: Math.round(perim * 14), category: 'material' },
        { description: `${cfg.roofMaterial || 'Tile'} roofing (incl. decking)`, qty: sqft, unit: 'SF', unitPrice: roofMat, total: Math.round(sqft * roofMat), category: 'material' },
        { description: 'Flashing & weatherproofing', qty: 1, unit: 'lot', unitPrice: Math.round(sqft * 1.8), total: Math.round(sqft * 1.8), category: 'material' },
      ];
      if (ceilRate > 0) items.push({ description: `${cfg.ceiling} ceiling finish`, qty: sqft, unit: 'SF', unitPrice: ceilRate, total: Math.round(sqft * ceilRate), category: 'material' });
      if (wallRate > 0) items.push({ description: `${cfg.wall} walls/enclosure`, qty: Math.round(perim * (cfg.postHeightFt || 10) * 0.5), unit: 'SF', unitPrice: wallRate, total: Math.round(perim * (cfg.postHeightFt || 10) * 0.5 * wallRate), category: 'material' });
      if (fans > 0) items.push({ description: 'Outdoor fan(s)', qty: fans, unit: 'ea', unitPrice: 420, total: fans * 420, category: 'material' });
      if (lights > 0) items.push({ description: 'Recessed LED lights', qty: lights, unit: 'ea', unitPrice: 185, total: lights * 185, category: 'material' });
      if (outlets > 0) items.push({ description: 'Weatherproof outlets', qty: outlets, unit: 'ea', unitPrice: 220, total: outlets * 220, category: 'material' });
      items.push({ description: 'Concrete footings', qty: postCnt, unit: 'ea', unitPrice: 380, total: postCnt * 380, category: 'material' });
      items.push({ description: 'Rough carpentry & framing labor', qty: sqft, unit: 'SF', unitPrice: 18, total: Math.round(sqft * 18), category: 'labor' });
      items.push({ description: 'Electrical rough-in & finish', qty: 1, unit: 'lot', unitPrice: Math.round((fans + lights + outlets) * 180 + 800), total: Math.round((fans + lights + outlets) * 180 + 800), category: 'labor' });
      items.push({ description: 'Permit & inspections', qty: 1, unit: 'ea', unitPrice: 850, total: 850, category: 'permit' });
      return items;
    }
    case 'pool_rect':
    case 'pool_freeform': {
      const finish = cfg.finish || 'pebble_blue';
      const cop = cfg.copingMaterial || 'travertine';
      const deckW = cfg.deckWidthFt || 4;
      const deckSqft = (w + deckW * 2) * (d + deckW * 2) - sqft;
      const finishRate = { white_plaster: 6, pebble_grey: 9.5, pebble_blue: 10, quartz: 12, tile_waterline: 14 }[finish] || 9.5;
      const copRate = { travertine: 38, bluestone: 52, concrete: 22, brick: 28 }[cop] || 38;
      const deckRate = { travertine: 22, concrete: 14, pavers: 18, none: 0 }[cfg.deckMaterial || 'travertine'] || 22;
      const items = [
        { description: 'Excavation & hauling', qty: sqft, unit: 'SF', unitPrice: 18, total: Math.round(sqft * 18), category: 'material' },
        { description: 'Gunite / shotcrete shell', qty: sqft, unit: 'SF', unitPrice: 55, total: Math.round(sqft * 55), category: 'material' },
        { description: `${finish.replace(/_/g,' ')} interior finish`, qty: sqft, unit: 'SF', unitPrice: finishRate, total: Math.round(sqft * finishRate), category: 'material' },
        { description: `${cop} coping (${cfg.copingWidthIn || 12}" wide)`, qty: Math.round(perim), unit: 'LF', unitPrice: copRate, total: Math.round(perim * copRate), category: 'material' },
        { description: `${el.type === 'pool_freeform' ? 'Freeform' : 'Rectangular'} pool plumbing`, qty: 1, unit: 'lot', unitPrice: Math.round(sqft * 28), total: Math.round(sqft * 28), category: 'material' },
        { description: `${cfg.pump === 'variable' ? 'Variable-speed' : 'Single-speed'} pump & filter system`, qty: 1, unit: 'ea', unitPrice: cfg.pump === 'variable' ? 3800 : 1800, total: cfg.pump === 'variable' ? 3800 : 1800, category: 'material' },
        { description: `${cfg.heater === 'heat_pump' ? 'Heat pump' : cfg.heater === 'gas' ? 'Gas heater' : 'No heater'}`, qty: cfg.heater !== 'none' ? 1 : 0, unit: 'ea', unitPrice: cfg.heater === 'heat_pump' ? 4800 : cfg.heater === 'gas' ? 3200 : 0, total: cfg.heater === 'heat_pump' ? 4800 : cfg.heater === 'gas' ? 3200 : 0, category: 'material' },
        { description: 'LED pool lights', qty: cfg.numLeds || 2, unit: 'ea', unitPrice: 680, total: (cfg.numLeds || 2) * 680, category: 'material' },
      ];
      if (cfg.spa) items.push({ description: 'Attached spa (6-8 seat)', qty: 1, unit: 'ea', unitPrice: 18500, total: 18500, category: 'material' });
      if (cfg.sunShelf) items.push({ description: 'Tanning ledge / sun shelf', qty: 1, unit: 'ea', unitPrice: 4200, total: 4200, category: 'material' });
      if (cfg.waterfall) items.push({ description: 'Rock waterfall feature', qty: 1, unit: 'ea', unitPrice: 6500, total: 6500, category: 'material' });
      if (cfg.automation) items.push({ description: 'Pool automation system', qty: 1, unit: 'ea', unitPrice: 3200, total: 3200, category: 'material' });
      if (cfg.fence) items.push({ description: 'Pool safety fence', qty: Math.round(perim + deckW * 8), unit: 'LF', unitPrice: 38, total: Math.round((perim + deckW * 8) * 38), category: 'material' });
      if (deckRate > 0 && deckSqft > 0) items.push({ description: `${cfg.deckMaterial || 'travertine'} pool deck`, qty: Math.round(deckSqft), unit: 'SF', unitPrice: deckRate, total: Math.round(deckSqft * deckRate), category: 'material' });
      items.push({ description: 'Pool construction labor', qty: sqft, unit: 'SF', unitPrice: 42, total: Math.round(sqft * 42), category: 'labor' });
      items.push({ description: 'Electrical (pool bonding + equipment)', qty: 1, unit: 'lot', unitPrice: 4200, total: 4200, category: 'labor' });
      items.push({ description: 'Permit & inspections', qty: 1, unit: 'ea', unitPrice: 1800, total: 1800, category: 'permit' });
      return items;
    }
    case 'spa': {
      const seats = cfg.seats || 6;
      const jets = cfg.jets || 12;
      const items = [
        { description: 'Excavation & concrete pad', qty: 1, unit: 'ea', unitPrice: 2800, total: 2800, category: 'material' },
        { description: 'Gunite spa shell', qty: 1, unit: 'ea', unitPrice: 6500, total: 6500, category: 'material' },
        { description: `${cfg.finish || 'Pebble grey'} interior finish`, qty: 1, unit: 'ea', unitPrice: 2200, total: 2200, category: 'material' },
        { description: `${cfg.heater === 'gas' ? 'Gas' : 'Electric'} heater`, qty: 1, unit: 'ea', unitPrice: cfg.heater === 'gas' ? 2800 : 1800, total: cfg.heater === 'gas' ? 2800 : 1800, category: 'material' },
        { description: `Jets (${jets})`, qty: jets, unit: 'ea', unitPrice: 180, total: jets * 180, category: 'material' },
        { description: 'LED spa lights', qty: cfg.lights || 2, unit: 'ea', unitPrice: 520, total: (cfg.lights || 2) * 520, category: 'material' },
        { description: `${cfg.pump === 'variable' ? 'Variable-speed' : 'Single-speed'} pump system`, qty: 1, unit: 'ea', unitPrice: cfg.pump === 'variable' ? 2800 : 1400, total: cfg.pump === 'variable' ? 2800 : 1400, category: 'material' },
        { description: 'Travertine or stone coping', qty: 1, unit: 'lot', unitPrice: 1800, total: 1800, category: 'material' },
        { description: 'Labor & plumbing', qty: 1, unit: 'lot', unitPrice: 5500, total: 5500, category: 'labor' },
        { description: 'Electrical rough-in', qty: 1, unit: 'lot', unitPrice: 1800, total: 1800, category: 'labor' },
        { description: 'Permit', qty: 1, unit: 'ea', unitPrice: 650, total: 650, category: 'permit' },
      ];
      return items;
    }
    case 'patio':
    case 'pavers':
    case 'driveway': {
      const mat = cfg.material || (el.type === 'driveway' ? 'concrete' : el.type === 'pavers' ? 'concrete_pavers' : 'travertine');
      const matRate = { concrete: 9, stamped_concrete: 18, travertine: 22, flagstone: 28, concrete_pavers: 16, brick: 20, porcelain: 30 }[mat] || 16;
      const baseRate = cfg.baseType === 'concrete' ? 7 : 4.5;
      const borderLF = cfg.border !== 'none' ? Math.round(perim) : 0;
      const items = [
        { description: 'Grade & compact subgrade', qty: sqft, unit: 'SF', unitPrice: 2.2, total: Math.round(sqft * 2.2), category: 'labor' },
        { description: `${cfg.baseType === 'concrete' ? 'Concrete slab base' : 'Gravel/sand base (4")'}`, qty: sqft, unit: 'SF', unitPrice: baseRate, total: Math.round(sqft * baseRate), category: 'material' },
        { description: `${mat.replace(/_/g,' ')} material (${cfg.pattern || 'random'} pattern)`, qty: sqft, unit: 'SF', unitPrice: matRate, total: Math.round(sqft * matRate), category: 'material' },
        { description: 'Setting material (sand/mortar)', qty: sqft, unit: 'SF', unitPrice: 1.8, total: Math.round(sqft * 1.8), category: 'material' },
        { description: 'Installation labor', qty: sqft, unit: 'SF', unitPrice: el.type === 'driveway' ? 5 : 9, total: Math.round(sqft * (el.type === 'driveway' ? 5 : 9)), category: 'labor' },
      ];
      if (borderLF > 0) items.push({ description: `${cfg.border?.replace(/_/g,' ')} border`, qty: borderLF, unit: 'LF', unitPrice: 14, total: borderLF * 14, category: 'material' });
      if (cfg.sealer) items.push({ description: 'Sealer application', qty: sqft, unit: 'SF', unitPrice: 1.2, total: Math.round(sqft * 1.2), category: 'material' });
      return items;
    }
    case 'firepit':
    case 'fire_table': {
      const fuelType = cfg.fuelType || 'gas';
      const matType = cfg.material || 'block';
      const capMat = cfg.capMaterial || 'bluestone';
      const diameter = cfg.diameterFt || 4;
      const capRate = { bluestone: 48, granite: 62, travertine: 40, none: 0 }[capMat] || 48;
      const bodyRate = { block: 18, stone: 28, concrete: 16, metal: 24 }[matType] || 18;
      const bodyLF = Math.PI * diameter;
      const seatCount = cfg.seatCount || 0;
      const items = [
        { description: 'Concrete pad / footing', qty: 1, unit: 'ea', unitPrice: 680, total: 680, category: 'material' },
        { description: `${matType} fire pit body`, qty: Math.round(bodyLF), unit: 'LF', unitPrice: bodyRate, total: Math.round(bodyLF * bodyRate), category: 'material' },
        { description: `${capMat} cap`, qty: Math.round(bodyLF), unit: 'LF', unitPrice: capRate, total: Math.round(bodyLF * capRate), category: 'material' },
        { description: fuelType === 'gas' ? 'Gas ring & valve assembly' : 'Spark arrestor & grate', qty: 1, unit: 'ea', unitPrice: fuelType === 'gas' ? 1200 : 380, total: fuelType === 'gas' ? 1200 : 380, category: 'material' },
        { description: 'Refractory interior liner', qty: 1, unit: 'ea', unitPrice: 480, total: 480, category: 'material' },
        { description: 'Masonry labor', qty: 1, unit: 'lot', unitPrice: 1400, total: 1400, category: 'labor' },
      ];
      if (fuelType === 'gas') items.push({ description: 'Gas line rough-in (to pit)', qty: 1, unit: 'lot', unitPrice: 1800, total: 1800, category: 'labor' });
      if (seatCount > 0) items.push({ description: `Outdoor lounge chairs (${seatCount})`, qty: seatCount, unit: 'ea', unitPrice: 420, total: seatCount * 420, category: 'material' });
      items.push({ description: 'Permit', qty: 1, unit: 'ea', unitPrice: 350, total: 350, category: 'permit' });
      return items;
    }
    case 'retaining_wall': {
      const h = cfg.heightFt || 3;
      const wallSF = w * h;
      const matRate2 = { block: 28, stone: 48, concrete: 22, timber: 18 }[cfg.material || 'block'] || 28;
      const items = [
        { description: 'Excavation & grading', qty: Math.round(w), unit: 'LF', unitPrice: 18, total: Math.round(w * 18), category: 'labor' },
        { description: `${cfg.material || 'block'} wall material`, qty: wallSF, unit: 'SF', unitPrice: matRate2, total: Math.round(wallSF * matRate2), category: 'material' },
        { description: 'Drainage pipe & gravel backfill', qty: Math.round(w), unit: 'LF', unitPrice: 22, total: Math.round(w * 22), category: 'material' },
        { description: 'Geogrid reinforcement (if >3′ high)', qty: h > 3 ? wallSF : 0, unit: 'SF', unitPrice: 4, total: h > 3 ? Math.round(wallSF * 4) : 0, category: 'material' },
        ...(cfg.cap ? [{ description: 'Wall cap', qty: Math.round(w), unit: 'LF', unitPrice: 24, total: Math.round(w * 24), category: 'material' }] : []),
        { description: 'Installation labor', qty: wallSF, unit: 'SF', unitPrice: 22, total: Math.round(wallSF * 22), category: 'labor' },
      ];
      return items;
    }
    case 'lawn': {
      const sodRate = { st_augustine: 1.8, bermuda: 1.4, zoysia: 2.2, fescue: 1.6, artificial: 8 }[cfg.sodType || 'st_augustine'] || 1.8;
      const items = [
        { description: 'Grade & prep soil', qty: sqft, unit: 'SF', unitPrice: 0.9, total: Math.round(sqft * 0.9), category: 'labor' },
        { description: 'Topsoil amendment (2")', qty: sqft, unit: 'SF', unitPrice: 0.85, total: Math.round(sqft * 0.85), category: 'material' },
        { description: `${(cfg.sodType || 'st_augustine').replace(/_/g, ' ')} sod`, qty: sqft, unit: 'SF', unitPrice: sodRate, total: Math.round(sqft * sodRate), category: 'material' },
        { description: 'Sod installation', qty: sqft, unit: 'SF', unitPrice: 0.65, total: Math.round(sqft * 0.65), category: 'labor' },
      ];
      if (cfg.irrigation) items.push({ description: 'Irrigation system (spray heads)', qty: sqft, unit: 'SF', unitPrice: 1.8, total: Math.round(sqft * 1.8), category: 'material' });
      return items;
    }
    case 'sunroom': {
      const doorCost = { french: 4800, sliding: 3600, single: 1800 }[cfg.doorType || 'french'] || 4800;
      const roofRate = { shingle: 12, metal: 22, tile: 18, glass: 45 }[cfg.roofMaterial || 'shingle'] || 12;
      const wallH3 = cfg.frontHeightFt || 9;
      const wallSF3 = Math.round(perim * wallH3 * 0.85);
      const items = [
        { description: 'Concrete slab foundation', qty: sqft, unit: 'SF', unitPrice: 9, total: Math.round(sqft * 9), category: 'material' },
        { description: 'Aluminum frame system', qty: wallSF3, unit: 'SF', unitPrice: 28, total: Math.round(wallSF3 * 28), category: 'material' },
        { description: 'Tempered glass panels', qty: Math.round(wallSF3 * 0.75), unit: 'SF', unitPrice: 45, total: Math.round(wallSF3 * 0.75 * 45), category: 'material' },
        { description: `${cfg.doorType || 'French'} door`, qty: 1, unit: 'ea', unitPrice: doorCost, total: doorCost, category: 'material' },
        { description: `${cfg.roofMaterial || 'Shingle'} roofing`, qty: sqft, unit: 'SF', unitPrice: roofRate, total: Math.round(sqft * roofRate), category: 'material' },
      ];
      if (cfg.ceiling && cfg.ceiling !== 'none') {
        const ceilRate3 = { tongue_groove: 16, drywall: 12 }[cfg.ceiling] || 12;
        items.push({ description: `${cfg.ceiling.replace(/_/g,' ')} ceiling`, qty: sqft, unit: 'SF', unitPrice: ceilRate3, total: Math.round(sqft * ceilRate3), category: 'material' });
      }
      if (cfg.hvac === 'mini_split') items.push({ description: 'Mini-split HVAC system', qty: 1, unit: 'ea', unitPrice: 4800, total: 4800, category: 'material' });
      if (cfg.fans > 0) items.push({ description: 'Ceiling fan(s)', qty: cfg.fans, unit: 'ea', unitPrice: 420, total: cfg.fans * 420, category: 'material' });
      if (cfg.lights > 0) items.push({ description: 'Recessed LED lights', qty: cfg.lights, unit: 'ea', unitPrice: 185, total: cfg.lights * 185, category: 'material' });
      if (cfg.outlets > 0) items.push({ description: 'Weatherproof outlets', qty: cfg.outlets, unit: 'ea', unitPrice: 220, total: cfg.outlets * 220, category: 'material' });
      items.push({ description: 'Installation labor', qty: sqft, unit: 'SF', unitPrice: 45, total: Math.round(sqft * 45), category: 'labor' });
      items.push({ description: 'Electrical rough-in & finish', qty: 1, unit: 'lot', unitPrice: 2800, total: 2800, category: 'labor' });
      items.push({ description: 'Permit & inspections', qty: 1, unit: 'ea', unitPrice: 1200, total: 1200, category: 'permit' });
      return items;
    }
    case 'room':
    case 'garage':
    case 'house_ranch':
    case 'house_colonial':
    case 'house_modern': {
      const wallH5 = cfg.heightFt || 9;
      const wallSF5 = Math.round(perim * wallH5);
      const roofSF5 = Math.round(sqft * 1.25);
      const extRate5 = { stucco:12,stucco_smooth:10,brick:22,stone:32,hardie_board:11,wood_siding:13,vinyl_siding:7,block:16 }[cfg.exteriorFinish||'stucco']||12;
      const intRate5 = { drywall:5,tongue_groove:11,shiplap:10,wood_panel:13,brick:18,stone_veneer:24,tile:15 }[cfg.interiorFinish||'drywall']||5;
      const flrRate5 = { wood:12,tile:9,stone:22,concrete:7,carpet:5,travertine:17,marble:28 }[cfg.floorMaterial||'wood']||12;
      const rfRate5  = { shingle:7,tile:16,metal:20,flat:9 }[cfg.roofMaterial||'shingle']||7;
      const numDoors5 = (cfg.doors||[]).length;
      const numWins5  = (cfg.windows||[]).length;
      const doorCost5 = (cfg.doors||[]).reduce((s,dr)=>s+({single:900,double:1600,french:3000,sliding:2400,garage:2600,entry:2200}[dr.type||'single']||900),0);
      const hvacCost5 = { central_air:Math.round(sqft*18), mini_split:4800, none:0 }[cfg.hvac||'central_air']||Math.round(sqft*18);
      const items5 = [
        { description:'Foundation / concrete slab', qty:sqft, unit:'SF', unitPrice:9, total:Math.round(sqft*9), category:'material' },
        { description:'Framing lumber & sheathing', qty:wallSF5, unit:'SF', unitPrice:8, total:Math.round(wallSF5*8), category:'material' },
        { description:`Exterior finish (${(cfg.exteriorFinish||'stucco').replace(/_/g,' ')})`, qty:wallSF5, unit:'SF', unitPrice:extRate5, total:Math.round(wallSF5*extRate5), category:'material' },
        { description:`Interior finish (${(cfg.interiorFinish||'drywall').replace(/_/g,' ')})`, qty:wallSF5, unit:'SF', unitPrice:intRate5, total:Math.round(wallSF5*intRate5), category:'material' },
        { description:`Flooring (${(cfg.floorMaterial||'wood').replace(/_/g,' ')})`, qty:sqft, unit:'SF', unitPrice:flrRate5, total:Math.round(sqft*flrRate5), category:'material' },
        { description:`Roofing (${(cfg.roofMaterial||'shingle').replace(/_/g,' ')})`, qty:roofSF5, unit:'SF', unitPrice:rfRate5, total:Math.round(roofSF5*rfRate5), category:'material' },
      ];
      if (numWins5>0) items5.push({ description:'Windows (installed)', qty:numWins5, unit:'ea', unitPrice:900, total:numWins5*900, category:'material' });
      if (numDoors5>0) items5.push({ description:'Doors (installed)', qty:numDoors5, unit:'ea', unitPrice:Math.round(doorCost5/numDoors5), total:doorCost5, category:'material' });
      if (cfg.fireplaceWall&&cfg.fireplaceWall!=='none') items5.push({ description:'Fireplace (gas insert + surround)', qty:1, unit:'ea', unitPrice:9500, total:9500, category:'material' });
      if (hvacCost5>0) items5.push({ description:'HVAC system', qty:1, unit:'lot', unitPrice:hvacCost5, total:hvacCost5, category:'material' });
      if ((cfg.fans||0)>0) items5.push({ description:'Ceiling fan(s)', qty:cfg.fans, unit:'ea', unitPrice:450, total:cfg.fans*450, category:'material' });
      items5.push({ description:'Framing & finish labor', qty:wallSF5+sqft, unit:'SF', unitPrice:9, total:Math.round((wallSF5+sqft)*9), category:'labor' });
      items5.push({ description:'Electrical rough-in & finish', qty:1, unit:'lot', unitPrice:Math.round(((cfg.outlets||8)*220)+((cfg.lights||8)*180)+3000), total:Math.round(((cfg.outlets||8)*220)+((cfg.lights||8)*180)+3000), category:'labor' });
      items5.push({ description:'Plumbing rough-in', qty:1, unit:'lot', unitPrice:Math.round(sqft*4.5), total:Math.round(sqft*4.5), category:'labor' });
      items5.push({ description:'Building permit & inspections', qty:1, unit:'lot', unitPrice:Math.round(sqft*4), total:Math.round(sqft*4), category:'permit' });
      return items5;
    }
    case 'fireplace': {
      const fuelCost6 = { gas:4200, wood:2600, electric:2000, propane:3600 }[cfg.fuel||'gas']||4200;
      const surrCost6 = { stone:4500, brick:3000, marble:6000, tile:2400, drywall:1400, shiplap:2000 }[cfg.surroundMaterial||'stone']||4500;
      const items6 = [
        { description:`${(cfg.fuel||'Gas')} fireplace unit`, qty:1, unit:'ea', unitPrice:fuelCost6, total:fuelCost6, category:'material' },
        { description:`Surround (${(cfg.surroundMaterial||'stone').replace(/_/g,' ')})`, qty:1, unit:'lot', unitPrice:surrCost6, total:surrCost6, category:'material' },
        { description:'Hearth / flooring', qty:1, unit:'lot', unitPrice:900, total:900, category:'material' },
        { description:'Chimney / flue system', qty:1, unit:'lot', unitPrice:2400, total:2400, category:'material' },
      ];
      if (cfg.mantleStyle&&cfg.mantleStyle!=='none') items6.push({ description:'Mantle', qty:1, unit:'ea', unitPrice:cfg.mantleStyle==='stone'?2400:1600, total:cfg.mantleStyle==='stone'?2400:1600, category:'material' });
      if (cfg.fuel==='gas'||cfg.fuel==='propane') items6.push({ description:'Gas line rough-in', qty:1, unit:'lot', unitPrice:1900, total:1900, category:'labor' });
      items6.push({ description:'Installation & framing labor', qty:1, unit:'lot', unitPrice:3800, total:3800, category:'labor' });
      items6.push({ description:'Permit', qty:1, unit:'lot', unitPrice:500, total:500, category:'permit' });
      return items6;
    }
    default: {
      const rate = COST_RATES[el.type];
      if (!rate) return [];
      let qty = 1;
      if (rate.unit === 'sqft') qty = sqft;
      else if (rate.unit === 'lnft') qty = w;
      return [
        { description: `${el.label} — materials`, qty, unit: rate.unit, unitPrice: rate.base, total: Math.round(rate.base * qty), category: 'material' },
        ...(rate.labor > 0 ? [{ description: `${el.label} — labor`, qty, unit: rate.unit, unitPrice: rate.labor, total: Math.round(rate.labor * qty), category: 'labor' }] : []),
      ];
    }
  }
}

// ─── Procedural textures + normal-map generation ────────────────────────────

// Sobel normal map from a grayscale height-draw function
function makeNormalMap(drawFn, W, H, strength) {
  const hc = document.createElement('canvas'); hc.width=W; hc.height=H;
  const hx = hc.getContext('2d');
  drawFn(hx, W, H);
  const src = hx.getImageData(0,0,W,H).data;
  const nc = document.createElement('canvas'); nc.width=W; nc.height=H;
  const nx = nc.getContext('2d');
  const dst = nx.createImageData(W,H);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const g = i => src[((((i%W)+W)%W) + (((Math.floor(i/W)+H)%H)*W))*4]/255;
    const idx = x+y*W;
    const tl=g(idx-W-1),tc=g(idx-W),tr=g(idx-W+1);
    const cl=g(idx-1),         cr=g(idx+1);
    const bl=g(idx+W-1),bc=g(idx+W),br=g(idx+W+1);
    const dx=strength*(-(tl+2*cl+bl)+(tr+2*cr+br));
    const dy=strength*(-(tl+2*tc+tr)+(bl+2*bc+br));
    const len=Math.sqrt(dx*dx+dy*dy+1);
    const i4=(x+y*W)*4;
    dst.data[i4]  =Math.floor((dx/len*0.5+0.5)*255);
    dst.data[i4+1]=Math.floor((dy/len*0.5+0.5)*255);
    dst.data[i4+2]=Math.floor((1/len*0.5+0.5)*255);
    dst.data[i4+3]=255;
  }
  nx.putImageData(dst,0,0);
  const t=new THREE.CanvasTexture(nc); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

function woodTexture(hex) {
  const W=1024,H=512;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const r0=(hex>>16)&0xFF,g0=(hex>>8)&0xFF,b0=hex&0xFF;
  ctx.fillStyle=`rgb(${r0},${g0},${b0})`; ctx.fillRect(0,0,W,H);
  for(let i=0;i<80;i++){
    const y0=Math.random()*H;
    ctx.strokeStyle=`rgba(0,0,0,${0.03+Math.random()*0.15})`;
    ctx.lineWidth=0.3+Math.random()*3.5;
    ctx.beginPath(); ctx.moveTo(0,y0);
    ctx.bezierCurveTo(W*.25,y0+(-45+Math.random()*90),W*.75,y0+(-45+Math.random()*90),W,y0+(-22+Math.random()*44));
    ctx.stroke();
  }
  for(let i=0;i<28;i++){
    const y0=Math.random()*H;
    ctx.strokeStyle=`rgba(255,255,255,${0.02+Math.random()*0.08})`;
    ctx.lineWidth=0.4+Math.random()*2;
    ctx.beginPath(); ctx.moveTo(0,y0);
    ctx.bezierCurveTo(W*.25,y0+(-25+Math.random()*50),W*.75,y0+(-25+Math.random()*50),W,y0+(-12+Math.random()*24));
    ctx.stroke();
  }
  for(let i=0;i<600;i++){
    ctx.fillStyle=`rgba(0,0,0,${0.06+Math.random()*0.14})`;
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*1.5,0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}
function woodNormal(rx,ry) {
  const t=makeNormalMap((ctx,W,H)=>{
    ctx.fillStyle='#808080'; ctx.fillRect(0,0,W,H);
    for(let i=0;i<60;i++){
      const y0=Math.random()*H;
      ctx.strokeStyle=`rgba(255,255,255,${0.15+Math.random()*0.3})`;
      ctx.lineWidth=1+Math.random()*4;
      ctx.beginPath(); ctx.moveTo(0,y0);
      ctx.bezierCurveTo(W*.25,y0+(-30+Math.random()*60),W*.75,y0+(-30+Math.random()*60),W,y0+(-15+Math.random()*30));
      ctx.stroke();
    }
    for(let i=0;i<400;i++){
      ctx.fillStyle=`rgba(0,0,0,${0.4+Math.random()*0.4})`;
      ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*2,0,Math.PI*2); ctx.fill();
    }
  },256,128,3.5);
  t.repeat.set(rx,ry); return t;
}

function concreteTexture(hex) {
  const W=1024,H=1024;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const r0=(hex>>16)&0xFF,g0=(hex>>8)&0xFF,b0=hex&0xFF;
  ctx.fillStyle=`rgb(${r0},${g0},${b0})`; ctx.fillRect(0,0,W,H);
  for(let i=0;i<22000;i++){
    const a=0.005+Math.random()*0.02;
    ctx.fillStyle=Math.random()>.5?`rgba(255,255,255,${a})`:`rgba(0,0,0,${a})`;
    ctx.fillRect(Math.random()*W,Math.random()*H,Math.random()*4+1,Math.random()*4+1);
  }
  for(let i=0;i<160;i++){
    const x=Math.random()*W,y=Math.random()*H,rad=2+Math.random()*14;
    const lum=160+Math.floor(Math.random()*50-25);
    ctx.fillStyle=`rgba(${lum},${lum-5},${lum-10},0.12)`; ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.lineWidth=1;
  [256,512,768].forEach(v=>{
    ctx.beginPath();ctx.moveTo(v,0);ctx.lineTo(v,H);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,v);ctx.lineTo(W,v);ctx.stroke();
  });
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}
function concreteNormal(rx,ry) {
  const t=makeNormalMap((ctx,W,H)=>{
    ctx.fillStyle='#7A7A7A'; ctx.fillRect(0,0,W,H);
    for(let i=0;i<4000;i++){
      const v=Math.floor(Math.random()*60-30);
      ctx.fillStyle=`rgba(${128+v},${128+v},${128+v},0.5)`;
      ctx.fillRect(Math.random()*W,Math.random()*H,Math.random()*5+1,Math.random()*5+1);
    }
    for(let i=0;i<120;i++){
      const x=Math.random()*W,y=Math.random()*H,r=3+Math.random()*12;
      ctx.fillStyle=`rgba(${170+Math.floor(Math.random()*60)},${170},${170},0.7)`;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
  },256,256,4.0);
  t.repeat.set(rx,ry); return t;
}

function waterTexture() {
  const W=1024,H=1024;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const grad=ctx.createRadialGradient(W/2,H/2,30,W/2,H/2,600);
  grad.addColorStop(0,'#1a7ec4'); grad.addColorStop(0.5,'#1560A0'); grad.addColorStop(1,'#0d4882');
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  for(let i=0;i<50;i++){
    const x=Math.random()*W,y=Math.random()*H,r=16+Math.random()*70;
    ctx.strokeStyle=`rgba(255,255,255,${0.04+Math.random()*0.14})`;
    ctx.lineWidth=0.5+Math.random()*2.5;
    ctx.beginPath(); ctx.ellipse(x,y,r,r*0.28,Math.random()*Math.PI,0,Math.PI*2); ctx.stroke();
  }
  for(let i=0;i<200;i++){
    ctx.fillStyle=`rgba(255,255,255,${0.06+Math.random()*0.2})`;
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*3+0.5,0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(3,3);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}

function grassTexture() {
  const W=1024,H=1024;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const grad=ctx.createLinearGradient(0,0,W,H);
  grad.addColorStop(0,'#4a8a5a'); grad.addColorStop(0.5,'#5a9e6a'); grad.addColorStop(1,'#3e7850');
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  const blades=['#3d7a4a','#5faa6e','#2e6639','#6cbf7a','#447d52','#71c481','#395e42','#4e9460','#527a5c','#68b574'];
  for(let i=0;i<6000;i++){
    const x=Math.random()*W,y=Math.random()*H;
    ctx.fillStyle=blades[Math.floor(Math.random()*blades.length)];
    ctx.fillRect(x,y,1+Math.random()*2.5,5+Math.random()*14);
  }
  for(let i=0;i<40;i++){
    ctx.fillStyle=`rgba(145,105,48,${0.03+Math.random()*0.07})`;
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,8+Math.random()*25,0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(14,14);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}

function brickTexture(hex) {
  const W=1024,H=512;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const r0=(hex>>16)&0xFF,g0=(hex>>8)&0xFF,b0=hex&0xFF;
  // Mortar base
  ctx.fillStyle=`rgb(${Math.min(255,r0-22)},${Math.min(255,g0-18)},${Math.min(255,b0-14)})`; ctx.fillRect(0,0,W,H);
  const bW=92,bH=40,mort=5;
  for(let row=0;row*(bH+mort)<H;row++){
    const off=row%2===0?0:bW/2+mort/2;
    const y=row*(bH+mort);
    for(let col=-1;col*(bW+mort)-off<W;col++){
      const x=col*(bW+mort)+off;
      const v=Math.floor((Math.random()-0.5)*38);
      ctx.fillStyle=`rgb(${Math.min(255,Math.max(0,r0+v))},${Math.min(255,Math.max(0,g0+Math.floor(v*.7)))},${Math.min(255,Math.max(0,b0+Math.floor(v*.5)))})`;
      ctx.fillRect(x,y,bW,bH);
      // Surface texture on each brick
      for(let d=0;d<6;d++){
        ctx.fillStyle=`rgba(0,0,0,${0.03+Math.random()*0.08})`;
        ctx.fillRect(x+Math.random()*bW,y+Math.random()*bH,Math.random()*12+2,Math.random()*6+1);
      }
      // Highlight top edge
      ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(x,y,bW,2);
      ctx.fillStyle='rgba(0,0,0,0.12)'; ctx.fillRect(x,y+bH-2,bW,2);
    }
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(3,6);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}
function brickNormal(rx,ry) {
  const t=makeNormalMap((ctx,W,H)=>{
    ctx.fillStyle='#404040'; ctx.fillRect(0,0,W,H); // mortar = low
    const bW=92,bH=40,mort=5;
    for(let row=0;row*(bH+mort)<H;row++){
      const off=row%2===0?0:bW/2+mort/2;
      const y=row*(bH+mort);
      for(let col=-1;col*(bW+mort)-off<W;col++){
        const x=col*(bW+mort)+off;
        ctx.fillStyle='#C8C8C8'; ctx.fillRect(x+1,y+1,bW-2,bH-2); // brick face = raised
        // slight surface variation
        for(let d=0;d<4;d++){
          const dv=100+Math.floor(Math.random()*80);
          ctx.fillStyle=`rgba(${dv},${dv},${dv},0.5)`;
          ctx.fillRect(x+Math.random()*(bW-8),y+Math.random()*(bH-4),Math.random()*16+4,Math.random()*8+2);
        }
      }
    }
  },256,128,6.0);
  t.repeat.set(rx,ry); return t;
}

function stoneTexture(hex) {
  const W=1024,H=1024;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const r0=(hex>>16)&0xFF,g0=(hex>>8)&0xFF,b0=hex&0xFF;
  // mortar color
  ctx.fillStyle=`rgb(${Math.max(0,r0-20)},${Math.max(0,g0-18)},${Math.max(0,b0-16)})`; ctx.fillRect(0,0,W,H);
  for(let i=0;i<90;i++){
    const x=Math.random()*W,y=Math.random()*H,rw=50+Math.random()*120,rh=32+Math.random()*70;
    const v=Math.floor((Math.random()-0.5)*40);
    ctx.fillStyle=`rgba(${Math.min(255,Math.max(0,r0+v))},${Math.min(255,Math.max(0,g0+v))},${Math.min(255,Math.max(0,b0+v))},0.9)`;
    ctx.beginPath(); ctx.roundRect(x-rw/2,y-rh/2,rw,rh,8+Math.random()*12); ctx.fill();
    // surface texture
    for(let d=0;d<8;d++){
      ctx.fillStyle=`rgba(0,0,0,${0.02+Math.random()*0.05})`;
      ctx.fillRect(x-rw/2+Math.random()*rw,y-rh/2+Math.random()*rh,Math.random()*18+3,Math.random()*10+2);
    }
    ctx.strokeStyle='rgba(0,0,0,0.22)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(x-rw/2,y-rh/2,rw,rh,8+Math.random()*12); ctx.stroke();
  }
  for(let i=0;i<5000;i++){
    ctx.fillStyle=`rgba(0,0,0,${0.006+Math.random()*0.022})`;
    ctx.fillRect(Math.random()*W,Math.random()*H,Math.random()*4+1,Math.random()*3+1);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}
function stoneNormal(rx,ry) {
  const t=makeNormalMap((ctx,W,H)=>{
    ctx.fillStyle='#3A3A3A'; ctx.fillRect(0,0,W,H);
    for(let i=0;i<80;i++){
      const x=Math.random()*W,y=Math.random()*H,rw=50+Math.random()*120,rh=32+Math.random()*70;
      const v=160+Math.floor(Math.random()*60);
      ctx.fillStyle=`rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.roundRect(x-rw/2,y-rh/2,rw,rh,8); ctx.fill();
    }
  },256,256,5.0);
  t.repeat.set(rx,ry); return t;
}

function sidingTexture(hex) {
  const W=1024,H=512;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const r0=(hex>>16)&0xFF,g0=(hex>>8)&0xFF,b0=hex&0xFF;
  ctx.fillStyle=`rgb(${r0},${g0},${b0})`; ctx.fillRect(0,0,W,H);
  const sp=40;
  for(let y=0;y<H;y+=sp){
    // Bottom shadow of each lap
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fillRect(0,y+sp-6,W,6);
    // Top highlight
    ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(0,y,W,3);
    // Mid bevel
    const g=ctx.createLinearGradient(0,y,0,y+sp);
    g.addColorStop(0,`rgba(255,255,255,0.04)`); g.addColorStop(0.5,'rgba(0,0,0,0.0)'); g.addColorStop(1,'rgba(0,0,0,0.06)');
    ctx.fillStyle=g; ctx.fillRect(0,y,W,sp);
  }
  for(let i=0;i<3000;i++){
    ctx.fillStyle=`rgba(0,0,0,${0.003+Math.random()*0.007})`;
    ctx.fillRect(Math.random()*W,Math.random()*H,Math.random()*5+1,Math.random()*2+1);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}

function tileTexture(hex) {
  const W=1024,H=1024;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const r0=(hex>>16)&0xFF,g0=(hex>>8)&0xFF,b0=hex&0xFF;
  const ts=128;
  // Grout color
  ctx.fillStyle=`rgb(${Math.max(0,r0-30)},${Math.max(0,g0-28)},${Math.max(0,b0-25)})`; ctx.fillRect(0,0,W,H);
  for(let tx=0;tx<W/ts;tx++) for(let ty=0;ty<H/ts;ty++){
    const v=Math.floor((Math.random()-0.5)*18);
    ctx.fillStyle=`rgb(${Math.min(255,r0+v)},${Math.min(255,g0+v)},${Math.min(255,b0+v)})`;
    ctx.fillRect(tx*ts+4,ty*ts+4,ts-8,ts-8);
    // subtle surface variation
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(tx*ts+4,ty*ts+4,ts-8,8);
    ctx.fillStyle='rgba(0,0,0,0.04)'; ctx.fillRect(tx*ts+4,ty*ts+ts-12,ts-8,8);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}

function floorWoodTexture() {
  const W=1024,H=256;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const colors=[0xC8A872,0xBC9C68,0xD4B480,0xB89060,0xCA9E62,0xD6B07A];
  const bH=36;
  for(let row=0;row*bH<H;row++){
    const hex2=colors[row%colors.length];
    const r0=(hex2>>16)&0xFF,g0=(hex2>>8)&0xFF,b0=hex2&0xFF;
    ctx.fillStyle=`rgb(${r0},${g0},${b0})`; ctx.fillRect(0,row*bH,W,bH);
    for(let i=0;i<14;i++){
      const y=row*bH+Math.random()*bH;
      ctx.strokeStyle=`rgba(0,0,0,${0.04+Math.random()*0.12})`; ctx.lineWidth=0.5+Math.random()*2;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y+(-8+Math.random()*16)); ctx.stroke();
    }
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(0,row*bH,W,4);
    ctx.strokeStyle='rgba(0,0,0,0.22)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,row*bH); ctx.lineTo(W,row*bH); ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4);
  t.colorSpace=THREE.SRGBColorSpace; return t;
}
function floorWoodNormal(rx,ry) {
  const t=makeNormalMap((ctx,W,H)=>{
    ctx.fillStyle='#808080'; ctx.fillRect(0,0,W,H);
    const bH=36;
    for(let row=0;row*bH<H;row++){
      for(let i=0;i<10;i++){
        const y=row*bH+Math.random()*bH;
        ctx.strokeStyle=`rgba(255,255,255,${0.15+Math.random()*0.25})`; ctx.lineWidth=1+Math.random()*3;
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y+(-5+Math.random()*10)); ctx.stroke();
      }
      ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,row*bH); ctx.lineTo(W,row*bH); ctx.stroke();
    }
  },256,64,3.5);
  t.repeat.set(rx,ry); return t;
}

// ─── Finish material factory ────────────────────────────────────────────────
function makeFinishMaterial(finish, _baseHex) {
  const N2 = (x,y)=>new THREE.Vector2(x,y);
  const defs = {
    stucco:       ()=>new THREE.MeshStandardMaterial({map:concreteTexture(0xE8E0D4),normalMap:concreteNormal(4,4),normalScale:N2(0.6,0.6),roughness:0.88,envMapIntensity:0.3}),
    stucco_smooth:()=>new THREE.MeshStandardMaterial({map:concreteTexture(0xF0ECE4),normalMap:concreteNormal(4,4),normalScale:N2(0.3,0.3),roughness:0.76,envMapIntensity:0.4}),
    brick:        ()=>new THREE.MeshStandardMaterial({map:brickTexture(0xB05A3A),normalMap:brickNormal(3,6),normalScale:N2(1.4,1.4),roughness:0.92,envMapIntensity:0.2}),
    stone:        ()=>new THREE.MeshStandardMaterial({map:stoneTexture(0x8A7A6A),normalMap:stoneNormal(2,2),normalScale:N2(1.6,1.6),roughness:0.94,envMapIntensity:0.2}),
    hardie_board: ()=>new THREE.MeshStandardMaterial({map:sidingTexture(0xC8C0B0),normalMap:concreteNormal(4,4),normalScale:N2(0.5,0.5),roughness:0.84,envMapIntensity:0.3}),
    wood_siding:  ()=>new THREE.MeshStandardMaterial({map:sidingTexture(0xA07848),normalMap:woodNormal(4,4),normalScale:N2(0.8,0.8),roughness:0.82,envMapIntensity:0.3}),
    vinyl_siding: ()=>new THREE.MeshPhysicalMaterial({map:sidingTexture(0xD8D0C4),roughness:0.55,metalness:0.0,clearcoat:0.3,clearcoatRoughness:0.3,envMapIntensity:0.5}),
    block:        ()=>new THREE.MeshStandardMaterial({map:concreteTexture(0x8A8880),normalMap:concreteNormal(4,4),normalScale:N2(1.0,1.0),roughness:0.95,envMapIntensity:0.15}),
    drywall:      ()=>new THREE.MeshStandardMaterial({map:concreteTexture(0xF0EDE8),normalMap:concreteNormal(4,4),normalScale:N2(0.2,0.2),roughness:0.90,envMapIntensity:0.2}),
    tongue_groove:()=>new THREE.MeshStandardMaterial({map:woodTexture(0xBC8A4A),normalMap:woodNormal(2,2),normalScale:N2(1.0,1.0),roughness:0.68,envMapIntensity:0.4}),
    shiplap:      ()=>new THREE.MeshStandardMaterial({map:sidingTexture(0xE8E0D4),normalMap:woodNormal(4,4),normalScale:N2(0.9,0.9),roughness:0.72,envMapIntensity:0.35}),
    wood_panel:   ()=>new THREE.MeshStandardMaterial({map:woodTexture(0x8B6328),normalMap:woodNormal(2,2),normalScale:N2(1.0,1.0),roughness:0.70,envMapIntensity:0.4}),
    brick_veneer: ()=>new THREE.MeshStandardMaterial({map:brickTexture(0xA85040),normalMap:brickNormal(3,6),normalScale:N2(1.5,1.5),roughness:0.90,envMapIntensity:0.2}),
    stone_veneer: ()=>new THREE.MeshStandardMaterial({map:stoneTexture(0x8A7A6A),normalMap:stoneNormal(2,2),normalScale:N2(1.5,1.5),roughness:0.92,envMapIntensity:0.2}),
    tile:         ()=>new THREE.MeshPhysicalMaterial({map:tileTexture(0xD8D4CC),roughness:0.28,metalness:0.0,clearcoat:0.6,clearcoatRoughness:0.15,envMapIntensity:0.8}),
    marble:       ()=>new THREE.MeshPhysicalMaterial({map:tileTexture(0xF0EEE8),roughness:0.08,metalness:0.0,clearcoat:1.0,clearcoatRoughness:0.05,envMapIntensity:1.2}),
    lp_smartside: ()=>new THREE.MeshStandardMaterial({map:sidingTexture(0xC0B89A),normalMap:woodNormal(4,4),normalScale:N2(0.7,0.7),roughness:0.80,envMapIntensity:0.3}),
    cedar:        ()=>new THREE.MeshStandardMaterial({map:woodTexture(0xB8784A),normalMap:woodNormal(2,2),normalScale:N2(1.1,1.1),roughness:0.78,envMapIntensity:0.35}),
  };
  return (defs[finish]||defs.stucco)();
}
function makeFloorMaterial(finish) {
  const N2 = (x,y)=>new THREE.Vector2(x,y);
  const defs = {
    wood:       ()=>new THREE.MeshStandardMaterial({map:floorWoodTexture(),normalMap:floorWoodNormal(4,4),normalScale:N2(0.8,0.8),roughness:0.48,metalness:0.02,envMapIntensity:0.5}),
    tile:       ()=>new THREE.MeshPhysicalMaterial({map:tileTexture(0xD8D4CC),roughness:0.22,metalness:0.0,clearcoat:0.8,clearcoatRoughness:0.1,envMapIntensity:1.0}),
    stone:      ()=>new THREE.MeshStandardMaterial({map:stoneTexture(0xA09080),normalMap:stoneNormal(2,2),normalScale:N2(1.2,1.2),roughness:0.88,envMapIntensity:0.25}),
    concrete:   ()=>new THREE.MeshStandardMaterial({map:concreteTexture(0xC0BCBA),normalMap:concreteNormal(4,4),normalScale:N2(0.7,0.7),roughness:0.92,envMapIntensity:0.2}),
    carpet:     ()=>new THREE.MeshStandardMaterial({map:concreteTexture(0x7080A0),normalMap:concreteNormal(4,4),normalScale:N2(0.4,0.4),roughness:1.0,envMapIntensity:0.05}),
    travertine: ()=>new THREE.MeshPhysicalMaterial({map:concreteTexture(0xE8DCC8),normalMap:concreteNormal(4,4),normalScale:N2(0.6,0.6),roughness:0.42,clearcoat:0.4,clearcoatRoughness:0.2,envMapIntensity:0.7}),
    marble:     ()=>new THREE.MeshPhysicalMaterial({map:tileTexture(0xF0EEE8),roughness:0.06,metalness:0.0,clearcoat:1.0,clearcoatRoughness:0.04,envMapIntensity:1.4}),
    pavers:     ()=>new THREE.MeshStandardMaterial({map:stoneTexture(0xB8A898),normalMap:stoneNormal(2,2),normalScale:N2(1.3,1.3),roughness:0.90,envMapIntensity:0.2}),
  };
  return (defs[finish]||defs.wood)();
}

// ─── 3D mesh builders (return THREE.Group) ─────────────────────────────────
function buildPergola(w, d, hex, config) {
  const cfg     = config || {};
  const g       = new THREE.Group();
  const ps      = (cfg.postSizeIn || 6) / 12;
  const frontH  = cfg.frontHeightFt || 10;
  const backH   = cfg.backHeightFt  || frontH;
  const beamD   = (cfg.beamDepthIn || 8) / 12;
  const rSpac   = (cfg.rafterSpacingIn || 16) / 12;
  const cmSpacIn = cfg.crossMemberSpacingIn || 0;
  const matColor = { cedar: 0x9E7D52, redwood: 0x8B4513, aluminum: 0xB0B0B0, steel: 0x888888 }[cfg.postMaterial || 'cedar'] || hex;
  const isAlum  = cfg.postMaterial === 'aluminum' || cfg.postMaterial === 'steel';
  const postMat = isAlum
    ? new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.3, metalness: 0.7 })
    : new THREE.MeshStandardMaterial({ map: woodTexture(matColor), roughness: 0.85 });
  const beamMat = new THREE.MeshStandardMaterial({ map: woodTexture(Math.max(0, matColor - 0x151515)), roughness: 0.8 });
  const cmMat   = new THREE.MeshStandardMaterial({ map: woodTexture(Math.max(0, matColor - 0x202020)), roughness: 0.8 });

  // Posts — shorter by beamD so side beams sit on post tops (not flush)
  const postFHp = frontH - beamD;
  const postBHp = backH  - beamD;
  const postDefs = [
    { x: -w/2+ps, z: -d/2+ps, h: postFHp },
    { x:  w/2-ps, z: -d/2+ps, h: postFHp },
    { x: -w/2+ps, z:  d/2-ps, h: postBHp },
    { x:  w/2-ps, z:  d/2-ps, h: postBHp },
  ];
  if (w > 20) postDefs.push({ x: 0, z: -d/2+ps, h: postFHp }, { x: 0, z: d/2-ps, h: postBHp });
  postDefs.forEach(({ x: px, z: pz, h: ph }) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(ps, ph, ps), postMat);
    post.position.set(px, ph/2, pz); post.castShadow = true; g.add(post);
    const base = new THREE.Mesh(new THREE.BoxGeometry(ps+0.15, 0.12, ps+0.15),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.2 }));
    base.position.set(px, 0.06, pz); g.add(base);
  });

  // Side beams — sloped when front/back heights differ
  const slopeAngle = Math.atan2(backH - frontH, d);
  const beamLen    = Math.sqrt(d * d + (backH - frontH) ** 2);
  const midH       = (frontH + backH) / 2;
  [-w/2+ps, w/2-ps].forEach(px => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ps * 1.5, beamD, beamLen), beamMat);
    beam.position.set(px, midH - beamD/2, 0);
    beam.rotation.x = -slopeAngle;
    beam.castShadow = true; g.add(beam);
  });
  // Front and back header beams — connect front posts and back posts
  { const hb = new THREE.Mesh(new THREE.BoxGeometry(w - ps, beamD, ps * 1.5), beamMat);
    hb.position.set(0, frontH - beamD / 2, -d / 2 + ps); hb.castShadow = true; g.add(hb); }
  { const hb = new THREE.Mesh(new THREE.BoxGeometry(w - ps, beamD, ps * 1.5), beamMat);
    hb.position.set(0, backH - beamD / 2, d / 2 - ps); hb.castShadow = true; g.add(hb); }

  // Rafters running front-to-back, sloped to match
  const rafterCount = Math.max(2, Math.ceil(w / rSpac));
  for (let i = 0; i < rafterCount; i++) {
    const rx = -w/2 + ps + (i + 0.5) * ((w - ps*2) / rafterCount);
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.3, beamLen), beamMat);
    rafter.position.set(rx, midH + 0.12, 0);
    rafter.rotation.x = -slopeAngle;
    rafter.castShadow = true; g.add(rafter);
  }

  // 2×2 cross members running left-to-right (on top of rafters)
  if (cmSpacIn > 0) {
    const cmSpac = cmSpacIn / 12;
    const cmCount = Math.max(1, Math.floor((d - ps*2) / cmSpac));
    for (let i = 0; i <= cmCount; i++) {
      const t  = cmCount > 0 ? i / cmCount : 0;
      const cz = -d/2 + ps + t * (d - ps*2);
      const ch = frontH + t * (backH - frontH);
      const cm = new THREE.Mesh(new THREE.BoxGeometry(w - ps*2, 0.17, 0.17), cmMat);
      cm.position.set(0, ch + 0.28, cz); g.add(cm);
    }
  }

  // Shade / roof cover
  if (cfg.shade === 'fabric') {
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xE8DCC8, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.82 });
    const sail = new THREE.Mesh(new THREE.BoxGeometry(w - ps*2, 0.04, beamLen), sailMat);
    sail.position.set(0, midH + 0.4, 0);
    sail.rotation.x = -slopeAngle; g.add(sail);
  } else if (cfg.shade === 'louvers') {
    const louverMat = new THREE.MeshStandardMaterial({ color: 0xC8C8C8, roughness: 0.2, metalness: 0.7 });
    const lc = Math.ceil((d - ps*2) / 0.4);
    for (let i = 0; i < lc; i++) {
      const t  = (i + 0.5) / lc;
      const lz = -d/2 + ps + t * (d - ps*2);
      const lh = frontH + t * (backH - frontH);
      const louver = new THREE.Mesh(new THREE.BoxGeometry(w - ps*2, 0.04, 0.32), louverMat);
      louver.position.set(0, lh + 0.38, lz); g.add(louver);
    }
  } else if (cfg.shade === 'polycarbonate') {
    const polyMat = new THREE.MeshPhysicalMaterial({ color: 0xD0EEFF, transparent: true, opacity: 0.45, roughness: 0.04, metalness: 0, reflectivity: 0.6, envMapIntensity: 1.2, side: THREE.DoubleSide });
    const poly = new THREE.Mesh(new THREE.BoxGeometry(w - ps*2, 0.06, beamLen), polyMat);
    poly.position.set(0, midH + 0.15, 0);
    poly.rotation.x = -slopeAngle; g.add(poly);
  }

  // Fans — hang on downrod to ~7.5 ft AFF
  if (cfg.fans > 0) {
    const fanMat  = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4, metalness: 0.5 });
    const bladMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.78 });
    const globMat = new THREE.MeshStandardMaterial({ color: 0xFFF8E0, transparent: true, opacity: 0.82, roughness: 0.04 });
    const fanPositions = [[-w/4, -d/4], [w/4, -d/4], [-w/4, d/4], [w/4, d/4], [0, 0]];
    const targetFanH = 7.5;
    fanPositions.slice(0, cfg.fans).forEach(([fx, fz]) => {
      const t    = (fz + d/2) / d;
      const ceil = frontH + t * (backH - frontH);
      const hubH = Math.min(ceil - 0.5, targetFanH);
      const rodL = ceil - hubH;
      // Ceiling canopy
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.12, 12), fanMat);
      canopy.position.set(fx, ceil - 0.06, fz); g.add(canopy);
      // Downrod
      if (rodL > 0.1) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, rodL, 8), fanMat);
        rod.position.set(fx, ceil - 0.12 - rodL/2, fz); g.add(rod);
      }
      // Motor housing
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.22, 12), fanMat);
      hub.position.set(fx, hubH, fz); g.add(hub);
      // 5 blades
      for (let b = 0; b < 5; b++) {
        const ang = b * (2*Math.PI/5);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 1.1), bladMat);
        blade.position.set(fx + Math.cos(ang)*0.6, hubH - 0.06, fz + Math.sin(ang)*0.6);
        blade.rotation.y = ang; g.add(blade);
      }
      // Light globe
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI*2, 0, Math.PI*0.6), globMat);
      globe.position.set(fx, hubH - 0.22, fz); g.add(globe);
    });
  }
  return g;
}

// Roof panel helpers — proper geometry for non-rectangular faces
function makeRoofQuad(v1, v2, v3, v4, mat) {
  const pos = new Float32Array([...v1,...v2,...v3, ...v1,...v3,...v4]);
  const g2  = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g2.computeVertexNormals();
  const m = new THREE.Mesh(g2, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function makeRoofTri(v1, v2, v3, mat) {
  const pos = new Float32Array([...v1,...v2,...v3]);
  const g2  = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g2.computeVertexNormals();
  const m = new THREE.Mesh(g2, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildPatioCover(w, d, hex, config) {
  const cfg       = config || {};
  const g         = new THREE.Group();
  const ps        = (cfg.postSizeIn || 6) / 12;
  const roofShape = cfg.roofShape || 'flat';
  const attached  = cfg.attachment === 'attached';
  const frontH    = cfg.frontHeightFt || 10;
  const backH2    = roofShape === 'shed' ? (cfg.backHeightFt || frontH + 2) : frontH;
  const ridgeRise = cfg.ridgeRiseFt || 2;
  const overhang  = 0.65;

  // Beam depth auto-sized from span — defined early so posts can be sized correctly
  const beamH2 = Math.max(0.5, Math.min(1.0, Math.max(w, d) * 0.044));
  const beamFW = Math.max(0.28, ps * 0.55);

  const isAlum = cfg.postMaterial === 'aluminum' || cfg.postMaterial === 'steel';
  const postMat = isAlum
    ? new THREE.MeshStandardMaterial({ color: 0xA8A8A8, roughness: 0.2, metalness: 0.75 })
    : new THREE.MeshStandardMaterial({ map: woodTexture(hex || 0x9E8050), roughness: 0.8 });
  // Posts are shorter by beamH2 so beams can sit on top of posts (not flush)
  const postFH = frontH - beamH2;
  const postBH = (roofShape === 'shed' ? backH2 : frontH) - beamH2;

  const postDefs2 = [];
  postDefs2.push({ x: -w/2+ps, z: -d/2+ps, h: postFH });
  postDefs2.push({ x:  w/2-ps, z: -d/2+ps, h: postFH });
  if (w > 18) postDefs2.push({ x: 0, z: -d/2+ps, h: postFH });
  if (!attached) {
    postDefs2.push({ x: -w/2+ps, z: d/2-ps, h: postBH });
    postDefs2.push({ x:  w/2-ps, z: d/2-ps, h: postBH });
    if (w > 18) postDefs2.push({ x: 0, z: d/2-ps, h: postBH });
  }
  postDefs2.forEach(({ x: px, z: pz, h: ph }) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(ps, ph, ps), postMat);
    post.position.set(px, ph/2, pz); post.castShadow = true; g.add(post);
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(ps+0.2, 0.14, ps+0.2),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.2 }));
    base2.position.set(px, 0.07, pz); g.add(base2);
  });

  // ── Structural perimeter beams — bottom at post top, beam sits ON post ──
  const bMat2  = new THREE.MeshStandardMaterial({ map: woodTexture(0x7A6030), normalMap: woodNormal(3, 1), normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.72, envMapIntensity: 0.35 });
  const backPH = roofShape === 'shed' ? backH2 : frontH;

  // Front beam — spans all front posts
  { const bm = new THREE.Mesh(new THREE.BoxGeometry(w - ps, beamH2, beamFW), bMat2);
    bm.position.set(0, frontH - beamH2 / 2, -d / 2 + ps); bm.castShadow = true; g.add(bm); }

  // Back beam or ledger board when attached to house
  if (attached) {
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, beamH2, beamFW + 0.02),
      new THREE.MeshStandardMaterial({ map: woodTexture(0x8B7355), roughness: 0.7 }));
    ledger.position.set(0, frontH - beamH2 / 2, d / 2); g.add(ledger);
  } else {
    const bm = new THREE.Mesh(new THREE.BoxGeometry(w - ps, beamH2, beamFW), bMat2);
    bm.position.set(0, backPH - beamH2 / 2, d / 2 - ps); bm.castShadow = true; g.add(bm);
  }

  // Side beams — sloped for shed, level for all other shapes
  if (roofShape === 'shed') {
    const sdLen = attached ? d - ps : d - 2 * ps;
    const sdCZ  = attached ? ps / 2 : 0;
    const slAng = Math.atan2(backH2 - frontH, sdLen);
    const slLen = Math.sqrt(sdLen ** 2 + (backH2 - frontH) ** 2);
    const midHs = (frontH + backH2) / 2;
    [-w / 2 + ps, w / 2 - ps].forEach(bx => {
      const bm = new THREE.Mesh(new THREE.BoxGeometry(beamFW, beamH2, slLen), bMat2);
      bm.position.set(bx, midHs - beamH2 / 2, sdCZ); bm.rotation.x = -slAng; bm.castShadow = true; g.add(bm);
    });
  } else {
    const sdLen = attached ? d - ps : d - 2 * ps;
    const sdCZ  = attached ? ps / 2 : 0;
    [-w / 2 + ps, w / 2 - ps].forEach(bx => {
      const bm = new THREE.Mesh(new THREE.BoxGeometry(beamFW, beamH2, sdLen), bMat2);
      bm.position.set(bx, frontH - beamH2 / 2, sdCZ); bm.castShadow = true; g.add(bm);
    });
  }

  // Roof construction
  const roofColorMap = { tile: 0x7A5030, shingle: 0x333333, metal: 0x6A8FA8, polycarbonate: 0xD4EEF8, wood: 0xA0784A };
  const roofColor    = roofColorMap[cfg.roofMaterial || 'shingle'] || 0x333333;
  const isPolycarb   = cfg.roofMaterial === 'polycarbonate';
  const roofMat2     = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: isPolycarb ? 0.08 : (cfg.roofMaterial === 'metal' ? 0.25 : 0.72),
    metalness: cfg.roofMaterial === 'metal' ? 0.55 : 0.04,
    transparent: isPolycarb, opacity: isPolycarb ? 0.55 : 1,
  });
  const fascMat = new THREE.MeshStandardMaterial({ map: woodTexture(0x7A6040), roughness: 0.7 });

  if (roofShape === 'flat') {
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(w + overhang, 0.35, d + overhang), roofMat2);
    roof2.position.y = frontH + 0.175; roof2.castShadow = true; g.add(roof2);
  } else if (roofShape === 'shed') {
    const slopeLen2  = Math.sqrt(d*d + (backH2 - frontH)**2);
    const slopeAng2  = Math.atan2(backH2 - frontH, d);
    const midH2      = (frontH + backH2) / 2;
    const panel2 = new THREE.Mesh(new THREE.BoxGeometry(w + overhang, 0.3, slopeLen2 + overhang), roofMat2);
    panel2.position.set(0, midH2 + 0.15, 0);
    panel2.rotation.x = -slopeAng2;
    panel2.castShadow = true; g.add(panel2);
    const fascia2 = new THREE.Mesh(new THREE.BoxGeometry(w + overhang, 0.5, 0.1), fascMat);
    fascia2.position.set(0, frontH - 0.25, -d/2 - overhang/2); g.add(fascia2);
  } else if (roofShape === 'gable') {
    const ridgeH2   = frontH + ridgeRise;
    const ov        = overhang;
    const axis      = cfg.ridgeAxis || 'x'; // 'x'=ridge left-right, gable ends at left/right  |  'z'=ridge front-back, gable ends at front/back
    const rm2       = roofMat2; rm2.side = THREE.DoubleSide;
    const ridgeBMat = new THREE.MeshStandardMaterial({ map: woodTexture(0x7A5020), roughness: 0.62 });
    const raftMat   = new THREE.MeshStandardMaterial({ map: woodTexture(0x8B7040), roughness: 0.70 });
    const gfMat     = new THREE.MeshStandardMaterial({ map: woodTexture(0x7A5020), roughness: 0.65 });

    // ridgeSpan = dimension perpendicular to ridge (slopes this direction)
    // eavSpan   = dimension parallel to ridge (ridge runs this direction)
    const ridgeSpan = axis === 'x' ? d : w;
    const eavSpan   = axis === 'x' ? w : d;
    const slopeLen  = Math.sqrt((ridgeSpan/2 + ov)**2 + ridgeRise**2);
    const slopeAng  = Math.atan2(ridgeRise, ridgeSpan/2 + ov);
    const offY      = Math.cos(slopeAng) * 0.40;
    const offS      = Math.sin(slopeAng) * 0.40;
    const raftSpac  = cfg.rafterSpacingIn ? cfg.rafterSpacingIn/12 : 1.5;
    const ctH       = frontH + ridgeRise * 0.55;

    if (axis === 'x') {
      // ── Ridge runs LEFT-RIGHT (X), gable end faces at LEFT and RIGHT (x=±w/2) ──
      // Exterior roof panels
      g.add(makeRoofQuad([-w/2-ov,frontH,-d/2-ov],[w/2+ov,frontH,-d/2-ov],[w/2+ov,ridgeH2,0],[-w/2-ov,ridgeH2,0],rm2));
      g.add(makeRoofQuad([w/2+ov,frontH,d/2+ov],[-w/2-ov,frontH,d/2+ov],[-w/2-ov,ridgeH2,0],[w/2+ov,ridgeH2,0],rm2));
      // Ridge beam (top at ridgeH2-0.06 so it stays below the roof surface)
      const rb=new THREE.Mesh(new THREE.BoxGeometry(eavSpan+ov*2+0.1,0.32,0.4),ridgeBMat); rb.position.set(0,ridgeH2-0.22,0); rb.castShadow=true; g.add(rb);
      // ── Gable-end barge rafters at x=±w/2 (open gable — no infill) ──
      [-w/2,w/2].forEach(ex=>{
        const efF=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.75,slopeLen),ridgeBMat); efF.position.set(ex,(frontH+ridgeH2)/2-offY,-(d/2+ov)/2-offS); efF.rotation.x=-slopeAng; efF.castShadow=true; g.add(efF);
        const efB=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.75,slopeLen),ridgeBMat); efB.position.set(ex,(frontH+ridgeH2)/2-offY,(d/2+ov)/2+offS); efB.rotation.x=slopeAng; efB.castShadow=true; g.add(efB);
      });
      // Fascia at eaves (front+back)
      [-d/2-ov*.5,d/2+ov*.5].forEach(fz=>{const fb=new THREE.Mesh(new THREE.BoxGeometry(eavSpan+ov*2+0.1,0.5,0.1),fascMat); fb.position.set(0,frontH-0.25,fz); g.add(fb);});

    } else {
      // ── Ridge runs FRONT-BACK (Z), gable end faces at FRONT and BACK (z=±d/2) ──
      // Exterior roof panels (slopes go left→right)
      g.add(makeRoofQuad([-w/2-ov,frontH,-d/2-ov],[-w/2-ov,frontH,d/2+ov],[0,ridgeH2,d/2+ov],[0,ridgeH2,-d/2-ov],rm2));
      g.add(makeRoofQuad([w/2+ov,frontH,d/2+ov],[w/2+ov,frontH,-d/2-ov],[0,ridgeH2,-d/2-ov],[0,ridgeH2,d/2+ov],rm2));
      // Ridge beam (top at ridgeH2-0.06 so it stays below the roof surface)
      const rb=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.32,eavSpan+ov*2+0.1),ridgeBMat); rb.position.set(0,ridgeH2-0.22,0); rb.castShadow=true; g.add(rb);
      // ── Gable-end barge rafters at z=±d/2 (open gable — no infill) ──
      [-d/2,d/2].forEach(ez=>{
        const efL=new THREE.Mesh(new THREE.BoxGeometry(slopeLen,0.75,0.2),ridgeBMat); efL.position.set(-(w/2+ov)/2-offS,(frontH+ridgeH2)/2-offY,ez); efL.rotation.z=slopeAng; efL.castShadow=true; g.add(efL);
        const efR=new THREE.Mesh(new THREE.BoxGeometry(slopeLen,0.75,0.2),ridgeBMat); efR.position.set((w/2+ov)/2+offS,(frontH+ridgeH2)/2-offY,ez); efR.rotation.z=-slopeAng; efR.castShadow=true; g.add(efR);
      });
      // Fascia at eaves (left+right)
      [-w/2-ov*.5,w/2+ov*.5].forEach(fx=>{const fb=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.5,eavSpan+ov*2+0.1),fascMat); fb.position.set(fx,frontH-0.25,0); g.add(fb);});
    }
  } else if (roofShape === 'hip') {
    const ridgeH3  = frontH + ridgeRise;
    const ridgeLen = Math.max(0, w - d);  // standard equal-slope hip proportion
    const rl       = ridgeLen / 2;
    const ov       = overhang;
    const rm3      = roofMat2; rm3.side = THREE.DoubleSide;
    // Front trapezoid (or triangle when ridgeLen=0): eave at -d/2, ridge at z=0
    if (ridgeLen > 0) {
      g.add(makeRoofQuad(
        [-w/2-ov, frontH, -d/2-ov], [ w/2+ov, frontH, -d/2-ov],
        [ rl, ridgeH3, 0],            [-rl, ridgeH3, 0], rm3));
      // Back trapezoid
      g.add(makeRoofQuad(
        [ w/2+ov, frontH, d/2+ov], [-w/2-ov, frontH, d/2+ov],
        [-rl, ridgeH3, 0],           [ rl, ridgeH3, 0], rm3));
      // Left triangle
      g.add(makeRoofTri(
        [-w/2-ov, frontH, -d/2-ov], [-w/2-ov, frontH, d/2+ov],
        [-rl, ridgeH3, 0], rm3));
      // Right triangle
      g.add(makeRoofTri(
        [ w/2+ov, frontH, d/2+ov], [ w/2+ov, frontH, -d/2-ov],
        [ rl, ridgeH3, 0], rm3));
      // Ridge board
      const ridgeBoard4 = new THREE.Mesh(new THREE.BoxGeometry(ridgeLen, 0.15, 0.2),
        new THREE.MeshStandardMaterial({ map: woodTexture(0x8B7355), roughness: 0.7 }));
      ridgeBoard4.position.set(0, ridgeH3 + 0.08, 0); g.add(ridgeBoard4);
    } else {
      // Square footprint — pyramid
      [
        [[-w/2-ov,frontH,-d/2-ov],[ w/2+ov,frontH,-d/2-ov],[0,ridgeH3,0]],
        [[ w/2+ov,frontH,-d/2-ov],[ w/2+ov,frontH, d/2+ov],[0,ridgeH3,0]],
        [[ w/2+ov,frontH, d/2+ov],[-w/2-ov,frontH, d/2+ov],[0,ridgeH3,0]],
        [[-w/2-ov,frontH, d/2+ov],[-w/2-ov,frontH,-d/2-ov],[0,ridgeH3,0]],
      ].forEach(([a,b,c]) => g.add(makeRoofTri(a,b,c,rm3)));
    }
    // Fascia all around
    const fasciaBox = (bw, bd, bx, bz) => {
      const fb2 = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.45, bd), fascMat);
      fb2.position.set(bx, frontH - 0.22, bz); g.add(fb2);
    };
    fasciaBox(w+ov*2, 0.1, 0, -d/2-ov/2);
    fasciaBox(w+ov*2, 0.1, 0,  d/2+ov/2);
    fasciaBox(0.1, d+ov*2, -w/2-ov/2, 0);
    fasciaBox(0.1, d+ov*2,  w/2+ov/2, 0);
  }

  // ── Interior ceiling — follows the actual roof pitch (no flat ceilings) ────
  if (cfg.ceiling && cfg.ceiling !== 'none') {
    const isDW      = cfg.ceiling === 'drywall';
    const isShiplap = cfg.ceiling === 'shiplap';
    const showPanel = cfg.ceiling !== 'open_beam'; // open_beam = rafters only, no surface
    const cHex = isDW ? 0xF0EDE8 : isShiplap ? 0xE8E2D8 : 0xBC8A4A;
    const ceilMat3 = new THREE.MeshStandardMaterial({
      map:        isDW ? concreteTexture(cHex) : isShiplap ? sidingTexture(cHex) : woodTexture(cHex),
      normalMap:  isDW ? concreteNormal(4,4)   : woodNormal(2,2),
      normalScale:new THREE.Vector2(isDW?0.25:isShiplap?0.7:0.9, isDW?0.25:isShiplap?0.7:0.9),
      roughness:  isDW ? 0.88 : 0.65,
      envMapIntensity: 0.4,
      side: THREE.DoubleSide,
    });
    const raftCeilMat = new THREE.MeshStandardMaterial({ map: woodTexture(0x9A7040), normalMap: woodNormal(2,2), normalScale: new THREE.Vector2(0.9,0.9), roughness: 0.72, envMapIntensity: 0.35 });
    const raftSpacC = (cfg.rafterSpacingIn || 16) / 12;

    if (roofShape === 'flat') {
      if (showPanel) {
        const fc = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, d - 0.05), ceilMat3);
        fc.rotation.x = Math.PI / 2; fc.position.y = frontH - 0.05; fc.receiveShadow = true; g.add(fc);
      }
      // Joists always visible (structure for open_beam; hidden behind panel for others)
      for (let rx = -w/2 + raftSpacC; rx < w/2; rx += raftSpacC) {
        const joist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, d - 0.1), raftCeilMat);
        joist.position.set(rx, frontH - 0.3, 0); joist.castShadow = true; g.add(joist);
      }

    } else if (roofShape === 'shed') {
      const slopeAngC = Math.atan2(backH2 - frontH, d);
      const slopeLenC = Math.sqrt(d*d + (backH2-frontH)**2);
      const midYC = (frontH + backH2) / 2;
      if (showPanel) g.add(makeRoofQuad([w/2,frontH,-d/2],[-w/2,frontH,-d/2],[-w/2,backH2-0.06,d/2],[w/2,backH2-0.06,d/2], ceilMat3));
      const offYC = Math.cos(slopeAngC)*0.24, offZC = Math.sin(slopeAngC)*0.24;
      for (let rx = -w/2 + raftSpacC; rx < w/2; rx += raftSpacC) {
        const sr = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, slopeLenC), raftCeilMat);
        sr.position.set(rx, midYC - offYC, - offZC); sr.rotation.x = -slopeAngC; sr.castShadow = true; g.add(sr);
      }

    } else if (roofShape === 'gable') {
      const ridgeHg  = frontH + ridgeRise;
      const gAxis    = cfg.ridgeAxis || 'x';

      if (gAxis === 'x') {
        if (showPanel) {
          g.add(makeRoofQuad([w/2,frontH,-d/2],[-w/2,frontH,-d/2],[-w/2,ridgeHg-0.06,0],[w/2,ridgeHg-0.06,0], ceilMat3));
          g.add(makeRoofQuad([-w/2,frontH,d/2],[w/2,frontH,d/2],[w/2,ridgeHg-0.06,0],[-w/2,ridgeHg-0.06,0], ceilMat3));
        }
        const slopeAngG = Math.atan2(ridgeRise, d/2);
        const slopeLenG = Math.sqrt((d/2)**2 + ridgeRise**2);
        const offYG = Math.cos(slopeAngG)*0.24, offZG = Math.sin(slopeAngG)*0.24;
        for (let rx = -w/2 + raftSpacC; rx < w/2; rx += raftSpacC) {
          const rfF2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, slopeLenG), raftCeilMat);
          rfF2.position.set(rx, (frontH+ridgeHg)/2 - offYG, -(d/4) - offZG);
          rfF2.rotation.x = -slopeAngG; rfF2.castShadow = true; g.add(rfF2);
          const rfB2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, slopeLenG), raftCeilMat);
          rfB2.position.set(rx, (frontH+ridgeHg)/2 - offYG, (d/4) + offZG);
          rfB2.rotation.x = slopeAngG; rfB2.castShadow = true; g.add(rfB2);
        }
      } else {
        if (showPanel) {
          g.add(makeRoofQuad([-w/2,frontH,d/2],[-w/2,frontH,-d/2],[0,ridgeHg-0.06,-d/2],[0,ridgeHg-0.06,d/2], ceilMat3));
          g.add(makeRoofQuad([0,ridgeHg-0.06,-d/2],[0,ridgeHg-0.06,d/2],[w/2,frontH,d/2],[w/2,frontH,-d/2], ceilMat3));
        }
        const slopeAngGz = Math.atan2(ridgeRise, w/2);
        const slopeLenGz = Math.sqrt((w/2)**2 + ridgeRise**2);
        const offYGz = Math.cos(slopeAngGz)*0.24, offXGz = Math.sin(slopeAngGz)*0.24;
        for (let rz = -d/2 + raftSpacC; rz < d/2; rz += raftSpacC) {
          const rfL2 = new THREE.Mesh(new THREE.BoxGeometry(slopeLenGz, 0.6, 0.13), raftCeilMat);
          rfL2.position.set(-(w/4) - offXGz, (frontH+ridgeHg)/2 - offYGz, rz);
          rfL2.rotation.z = slopeAngGz; rfL2.castShadow = true; g.add(rfL2);
          const rfR2 = new THREE.Mesh(new THREE.BoxGeometry(slopeLenGz, 0.6, 0.13), raftCeilMat);
          rfR2.position.set((w/4) + offXGz, (frontH+ridgeHg)/2 - offYGz, rz);
          rfR2.rotation.z = -slopeAngGz; rfR2.castShadow = true; g.add(rfR2);
        }
      }

    } else if (roofShape === 'hip') {
      const ridgeHh = frontH + ridgeRise;
      const ridgeLh = Math.max(0, w - d);
      const rlh     = ridgeLh / 2;
      if (ridgeLh > 0) {
        if (showPanel) {
          g.add(makeRoofQuad([w/2,frontH,-d/2],[-w/2,frontH,-d/2],[-rlh,ridgeHh-0.06,0],[rlh,ridgeHh-0.06,0], ceilMat3));
          g.add(makeRoofQuad([-w/2,frontH,d/2],[w/2,frontH,d/2],[rlh,ridgeHh-0.06,0],[-rlh,ridgeHh-0.06,0], ceilMat3));
          g.add(makeRoofTri([-w/2,frontH,-d/2],[-w/2,frontH,d/2],[-rlh,ridgeHh-0.06,0], ceilMat3));
          g.add(makeRoofTri([w/2,frontH,d/2],[w/2,frontH,-d/2],[rlh,ridgeHh-0.06,0], ceilMat3));
        }
        const ridgeBoardH = new THREE.Mesh(new THREE.BoxGeometry(ridgeLh, 0.28, 0.32), raftCeilMat);
        ridgeBoardH.position.set(0, ridgeHh - 0.18, 0); ridgeBoardH.castShadow = true; g.add(ridgeBoardH);
        const slopeAngHf = Math.atan2(ridgeRise, d/2);
        const slopeLenHf = Math.sqrt((d/2)**2 + ridgeRise**2);
        const offYHf = Math.cos(slopeAngHf)*0.22, offZHf = Math.sin(slopeAngHf)*0.22;
        for (let rx = -rlh + raftSpacC; rx < rlh; rx += raftSpacC) {
          const rF = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, slopeLenHf), raftCeilMat);
          rF.position.set(rx, (frontH+ridgeHh)/2-offYHf, -(d/4)-offZHf); rF.rotation.x=-slopeAngHf; rF.castShadow=true; g.add(rF);
          const rB = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, slopeLenHf), raftCeilMat);
          rB.position.set(rx, (frontH+ridgeHh)/2-offYHf, (d/4)+offZHf); rB.rotation.x=slopeAngHf; rB.castShadow=true; g.add(rB);
        }
        const hipSlopeLenX = Math.sqrt((w/2-rlh)**2 + ridgeRise**2);
        const hipSlopeAngX = Math.atan2(ridgeRise, w/2-rlh);
        const offYHx = Math.cos(hipSlopeAngX)*0.22;
        [-1,1].forEach(side => {
          const x0 = side*(w/2), xR = side*rlh;
          for(let i=0;i<3;i++){
            const t=(i+1)/4, xI=x0+(xR-x0)*t, yI=frontH+ridgeRise*t;
            const jr = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, hipSlopeLenX*(1-t)), raftCeilMat);
            jr.position.set(xI, (frontH+yI)/2-offYHx, 0);
            jr.rotation.x = side>0?-hipSlopeAngX:hipSlopeAngX; jr.castShadow=true; g.add(jr);
          }
        });
      } else {
        // Square — pyramid
        const pts2 = [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
        if (showPanel) pts2.forEach(([x,z],i)=>{
          const [nx2,nz2]=pts2[(i+1)%4];
          g.add(makeRoofTri([x,frontH,z],[nx2,frontH,nz2],[0,ridgeHh-0.06,0],ceilMat3));
        });
      }
    }
  }

  // Privacy walls with configurable width and finish materials
  const privacyWalls = Array.isArray(cfg.privacyWalls) ? cfg.privacyWalls : [];
  const wallT3  = cfg.wallWidthFt || 0.5;
  const extMat3 = makeFinishMaterial(cfg.exteriorFinish || 'stucco');
  const intMat3 = makeFinishMaterial(cfg.interiorFinish || 'drywall');
  if (privacyWalls.includes('front')) {
    const pw=new THREE.Mesh(new THREE.BoxGeometry(w,frontH,wallT3),extMat3); pw.position.set(0,frontH/2,-d/2); pw.castShadow=true; pw.receiveShadow=true; g.add(pw);
    const pwi=new THREE.Mesh(new THREE.BoxGeometry(w,frontH,0.04),intMat3); pwi.position.set(0,frontH/2,-d/2+wallT3/2-0.025); g.add(pwi);
  }
  if (privacyWalls.includes('back')) {
    const pw=new THREE.Mesh(new THREE.BoxGeometry(w,frontH,wallT3),extMat3); pw.position.set(0,frontH/2,d/2); pw.castShadow=true; pw.receiveShadow=true; g.add(pw);
    const pwi=new THREE.Mesh(new THREE.BoxGeometry(w,frontH,0.04),intMat3); pwi.position.set(0,frontH/2,d/2-wallT3/2+0.025); g.add(pwi);
  }
  if (privacyWalls.includes('left')) {
    const pw=new THREE.Mesh(new THREE.BoxGeometry(wallT3,frontH,d),extMat3); pw.position.set(-w/2,frontH/2,0); pw.castShadow=true; pw.receiveShadow=true; g.add(pw);
    const pwi=new THREE.Mesh(new THREE.BoxGeometry(0.04,frontH,d),intMat3); pwi.position.set(-w/2+wallT3/2-0.025,frontH/2,0); g.add(pwi);
  }
  if (privacyWalls.includes('right')) {
    const pw=new THREE.Mesh(new THREE.BoxGeometry(wallT3,frontH,d),extMat3); pw.position.set(w/2,frontH/2,0); pw.castShadow=true; pw.receiveShadow=true; g.add(pw);
    const pwi=new THREE.Mesh(new THREE.BoxGeometry(0.04,frontH,d),intMat3); pwi.position.set(w/2-wallT3/2+0.025,frontH/2,0); g.add(pwi);
  }

  // Screen enclosure walls
  if (cfg.wall === 'screen') {
    const scrMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.18, side: THREE.DoubleSide, roughness: 0.9 });
    [
      [0, frontH/2, -d/2, w, frontH, 0.04, 'front'],
      [0, frontH/2,  d/2, w, frontH, 0.04, 'back'],
      [-w/2, frontH/2, 0, 0.04, frontH, d, 'left'],
      [ w/2, frontH/2, 0, 0.04, frontH, d, 'right'],
    ].forEach(([x, y, z, sw2, sh, sdp, side]) => {
      if (privacyWalls.includes(side)) return;
      const s = new THREE.Mesh(new THREE.BoxGeometry(sw2, sh, sdp), scrMat);
      s.position.set(x, y, z); g.add(s);
    });
  }

  // TV wall — full wall section with mounted TV
  if (cfg.tvWall && cfg.tvWall !== 'none') {
    const tvSide  = cfg.tvWall;
    const tvWallW = cfg.tvWallWidthFt > 0 ? cfg.tvWallWidthFt : (tvSide==='left'||tvSide==='right' ? d : w);
    const tvWallT = wallT3 > 0 ? wallT3 : 0.5;
    const tvMountH = cfg.tvMountHeightFt || 5;
    const tvDispW = Math.min(tvWallW - 0.6, 5.5), tvDispH = tvDispW * 0.58;
    const tvWallExtMat = extMat3; const tvWallIntMat = intMat3;
    const tvMat = new THREE.MeshStandardMaterial({ color: 0x0A0A0A, roughness: 0.12, metalness: 0.65 });
    const scrMat2 = new THREE.MeshStandardMaterial({ color: 0x18202C, roughness: 0.02, emissive: 0x0C1018, emissiveIntensity: 0.4 });
    let tvX=0, tvY=tvMountH, tvZ=0, tvRY=0, wallH2=frontH;
    // Wall body + TV
    if(tvSide==='back'){
      tvZ=d/2; tvRY=0;
      if(!privacyWalls.includes('back')){
        const wm=new THREE.Mesh(new THREE.BoxGeometry(tvWallW,wallH2,tvWallT),tvWallExtMat); wm.position.set(0,wallH2/2,tvZ); wm.castShadow=true; wm.receiveShadow=true; g.add(wm);
        const wmi=new THREE.Mesh(new THREE.BoxGeometry(tvWallW,wallH2,0.04),tvWallIntMat); wmi.position.set(0,wallH2/2,tvZ-tvWallT/2+0.025); g.add(wmi);
      }
    } else if(tvSide==='front'){
      tvZ=-d/2; tvRY=Math.PI;
      if(!privacyWalls.includes('front')){
        const wm=new THREE.Mesh(new THREE.BoxGeometry(tvWallW,wallH2,tvWallT),tvWallExtMat); wm.position.set(0,wallH2/2,tvZ); wm.castShadow=true; wm.receiveShadow=true; g.add(wm);
        const wmi=new THREE.Mesh(new THREE.BoxGeometry(tvWallW,wallH2,0.04),tvWallIntMat); wmi.position.set(0,wallH2/2,tvZ+tvWallT/2-0.025); g.add(wmi);
      }
    } else if(tvSide==='left'){
      tvX=-w/2; tvRY=Math.PI/2;
      if(!privacyWalls.includes('left')){
        const wm=new THREE.Mesh(new THREE.BoxGeometry(tvWallT,wallH2,tvWallW),tvWallExtMat); wm.position.set(tvX,wallH2/2,0); wm.castShadow=true; wm.receiveShadow=true; g.add(wm);
        const wmi=new THREE.Mesh(new THREE.BoxGeometry(0.04,wallH2,tvWallW),tvWallIntMat); wmi.position.set(tvX+tvWallT/2-0.025,wallH2/2,0); g.add(wmi);
      }
    } else if(tvSide==='right'){
      tvX=w/2; tvRY=-Math.PI/2;
      if(!privacyWalls.includes('right')){
        const wm=new THREE.Mesh(new THREE.BoxGeometry(tvWallT,wallH2,tvWallW),tvWallExtMat); wm.position.set(tvX,wallH2/2,0); wm.castShadow=true; wm.receiveShadow=true; g.add(wm);
        const wmi=new THREE.Mesh(new THREE.BoxGeometry(0.04,wallH2,tvWallW),tvWallIntMat); wmi.position.set(tvX-tvWallT/2+0.025,wallH2/2,0); g.add(wmi);
      }
    }
    const tvBody=new THREE.Mesh(new THREE.BoxGeometry(tvDispW,tvDispH,0.1),tvMat);
    tvBody.position.set(tvX,tvY,tvZ); tvBody.rotation.y=tvRY; g.add(tvBody);
    const tvScr=new THREE.Mesh(new THREE.BoxGeometry(tvDispW-0.14,tvDispH-0.14,0.05),scrMat2);
    tvScr.position.set(tvX,tvY,tvZ); tvScr.rotation.y=tvRY; g.add(tvScr);
  }

  // Ceiling fans — downrod from sloped ceiling, blades at ~7.5 ft AFF
  // Ceiling height at center of space follows roof pitch
  const ridgeHfan = (roofShape==='gable'||roofShape==='hip') ? frontH + ridgeRise : (roofShape==='shed' ? (frontH+backH2)/2 : frontH);
  if (cfg.fans > 0) {
    const fanMat2  = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4, metalness: 0.5 });
    const bladeMat2 = new THREE.MeshStandardMaterial({ color: 0x7A5C3A, roughness: 0.75 });
    const globeMat2 = new THREE.MeshStandardMaterial({ color: 0xFFF8E0, transparent: true, opacity: 0.82, roughness: 0.04 });
    const fanPositions2 = [[0,0],[-w/4,-d/4],[w/4,-d/4],[-w/4,d/4],[w/4,d/4]];
    const targetH2 = 7.5;  // blade height AFF in feet
    // Fan canopy attaches to the ceiling at the sloped height above fan position
    const hubH2    = Math.min(ridgeHfan - 0.5, targetH2);
    const rodLen2  = ridgeHfan - hubH2;
    fanPositions2.slice(0, cfg.fans).forEach(([fx, fz]) => {
      // Ceiling canopy — attaches to sloped ceiling at ridge height
      const canopy2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.12, 12), fanMat2);
      canopy2.position.set(fx, ridgeHfan - 0.06, fz); g.add(canopy2);
      // Downrod
      if (rodLen2 > 0.1) {
        const rod2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, rodLen2, 8), fanMat2);
        rod2.position.set(fx, ridgeHfan - 0.12 - rodLen2/2, fz); g.add(rod2);
      }
      // Motor housing
      const hub2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.22, 12), fanMat2);
      hub2.position.set(fx, hubH2, fz); g.add(hub2);
      // 5 blades
      for (let b = 0; b < 5; b++) {
        const ang2 = b * (2*Math.PI/5);
        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.038, 1.35), bladeMat2);
        blade2.position.set(fx + Math.cos(ang2)*0.76, hubH2 - 0.08, fz + Math.sin(ang2)*0.76);
        blade2.rotation.y = ang2; g.add(blade2);
      }
      // Light globe below motor
      const globe2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI*2, 0, Math.PI*0.65), globeMat2);
      globe2.rotation.x = Math.PI;
      globe2.position.set(fx, hubH2 - 0.15, fz); g.add(globe2);
    });
  }

  // Recessed can lights in ceiling
  if (cfg.lights > 0) {
    const lightMat2 = new THREE.MeshStandardMaterial({ color: 0xFFFFCC, emissive: 0xFFFFCC, emissiveIntensity: 0.55 });
    const lCount = Math.min(cfg.lights, 16);
    const cols2  = Math.max(1, Math.ceil(Math.sqrt(lCount * (w/d))));
    const rows2  = Math.ceil(lCount / cols2);
    let lc = 0;
    for (let r = 0; r < rows2 && lc < lCount; r++) {
      for (let c = 0; c < cols2 && lc < lCount; c++) {
        const lx = -w/2 + (c+0.5)*(w/cols2);
        const lz = -d/2 + (r+0.5)*(d/rows2);
        const light2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), lightMat2);
        // Place lights just below sloped ceiling (approximate height at center)
        const lightH = (roofShape==='flat') ? frontH - 0.12 : ridgeHfan - 0.18;
        light2.position.set(lx, lightH, lz); g.add(light2);
        lc++;
      }
    }
  }

  return g;
}

function buildSunroom(w, d, hex, config) {
  const cfg        = config || {};
  const g          = new THREE.Group();
  const wallH      = cfg.frontHeightFt || 9;
  const backWallH  = cfg.backHeightFt  || wallH;
  const roofStyle  = cfg.roofStyle     || 'gable';
  const ridgeRise5 = 2;
  const overhang5  = 0.4;

  const frameMat5 = new THREE.MeshStandardMaterial({ color: 0xC8C8C8, roughness: 0.25, metalness: 0.65 });
  const glassMat5 = new THREE.MeshPhysicalMaterial({ color: 0xC8E8FF, transparent: true, opacity: 0.18, roughness: 0.0, metalness: 0, reflectivity: 0.85, envMapIntensity: 1.5, side: THREE.DoubleSide });
  const roofColorMap5 = { shingle: 0x333333, metal: 0x6A8FA8, tile: 0x7A5030, glass: 0xB0D8F0 };
  const roofColor5    = roofColorMap5[cfg.roofMaterial || 'shingle'] || 0x333333;
  const isGlassRoof   = cfg.roofMaterial === 'glass';
  const roofMat5      = new THREE.MeshStandardMaterial({ color: roofColor5, roughness: isGlassRoof ? 0.05 : 0.68, transparent: isGlassRoof, opacity: isGlassRoof ? 0.3 : 1 });

  // Slab
  const slab5 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.15, d + 0.3),
    new THREE.MeshStandardMaterial({ color: 0xC4C0B8, roughness: 0.85 }));
  slab5.position.y = -0.08; g.add(slab5);

  // Corner posts
  [[-w/2,-d/2,wallH],[w/2,-d/2,wallH],[-w/2,d/2,backWallH],[w/2,d/2,backWallH]].forEach(([px,pz,ph]) => {
    const cp = new THREE.Mesh(new THREE.BoxGeometry(0.18, ph, 0.18), frameMat5);
    cp.position.set(px, ph/2, pz); g.add(cp);
  });

  // Top perimeter rails
  const topRails = [
    [0, wallH, -d/2, w, 0.15, 0.18],
    [0, backWallH, d/2, w, 0.15, 0.18],
    [-w/2, (wallH+backWallH)/2, 0, 0.18, 0.15, d],
    [ w/2, (wallH+backWallH)/2, 0, 0.18, 0.15, d],
  ];
  topRails.forEach(([x,y,z,rw,rh,rd]) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), frameMat5);
    rail.position.set(x, y, z); g.add(rail);
  });

  // Door on front wall
  const doorType5 = cfg.doorType || 'french';
  const doorW5    = doorType5 === 'french' ? 5 : doorType5 === 'sliding' ? 6 : 3;
  const doorH5    = 7;
  const doorMat5  = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.2, metalness: 0.55 });
  if (doorType5 === 'french') {
    [-doorW5/4, doorW5/4].forEach(ox => {
      const dp = new THREE.Mesh(new THREE.BoxGeometry(doorW5/2 - 0.06, doorH5, 0.07), doorMat5);
      dp.position.set(ox, doorH5/2, -d/2); g.add(dp);
      const dg = new THREE.Mesh(new THREE.BoxGeometry(doorW5/2 - 0.22, doorH5 - 0.5, 0.06), glassMat5);
      dg.position.set(ox, doorH5/2 + 0.1, -d/2 + 0.01); g.add(dg);
    });
  } else if (doorType5 === 'sliding') {
    [-doorW5/4, doorW5/4].forEach(ox => {
      const dg = new THREE.Mesh(new THREE.BoxGeometry(doorW5/2 - 0.05, doorH5, 0.08), glassMat5);
      dg.position.set(ox, doorH5/2, -d/2); g.add(dg);
      const df = new THREE.Mesh(new THREE.BoxGeometry(doorW5/2 - 0.05, doorH5, 0.04), frameMat5);
      df.position.set(ox, doorH5/2, -d/2 - 0.03); g.add(df);
    });
  } else {
    const dp = new THREE.Mesh(new THREE.BoxGeometry(doorW5 - 0.06, doorH5, 0.07), doorMat5);
    dp.position.set(0, doorH5/2, -d/2); g.add(dp);
    const dg = new THREE.Mesh(new THREE.BoxGeometry(doorW5 - 0.28, doorH5 - 0.5, 0.06), glassMat5);
    dg.position.set(0, doorH5/2 + 0.1, -d/2 + 0.01); g.add(dg);
  }

  // Front wall glass side panels
  const numWin5 = cfg.windows || 3;
  const sideW5  = (w - doorW5) / 2;
  if (sideW5 > 0.4) {
    [-1, 1].forEach(side => {
      const panelX5 = side * (doorW5/2 + sideW5/2);
      const gp5 = new THREE.Mesh(new THREE.BoxGeometry(sideW5 - 0.18, wallH - 0.28, 0.06), glassMat5);
      gp5.position.set(panelX5, wallH/2, -d/2); g.add(gp5);
      const midRail5 = new THREE.Mesh(new THREE.BoxGeometry(sideW5 - 0.18, 0.06, 0.09), frameMat5);
      midRail5.position.set(panelX5, wallH * 0.55, -d/2); g.add(midRail5);
      for (let wi = 1; wi < numWin5; wi++) {
        const mx5 = panelX5 - sideW5/2 + wi * (sideW5/numWin5);
        const mull5 = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH - 0.28, 0.09), frameMat5);
        mull5.position.set(mx5, wallH/2, -d/2); g.add(mull5);
      }
    });
  }

  // Side walls (glass with mullion grid)
  [-w/2, w/2].forEach(wx5 => {
    const gp5s = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH - 0.28, d - 0.28), glassMat5);
    gp5s.position.set(wx5, wallH/2, 0); g.add(gp5s);
    const mr5s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, d - 0.28), frameMat5);
    mr5s.position.set(wx5, wallH * 0.55, 0); g.add(mr5s);
    for (let wi = 1; wi < numWin5; wi++) {
      const mz5 = -d/2 + wi * (d / numWin5);
      const mull5s = new THREE.Mesh(new THREE.BoxGeometry(0.09, wallH - 0.28, 0.06), frameMat5);
      mull5s.position.set(wx5, wallH/2, mz5); g.add(mull5s);
    }
  });

  // Back wall
  const bgp5 = new THREE.Mesh(new THREE.BoxGeometry(w - 0.28, backWallH - 0.28, 0.06), glassMat5);
  bgp5.position.set(0, backWallH/2, d/2); g.add(bgp5);
  for (let wi = 1; wi < numWin5; wi++) {
    const mx5b = -w/2 + wi * (w / numWin5);
    const mull5b = new THREE.Mesh(new THREE.BoxGeometry(0.06, backWallH - 0.28, 0.09), frameMat5);
    mull5b.position.set(mx5b, backWallH/2, d/2); g.add(mull5b);
  }

  // Roof
  if (roofStyle === 'flat') {
    const rp5 = new THREE.Mesh(new THREE.BoxGeometry(w + overhang5, 0.3, d + overhang5), roofMat5);
    rp5.position.y = wallH + 0.15; g.add(rp5);
  } else if (roofStyle === 'shed') {
    const shedH5   = wallH + ridgeRise5;
    const slopeL5  = Math.sqrt(d*d + ridgeRise5*ridgeRise5);
    const slopeA5  = Math.atan2(ridgeRise5, d);
    const rp5s = new THREE.Mesh(new THREE.BoxGeometry(w + overhang5, 0.3, slopeL5), roofMat5);
    rp5s.position.set(0, (wallH + shedH5)/2 + 0.15, 0);
    rp5s.rotation.x = -slopeA5; g.add(rp5s);
  } else {
    // Gable (default)
    const ridgeH5  = wallH + ridgeRise5;
    const slopeL5g = Math.sqrt((d/2)*(d/2) + ridgeRise5*ridgeRise5);
    const slopeA5g = Math.atan2(ridgeRise5, d/2);
    ['front','back'].forEach((side5, si5) => {
      const rp5g = new THREE.Mesh(new THREE.BoxGeometry(w + overhang5, 0.28, slopeL5g + overhang5/2), roofMat5);
      rp5g.position.set(0, (wallH + ridgeH5)/2 + 0.1, si5 === 0 ? -d/4 : d/4);
      rp5g.rotation.x = si5 === 0 ? slopeA5g : -slopeA5g;
      rp5g.castShadow = true; g.add(rp5g);
    });
    const rb5 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.18), frameMat5);
    rb5.position.set(0, ridgeH5 + 0.06, 0); g.add(rb5);
    [-w/2 - 0.08, w/2 + 0.08].forEach(gx5 => {
      const gt5 = new THREE.Mesh(new THREE.BoxGeometry(0.12, ridgeRise5 * 0.92, d * 0.88),
        new THREE.MeshStandardMaterial({ color: hex || 0xD8D4CC, roughness: 0.7 }));
      gt5.position.set(gx5, wallH + ridgeRise5 * 0.46, 0); g.add(gt5);
    });
  }

  // Ceiling
  if (cfg.ceiling && cfg.ceiling !== 'none') {
    const ceilC5 = { tongue_groove: 0xBC8A4A, drywall: 0xF0EDE8 }[cfg.ceiling] || 0xF0EDE8;
    const ceilM5 = new THREE.MeshStandardMaterial({
      map: cfg.ceiling === 'drywall' ? concreteTexture(0xF0EDE8) : woodTexture(ceilC5),
      roughness: 0.7,
    });
    const ceil5 = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.1, d - 0.1), ceilM5);
    ceil5.position.y = wallH - 0.06; g.add(ceil5);
  }

  // Mini-split condenser (outside)
  if (cfg.hvac === 'mini_split') {
    const cond = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0xD0CCC8, roughness: 0.3, metalness: 0.4 }));
    cond.position.set(w/2 + 0.8, 1, 0); g.add(cond);
  }

  // Fans and lights
  if (cfg.fans > 0) {
    const fMat5 = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
    const fPos5 = [[0,0],[-w/4,0],[w/4,0],[-w/4,d/4],[w/4,d/4]];
    fPos5.slice(0, cfg.fans).forEach(([fx5, fz5]) => {
      const hub5 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10), fMat5);
      hub5.position.set(fx5, wallH - 0.22, fz5); g.add(hub5);
      for (let b = 0; b < 5; b++) {
        const ang5 = b * (2*Math.PI/5);
        const bl5 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 1.3),
          new THREE.MeshStandardMaterial({ color: 0x7A5C3A, roughness: 0.8 }));
        bl5.position.set(fx5 + Math.cos(ang5)*0.75, wallH - 0.28, fz5 + Math.sin(ang5)*0.75);
        bl5.rotation.y = ang5; g.add(bl5);
      }
    });
  }
  if (cfg.lights > 0) {
    const lMat5 = new THREE.MeshStandardMaterial({ color: 0xFFFFCC, emissive: 0xFFFFCC, emissiveIntensity: 0.55 });
    const lCount5 = Math.min(cfg.lights, 16);
    const lcols5  = Math.max(1, Math.ceil(Math.sqrt(lCount5 * (w/d))));
    const lrows5  = Math.ceil(lCount5 / lcols5);
    let lc5 = 0;
    for (let r = 0; r < lrows5 && lc5 < lCount5; r++) {
      for (let c = 0; c < lcols5 && lc5 < lCount5; c++) {
        const l5 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), lMat5);
        l5.position.set(-w/2 + (c+0.5)*(w/lcols5), wallH - 0.12, -d/2 + (r+0.5)*(d/lrows5));
        g.add(l5); lc5++;
      }
    }
  }

  return g;
}

// ─── Wall builder with door/window openings ──────────────────────────────────
function buildWallWithOpenings(wallLen, wallH, wallT, doors, wins, extMat, intMat) {
  const g = new THREE.Group();
  const openings = [
    ...(doors||[]).map(d=>({ x:d.xFt||0, w:d.widthFt||3, y0:0, y1:d.heightFt||6.8, type:'door', doorType:d.type||'single' })),
    ...(wins||[]).map(win=>({ x:win.xFt||0, w:win.widthFt||3, y0:win.sillFt||2.5, y1:(win.sillFt||2.5)+(win.heightFt||3.5), type:'window' })),
  ].sort((a,b)=>(a.x-a.w/2)-(b.x-b.w/2));

  const panel=(x0,x1,y0,y1)=>{
    const pw=x1-x0, ph=y1-y0; if(pw<=0.01||ph<=0.01)return;
    const ext=new THREE.Mesh(new THREE.BoxGeometry(pw,ph,wallT),extMat);
    ext.position.set((x0+x1)/2,(y0+y1)/2,0); ext.castShadow=true; ext.receiveShadow=true; g.add(ext);
    if(intMat!==extMat){
      const interior=new THREE.Mesh(new THREE.BoxGeometry(pw,ph,0.04),intMat);
      interior.position.set((x0+x1)/2,(y0+y1)/2,-wallT/2+0.025); g.add(interior);
    }
  };
  const frameMat=new THREE.MeshStandardMaterial({color:0xE8E4DC,roughness:0.35});
  const glassMat=new THREE.MeshPhysicalMaterial({color:0xC8E8FF,transparent:true,opacity:0.2,roughness:0,reflectivity:0.85,envMapIntensity:1.5,side:THREE.DoubleSide});
  const doorWoodMat=new THREE.MeshStandardMaterial({map:woodTexture(0x8B6820),roughness:0.6});
  const goldMat=new THREE.MeshStandardMaterial({color:0xC8A020,metalness:0.85,roughness:0.2});

  const addWindow=(op)=>{
    const wh=op.y1-op.y0;
    const fr=new THREE.Mesh(new THREE.BoxGeometry(op.w,wh,wallT*0.65),frameMat);
    fr.position.set(op.x,(op.y0+op.y1)/2,0); g.add(fr);
    const gl=new THREE.Mesh(new THREE.BoxGeometry(op.w-0.14,wh-0.14,0.04),glassMat);
    gl.position.set(op.x,(op.y0+op.y1)/2,wallT*0.1); g.add(gl);
    // Mullions
    const mh=new THREE.Mesh(new THREE.BoxGeometry(op.w-0.14,0.05,0.05),frameMat);
    mh.position.set(op.x,(op.y0+op.y1)/2,wallT*0.12); g.add(mh);
    const mv=new THREE.Mesh(new THREE.BoxGeometry(0.05,wh-0.14,0.05),frameMat);
    mv.position.set(op.x,(op.y0+op.y1)/2,wallT*0.12); g.add(mv);
  };
  const addDoor=(op)=>{
    const dh=op.y1, dw=op.w;
    // Door frame
    [{x:op.x-dw/2+0.05,w:0.1,h:dh+0.12},{x:op.x+dw/2-0.05,w:0.1,h:dh+0.12}].forEach(f=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(f.w,f.h,wallT*1.1),frameMat); m.position.set(f.x,f.h/2,0); g.add(m);
    });
    const top=new THREE.Mesh(new THREE.BoxGeometry(dw+0.22,0.14,wallT*1.1),frameMat); top.position.set(op.x,dh+0.07,0); g.add(top);
    if(op.doorType==='garage'){
      const dp=new THREE.Mesh(new THREE.BoxGeometry(dw-0.12,dh-0.1,0.1),new THREE.MeshStandardMaterial({color:0xE8E4DC,roughness:0.5}));
      dp.position.set(op.x,dh/2,wallT*0.1); g.add(dp);
      for(let p=0;p<4;p++){
        const ln=new THREE.Mesh(new THREE.BoxGeometry(dw-0.12,0.06,0.12),frameMat);
        ln.position.set(op.x,dh/4*p+dh/8,wallT*0.16); g.add(ln);
      }
    } else if(op.doorType==='sliding'){
      [-dw/4,dw/4].forEach(ox=>{
        const dp=new THREE.Mesh(new THREE.BoxGeometry(dw/2-0.08,dh-0.1,0.05),glassMat); dp.position.set(op.x+ox,dh/2,wallT*0.1); g.add(dp);
        const fr2=new THREE.Mesh(new THREE.BoxGeometry(dw/2-0.08,dh-0.1,0.06),frameMat); fr2.position.set(op.x+ox,dh/2,wallT*0.08); g.add(fr2);
      });
    } else if(op.doorType==='french'||op.doorType==='double'){
      [-dw/4,dw/4].forEach(ox=>{
        const dp=new THREE.Mesh(new THREE.BoxGeometry(dw/2-0.12,dh-0.1,0.08),doorWoodMat); dp.position.set(op.x+ox,dh/2,wallT*0.1); g.add(dp);
        const dg=new THREE.Mesh(new THREE.BoxGeometry(dw/2-0.22,dh*0.45,0.04),glassMat); dg.position.set(op.x+ox,dh*0.6,wallT*0.15); g.add(dg);
      });
    } else {
      const dp=new THREE.Mesh(new THREE.BoxGeometry(dw-0.14,dh-0.1,0.08),doorWoodMat); dp.position.set(op.x,dh/2,wallT*0.1); g.add(dp);
      const hnd=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.04,0.08),goldMat); hnd.position.set(op.x+dw*0.3,dh*0.45,wallT*0.2); g.add(hnd);
    }
  };

  let curX=-wallLen/2;
  for(const op of openings){
    const opX0=op.x-op.w/2, opX1=op.x+op.w/2;
    if(opX0>curX) panel(curX,opX0,0,wallH);
    if(op.y1<wallH) panel(opX0,opX1,op.y1,wallH);
    if(op.y0>0) panel(opX0,opX1,0,op.y0);
    if(op.type==='window') addWindow(op); else addDoor(op);
    curX=opX1;
  }
  if(curX<wallLen/2) panel(curX,wallLen/2,0,wallH);
  if(openings.length===0) panel(-wallLen/2,wallLen/2,0,wallH);
  return g;
}

// ─── Room/house builder ───────────────────────────────────────────────────────
function buildRoom(w, d, hex, config) {
  const cfg=config||{};
  const g=new THREE.Group();
  const wallH  = cfg.heightFt||9;
  const wallT  = (cfg.wallThicknessIn||6)/12;
  const ovhg   = 0.75;
  const extMat = makeFinishMaterial(cfg.exteriorFinish||'stucco');
  const intMat = makeFinishMaterial(cfg.interiorFinish||'drywall');
  const flrMat = makeFloorMaterial(cfg.floorMaterial||'wood');
  const clgMat = makeFinishMaterial(cfg.ceilingFinish||'drywall');
  const roofSh = cfg.roofStyle||'gable';
  const roofMt = cfg.roofMaterial||'shingle';
  const ridge  = cfg.ridgeRiseFt||3;
  const doors  = cfg.doors  ||[];
  const windows= cfg.windows||[];

  // Slab
  const slab=new THREE.Mesh(new THREE.BoxGeometry(w+wallT*2,0.5,d+wallT*2),new THREE.MeshStandardMaterial({map:concreteTexture(0xC0BCBA),roughness:0.88}));
  slab.position.y=-0.25; slab.receiveShadow=true; g.add(slab);
  // Floor finish
  const flr=new THREE.Mesh(new THREE.BoxGeometry(w-wallT*2,0.04,d-wallT*2),flrMat);
  flr.position.y=0.02; flr.receiveShadow=true; g.add(flr);
  // Ceiling
  if(cfg.ceilingFinish!=='open'){
    const clg=new THREE.Mesh(new THREE.BoxGeometry(w-wallT*2,0.08,d-wallT*2),clgMat);
    clg.position.y=wallH-0.04; clg.receiveShadow=true; g.add(clg);
  }

  // Four walls
  const sides=[
    {name:'front',len:w, pos:[0,0,-d/2], ry:0},
    {name:'back', len:w, pos:[0,0, d/2], ry:Math.PI},
    {name:'left', len:d, pos:[-w/2,0,0], ry:-Math.PI/2},
    {name:'right',len:d, pos:[ w/2,0,0], ry: Math.PI/2},
  ];
  for(const side of sides){
    const wg=buildWallWithOpenings(
      side.len, wallH, wallT,
      doors.filter(x=>x.wall===side.name),
      windows.filter(x=>x.wall===side.name),
      extMat, intMat
    );
    wg.position.set(...side.pos); wg.rotation.y=side.ry; g.add(wg);
  }

  // Roof
  const roofColorMap={shingle:0x2E2E2E,tile:0x7A5030,metal:0x6A8FA8,flat:0xC0BCB8};
  const rc=roofColorMap[roofMt]||0x2E2E2E;
  const rm=new THREE.MeshStandardMaterial({color:rc,map:roofMt!=='metal'?concreteTexture(rc):null,roughness:roofMt==='metal'?0.3:0.78,metalness:roofMt==='metal'?0.65:0.02});
  rm.side=THREE.DoubleSide;
  if(roofSh==='flat'){
    const rf=new THREE.Mesh(new THREE.BoxGeometry(w+ovhg*2,0.3,d+ovhg*2),rm);
    rf.position.y=wallH+0.15; rf.castShadow=true; g.add(rf);
  } else if(roofSh==='shed'){
    const shedR=ridge||2;
    const shedL=Math.sqrt(d*d+shedR*shedR)+ovhg*2;
    const ang=Math.atan2(shedR,d);
    const rf=new THREE.Mesh(new THREE.BoxGeometry(w+ovhg*2,0.22,shedL),rm);
    rf.position.set(0,wallH+shedR/2,0); rf.rotation.x=-ang; rf.castShadow=true; g.add(rf);
  } else if(roofSh==='gable'){
    const rH=wallH+ridge;
    g.add(makeRoofQuad([-w/2-ovhg,wallH,-d/2-ovhg],[w/2+ovhg,wallH,-d/2-ovhg],[w/2+ovhg,rH,0],[-w/2-ovhg,rH,0],rm));
    g.add(makeRoofQuad([w/2+ovhg,wallH,d/2+ovhg],[-w/2-ovhg,wallH,d/2+ovhg],[-w/2-ovhg,rH,0],[w/2+ovhg,rH,0],rm));
    const gabMat2=new THREE.MeshStandardMaterial({map:extMat.map,roughness:extMat.roughness});
    [[-d/2-ovhg],[d/2+ovhg]].forEach(([gz])=>g.add(makeRoofTri([-w/2-ovhg,wallH,gz],[w/2+ovhg,wallH,gz],[0,rH,gz],gabMat2)));
    const rdg=new THREE.Mesh(new THREE.BoxGeometry(w+ovhg*2,0.15,0.15),new THREE.MeshStandardMaterial({map:woodTexture(0xA07840),roughness:0.7}));
    rdg.position.set(0,rH+0.075,0); g.add(rdg);
  } else if(roofSh==='hip'){
    const rH=wallH+ridge;
    const rL=Math.max(0,w-d), rl=rL/2;
    if(rL>0){
      g.add(makeRoofQuad([-w/2-ovhg,wallH,-d/2-ovhg],[w/2+ovhg,wallH,-d/2-ovhg],[rl,rH,0],[-rl,rH,0],rm));
      g.add(makeRoofQuad([w/2+ovhg,wallH,d/2+ovhg],[-w/2-ovhg,wallH,d/2+ovhg],[-rl,rH,0],[rl,rH,0],rm));
      g.add(makeRoofTri([-w/2-ovhg,wallH,-d/2-ovhg],[-w/2-ovhg,wallH,d/2+ovhg],[-rl,rH,0],rm));
      g.add(makeRoofTri([w/2+ovhg,wallH,d/2+ovhg],[w/2+ovhg,wallH,-d/2-ovhg],[rl,rH,0],rm));
    } else {
      [[-w/2-ovhg,-d/2-ovhg],[w/2+ovhg,-d/2-ovhg],[w/2+ovhg,d/2+ovhg],[-w/2-ovhg,d/2+ovhg]].map(([px,pz],i,arr)=>{
        const n=arr[(i+1)%4];
        g.add(makeRoofTri([px,wallH,pz],[n[0],wallH,n[1]],[0,rH,0],rm));
      });
    }
  }

  // Built-in fireplace
  if(cfg.fireplaceWall&&cfg.fireplaceWall!=='none'){
    const fpW=cfg.fireplaceWidthFt||5;
    const fp=buildFireplace(fpW,1.5,hex,{
      style:cfg.fireplaceStyle||'traditional', fuel:cfg.fireplaceFuel||'gas',
      surroundMaterial:cfg.fireplaceSurround||'stone', hearthMaterial:cfg.fireplaceHearth||'stone',
      mantleStyle:cfg.fireplaceMantleStyle||'wood', heightFt:Math.min(wallH-0.5,7),
      chimneyBreast:true,
    });
    const fw=cfg.fireplaceWall;
    if(fw==='front') fp.position.set(0,0,-d/2+0.75);
    else if(fw==='back')  fp.position.set(0,0,d/2-0.75);
    else if(fw==='left')  { fp.position.set(-w/2+0.75,0,0); fp.rotation.y=Math.PI/2; }
    else if(fw==='right') { fp.position.set(w/2-0.75,0,0);  fp.rotation.y=-Math.PI/2; }
    g.add(fp);
  }
  return g;
}

// ─── Fireplace builder ────────────────────────────────────────────────────────
function buildFireplace(w, d, _hex, config) {
  const cfg=config||{};
  const g=new THREE.Group();
  const style   = cfg.style||'traditional';
  const fuel    = cfg.fuel ||'gas';
  const fW      = cfg.widthFt||w;
  const fH      = cfg.heightFt||7;
  const fD      = d||1.5;
  const boxW    = fW*0.52;
  const boxH    = fH*0.48;
  const surrMat = makeFinishMaterial(cfg.surroundMaterial||'stone');
  const hearthM = makeFinishMaterial(cfg.hearthMaterial||'stone');

  // Hearth slab (extends in front)
  const hearth=new THREE.Mesh(new THREE.BoxGeometry(fW+0.6,0.16,fD+0.9),hearthM);
  hearth.position.set(0,0.08,0.45); hearth.castShadow=true; hearth.receiveShadow=true; g.add(hearth);

  // Left + right surround legs
  const legW=(fW-boxW)/2;
  [[-(boxW/2+legW/2)],[boxW/2+legW/2]].forEach(([lx])=>{
    const leg=new THREE.Mesh(new THREE.BoxGeometry(legW,fH,fD),surrMat);
    leg.position.set(lx,fH/2,0); leg.castShadow=true; leg.receiveShadow=true; g.add(leg);
  });
  // Header above opening
  const headH=fH-boxH;
  const head=new THREE.Mesh(new THREE.BoxGeometry(fW,headH,fD),surrMat);
  head.position.set(0,boxH+headH/2,0); head.castShadow=true; head.receiveShadow=true; g.add(head);

  // Firebox interior (dark)
  const boxMat=new THREE.MeshStandardMaterial({color:0x18140E,roughness:0.96});
  const box=new THREE.Mesh(new THREE.BoxGeometry(boxW-0.1,boxH-0.05,fD*0.55),boxMat);
  box.position.set(0,boxH/2,-fD/2+fD*0.55/2+0.05); g.add(box);

  // Ember glow
  if(fuel!=='electric'){
    const emberMat=new THREE.MeshStandardMaterial({color:0xFF3800,emissive:new THREE.Color(0xFF4500),emissiveIntensity:2.0,roughness:0.9});
    const embers=new THREE.Mesh(new THREE.BoxGeometry(boxW*0.58,0.1,fD*0.28),emberMat);
    embers.position.set(0,0.2,-fD/2+fD*0.55/2+0.05); g.add(embers);
    // Fake logs for wood
    if(fuel==='wood'){
      const logMat=new THREE.MeshStandardMaterial({map:woodTexture(0x4A2C0A),roughness:0.9});
      [-0.18,0,0.18].forEach(lx=>{
        const log=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.07,boxW*0.5,8),logMat);
        log.rotation.z=Math.PI/2; log.position.set(lx,0.15,-fD/2+fD*0.55/2+0.05); g.add(log);
      });
    }
    const glow=new THREE.PointLight(0xFF4400,1.8,6); glow.position.set(0,0.5,-fD/2+fD*0.3); g.add(glow);
  }

  // Mantle shelf
  if(cfg.mantleStyle!=='none'){
    const mantleMat = cfg.mantleStyle==='stone'?makeFinishMaterial('stone'):new THREE.MeshStandardMaterial({map:woodTexture(0x7A4F18),roughness:0.52});
    const mantle=new THREE.Mesh(new THREE.BoxGeometry(fW+0.35,0.2,fD+0.45),mantleMat);
    mantle.position.set(0,fH+0.1,0.22); mantle.castShadow=true; g.add(mantle);
    // Mantle corbels for traditional style
    if(style==='traditional'&&cfg.mantleStyle!=='stone'){
      [-fW/2+0.15,fW/2-0.15].forEach(mx=>{
        const cor=new THREE.Mesh(new THREE.BoxGeometry(0.18,fH*0.28,fD*0.38),mantleMat);
        cor.position.set(mx,boxH+fH*0.14,fD*0.18); g.add(cor);
      });
    }
  }

  // Chimney breast (projection above mantle)
  if(cfg.chimneyBreast!==false){
    const chW=fW*0.72, chH=Math.max(2, (cfg.roomHeightFt||9)-fH-0.2);
    const chMat=makeFinishMaterial(cfg.surroundMaterial||'stone');
    const chim=new THREE.Mesh(new THREE.BoxGeometry(chW,chH,fD*0.6),chMat);
    chim.position.set(0,fH+chH/2,0); chim.castShadow=true; g.add(chim);
  }

  // TV above fireplace (mounted above mantle)
  if(cfg.hasTV){
    const tvW=Math.min(fW-0.4, 5.5), tvH2=tvW*0.58;
    const tvMat=new THREE.MeshStandardMaterial({color:0x0A0A0A,roughness:0.12,metalness:0.65});
    const scrMat=new THREE.MeshStandardMaterial({color:0x18202C,roughness:0.02,emissive:0x0C1018,emissiveIntensity:0.4});
    const tvY=fH+0.25+tvH2/2;
    const tv=new THREE.Mesh(new THREE.BoxGeometry(tvW,tvH2,0.1),tvMat);
    tv.position.set(0,tvY,-fD/2+0.12); g.add(tv);
    const scr=new THREE.Mesh(new THREE.BoxGeometry(tvW-0.16,tvH2-0.16,0.05),scrMat);
    scr.position.set(0,tvY,-fD/2+0.14); g.add(scr);
  }
  return g;
}

function buildPool(w, d, _hex, config) {
  const cfg = config || {};
  const g = new THREE.Group();
  const finish = cfg.finish || 'pebble_blue';
  const waterColors = { white_plaster: 0x38C0D8, pebble_grey: 0x4AABB0, pebble_blue: 0x1E90D0, quartz: 0x28A8C8, tile_waterline: 0x1575B8 };
  const wColor = waterColors[finish] || 0x1E90D0;
  const basinColor = { white_plaster: 0xE8F8FA, pebble_grey: 0x607080, pebble_blue: 0x285878, quartz: 0xD8EEF4, tile_waterline: 0x1A4060 }[finish] || 0x285878;
  const deckW = cfg.deckWidthFt || 0;

  const deepH = cfg.deepDepthFt || 6;
  const basin = new THREE.Mesh(new THREE.BoxGeometry(w, deepH, d), new THREE.MeshStandardMaterial({ color: basinColor, roughness: 0.35 }));
  basin.position.y = -deepH/2; basin.receiveShadow = true; g.add(basin);

  const wt2 = waterTexture();
  const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.28, 0.07, d - 0.28), new THREE.MeshPhysicalMaterial({ map: wt2, color: new THREE.Color(wColor), transparent: true, opacity: 0.88, roughness: 0.02, metalness: 0, reflectivity: 1, envMapIntensity: 1.8 }));
  water.position.y = 0.04; g.add(water);

  const copColors = { travertine: 0xE8DCC8, bluestone: 0x8A9898, concrete: 0xC8C4BC, brick: 0xB86840 };
  const copColor = copColors[cfg.copingMaterial || 'travertine'] || 0xE8DCC8;
  const copW = (cfg.copingWidthIn || 12) / 12;
  const copMat2 = new THREE.MeshStandardMaterial({ map: concreteTexture(copColor), roughness: 0.55 });
  const copH = 0.22, copY = copH/2;
  [[0, copY, -(d/2+copW/2), w + copW*2, copH, copW], [0, copY, d/2+copW/2, w + copW*2, copH, copW],
   [-(w/2+copW/2), copY, 0, copW, copH, d], [w/2+copW/2, copY, 0, copW, copH, d]].forEach(([x, y, z, bw, bh, bd]) => {
    const cop = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), copMat2);
    cop.position.set(x, y, z); cop.receiveShadow = true; g.add(cop);
  });

  if (cfg.spa) {
    const sr = 4.0, spX = w/2 + sr + copW + 0.5;
    const spaShell = new THREE.Mesh(new THREE.CylinderGeometry(sr * 0.9, sr, 1.1, 20), new THREE.MeshStandardMaterial({ color: basinColor, roughness: 0.4 }));
    spaShell.position.set(spX, 0.55, 0); spaShell.castShadow = true; g.add(spaShell);
    const spaWater = new THREE.Mesh(new THREE.CylinderGeometry(sr * 0.82, sr * 0.82, 0.08, 20), new THREE.MeshStandardMaterial({ map: wt2, color: new THREE.Color(wColor), transparent: true, opacity: 0.9 }));
    spaWater.position.set(spX, 1.04, 0); g.add(spaWater);
    const spaCop = new THREE.Mesh(new THREE.TorusGeometry(sr * 0.95, copW * 0.4, 8, 24), copMat2);
    spaCop.rotation.x = Math.PI/2; spaCop.position.set(spX, copH, 0); g.add(spaCop);
  }
  if (cfg.sunShelf) {
    const ssh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 0.2, 5), new THREE.MeshStandardMaterial({ color: basinColor, roughness: 0.4 }));
    ssh.position.set(-w/4, -0.1, d/2 - 2.8); g.add(ssh);
  }
  if (cfg.waterfall) {
    const rockMat = new THREE.MeshStandardMaterial({ map: concreteTexture(0x6A6560), roughness: 0.95 });
    [[0, 2, -(d/2+1.2)], [-1.5, 1.5, -(d/2+0.8)], [1.5, 1.8, -(d/2+0.9)]].forEach(([rx, ry, rz]) => {
      const rock = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.4, 8, 6), rockMat);
      rock.position.set(rx, ry, rz); rock.castShadow = true; g.add(rock);
    });
  }
  if (deckW > 0) {
    const deckMat3 = new THREE.MeshStandardMaterial({ map: concreteTexture({ travertine: 0xE8DCC8, concrete: 0xC8C4BC, pavers: 0xB09880 }[cfg.deckMaterial] || 0xE8DCC8), roughness: 0.65 });
    const dOuter = w + copW*2 + deckW*2, dOuterD = d + copW*2 + deckW*2;
    const dInner = w + copW*2, dInnerD = d + copW*2;
    [[0, 0.08, -(dInnerD/2 + deckW/2), dOuter, 0.16, deckW],
     [0, 0.08,   dInnerD/2 + deckW/2,  dOuter, 0.16, deckW],
     [-(dInner/2 + deckW/2), 0.08, 0, deckW, 0.16, dInnerD],
     [  dInner/2 + deckW/2,  0.08, 0, deckW, 0.16, dInnerD]].forEach(([x, y, z, bw, bh, bd]) => {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), deckMat3);
      deck.position.set(x, y, z); deck.receiveShadow = true; g.add(deck);
    });
  }
  return g;
}

function buildSpa(_hex, config) {
  const cfg = config || {};
  const g = new THREE.Group();
  const finish2 = cfg.finish || 'pebble_grey';
  const shellColor = { pebble_grey: 0x607080, pebble_blue: 0x285878, white_plaster: 0xD8EEF4, quartz: 0xC8D8E0 }[finish2] || 0x607080;
  const shell2 = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.2, 1.1, 22), new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.35 }));
  shell2.position.y = 0.55; shell2.castShadow = true; g.add(shell2);
  const water2 = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 22), new THREE.MeshStandardMaterial({ map: waterTexture(), transparent: true, opacity: 0.9, roughness: 0.05 }));
  water2.position.y = 0.95; g.add(water2);
  const copMat3 = new THREE.MeshStandardMaterial({ map: concreteTexture(0xE8DCC8), roughness: 0.55 });
  const cop3 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.22, 8, 24), copMat3);
  cop3.rotation.x = Math.PI/2; cop3.position.y = 0.22; g.add(cop3);
  const stepMat = new THREE.MeshStandardMaterial({ map: concreteTexture(0xD8D0C0), roughness: 0.6 });
  [0.3, 0.6, 0.95].forEach((sh, i) => {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(4.3 - i * 0.4, 4.3 - i * 0.4, 0.22, 22, 1, false, 0, Math.PI), stepMat);
    step.position.set(0, sh, 0); step.rotation.y = Math.PI/2; g.add(step);
  });
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

function buildFirepit(_hex, config) {
  const cfg = config || {};
  const r   = (cfg.diameterFt || 4) / 2;
  const shape = cfg.shape || 'round';
  const matType2 = cfg.material || 'block';
  const matColor2 = { block: 0x8A7A6A, stone: 0x7A7068, concrete: 0xA0A098, metal: 0x555555 }[matType2] || 0x8A7A6A;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ map: concreteTexture(matColor2), roughness: 0.9 });
  if (shape === 'round') {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, 0.75, 20), bodyMat);
    stone.position.y = 0.375; stone.castShadow = true; g.add(stone);
    const inner2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r * 0.65, 0.28, 20), new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9 }));
    inner2.position.y = 0.84; g.add(inner2);
  } else {
    const sq = new THREE.Mesh(new THREE.BoxGeometry(r*2, 0.75, r*2), bodyMat);
    sq.position.y = 0.375; sq.castShadow = true; g.add(sq);
    const sqIn = new THREE.Mesh(new THREE.BoxGeometry(r*1.35, 0.28, r*1.35), new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9 }));
    sqIn.position.y = 0.84; g.add(sqIn);
  }
  const capMat4 = new THREE.MeshStandardMaterial({ map: concreteTexture({ bluestone: 0x6A7888, granite: 0x3A3838, travertine: 0xD8CCB8 }[cfg.capMaterial || 'bluestone'] || 0x6A7888), roughness: 0.45 });
  if (shape === 'round') {
    const cap4 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, 0.16, 6, 22), capMat4);
    cap4.rotation.x = Math.PI/2; cap4.position.y = 0.78; g.add(cap4);
  } else {
    [[0, 0, -(r+0.08), r*2+0.32, 0.12, 0.25], [0, 0, r+0.08, r*2+0.32, 0.12, 0.25],
     [-(r+0.08), 0, 0, 0.25, 0.12, r*2], [r+0.08, 0, 0, 0.25, 0.12, r*2]].forEach(([x, y, z, cw, ch, cd]) => {
      const cap5 = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), capMat4);
      cap5.position.set(x, 0.8, z); g.add(cap5);
    });
  }
  if (cfg.fuelType !== 'wood') {
    const burner = new THREE.Mesh(new THREE.TorusGeometry(r * 0.45, 0.06, 6, 18), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.2 }));
    burner.rotation.x = Math.PI/2; burner.position.y = 0.88; g.add(burner);
  }
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.75,1.6,8), new THREE.MeshStandardMaterial({ color:0xFF6F00, emissive:new THREE.Color(0xFF3D00), emissiveIntensity:2, transparent:true, opacity:0.85 }));
  f1.position.y=1.5; g.add(f1);
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.4,1.1,8), new THREE.MeshStandardMaterial({ color:0xFFCA28, emissive:new THREE.Color(0xFF6F00), emissiveIntensity:2.5, transparent:true, opacity:0.75 }));
  f2.position.y=2.0; g.add(f2);
  const ptLight = new THREE.PointLight(0xFF6600, 2, 15); ptLight.position.y=2; g.add(ptLight);
  return g;
}

function buildKitchen(w, d, hex, config) {
  const g        = new THREE.Group();
  const sections = config?.sections || [];
  const levels   = config?.levels   || 1;
  const ledge    = config?.ledge    || 'concrete';
  const baseH    = 3.0;      // 36" cabinet height
  const toeH     = 0.33;     // 4" toe kick
  const toeD     = 0.25;     // 3" toe kick setback

  // ── Materials ──────────────────────────────────────────────────────────────
  const cabinetColor  = hex || 0x9E7D52;
  const cabinetMat    = new THREE.MeshStandardMaterial({ map: woodTexture(cabinetColor), roughness: 0.75 });
  const toeMat        = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.8 });
  const panelMat      = new THREE.MeshStandardMaterial({ map: woodTexture(cabinetColor), roughness: 0.65 });
  const frameMat2     = new THREE.MeshStandardMaterial({ map: woodTexture(Math.max(0, cabinetColor - 0x151515)), roughness: 0.7 });
  const pullMat       = new THREE.MeshStandardMaterial({ color: 0xB8B8B8, metalness: 0.9, roughness: 0.08 });
  const stainlessMat  = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.12 });

  const LEDGE_CFG = {
    concrete:  { color: 0xE0DDD8, roughness: 0.12, metalness: 0.35 },
    granite:   { color: 0x282828, roughness: 0.04, metalness: 0.08 },
    quartzite: { color: 0xD6CBB8, roughness: 0.07, metalness: 0.04 },
    tile:      { color: 0xD8C9A8, roughness: 0.38, metalness: 0.0 },
    none:      null,
  };
  const lc = LEDGE_CFG[ledge] || LEDGE_CFG.concrete;

  // ── Body (main cabinet box, with toe-kick gap at bottom) ──────────────────
  const bodyH = baseH - toeH;
  const body  = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), cabinetMat);
  body.position.y = toeH + bodyH / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

  // Toe kick (recessed at front = +z side)
  const toe = new THREE.Mesh(new THREE.BoxGeometry(w, toeH, d - toeD), toeMat);
  toe.position.set(0, toeH / 2, -toeD / 2); g.add(toe);

  // ── Countertop with overhang toward front (+z) ───────────────────────────
  if (lc) {
    const ctW = w + 0.2;  const ctD = d + 0.3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(ctW, 0.2, ctD), new THREE.MeshStandardMaterial(lc));
    top.position.set(0, baseH + 0.1, -0.05); top.castShadow = true; g.add(top);
    // Front edge trim
    const edgeMat2 = new THREE.MeshStandardMaterial({ ...lc, roughness: Math.max(0, (lc.roughness || 0) - 0.02) });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(ctW, 0.22, 0.06), edgeMat2);
    edge.position.set(0, baseH + 0.09, ctD / 2 + 0.03); g.add(edge);
  }

  // ── Front face: sections (front = +z face) ────────────────────────────────
  const addRaisedPanel = (pcx, pcy, pw, ph, pfz) => {
    // outer panel face
    const outer = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.06, ph - 0.06, 0.075), panelMat);
    outer.position.set(pcx, pcy, pfz); g.add(outer);
    // inner raised inset (slightly recessed effect)
    const inset = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.22, ph - 0.22, 0.06), frameMat2);
    inset.position.set(pcx, pcy, pfz - 0.01); g.add(inset);
  };

  if (sections.length > 0) {
    const totalIn = sections.reduce((s, sec) => s + (sec.widthIn || 24), 0) || 1;
    let xCursor   = -w / 2;
    const fz      = d / 2 + 0.04;  // front face toward camera (+z)

    sections.forEach(sec => {
      const sw  = ((sec.widthIn || 24) / totalIn) * w;
      const cx  = xCursor + sw / 2;

      switch (sec.type) {
        case 'drawer': {
          const cnt = Math.max(1, sec.drawerCount || 3);
          const dh  = (baseH - toeH - 0.12) / cnt;
          for (let di = 0; di < cnt; di++) {
            const py = toeH + 0.06 + dh * (di + 0.5);
            addRaisedPanel(cx, py, sw, dh, fz);
            // Bar pull centered
            const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, sw * 0.42, 8), pullMat);
            pull.rotation.z = Math.PI / 2;
            pull.position.set(cx, py, fz - 0.08); g.add(pull);
            // Pull end caps
            [-sw * 0.21, sw * 0.21].forEach(px => {
              const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 8), pullMat);
              cap.rotation.x = Math.PI / 2; cap.position.set(cx + px, py, fz - 0.07); g.add(cap);
            });
          }
          break;
        }
        case 'door': {
          const cnt = Math.max(1, sec.doorCount || 1);
          const dw2 = (sw - 0.1) / cnt;
          const doorH = baseH - toeH - 0.1;
          for (let di = 0; di < cnt; di++) {
            const dcx = cx - (sw - 0.1) / 2 + dw2 * (di + 0.5);
            const dcy = toeH + 0.05 + doorH / 2;
            addRaisedPanel(dcx, dcy, dw2, doorH, fz);
            // Vertical bar pull
            const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, doorH * 0.32, 8), pullMat);
            pull.position.set(dcx + dw2 * 0.36, dcy, fz - 0.08); g.add(pull);
            [-doorH * 0.16, doorH * 0.16].forEach(py => {
              const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 8), pullMat);
              cap.rotation.x = Math.PI / 2; cap.position.set(dcx + dw2 * 0.36, dcy + py, fz - 0.07); g.add(cap);
            });
          }
          break;
        }
        case 'appliance': {
          const app = sec.applianceType || 'grill_30';
          if (app === 'big_green_egg' || app === 'kamado_lg') {
            const diam = (app === 'big_green_egg' ? 20 : 24) / 12;
            const r    = diam / 2;
            // Lower body (wider at base)
            const botMat = new THREE.MeshStandardMaterial({ color: 0x1C1C1C, roughness: 0.45, metalness: 0.25 });
            const botBody = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 1.2, 20), botMat);
            botBody.position.set(cx, baseH + 0.6, 0); g.add(botBody);
            // Hinge band
            const bandMat2 = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.85, roughness: 0.15 });
            const band1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.87, r * 0.87, 0.12, 20), bandMat2);
            band1.position.set(cx, baseH + 1.18, 0); g.add(band1);
            // Lid dome
            const lidMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.35, metalness: 0.2 });
            const lid2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), lidMat);
            lid2.position.set(cx, baseH + 1.18, 0); g.add(lid2);
            // Top cap
            const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 10), bandMat2);
            cap2.position.set(cx, baseH + 1.18 + r * 0.75, 0); g.add(cap2);
            // Logo ring
            const logoBand = new THREE.Mesh(new THREE.TorusGeometry(r * 0.3, 0.03, 6, 18), bandMat2);
            logoBand.rotation.x = Math.PI / 2; logoBand.position.set(cx, baseH + 1.18 + r * 0.5, 0); g.add(logoBand);
          } else if (app === 'pizza_oven') {
            const pw = (sec.applianceWidthIn || 24) / 12;
            const pd = Math.min(d - 0.25, (sec.applianceDepthIn || 24) / 12);
            const stoneMat = new THREE.MeshStandardMaterial({ map: concreteTexture(0x7D6050), roughness: 0.95 });
            const ovenBase2 = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.65, pd), stoneMat);
            ovenBase2.position.set(cx, baseH + 0.42, 0); g.add(ovenBase2);
            const domeMat = new THREE.MeshStandardMaterial({ color: 0x6B4E3D, roughness: 0.9 });
            const dome = new THREE.Mesh(new THREE.SphereGeometry(pw * 0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
            dome.position.set(cx, baseH + 0.65, 0); g.add(dome);
            // Opening arch
            const archMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
            const arch = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.4, pw * 0.3, 0.12), archMat);
            arch.position.set(cx, baseH + 0.5, pd / 2 + 0.06); g.add(arch);
          } else if (app === 'fridge_15' || app === 'fridge_24' || app === 'ice_maker') {
            const fw = (sec.applianceWidthIn || (app === 'fridge_24' ? 24 : 15)) / 12;
            const fh = app === 'ice_maker' ? 2.6 : 2.9;
            // Main stainless body
            const fridgeMat = new THREE.MeshStandardMaterial({ color: 0xC8C8C8, roughness: 0.18, metalness: 0.55 });
            const fridge = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.04, fh, d * 0.9), fridgeMat);
            fridge.position.set(cx, fh / 2, 0); g.add(fridge);
            // Door seam
            const seamMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2, metalness: 0.5 });
            const seam = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.06, 0.03, 0.04), seamMat);
            seam.position.set(cx, fh * 0.55, d * 0.45 + 0.02); g.add(seam);
            // Handle
            const hdl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, fh * 0.38, 8), pullMat);
            hdl.position.set(cx + fw * 0.38, fh * 0.55, d * 0.45 + 0.08); g.add(hdl);
            [-fh * 0.19, fh * 0.19].forEach(py => {
              const cap3 = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 8), pullMat);
              cap3.rotation.x = Math.PI / 2; cap3.position.set(cx + fw * 0.38, fh * 0.55 + py, d * 0.45 + 0.07); g.add(cap3);
            });
          } else if (app === 'trash_pullout') {
            const tw = (sec.applianceWidthIn || 15) / 12;
            addRaisedPanel(cx, toeH + 0.05 + (baseH - toeH - 0.1) / 2, tw, baseH - toeH - 0.1, fz);
            const tPull = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, tw * 0.38, 8), pullMat);
            tPull.rotation.z = Math.PI / 2; tPull.position.set(cx, toeH + 0.05 + (baseH - toeH) / 2, fz - 0.08); g.add(tPull);
          } else {
            // Gas grill: stainless hood with wedge shape, knobs, handle bar
            const gw = (sec.applianceWidthIn || 30) / 12;
            const gd = Math.min(d - 0.18, (sec.applianceDepthIn || 20) / 12);
            const grillMat2 = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.15, metalness: 0.85 });
            const lidTop = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.28, gd * 0.9), grillMat2);
            lidTop.position.set(cx, baseH + 0.3, 0); g.add(lidTop);
            // Wedge back rise (hood)
            const hoodMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.12, metalness: 0.9 });
            const hood = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.22, gd * 0.35), hoodMat);
            hood.position.set(cx, baseH + 0.52, -gd * 0.25); g.add(hood);
            // Front panel
            const frontP = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.35, 0.06), stainlessMat);
            frontP.position.set(cx, baseH + 0.11, gd / 2 + 0.03); g.add(frontP);
            // Knobs along front
            const knobCount = Math.max(2, Math.round(gw * 1.5));
            const knobMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.5 });
            for (let k = 0; k < knobCount; k++) {
              const kx = cx - gw / 2 + (k + 0.5) * (gw / knobCount);
              const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.1, 10), knobMat);
              knob.position.set(kx, baseH + 0.15, gd / 2 + 0.06); g.add(knob);
            }
            // Handle bar
            const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, gw * 0.88, 8), stainlessMat);
            hBar.rotation.z = Math.PI / 2; hBar.position.set(cx, baseH + 0.28, gd / 2 + 0.09); g.add(hBar);
            // Grates (run front-to-back)
            const grateMat = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.5, metalness: 0.5 });
            for (let gi = 0; gi < 6; gi++) {
              const gr = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.9, 0.03, 0.04), grateMat);
              gr.position.set(cx, baseH + 0.06, gd / 2 - 0.04 - gi * ((gd * 0.85) / 5)); g.add(gr);
            }
          }
          break;
        }
        case 'sink': {
          const sw2  = Math.min(sw - 0.18, (sec.applianceWidthIn || 21) / 12);
          const sd2  = Math.min(d - 0.22, 1.3);
          // Under-mount look: countertop cut-out filled with basin
          const rimMat2 = new THREE.MeshStandardMaterial({ color: 0xA8A8A8, metalness: 0.65, roughness: 0.12 });
          const rim = new THREE.Mesh(new THREE.BoxGeometry(sw2, 0.09, sd2), rimMat2);
          rim.position.set(cx, baseH + 0.12, 0); g.add(rim);
          const basinMat = new THREE.MeshStandardMaterial({ color: 0x7A7A7A, metalness: 0.5, roughness: 0.28 });
          const basin = new THREE.Mesh(new THREE.BoxGeometry(sw2 - 0.12, 0.07, sd2 - 0.12), basinMat);
          basin.position.set(cx, baseH + 0.065, 0); g.add(basin);
          // Faucet: base + arc + spout
          const fMat = new THREE.MeshStandardMaterial({ color: 0xD4D4D4, metalness: 0.92, roughness: 0.04 });
          const fBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 10), fMat);
          fBase.position.set(cx, baseH + 0.32, -sd2 * 0.2); g.add(fBase);
          const fNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 8), fMat);
          fNeck.rotation.x = -Math.PI / 3; fNeck.position.set(cx, baseH + 0.56, 0); g.add(fNeck);
          const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), fMat);
          spout.rotation.x = Math.PI / 2; spout.position.set(cx, baseH + 0.6, 0.1); g.add(spout);
          break;
        }
        case 'open': {
          const postMat = new THREE.MeshStandardMaterial({ map: woodTexture(Math.max(0, cabinetColor + 0x0A0A08)), roughness: 0.65 });
          [-sw / 2 + 0.05, sw / 2 - 0.05].forEach(px => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, baseH - toeH, 0.07), postMat);
            post.position.set(cx + px, toeH + (baseH - toeH) / 2, d / 2 - 0.04); g.add(post);
          });
          // Two shelves
          [0.35, 0.65].forEach(frac => {
            const shelf = new THREE.Mesh(new THREE.BoxGeometry(sw - 0.12, 0.06, d * 0.38), postMat);
            shelf.position.set(cx, toeH + (baseH - toeH) * frac, -d / 2 + d * 0.2); g.add(shelf);
          });
          break;
        }
        // 'filler' — covered by cabinet body
      }
      xCursor += sw;
    });
  } else {
    // Default: built-in grill look
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.15, metalness: 0.85 });
    const lid4 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.3, d * 0.75), grillMat);
    lid4.position.set(0, baseH + 0.28, 0); g.add(lid4);
    const grateMat2 = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.5, metalness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const gr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, 0.03, 0.04), grateMat2);
      gr.position.set(0, baseH + 0.06, -d * 0.35 + i * (d * 0.65 / 5)); g.add(gr);
    }
    const hBar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w * 0.75, 8), stainlessMat);
    hBar2.rotation.z = Math.PI / 2; hBar2.position.set(0, baseH + 0.28, d / 2 + 0.08); g.add(hBar2);
    const knobMat2 = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.5 });
    const kc2 = Math.max(2, Math.round(w * 1.5));
    for (let k = 0; k < kc2; k++) {
      const kx = -w / 2 + (k + 0.5) * (w / kc2);
      const kn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.1, 10), knobMat2);
      kn2.position.set(kx, baseH + 0.15, d / 2 + 0.06); g.add(kn2);
    }
  }

  // ── Two-level bar ──────────────────────────────────────────────────────────
  if (levels === 2) {
    const barH  = (config?.barHeightIn || 42) / 12;
    const barD  = (config?.barDepthIn  || 14) / 12;
    const barBodyMat = new THREE.MeshStandardMaterial({ map: woodTexture(Math.max(0, cabinetColor - 0x111010)), roughness: 0.68 });
    const barBody = new THREE.Mesh(new THREE.BoxGeometry(w, barH - baseH, barD), barBodyMat);
    barBody.position.set(0, baseH + (barH - baseH) / 2, d / 2 - barD / 2);
    barBody.castShadow = true; g.add(barBody);
    if (lc) {
      const barTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.2, barD + 0.3), new THREE.MeshStandardMaterial(lc));
      barTop.position.set(0, barH + 0.1, d / 2 - barD / 2);
      barTop.castShadow = true; g.add(barTop);
      // Edge trim (front face toward camera)
      const edgeTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.32, 0.22, 0.06), new THREE.MeshStandardMaterial(lc));
      edgeTrim.position.set(0, barH + 0.09, d / 2 + 0.03); g.add(edgeTrim);
    }
    // Bar stools (in front of bar)
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0x4A3828, roughness: 0.75 });
    const seatMat  = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.6, metalness: 0.3 });
    const numStools = Math.max(1, Math.floor(w / 2.2));
    for (let s = 0; s < numStools; s++) {
      const sx = -w / 2 + (s + 0.5) * (w / numStools);
      const sz = d / 2 + 1.2;
      const stH = barH - 1.2;
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.09, 10), seatMat);
      seat.position.set(sx, barH - 0.02, sz); g.add(seat);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, stH, 6), stoolMat);
      leg.position.set(sx, stH / 2, sz); g.add(leg);
      // Footrest ring
      const foot = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 5, 14), stoolMat);
      foot.rotation.x = Math.PI / 2; foot.position.set(sx, stH * 0.35, sz); g.add(foot);
    }
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

// ─── House geometry helpers ─────────────────────────────────────────────────
function gableRoofGeo(w, d, ridgeH) {
  const positions = new Float32Array([
    // Front gable
    -w/2,0,-d/2,  w/2,0,-d/2,  0,ridgeH,-d/2,
    // Back gable
     w/2,0, d/2, -w/2,0, d/2,  0,ridgeH, d/2,
    // Left slope
    -w/2,0,-d/2,  0,ridgeH,-d/2,  0,ridgeH,d/2,
    -w/2,0,-d/2,  0,ridgeH, d/2, -w/2,0,  d/2,
    // Right slope
     w/2,0,-d/2,  w/2,0,  d/2,  0,ridgeH, d/2,
     w/2,0,-d/2,  0,ridgeH, d/2,  0,ridgeH,-d/2,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function addMesh(g, geo, mat, x=0, y=0, z=0, rx=0, ry=0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.x=rx; m.rotation.y=ry;
  m.castShadow=true; m.receiveShadow=true; g.add(m); return m;
}

function buildHouseRanch(w, d, hex) {
  const g = new THREE.Group();
  const wallH=9, eave=1.5, pitch=0.32;
  const rW=w+eave*2, rD=d+eave*2, ridgeH=rW/2*pitch;

  const wallMat  = new THREE.MeshStandardMaterial({color:hex, roughness:0.85});
  const roofMat  = new THREE.MeshStandardMaterial({color:0x2A1710, roughness:0.95});
  const foundMat = new THREE.MeshStandardMaterial({color:0x9A8878, roughness:0.9});
  const trimMat  = new THREE.MeshStandardMaterial({color:0xFFFFFF, roughness:0.7});
  const winMat   = new THREE.MeshStandardMaterial({color:0x9EC9E0,transparent:true,opacity:0.55,roughness:0.1,metalness:0.15});
  const doorMat  = new THREE.MeshStandardMaterial({color:0x5C3317, roughness:0.8});
  const brickMat = new THREE.MeshStandardMaterial({color:0x8B5E52, roughness:0.92});
  const concMat  = new THREE.MeshStandardMaterial({color:0xAAAAAA, roughness:0.85});

  // Foundation
  addMesh(g, new THREE.BoxGeometry(w+0.6,1.8,d+0.6), foundMat, 0,0.9,0);
  // Main body
  addMesh(g, new THREE.BoxGeometry(w,wallH,d), wallMat, 0,wallH/2+1.8,0);
  // Gable roof with eaves
  const roofMesh = new THREE.Mesh(gableRoofGeo(rW,rD,ridgeH), roofMat);
  roofMesh.position.set(0,wallH+1.8,0); roofMesh.castShadow=true; g.add(roofMesh);

  // Front windows × 2
  const winH=3.5, winW=4;
  [-w/4, w/4].forEach(wx=>{
    addMesh(g, new THREE.BoxGeometry(winW+0.3,winH+0.3,0.12), trimMat, wx, wallH*0.55+1.8, -d/2-0.05);
    addMesh(g, new THREE.BoxGeometry(winW,winH,0.14), winMat, wx, wallH*0.55+1.8, -d/2-0.07);
  });
  // Side windows
  [-d/4, d/4].forEach(wz=>{
    addMesh(g, new THREE.BoxGeometry(0.12,winH+0.3,winW+0.3), trimMat, -w/2-0.05, wallH*0.5+1.8, wz);
    addMesh(g, new THREE.BoxGeometry(0.14,winH,winW), winMat, -w/2-0.07, wallH*0.5+1.8, wz);
  });
  // Front door
  addMesh(g, new THREE.BoxGeometry(3.8,7.2,0.12), trimMat, 0, 5.4+1.8, -d/2-0.05);
  addMesh(g, new THREE.BoxGeometry(3.2,7,0.14), doorMat, 0, 5.1+1.8, -d/2-0.07);
  // Porch overhang over door
  addMesh(g, new THREE.BoxGeometry(7,0.3,4), concMat, 0, 9+1.8, -d/2-2);
  addMesh(g, new THREE.CylinderGeometry(0.2,0.2,8,8), trimMat, -3, 5+1.8, -d/2-3.8);
  addMesh(g, new THREE.CylinderGeometry(0.2,0.2,8,8), trimMat,  3, 5+1.8, -d/2-3.8);

  // Chimney
  const chim=new THREE.Mesh(new THREE.BoxGeometry(2.5,wallH+ridgeH*0.8+2,2.5),brickMat);
  chim.position.set(w/4, (wallH+ridgeH*0.8)/2+1.8, 0); chim.castShadow=true; g.add(chim);

  // Attached garage (right side)
  const gW=Math.min(24,w*0.55), gH=8, gD=Math.min(22,d*0.85);
  addMesh(g, new THREE.BoxGeometry(gW+0.6,1.8,gD+0.6), foundMat, w/2+gW/2, 0.9, 0);
  addMesh(g, new THREE.BoxGeometry(gW,gH,gD), wallMat, w/2+gW/2, gH/2+1.8, 0);
  const gRoof=new THREE.Mesh(gableRoofGeo(gW+eave,gD+eave,ridgeH*0.65),roofMat);
  gRoof.position.set(w/2+gW/2,gH+1.8,0); gRoof.castShadow=true; g.add(gRoof);
  // Garage door
  addMesh(g, new THREE.BoxGeometry(gW-2,7,0.15), new THREE.MeshStandardMaterial({color:0x888888,roughness:0.6}), w/2+gW/2, 5+1.8, -(gD/2)-0.01);

  // Driveway
  addMesh(g, new THREE.BoxGeometry(gW,0.15,20), concMat, w/2+gW/2, 1.8+0.08, -gD/2-10);

  return g;
}

function buildHouseColonial(w, d, hex) {
  const g = new THREE.Group();
  const wallH=18, eave=1.5, pitch=0.4;
  const rW=w+eave*2, rD=d+eave*2, ridgeH=rW/2*pitch;

  const wallMat  = new THREE.MeshStandardMaterial({color:hex, roughness:0.82});
  const roofMat  = new THREE.MeshStandardMaterial({color:0x1A0F0A, roughness:0.95});
  const foundMat = new THREE.MeshStandardMaterial({color:0x9A8878, roughness:0.9});
  const trimMat  = new THREE.MeshStandardMaterial({color:0xFFFFFF, roughness:0.7});
  const winMat   = new THREE.MeshStandardMaterial({color:0xA8CCE0,transparent:true,opacity:0.55,roughness:0.08,metalness:0.15});
  const doorMat  = new THREE.MeshStandardMaterial({color:0x1A1A1A, roughness:0.75});
  const shutMat  = new THREE.MeshStandardMaterial({color:0x2E5E38, roughness:0.8});
  const brickMat = new THREE.MeshStandardMaterial({color:0x7A4A3A, roughness:0.92});

  addMesh(g, new THREE.BoxGeometry(w+0.6,1.8,d+0.6), foundMat, 0,0.9,0);
  addMesh(g, new THREE.BoxGeometry(w,wallH,d), wallMat, 0,wallH/2+1.8,0);
  // Mid-floor trim band
  addMesh(g, new THREE.BoxGeometry(w+0.15,0.4,d+0.15), trimMat, 0,9.2+1.8,0);
  // Gable roof
  const rm=new THREE.Mesh(gableRoofGeo(rW,rD,ridgeH),roofMat);
  rm.position.set(0,wallH+1.8,0); rm.castShadow=true; g.add(rm);

  // Symmetrical windows — ground & 2nd floor, 3 columns each side of door
  const cols=[-w/2+6,-w/4,w/4,w/2-6];
  [4.5,13.5].forEach(wy=>{
    cols.forEach(wx=>{
      addMesh(g,new THREE.BoxGeometry(3.2+0.4,4+0.4,0.12),trimMat,wx,wy+1.8,-d/2-0.05);
      addMesh(g,new THREE.BoxGeometry(3.2,4,0.14),winMat,wx,wy+1.8,-d/2-0.07);
      // Shutters
      addMesh(g,new THREE.BoxGeometry(1.2,4,0.12),shutMat,wx-2.2,wy+1.8,-d/2-0.06);
      addMesh(g,new THREE.BoxGeometry(1.2,4,0.12),shutMat,wx+2.2,wy+1.8,-d/2-0.06);
    });
  });
  // Grand front door with transom
  addMesh(g,new THREE.BoxGeometry(4,8.5,0.12),trimMat,0,4.5+1.8,-d/2-0.05);
  addMesh(g,new THREE.BoxGeometry(3.4,7.5,0.14),doorMat,0,4.5+1.8,-d/2-0.07);
  addMesh(g,new THREE.BoxGeometry(3.4,1.5,0.14),winMat,0,9+1.8,-d/2-0.07);
  // Portico columns
  [-3.5,-1.2,1.2,3.5].forEach(cx=>{
    addMesh(g,new THREE.CylinderGeometry(0.28,0.32,10,12),trimMat,cx,6+1.8,-d/2-2.5);
  });
  addMesh(g,new THREE.BoxGeometry(10,0.35,3.5),trimMat,0,11.5+1.8,-d/2-2.5);
  // Chimney (two chimneys for colonial)
  [-w/3,w/3].forEach(cx=>{
    const chim=new THREE.Mesh(new THREE.BoxGeometry(2.5,wallH+ridgeH+2,2.5),brickMat);
    chim.position.set(cx,(wallH+ridgeH)/2+1.8,0); chim.castShadow=true; g.add(chim);
  });
  return g;
}

function buildHouseModern(w, d, hex) {
  const g = new THREE.Group();
  const wallH=11, wallH2=9;

  const wallMat  = new THREE.MeshStandardMaterial({color:hex, roughness:0.7, metalness:0.05});
  const concMat  = new THREE.MeshStandardMaterial({color:0xC8C4BE, roughness:0.88});
  const foundMat = new THREE.MeshStandardMaterial({color:0x888888, roughness:0.9});
  const winMat   = new THREE.MeshStandardMaterial({color:0x8EC4D8,transparent:true,opacity:0.5,roughness:0.05,metalness:0.3});
  const frameMat = new THREE.MeshStandardMaterial({color:0x222222, roughness:0.4, metalness:0.8});
  const darkMat  = new THREE.MeshStandardMaterial({color:0x222222, roughness:0.7});

  // Main volume (2 offset boxes for split-level look)
  addMesh(g, new THREE.BoxGeometry(w+0.6,1.8,d+0.6), foundMat, 0,0.9,0);
  addMesh(g, new THREE.BoxGeometry(w,wallH,d*0.6), wallMat, 0,wallH/2+1.8,-d*0.2);
  addMesh(g, new THREE.BoxGeometry(w*0.55,wallH2,d*0.4), concMat, -w*0.225,wallH2/2+1.8, d*0.3);
  // Flat roofs with thin parapet
  addMesh(g, new THREE.BoxGeometry(w+0.4,0.5,d*0.6+0.4), darkMat, 0,wallH+1.8+0.25,-d*0.2);
  addMesh(g, new THREE.BoxGeometry(w*0.55+0.4,0.5,d*0.4+0.4), darkMat, -w*0.225,wallH2+1.8+0.25,d*0.3);

  // Picture windows (large, floor-to-ceiling)
  const pW=w*0.35, pH=wallH-1.5;
  addMesh(g,new THREE.BoxGeometry(0.08,pH+0.2,0.08),frameMat, pW/2,pH/2+2.6,-d*0.5-0.06);
  addMesh(g,new THREE.BoxGeometry(0.08,pH+0.2,0.08),frameMat,-pW/2,pH/2+2.6,-d*0.5-0.06);
  addMesh(g,new THREE.BoxGeometry(pW,pH,0.14),winMat,0,pH/2+2.6,-d*0.5-0.07);
  // Horizontal window strip on 2nd volume
  addMesh(g,new THREE.BoxGeometry(w*0.5,2.5,0.14),winMat,-w*0.225,wallH2*0.65+1.8,-d*0.1-0.07);
  addMesh(g,new THREE.BoxGeometry(w*0.5+0.2,2.7,0.08),frameMat,-w*0.225,wallH2*0.65+1.8,-d*0.1-0.06);

  // Cantilevered carport
  addMesh(g,new THREE.BoxGeometry(0.25,wallH-1,0.25),frameMat,w/2-2,  (wallH-1)/2+1.8,-d*0.2);
  addMesh(g,new THREE.BoxGeometry(0.25,wallH-1,0.25),frameMat,w/2+8,  (wallH-1)/2+1.8,-d*0.2);
  addMesh(g,new THREE.BoxGeometry(12,0.3,d*0.5),darkMat,w/2+4,wallH+1.8,-d*0.2);

  // Front entry recess + door
  addMesh(g,new THREE.BoxGeometry(5,wallH*0.65,1),darkMat,0,wallH*0.65*0.5+1.8,-d*0.5-0.5);
  addMesh(g,new THREE.BoxGeometry(3,8,0.15),frameMat,0,5+1.8,-d*0.5-0.07);

  // Driveway
  addMesh(g,new THREE.BoxGeometry(14,0.15,24),new THREE.MeshStandardMaterial({color:0x999999,roughness:0.85}),w/2+4,1.81,-d*0.2-14);

  return g;
}

function buildStructureGroup(el) {
  const cfg = ITEM_MAP[el.type] || {};
  const w   = el.w ?? cfg.w ?? 10;
  const d   = el.d ?? cfg.d ?? 10;
  const hex = typeof el.color==="number" ? el.color : (parseInt((el.color||"888888").replace("#",""),16)||0x888888);

  const bc = el.buildConfig || {};
  let mg;
  switch(el.type) {
    case "pergola":        mg = buildPergola(w,d,hex,bc); break;
    case "patio_cover":    mg = buildPatioCover(w,d,hex,bc); break;
    case "cabana":         mg = buildPatioCover(w,d,hex,bc); break;
    case "sunroom":        mg = buildSunroom(w,d,hex,bc); break;
    case "pool_rect":
    case "pool_freeform":  mg = buildPool(w,d,hex,bc); break;
    case "spa":            mg = buildSpa(hex,bc); break;
    case "tree_palm":
    case "tree_shade":     mg = buildTree(el.type,hex); break;
    case "firepit":
    case "fire_table":     mg = buildFirepit(hex,bc); break;
    case "kitchen_island":
    case "bbq_grill":
    case "outdoor_bar":    mg = buildKitchen(w,d,hex,el.kitchenConfig); break;
    case "patio":
    case "pavers":
    case "driveway":
    case "lawn":
    case "putting_green":
    case "golf_green":
    case "bocce_court":    mg = buildPatio(w,d,hex); break;
    case "room":
    case "house_ranch":
    case "house_colonial":
    case "house_modern":
    case "garage":         mg = buildRoom(w,d,hex,bc); break;
    case "fireplace":      mg = buildFireplace(w,d,hex,bc); break;
    default:               mg = buildGeneric(el.type,w,d,hex);
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
  const [expanded, setExpanded] = useState({});

  const allItems = elements.map(el => ({ el, lineItems: getLineItems(el) }));
  const grandTotal = allItems.reduce((s, { lineItems }) => s + lineItems.reduce((a, i) => a + i.total, 0), 0);
  const matTotal   = allItems.reduce((s, { lineItems }) => s + lineItems.filter(i => i.category === 'material').reduce((a, i) => a + i.total, 0), 0);
  const labTotal   = allItems.reduce((s, { lineItems }) => s + lineItems.filter(i => i.category === 'labor').reduce((a, i) => a + i.total, 0), 0);
  const perTotal   = allItems.reduce((s, { lineItems }) => s + lineItems.filter(i => i.category === 'permit').reduce((a, i) => a + i.total, 0), 0);

  const createEstimate = async () => {
    setCreating(true);
    try {
      const est = await base44.entities.Estimate.create({
        title: designTitle ? `${designTitle} — Estimate` : "Design Estimate",
        client_name: clientName || "",
        status: "draft",
        notes: `Auto-generated from Design: ${designTitle || designId}`,
      });
      for (const { el, lineItems } of allItems) {
        for (const li of lineItems) {
          if (!li.total) continue;
          await base44.entities.LineItem.create({
            estimate_id: est.id,
            description: `${el.label} — ${li.description}`,
            quantity: li.qty,
            unit: li.unit,
            unit_price: li.unitPrice || 0,
            amount: li.total,
            category: li.category,
          }).catch(() => {});
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
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Detailed Estimate</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {allItems.length === 0 && (
          <p className="text-xs text-slate-500 p-2 text-center">Add elements to see line-item costs</p>
        )}
        {allItems.map(({ el, lineItems }) => {
          const elTotal = lineItems.reduce((s, i) => s + i.total, 0);
          const isOpen = expanded[el.id];
          return (
            <div key={el.id} className="rounded-lg bg-slate-800 overflow-hidden border border-slate-700">
              <button className="flex items-center justify-between w-full px-2.5 py-2 text-left"
                onClick={() => setExpanded(p => ({ ...p, [el.id]: !p[el.id] }))}>
                <span className="text-[10px] font-semibold text-slate-300 truncate flex-1">{el.label}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold text-amber-400">${elTotal.toLocaleString()}</span>
                  <ChevronDown className={cn("w-3 h-3 text-slate-500 transition-transform", isOpen && "rotate-180")}/>
                </div>
              </button>
              {isOpen && (
                <div className="px-2.5 pb-2 space-y-0.5 border-t border-slate-700 pt-1.5">
                  {lineItems.filter(i => i.total > 0).map((li, idx) => (
                    <div key={idx} className="flex items-baseline gap-1">
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-0.5", li.category === 'labor' ? 'bg-blue-500' : li.category === 'permit' ? 'bg-purple-500' : 'bg-amber-500')}/>
                      <span className="text-[9px] text-slate-400 flex-1 truncate">{li.description}</span>
                      <span className="text-[9px] text-slate-500 shrink-0">{li.qty} {li.unit}</span>
                      <span className="text-[9px] font-semibold text-slate-300 w-14 text-right shrink-0">${li.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="p-3 border-t border-slate-700 space-y-2">
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px]"><span className="text-slate-500">● Materials</span><span className="text-slate-300">${matTotal.toLocaleString()}</span></div>
          <div className="flex justify-between text-[10px]"><span className="text-blue-400">● Labor</span><span className="text-slate-300">${labTotal.toLocaleString()}</span></div>
          {perTotal > 0 && <div className="flex justify-between text-[10px]"><span className="text-purple-400">● Permits</span><span className="text-slate-300">${perTotal.toLocaleString()}</span></div>}
          <div className="flex justify-between text-sm font-bold border-t border-slate-600 pt-1.5 mt-1"><span className="text-white">Project Total</span><span className="text-amber-400">${grandTotal.toLocaleString()}</span></div>
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
  const isKitchen = KITCHEN_ELEMENT_TYPES.has(el.type);
  const HAS_DEDICATED_PANEL = new Set(['pergola','pool_rect','pool_freeform','patio_cover','cabana','sunroom','patio','pavers','driveway','firepit','fire_table','retaining_wall','lawn','room','garage','house_ranch','house_colonial','house_modern','fireplace']);
  const hasDedicatedPanel = isKitchen || HAS_DEDICATED_PANEL.has(el.type);

  return (
    <div className="flex-1 overflow-y-auto pb-4 space-y-3">
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{el.label}</p>
        <div>
          <Label className="text-[10px] text-slate-400 mb-1 block">Label</Label>
          <Input value={el.label} onChange={e=>onUpdate(el.id,{label:e.target.value})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" />
        </div>
        {/* For kitchen elements: width is controlled by section builder, show read-only total */}
        {isKitchen ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-slate-400 mb-1 block">Total Width</Label>
              <div className="h-7 px-2 flex items-center text-xs bg-slate-900 border border-slate-700 rounded text-amber-300 font-bold">
                {fmtIn((el.w ?? cfg.w ?? 10) * 12)}
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-slate-400 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={1.5} max={6} step={0.5} value={el.d??cfg.d??4}
                onChange={e=>onUpdate(el.id,{d:Number(e.target.value)})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px] text-slate-400 mb-1 block">Width (ft)</Label>
              <Input type="number" min={1} value={el.w??cfg.w??10} onChange={e=>onUpdate(el.id,{w:Number(e.target.value)})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" /></div>
            <div><Label className="text-[10px] text-slate-400 mb-1 block">Depth (ft)</Label>
              <Input type="number" min={1} value={el.d??cfg.d??10} onChange={e=>onUpdate(el.id,{d:Number(e.target.value)})} className="h-7 text-xs bg-slate-800 border-slate-600 text-white" /></div>
          </div>
        )}
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
        {!isKitchen && (
          <div>
            <Label className="text-[10px] text-slate-400 mb-1 block">Color</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={hexStr} onChange={e=>onUpdate(el.id,{color:parseInt(e.target.value.replace("#",""),16)})} className="w-8 h-7 rounded cursor-pointer border border-slate-600 bg-slate-800" />
              <span className="text-[10px] text-slate-400 font-mono">{hexStr.toUpperCase()}</span>
            </div>
          </div>
        )}
        {/* Quick cost summary — only for types without a dedicated panel */}
        {!hasDedicatedPanel && (() => {
          const items2 = getLineItems(el);
          const tot = items2.reduce((s,i)=>s+i.total,0);
          const mat2 = items2.filter(i=>i.category==='material').reduce((s,i)=>s+i.total,0);
          const lab2 = items2.filter(i=>i.category==='labor').reduce((s,i)=>s+i.total,0);
          return (
            <div className="rounded-lg bg-slate-800/80 p-2.5 space-y-1 border border-slate-700 mt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cost Preview</p>
              <div className="flex justify-between text-[10px]"><span className="text-slate-400">Materials</span><span className="text-slate-300">${mat2.toLocaleString()}</span></div>
              <div className="flex justify-between text-[10px]"><span className="text-slate-400">Labor</span><span className="text-slate-300">${lab2.toLocaleString()}</span></div>
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-600"><span className="text-slate-300">Total</span><span className="text-amber-400">${tot.toLocaleString()}</span></div>
            </div>
          );
        })()}
        <div className="space-y-1.5 border-t border-slate-700 pt-2">
          <button onClick={()=>onDuplicate(el.id)} className="flex items-center gap-2 w-full text-xs text-slate-300 hover:text-white px-2 py-1.5 rounded hover:bg-slate-700 transition-colors">
            <Copy className="w-3.5 h-3.5"/> Duplicate
          </button>
          <button onClick={()=>onDelete(el.id)} className="flex items-center gap-2 w-full text-xs text-rose-400 hover:text-rose-300 px-2 py-1.5 rounded hover:bg-rose-900/30 transition-colors">
            <Trash2 className="w-3.5 h-3.5"/> Remove
          </button>
        </div>
      </div>

      {/* Type-specific builder panels */}
      {isKitchen && <KitchenSketchPanel el={el} onUpdate={onUpdate}/>}
      {el.type === 'pergola' && <PergolaConfigPanel el={el} onUpdate={onUpdate}/>}
      {(el.type === 'pool_rect' || el.type === 'pool_freeform') && <PoolConfigPanel el={el} onUpdate={onUpdate}/>}
      {(el.type === 'patio_cover' || el.type === 'cabana') && <PatioCoverConfigPanel el={el} onUpdate={onUpdate}/>}
      {el.type === 'sunroom' && <SunroomConfigPanel el={el} onUpdate={onUpdate}/>}
      {(el.type === 'patio' || el.type === 'pavers' || el.type === 'driveway') && <PatioConfigPanel el={el} onUpdate={onUpdate}/>}
      {(el.type === 'firepit' || el.type === 'fire_table') && <FirepitConfigPanel el={el} onUpdate={onUpdate}/>}
      {el.type === 'retaining_wall' && <RetainingWallConfigPanel el={el} onUpdate={onUpdate}/>}
      {el.type === 'lawn' && <LawnConfigPanel el={el} onUpdate={onUpdate}/>}
      {(el.type==='room'||el.type==='garage'||el.type==='house_ranch'||el.type==='house_colonial'||el.type==='house_modern') && <RoomConfigPanel el={el} onUpdate={onUpdate}/>}
      {el.type==='fireplace' && <FireplaceConfigPanel el={el} onUpdate={onUpdate}/>}
    </div>
  );
}

// ─── Shared config panel helpers ────────────────────────────────────────────
function CfgRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-800">
      <span className="text-[10px] text-slate-400 shrink-0 w-28">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
function CfgSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
function CfgNumber({ value, onChange, min, max, step = 1 }) {
  return (
    <input type="number" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500" />
  );
}
function CfgToggle({ value, onChange, label }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn("px-2.5 py-1 rounded text-[10px] font-semibold transition-colors border", value ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500")}>
      {value ? '✓ ' : ''}{label}
    </button>
  );
}

function LineItemsPreview({ el }) {
  const items = getLineItems(el);
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + (i.total || 0), 0);
  const matTotal = items.filter(i => i.category === 'material').reduce((s, i) => s + i.total, 0);
  const labTotal = items.filter(i => i.category === 'labor').reduce((s, i) => s + i.total, 0);
  const perTotal = items.filter(i => i.category === 'permit').reduce((s, i) => s + i.total, 0);
  return (
    <div className="mt-3 border-t border-slate-700 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Line-Item Estimate</p>
      <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
        {items.filter(i => i.total > 0).map((item, idx) => (
          <div key={idx} className="flex justify-between items-baseline gap-1">
            <span className="text-[9px] text-slate-400 truncate flex-1">{item.description}</span>
            <span className="text-[9px] text-slate-500 shrink-0">{item.qty} {item.unit}</span>
            <span className="text-[9px] font-semibold text-slate-300 shrink-0 w-16 text-right">${item.total.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-700 space-y-0.5">
        {matTotal > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-500">Materials</span><span className="text-slate-300">${matTotal.toLocaleString()}</span></div>}
        {labTotal > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-500">Labor</span><span className="text-slate-300">${labTotal.toLocaleString()}</span></div>}
        {perTotal > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-500">Permits</span><span className="text-slate-300">${perTotal.toLocaleString()}</span></div>}
        <div className="flex justify-between text-xs font-bold pt-1"><span className="text-white">Total</span><span className="text-amber-400">${total.toLocaleString()}</span></div>
      </div>
    </div>
  );
}

// ─── Pergola Config Panel ────────────────────────────────────────────────────
function PergolaConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.pergola;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  const frontH = cfg.frontHeightFt || 10;
  const backH  = cfg.backHeightFt  || frontH;
  const sloped = frontH !== backH;
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Pergola Builder</p>
      <CfgRow label="Post material"><CfgSelect value={cfg.postMaterial || 'cedar'} onChange={v => set({ postMaterial: v })} options={[['cedar','Cedar'],['redwood','Redwood'],['aluminum','Aluminum'],['steel','Steel']]}/></CfgRow>
      <CfgRow label="Post size"><CfgSelect value={String(cfg.postSizeIn || 6)} onChange={v => set({ postSizeIn: Number(v) })} options={[['4','4×4"'],['6','6×6"'],['8','8×8"']]}/></CfgRow>
      <CfgRow label="Front height (ft)"><CfgNumber value={frontH} onChange={v => set({ frontHeightFt: v })} min={7} max={16}/></CfgRow>
      <CfgRow label="Back height (ft)">
        <div className="flex items-center gap-1.5">
          <CfgNumber value={backH} onChange={v => set({ backHeightFt: v })} min={7} max={16}/>
          {sloped && <span className="text-[9px] text-amber-400">sloped</span>}
        </div>
      </CfgRow>
      <CfgRow label="Beam depth"><CfgSelect value={String(cfg.beamDepthIn || 8)} onChange={v => set({ beamDepthIn: Number(v) })} options={[['6','6"'],['8','8"'],['10','10"'],['12','12"']]}/></CfgRow>
      <CfgRow label="Rafter spacing"><CfgSelect value={String(cfg.rafterSpacingIn || 16)} onChange={v => set({ rafterSpacingIn: Number(v) })} options={[['12','12" OC'],['16','16" OC'],['24','24" OC']]}/></CfgRow>
      <CfgRow label="Cross members">
        <CfgSelect value={String(cfg.crossMemberSpacingIn || 0)} onChange={v => set({ crossMemberSpacingIn: Number(v) })}
          options={[['0','None'],['12','12" OC (dense)'],['16','16" OC'],['24','24" OC'],['48','48" OC (sparse)']]}/>
      </CfgRow>
      <CfgRow label="Roof cover">
        <CfgSelect value={cfg.shade || 'none'} onChange={v => set({ shade: v })}
          options={[['none','Open rafters'],['fabric','Shade sail fabric'],['louvers','Motorized louvers'],['polycarbonate','Polycarbonate panels']]}/>
      </CfgRow>
      <CfgRow label="Ceiling fans"><CfgNumber value={cfg.fans || 0} onChange={v => set({ fans: v })} min={0} max={4}/></CfgRow>
      <CfgRow label="Lights"><CfgNumber value={cfg.lights || 0} onChange={v => set({ lights: v })} min={0} max={12}/></CfgRow>
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Pool Config Panel ───────────────────────────────────────────────────────
function PoolConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.pool_rect;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Pool Builder</p>
      <CfgRow label="Interior finish"><CfgSelect value={cfg.finish || 'pebble_blue'} onChange={v => set({ finish: v })} options={[['white_plaster','White Plaster'],['pebble_grey','Pebble Grey'],['pebble_blue','Pebble Blue'],['quartz','Quartz White'],['tile_waterline','Tile Waterline']]}/></CfgRow>
      <CfgRow label="Coping material"><CfgSelect value={cfg.copingMaterial || 'travertine'} onChange={v => set({ copingMaterial: v })} options={[['travertine','Travertine'],['bluestone','Bluestone'],['concrete','Concrete'],['brick','Brick']]}/></CfgRow>
      <CfgRow label="Coping width"><CfgSelect value={String(cfg.copingWidthIn || 12)} onChange={v => set({ copingWidthIn: Number(v) })} options={[['12','12"'],['18','18"']]}/></CfgRow>
      <CfgRow label="Shallow depth (ft)"><CfgNumber value={cfg.shallowDepthFt || 3.5} onChange={v => set({ shallowDepthFt: v })} min={2} max={5} step={0.5}/></CfgRow>
      <CfgRow label="Deep depth (ft)"><CfgNumber value={cfg.deepDepthFt || 6} onChange={v => set({ deepDepthFt: v })} min={4} max={9} step={0.5}/></CfgRow>
      <CfgRow label="Pump"><CfgSelect value={cfg.pump || 'variable'} onChange={v => set({ pump: v })} options={[['variable','Variable-speed (efficient)'],['single','Single-speed']]}/></CfgRow>
      <CfgRow label="Heater"><CfgSelect value={cfg.heater || 'heat_pump'} onChange={v => set({ heater: v })} options={[['heat_pump','Heat pump'],['gas','Gas heater'],['none','No heater']]}/></CfgRow>
      <CfgRow label="LED lights"><CfgNumber value={cfg.numLeds || 2} onChange={v => set({ numLeds: v })} min={0} max={8}/></CfgRow>
      <CfgRow label="Deck material"><CfgSelect value={cfg.deckMaterial || 'travertine'} onChange={v => set({ deckMaterial: v })} options={[['travertine','Travertine'],['concrete','Brushed concrete'],['pavers','Pavers'],['none','None']]}/></CfgRow>
      <CfgRow label="Deck width (ft)"><CfgNumber value={cfg.deckWidthFt || 4} onChange={v => set({ deckWidthFt: v })} min={0} max={12}/></CfgRow>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <CfgToggle value={!!cfg.spa} onChange={v => set({ spa: v })} label="Attached spa"/>
        <CfgToggle value={!!cfg.sunShelf} onChange={v => set({ sunShelf: v })} label="Sun shelf"/>
        <CfgToggle value={!!cfg.waterfall} onChange={v => set({ waterfall: v })} label="Waterfall"/>
        <CfgToggle value={!!cfg.automation} onChange={v => set({ automation: v })} label="Automation"/>
        <CfgToggle value={!!cfg.fence} onChange={v => set({ fence: v })} label="Safety fence"/>
      </div>
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Patio Cover / Cabana Config Panel ──────────────────────────────────────
function PatioCoverConfigPanel({ el, onUpdate }) {
  const defCfg = el.type === 'cabana' ? DEFAULT_BUILD_CONFIGS.cabana : DEFAULT_BUILD_CONFIGS.patio_cover;
  const cfg    = el.buildConfig || defCfg;
  const set    = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  const roofShape  = cfg.roofShape  || 'gable';
  const privWalls  = Array.isArray(cfg.privacyWalls) ? cfg.privacyWalls : [];
  const isShed     = roofShape === 'shed';

  const toggleWall = side => {
    const next = privWalls.includes(side) ? privWalls.filter(s => s !== side) : [...privWalls, side];
    set({ privacyWalls: next });
  };

  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">{el.type === 'cabana' ? 'Cabana' : 'Patio Cover'} Builder</p>

      <CfgRow label="Attachment">
        <CfgSelect value={cfg.attachment || 'detached'} onChange={v => set({ attachment: v })}
          options={[['detached','Free-standing / detached'],['attached','Attached to house']]}/>
      </CfgRow>

      <CfgRow label="Roof shape">
        <CfgSelect value={roofShape} onChange={v => set({ roofShape: v })}
          options={[['flat','Flat (solid deck)'],['shed','Shed (single slope)'],['gable','Open gable'],['hip','Hip roof']]}/>
      </CfgRow>

      <CfgRow label="Roof material">
        <CfgSelect value={cfg.roofMaterial || 'shingle'} onChange={v => set({ roofMaterial: v })}
          options={[['shingle','Comp shingle'],['tile','Clay / concrete tile'],['metal','Standing seam metal'],['polycarbonate','Polycarbonate (clear)'],['wood','Wood T&G']]}/>
      </CfgRow>

      <CfgRow label="Front height (ft)">
        <CfgNumber value={cfg.frontHeightFt || 10} onChange={v => set({ frontHeightFt: v })} min={7} max={16}/>
      </CfgRow>

      {isShed && (
        <CfgRow label="Back height (ft)">
          <CfgNumber value={cfg.backHeightFt || 12} onChange={v => set({ backHeightFt: v })} min={7} max={18}/>
        </CfgRow>
      )}

      {(roofShape === 'gable' || roofShape === 'hip') && (
        <CfgRow label="Ridge rise (ft)">
          <CfgNumber value={cfg.ridgeRiseFt || 2} onChange={v => set({ ridgeRiseFt: v })} min={1} max={6} step={0.5}/>
        </CfgRow>
      )}

      {roofShape === 'gable' && (
        <CfgRow label="Gable faces">
          <CfgSelect value={cfg.ridgeAxis || 'x'} onChange={v => set({ ridgeAxis: v })}
            options={[['x','Left & Right ends'],['z','Front & Back ends']]}/>
        </CfgRow>
      )}

      <CfgRow label="Post material">
        <CfgSelect value={cfg.postMaterial || 'wood'} onChange={v => set({ postMaterial: v })}
          options={[['wood','Wood'],['aluminum','Aluminum'],['steel','Steel']]}/>
      </CfgRow>
      <CfgRow label="Post size">
        <CfgSelect value={String(cfg.postSizeIn || 6)} onChange={v => set({ postSizeIn: Number(v) })}
          options={[['4','4×4"'],['6','6×6"'],['8','8×8"']]}/>
      </CfgRow>

      <CfgRow label="Wall / screen">
        <CfgSelect value={cfg.wall || 'open'} onChange={v => set({ wall: v })}
          options={[['open','Open'],['screen','Screen enclosure'],['partial','Partial / knee wall'],['full','Full walls']]}/>
      </CfgRow>

      <CfgRow label="Privacy walls">
        <div className="flex flex-wrap gap-1">
          {['front','back','left','right'].map(side => (
            <button key={side} onClick={() => toggleWall(side)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${privWalls.includes(side) ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
              {side.charAt(0).toUpperCase()+side.slice(1)}
            </button>
          ))}
        </div>
      </CfgRow>

      {privWalls.length > 0 && <>
        <CfgRow label="Wall thickness (ft)">
          <CfgNumber value={cfg.wallWidthFt ?? 0.5} onChange={v => set({ wallWidthFt: v })} min={0.33} max={2} step={0.17}/>
        </CfgRow>
        <CfgRow label="Exterior finish">
          <CfgSelect value={cfg.exteriorFinish||'stucco'} onChange={v=>set({exteriorFinish:v})}
            options={[['stucco','Stucco'],['stucco_smooth','Smooth stucco'],['brick','Brick'],['stone','Natural stone'],['hardie_board','Hardie board'],['wood_siding','Wood siding'],['vinyl_siding','Vinyl siding'],['block','CMU block']]}/>
        </CfgRow>
        <CfgRow label="Interior finish">
          <CfgSelect value={cfg.interiorFinish||'drywall'} onChange={v=>set({interiorFinish:v})}
            options={[['drywall','Painted drywall'],['tongue_groove','Tongue & groove'],['shiplap','Shiplap'],['wood_panel','Wood paneling'],['brick','Exposed brick'],['stone_veneer','Stone veneer'],['tile','Tile']]}/>
        </CfgRow>
      </>}

      <CfgRow label="TV wall">
        <CfgSelect value={cfg.tvWall || 'none'} onChange={v => set({ tvWall: v })}
          options={[['none','None'],['back','Back wall'],['left','Left wall'],['right','Right wall'],['front','Front wall']]}/>
      </CfgRow>

      {cfg.tvWall && cfg.tvWall !== 'none' && <>
        <CfgRow label="TV wall width (ft, 0=full)">
          <CfgNumber value={cfg.tvWallWidthFt ?? 0} onChange={v=>set({tvWallWidthFt:v})} min={0} max={20} step={0.5}/>
        </CfgRow>
        <CfgRow label="TV mount height (ft)">
          <CfgNumber value={cfg.tvMountHeightFt ?? 5} onChange={v=>set({tvMountHeightFt:v})} min={3} max={12} step={0.5}/>
        </CfgRow>
      </>}

      <CfgRow label="Ceiling">
        <CfgSelect value={cfg.ceiling || 'open_beam'} onChange={v => set({ ceiling: v })}
          options={[['none','Open (no ceiling)'],['open_beam','Exposed beam'],['tongue_groove','Tongue & groove'],['drywall','Painted drywall'],['shiplap','Shiplap']]}/>
      </CfgRow>

      <CfgRow label="Ceiling fans"><CfgNumber value={cfg.fans ?? 1} onChange={v => set({ fans: v })} min={0} max={6}/></CfgRow>
      <CfgRow label="Lights"><CfgNumber value={cfg.lights ?? 4} onChange={v => set({ lights: v })} min={0} max={20}/></CfgRow>
      <CfgRow label="Outlets"><CfgNumber value={cfg.outlets ?? 2} onChange={v => set({ outlets: v })} min={0} max={12}/></CfgRow>

      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Sunroom Config Panel ────────────────────────────────────────────────────
function SunroomConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.sunroom;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Sunroom Builder</p>

      <CfgRow label="Roof style">
        <CfgSelect value={cfg.roofStyle || 'gable'} onChange={v => set({ roofStyle: v })}
          options={[['gable','Gable'],['shed','Shed (single slope)'],['flat','Flat']]}/>
      </CfgRow>
      <CfgRow label="Roof material">
        <CfgSelect value={cfg.roofMaterial || 'shingle'} onChange={v => set({ roofMaterial: v })}
          options={[['shingle','Comp shingle'],['metal','Standing seam metal'],['tile','Clay / concrete tile'],['glass','Glass / skylight']]}/>
      </CfgRow>

      <CfgRow label="Wall height (ft)">
        <CfgNumber value={cfg.frontHeightFt || 9} onChange={v => set({ frontHeightFt: v })} min={7} max={14}/>
      </CfgRow>
      {cfg.roofStyle === 'shed' && (
        <CfgRow label="Back height (ft)">
          <CfgNumber value={cfg.backHeightFt || 11} onChange={v => set({ backHeightFt: v })} min={7} max={16}/>
        </CfgRow>
      )}

      <CfgRow label="Door type">
        <CfgSelect value={cfg.doorType || 'french'} onChange={v => set({ doorType: v })}
          options={[['french','French doors (double)'],['sliding','Sliding glass door'],['single','Single door']]}/>
      </CfgRow>

      <CfgRow label="Windows per side">
        <CfgNumber value={cfg.windows || 3} onChange={v => set({ windows: v })} min={1} max={6}/>
      </CfgRow>

      <CfgRow label="Ceiling">
        <CfgSelect value={cfg.ceiling || 'drywall'} onChange={v => set({ ceiling: v })}
          options={[['drywall','Painted drywall'],['tongue_groove','Tongue & groove'],['none','None (open framing)']]}/>
      </CfgRow>

      <CfgRow label="HVAC">
        <CfgSelect value={cfg.hvac || 'mini_split'} onChange={v => set({ hvac: v })}
          options={[['mini_split','Mini-split (A/C + heat)'],['none','No HVAC']]}/>
      </CfgRow>

      <CfgRow label="Foundation">
        <CfgSelect value={cfg.foundation || 'slab'} onChange={v => set({ foundation: v })}
          options={[['slab','Concrete slab'],['stem_wall','Stem wall']]}/>
      </CfgRow>

      <CfgRow label="Ceiling fans"><CfgNumber value={cfg.fans ?? 1} onChange={v => set({ fans: v })} min={0} max={4}/></CfgRow>
      <CfgRow label="Lights"><CfgNumber value={cfg.lights ?? 4} onChange={v => set({ lights: v })} min={0} max={16}/></CfgRow>
      <CfgRow label="Outlets"><CfgNumber value={cfg.outlets ?? 4} onChange={v => set({ outlets: v })} min={0} max={12}/></CfgRow>

      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Room / House / Garage Config Panel ──────────────────────────────────────
function RoomConfigPanel({ el, onUpdate }) {
  const defKey = el.type === 'garage' ? 'garage' : el.type === 'room' ? 'room' : (el.type === 'house_ranch' ? 'house_ranch' : el.type === 'house_colonial' ? 'house_colonial' : 'house_modern');
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS[defKey] || DEFAULT_BUILD_CONFIGS.room;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  const [activeWall, setActiveWall] = useState('front');
  const doors   = Array.isArray(cfg.doors)   ? cfg.doors   : [];
  const windows = Array.isArray(cfg.windows) ? cfg.windows : [];
  const wallDoors   = doors.filter(x => x.wall === activeWall);
  const wallWindows = windows.filter(x => x.wall === activeWall);

  const addDoor = () => set({ doors: [...doors, { wall: activeWall, xFt: 0, widthFt: 3, heightFt: 6.8, type: 'single' }] });
  const removeDoor = (wallIdx) => {
    const wDoors = doors.filter(x => x.wall === activeWall);
    const globalIdx = doors.indexOf(wDoors[wallIdx]);
    set({ doors: doors.filter((_, i) => i !== globalIdx) });
  };
  const updateDoor = (wallIdx, patch) => {
    const wDoors = doors.filter(x => x.wall === activeWall);
    const globalIdx = doors.indexOf(wDoors[wallIdx]);
    set({ doors: doors.map((d, i) => i === globalIdx ? { ...d, ...patch } : d) });
  };
  const addWindow = () => set({ windows: [...windows, { wall: activeWall, xFt: 0, widthFt: 3, heightFt: 3.5, sillFt: 2.5 }] });
  const removeWindow = (wallIdx) => {
    const wWins = windows.filter(x => x.wall === activeWall);
    const globalIdx = windows.indexOf(wWins[wallIdx]);
    set({ windows: windows.filter((_, i) => i !== globalIdx) });
  };
  const updateWindow = (wallIdx, patch) => {
    const wWins = windows.filter(x => x.wall === activeWall);
    const globalIdx = windows.indexOf(wWins[wallIdx]);
    set({ windows: windows.map((w, i) => i === globalIdx ? { ...w, ...patch } : w) });
  };

  const typeLabel = el.type === 'garage' ? 'Garage' : el.type === 'room' ? 'Room / Space' : el.type.replace('house_','').replace(/^\w/,c=>c.toUpperCase())+' House';

  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">{typeLabel} Builder</p>

      <CfgRow label="Wall height (ft)"><CfgNumber value={cfg.heightFt||9} onChange={v=>set({heightFt:v})} min={7} max={20}/></CfgRow>
      <CfgRow label="Wall thickness">
        <CfgSelect value={String(cfg.wallThicknessIn||6)} onChange={v=>set({wallThicknessIn:Number(v)})}
          options={[['4','4" (interior)'],['6','6" (standard)'],['8','8" (masonry)'],['12','12" (block)']]}/>
      </CfgRow>

      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 pt-1">Roof</p>
      <CfgRow label="Roof style">
        <CfgSelect value={cfg.roofStyle||'gable'} onChange={v=>set({roofStyle:v})}
          options={[['gable','Gable'],['hip','Hip'],['flat','Flat / low-slope'],['shed','Shed (single slope)']]}/>
      </CfgRow>
      <CfgRow label="Roof material">
        <CfgSelect value={cfg.roofMaterial||'shingle'} onChange={v=>set({roofMaterial:v})}
          options={[['shingle','Comp shingle'],['tile','Clay / concrete tile'],['metal','Standing seam metal'],['flat','TPO / mod bitumen']]}/>
      </CfgRow>
      {(cfg.roofStyle==='gable'||cfg.roofStyle==='hip') && (
        <CfgRow label="Ridge rise (ft)"><CfgNumber value={cfg.ridgeRiseFt||3} onChange={v=>set({ridgeRiseFt:v})} min={1} max={12} step={0.5}/></CfgRow>
      )}

      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 pt-1">Finishes</p>
      <CfgRow label="Exterior finish">
        <CfgSelect value={cfg.exteriorFinish||'stucco'} onChange={v=>set({exteriorFinish:v})}
          options={[['stucco','Stucco'],['stucco_smooth','Smooth stucco'],['brick','Brick'],['stone','Natural stone'],['hardie_board','Hardie board (fiber cement)'],['wood_siding','Wood lap siding'],['vinyl_siding','Vinyl siding'],['block','CMU / concrete block']]}/>
      </CfgRow>
      <CfgRow label="Interior finish">
        <CfgSelect value={cfg.interiorFinish||'drywall'} onChange={v=>set({interiorFinish:v})}
          options={[['drywall','Painted drywall'],['tongue_groove','Tongue & groove'],['shiplap','Shiplap'],['wood_panel','Wood paneling'],['brick','Exposed brick'],['stone_veneer','Stone veneer'],['tile','Tile']]}/>
      </CfgRow>
      <CfgRow label="Floor material">
        <CfgSelect value={cfg.floorMaterial||'wood'} onChange={v=>set({floorMaterial:v})}
          options={[['wood','Hardwood'],['tile','Tile'],['stone','Natural stone'],['concrete','Polished concrete'],['carpet','Carpet'],['travertine','Travertine'],['marble','Marble']]}/>
      </CfgRow>
      <CfgRow label="Ceiling finish">
        <CfgSelect value={cfg.ceilingFinish||'drywall'} onChange={v=>set({ceilingFinish:v})}
          options={[['drywall','Painted drywall'],['tongue_groove','Tongue & groove'],['shiplap','Shiplap'],['open','Open framing']]}/>
      </CfgRow>

      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 pt-1">Fireplace</p>
      <CfgRow label="Fireplace wall">
        <CfgSelect value={cfg.fireplaceWall||'none'} onChange={v=>set({fireplaceWall:v})}
          options={[['none','None'],['front','Front wall'],['back','Back wall'],['left','Left wall'],['right','Right wall']]}/>
      </CfgRow>
      {cfg.fireplaceWall&&cfg.fireplaceWall!=='none'&&<>
        <CfgRow label="Style">
          <CfgSelect value={cfg.fireplaceStyle||'traditional'} onChange={v=>set({fireplaceStyle:v})}
            options={[['traditional','Traditional'],['modern','Modern / linear'],['rustic','Rustic'],['contemporary','Contemporary']]}/>
        </CfgRow>
        <CfgRow label="Fuel">
          <CfgSelect value={cfg.fireplaceFuel||'gas'} onChange={v=>set({fireplaceFuel:v})}
            options={[['gas','Natural gas'],['wood','Wood burning'],['electric','Electric'],['propane','Propane']]}/>
        </CfgRow>
        <CfgRow label="Surround">
          <CfgSelect value={cfg.fireplaceSurround||'stone'} onChange={v=>set({fireplaceSurround:v})}
            options={[['stone','Natural stone'],['brick','Brick'],['marble','Marble'],['tile','Tile'],['drywall','Drywall / plaster'],['shiplap','Shiplap']]}/>
        </CfgRow>
      </>}

      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 pt-1">Wall Openings</p>
      <div className="flex gap-1 mb-1">
        {['front','back','left','right'].map(side=>(
          <button key={side} onClick={()=>setActiveWall(side)}
            className={`flex-1 py-1 text-[9px] rounded border transition-colors ${activeWall===side?'bg-amber-600 border-amber-500 text-white':'bg-slate-700 border-slate-600 text-slate-400'}`}>
            {side[0].toUpperCase()+side.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400">Doors — {activeWall}</span>
          <button onClick={addDoor} className="text-[10px] px-2 py-0.5 bg-amber-600/30 border border-amber-600/50 text-amber-300 rounded hover:bg-amber-600/50">+ Door</button>
        </div>
        {wallDoors.map((door,i)=>(
          <div key={i} className="bg-slate-800 rounded p-2 space-y-1 text-[10px]">
            <div className="flex justify-between"><span className="text-slate-400">Door {i+1}</span><button onClick={()=>removeDoor(i)} className="text-red-400 hover:text-red-300 text-[9px]">✕ Remove</button></div>
            <CfgRow label="Type"><CfgSelect value={door.type||'single'} onChange={v=>updateDoor(i,{type:v})} options={[['single','Single'],['double','Double'],['french','French (glass)'],['sliding','Sliding glass'],['garage','Garage door'],['entry','Entry (solid panel)']]}/></CfgRow>
            <CfgRow label="Width (ft)"><CfgNumber value={door.widthFt||3} onChange={v=>updateDoor(i,{widthFt:v})} min={2.5} max={18} step={0.5}/></CfgRow>
            <CfgRow label="Height (ft)"><CfgNumber value={door.heightFt||6.8} onChange={v=>updateDoor(i,{heightFt:v})} min={6} max={10} step={0.1}/></CfgRow>
            <CfgRow label="Position (ft from center)"><CfgNumber value={door.xFt||0} onChange={v=>updateDoor(i,{xFt:v})} min={-40} max={40} step={0.5}/></CfgRow>
          </div>
        ))}
      </div>

      <div className="space-y-1 mt-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400">Windows — {activeWall}</span>
          <button onClick={addWindow} className="text-[10px] px-2 py-0.5 bg-amber-600/30 border border-amber-600/50 text-amber-300 rounded hover:bg-amber-600/50">+ Window</button>
        </div>
        {wallWindows.map((win,i)=>(
          <div key={i} className="bg-slate-800 rounded p-2 space-y-1 text-[10px]">
            <div className="flex justify-between"><span className="text-slate-400">Window {i+1}</span><button onClick={()=>removeWindow(i)} className="text-red-400 hover:text-red-300 text-[9px]">✕ Remove</button></div>
            <CfgRow label="Width (ft)"><CfgNumber value={win.widthFt||3} onChange={v=>updateWindow(i,{widthFt:v})} min={1} max={12} step={0.5}/></CfgRow>
            <CfgRow label="Height (ft)"><CfgNumber value={win.heightFt||3.5} onChange={v=>updateWindow(i,{heightFt:v})} min={1} max={8} step={0.25}/></CfgRow>
            <CfgRow label="Sill height (ft)"><CfgNumber value={win.sillFt||2.5} onChange={v=>updateWindow(i,{sillFt:v})} min={0} max={8} step={0.25}/></CfgRow>
            <CfgRow label="Position (ft from center)"><CfgNumber value={win.xFt||0} onChange={v=>updateWindow(i,{xFt:v})} min={-40} max={40} step={0.5}/></CfgRow>
          </div>
        ))}
      </div>

      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 pt-1">MEP</p>
      <CfgRow label="HVAC">
        <CfgSelect value={cfg.hvac||'central_air'} onChange={v=>set({hvac:v})}
          options={[['central_air','Central A/C + Heat'],['mini_split','Mini-split'],['none','No HVAC']]}/>
      </CfgRow>
      <CfgRow label="Ceiling fans"><CfgNumber value={cfg.fans||0} onChange={v=>set({fans:v})} min={0} max={10}/></CfgRow>
      <CfgRow label="Lights"><CfgNumber value={cfg.lights||8} onChange={v=>set({lights:v})} min={0} max={40}/></CfgRow>
      <CfgRow label="Outlets"><CfgNumber value={cfg.outlets||8} onChange={v=>set({outlets:v})} min={0} max={40}/></CfgRow>

      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Fireplace Config Panel ───────────────────────────────────────────────────
function FireplaceConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.fireplace;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Fireplace Builder</p>
      <CfgRow label="Style">
        <CfgSelect value={cfg.style||'traditional'} onChange={v=>set({style:v})}
          options={[['traditional','Traditional'],['modern','Modern / linear'],['rustic','Rustic / farmhouse'],['contemporary','Contemporary']]}/>
      </CfgRow>
      <CfgRow label="Fuel type">
        <CfgSelect value={cfg.fuel||'gas'} onChange={v=>set({fuel:v})}
          options={[['gas','Natural gas'],['wood','Wood burning'],['electric','Electric'],['propane','Propane']]}/>
      </CfgRow>
      <CfgRow label="Width (ft)"><CfgNumber value={cfg.widthFt||5} onChange={v=>set({widthFt:v})} min={3} max={14} step={0.5}/></CfgRow>
      <CfgRow label="Height (ft)"><CfgNumber value={cfg.heightFt||7} onChange={v=>set({heightFt:v})} min={3} max={12} step={0.5}/></CfgRow>
      <CfgRow label="Surround material">
        <CfgSelect value={cfg.surroundMaterial||'stone'} onChange={v=>set({surroundMaterial:v})}
          options={[['stone','Natural stone'],['brick','Brick'],['marble','Marble'],['tile','Tile'],['drywall','Drywall / plaster'],['shiplap','Shiplap']]}/>
      </CfgRow>
      <CfgRow label="Hearth material">
        <CfgSelect value={cfg.hearthMaterial||'stone'} onChange={v=>set({hearthMaterial:v})}
          options={[['stone','Natural stone'],['tile','Tile'],['brick','Brick'],['concrete','Concrete'],['marble','Marble']]}/>
      </CfgRow>
      <CfgRow label="Mantle style">
        <CfgSelect value={cfg.mantleStyle||'wood'} onChange={v=>set({mantleStyle:v})}
          options={[['wood','Wood beam / board'],['stone','Stone / concrete'],['none','No mantle']]}/>
      </CfgRow>
      <CfgRow label="TV above fireplace"><CfgToggle value={cfg.hasTV||false} onChange={v=>set({hasTV:v})} label={cfg.hasTV?'Yes':'No'}/></CfgRow>
      <CfgRow label="Chimney breast"><CfgToggle value={cfg.chimneyBreast!==false} onChange={v=>set({chimneyBreast:v})} label={cfg.chimneyBreast!==false?'Yes':'No'}/></CfgRow>
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Patio / Pavers / Driveway Config Panel ──────────────────────────────────
function PatioConfigPanel({ el, onUpdate }) {
  const defaultCfg = DEFAULT_BUILD_CONFIGS[el.type] || DEFAULT_BUILD_CONFIGS.patio;
  const cfg = el.buildConfig || defaultCfg;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Surface Builder</p>
      <CfgRow label="Material"><CfgSelect value={cfg.material || 'travertine'} onChange={v => set({ material: v })} options={[['travertine','Travertine'],['flagstone','Flagstone'],['concrete_pavers','Concrete pavers'],['brick','Brick'],['stamped_concrete','Stamped concrete'],['concrete','Broom concrete'],['porcelain','Porcelain tile']]}/></CfgRow>
      <CfgRow label="Pattern"><CfgSelect value={cfg.pattern || 'random'} onChange={v => set({ pattern: v })} options={[['random','Random / ashlar'],['running_bond','Running bond'],['herringbone','Herringbone'],['basketweave','Basketweave'],['straight','Straight / grid']]}/></CfgRow>
      <CfgRow label="Border"><CfgSelect value={cfg.border || 'none'} onChange={v => set({ border: v })} options={[['none','No border'],['soldier_course','Soldier course'],['header_course','Header course']]}/></CfgRow>
      <CfgRow label="Base type"><CfgSelect value={cfg.baseType || 'gravel_sand'} onChange={v => set({ baseType: v })} options={[['gravel_sand','Gravel/sand (standard)'],['concrete','Concrete slab base']]}/></CfgRow>
      <CfgRow label="Sealer">
        <CfgToggle value={!!cfg.sealer} onChange={v => set({ sealer: v })} label="Apply sealer"/>
      </CfgRow>
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Firepit / Fire Table Config Panel ──────────────────────────────────────
function FirepitConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.firepit;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Fire Feature Builder</p>
      <CfgRow label="Shape"><CfgSelect value={cfg.shape || 'round'} onChange={v => set({ shape: v })} options={[['round','Round'],['square','Square']]}/></CfgRow>
      <CfgRow label="Fuel type"><CfgSelect value={cfg.fuelType || 'gas'} onChange={v => set({ fuelType: v })} options={[['gas','Natural gas / propane'],['wood','Wood burning']]}/></CfgRow>
      <CfgRow label="Body material"><CfgSelect value={cfg.material || 'block'} onChange={v => set({ material: v })} options={[['block','CMU block'],['stone','Natural stone'],['concrete','Cast concrete'],['metal','Corten steel']]}/></CfgRow>
      <CfgRow label="Cap material"><CfgSelect value={cfg.capMaterial || 'bluestone'} onChange={v => set({ capMaterial: v })} options={[['bluestone','Bluestone'],['granite','Granite'],['travertine','Travertine'],['none','None']]}/></CfgRow>
      <CfgRow label="Diameter (ft)"><CfgNumber value={cfg.diameterFt || 4} onChange={v => set({ diameterFt: v })} min={3} max={8}/></CfgRow>
      <CfgRow label="Seating"><CfgSelect value={cfg.seating || 'chairs'} onChange={v => set({ seating: v })} options={[['none','No seating'],['chairs','Lounge chairs'],['bench','Curved bench']]}/></CfgRow>
      {cfg.seating !== 'none' && <CfgRow label="Seat count"><CfgNumber value={cfg.seatCount || 4} onChange={v => set({ seatCount: v })} min={2} max={10}/></CfgRow>}
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Retaining Wall Config Panel ─────────────────────────────────────────────
function RetainingWallConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.retaining_wall;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Retaining Wall Builder</p>
      <CfgRow label="Material"><CfgSelect value={cfg.material || 'block'} onChange={v => set({ material: v })} options={[['block','Concrete block (CMU)'],['stone','Natural stone'],['concrete','Poured concrete'],['timber','Timber']]}/></CfgRow>
      <CfgRow label="Height (ft)"><CfgNumber value={cfg.heightFt || 3} onChange={v => set({ heightFt: v })} min={1} max={12}/></CfgRow>
      <CfgRow label="Cap"><CfgToggle value={!!cfg.cap} onChange={v => set({ cap: v })} label="Include cap"/></CfgRow>
      <CfgRow label="Footing"><CfgToggle value={!!cfg.footing} onChange={v => set({ footing: v })} label="Concrete footing"/></CfgRow>
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Lawn Config Panel ───────────────────────────────────────────────────────
function LawnConfigPanel({ el, onUpdate }) {
  const cfg = el.buildConfig || DEFAULT_BUILD_CONFIGS.lawn;
  const set = patch => onUpdate(el.id, { buildConfig: { ...cfg, ...patch } });
  return (
    <div className="p-3 space-y-1 border-t border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-2">Lawn Builder</p>
      <CfgRow label="Sod type"><CfgSelect value={cfg.sodType || 'st_augustine'} onChange={v => set({ sodType: v })} options={[['st_augustine','St. Augustine'],['bermuda','Bermuda'],['zoysia','Zoysia'],['fescue','Tall fescue'],['artificial','Artificial turf']]}/></CfgRow>
      <CfgRow label="Irrigation"><CfgToggle value={!!cfg.irrigation} onChange={v => set({ irrigation: v })} label="Irrigation system"/></CfgRow>
      <LineItemsPreview el={el}/>
    </div>
  );
}

// ─── Kitchen Builder Panel ───────────────────────────────────────────────────
const SEC_COLORS = {
  drawer: '#374151', door: '#4B5563', appliance: '#7C2D12',
  sink: '#1E3A5F', open: '#1F2937', filler: '#111827',
};
const SEC_LABELS = {
  drawer: 'DWR', door: 'DOOR', appliance: 'APPL',
  sink: 'SINK', open: 'OPEN', filler: 'FILL',
};

function KitchenSketchPanel({ el, onUpdate }) {
  const cfg         = el.kitchenConfig || {};
  const levels      = cfg.levels      || 1;
  const ledge       = cfg.ledge       || 'concrete';
  const sections    = cfg.sections    || [];
  const barHeightIn = cfg.barHeightIn || 42;
  const barDepthIn  = cfg.barDepthIn  || 14;

  // Fixed overall dimensions — el.w (ft) is the source of truth for total width.
  // el.d (ft) is depth. Height is always 36" standard (3 ft).
  const totalIn = Math.round((el.w || 10) * 12);  // total width in inches, fixed
  const depthFt = el.d || 2;

  const [selIdx, setSelIdx] = useState(null);
  const selSec = selIdx !== null ? sections[selIdx] : null;

  const updateCfg = patch => onUpdate(el.id, { kitchenConfig: { ...cfg, ...patch } });

  // Redistribute all section widths so they sum exactly to targetIn, preserving relative proportions.
  const redistributeWidths = (secs, targetIn) => {
    if (secs.length === 0) return secs;
    const current = secs.reduce((s, sec) => s + (sec.widthIn || 24), 0);
    if (current === 0) {
      const even = Math.round(targetIn / secs.length);
      const result = secs.map(s => ({ ...s, widthIn: even }));
      // Correct rounding drift on last item
      const drift = targetIn - result.reduce((s, sec) => s + sec.widthIn, 0);
      result[result.length - 1].widthIn += drift;
      return result;
    }
    const scaled = secs.map(s => ({ ...s, widthIn: Math.max(6, Math.round((s.widthIn || 24) * (targetIn / current))) }));
    const drift2  = targetIn - scaled.reduce((s, sec) => s + sec.widthIn, 0);
    scaled[scaled.length - 1].widthIn = Math.max(6, scaled[scaled.length - 1].widthIn + drift2);
    return scaled;
  };

  // Change overall width: scale sections proportionally.
  const changeWidth = wFt => {
    const newW  = Math.max(2, Math.min(50, wFt));
    const newIn = Math.round(newW * 12);
    const scaled = redistributeWidths(sections, newIn);
    onUpdate(el.id, { w: newW, kitchenConfig: { ...cfg, sections: scaled } });
  };

  // Add section: evenly split the fixed total among all sections including new one.
  const addSection = type => {
    const secDefaults = {
      drawer:    { drawerCount: 3 },
      door:      { doorCount: 1 },
      appliance: { applianceType: 'grill_30', applianceName: 'Gas Grill 30"', applianceWidthIn: 30, applianceDepthIn: 20 },
      sink:      { applianceWidthIn: 21 },
      open:      {},
      filler:    {},
    };
    const newSec  = { id: `sec_${Date.now()}`, type, widthIn: 24, ...secDefaults[type] };
    const rawSecs = [...sections, newSec];
    const evenIn  = Math.round(totalIn / rawSecs.length);
    const distrib = rawSecs.map(s => ({ ...s, widthIn: evenIn }));
    const drift3  = totalIn - distrib.reduce((s, sec) => s + sec.widthIn, 0);
    distrib[0].widthIn += drift3;
    onUpdate(el.id, { kitchenConfig: { ...cfg, sections: distrib } });
    setSelIdx(rawSecs.length - 1);
  };

  // Resize one section: redistribute the remainder to other sections proportionally.
  const updateSectionWidth = (idx, newWidthIn) => {
    const min = 6, otherCount = sections.length - 1;
    const clamped   = Math.max(min, Math.min(totalIn - otherCount * min, newWidthIn));
    const remaining = totalIn - clamped;
    const others = sections.filter((_, i) => i !== idx);
    const othersTotal = others.reduce((s, sec) => s + (sec.widthIn || 24), 0) || remaining;
    const newSecs = sections.map((s, i) => {
      if (i === idx) return { ...s, widthIn: clamped };
      const scaled2 = Math.max(min, Math.round((s.widthIn || 24) * (remaining / othersTotal)));
      return { ...s, widthIn: scaled2 };
    });
    // Correct rounding drift
    const drift4 = totalIn - newSecs.reduce((s, sec) => s + sec.widthIn, 0);
    const otherIdx = newSecs.findIndex((_, i) => i !== idx);
    if (otherIdx >= 0) newSecs[otherIdx].widthIn = Math.max(min, newSecs[otherIdx].widthIn + drift4);
    onUpdate(el.id, { kitchenConfig: { ...cfg, sections: newSecs } });
  };

  // Update non-width section properties.
  const updateSection = (idx, patch) => {
    const newSecs = sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    if ('widthIn' in patch) {
      updateSectionWidth(idx, patch.widthIn);
    } else {
      onUpdate(el.id, { kitchenConfig: { ...cfg, sections: newSecs } });
    }
  };

  // Remove section: redistribute its width proportionally to remaining sections.
  const removeSection = idx => {
    const newSecs = sections.filter((_, i) => i !== idx);
    if (newSecs.length === 0) {
      onUpdate(el.id, { kitchenConfig: { ...cfg, sections: [] } });
    } else {
      const distrib2 = redistributeWidths(newSecs, totalIn);
      onUpdate(el.id, { kitchenConfig: { ...cfg, sections: distrib2 } });
    }
    setSelIdx(null);
  };

  const moveSection = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= sections.length) return;
    const newSecs = [...sections];
    [newSecs[idx], newSecs[to]] = [newSecs[to], newSecs[idx]];
    updateCfg({ sections: newSecs });
    setSelIdx(to);
  };

  return (
    <div className="space-y-2.5 border-t border-slate-700 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 px-3 flex items-center gap-1.5">
        <UtensilsCrossed className="w-3 h-3"/> Kitchen Builder
      </p>

      {/* ── Dimensions row ──────────────────────────────────────────────── */}
      <div className="px-3">
        <div className="grid grid-cols-3 gap-1.5 bg-slate-800/60 rounded-lg p-2 border border-slate-700">
          {/* Width */}
          <div>
            <p className="text-[8px] text-slate-500 mb-0.5 uppercase tracking-wide">Width</p>
            <div className="flex items-center gap-0.5">
              <Input type="number" min={2} max={50} step={0.5} value={el.w || 10}
                onChange={e => changeWidth(Number(e.target.value))}
                className="h-6 text-[10px] bg-slate-900 border-slate-600 text-white px-1.5"/>
            </div>
            <p className="text-[8px] text-amber-300 mt-0.5">{fmtIn(totalIn)}</p>
          </div>
          {/* Height — always 36" standard */}
          <div>
            <p className="text-[8px] text-slate-500 mb-0.5 uppercase tracking-wide">Height</p>
            <div className="h-6 flex items-center px-1.5 bg-slate-900/60 rounded border border-slate-700 text-[10px] text-slate-500">
              36″
            </div>
            <p className="text-[8px] text-slate-500 mt-0.5">Standard</p>
          </div>
          {/* Depth */}
          <div>
            <p className="text-[8px] text-slate-500 mb-0.5 uppercase tracking-wide">Depth</p>
            <Input type="number" min={1.5} max={6} step={0.5} value={depthFt}
              onChange={e => onUpdate(el.id, { d: Number(e.target.value) })}
              className="h-6 text-[10px] bg-slate-900 border-slate-600 text-white px-1.5"/>
            <p className="text-[8px] text-amber-300 mt-0.5">{fmtIn(depthFt * 12)}</p>
          </div>
        </div>
        <p className="text-[8px] text-slate-600 mt-1 text-center">Sections fill the set width automatically</p>
      </div>

      {/* ── Level + Bar config ───────────────────────────────────────────── */}
      <div className="px-3 space-y-1.5">
        <div className="flex gap-1">
          {[1, 2].map(lvl => (
            <button key={lvl} onClick={() => updateCfg({ levels: lvl })}
              className={cn("flex-1 py-1 text-[10px] rounded font-bold transition-colors",
                levels === lvl ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}>
              {lvl === 1 ? 'Single Level' : '2-Level Bar'}
            </button>
          ))}
        </div>

        {levels === 2 && (
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Bar Height (in)</p>
              <Input type="number" min={38} max={52} value={barHeightIn}
                onChange={e => updateCfg({ barHeightIn: Number(e.target.value) })}
                className="h-6 text-[10px] bg-slate-800 border-slate-600 text-white px-1.5"/>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Bar Depth (in)</p>
              <Input type="number" min={8} max={24} value={barDepthIn}
                onChange={e => updateCfg({ barDepthIn: Number(e.target.value) })}
                className="h-6 text-[10px] bg-slate-800 border-slate-600 text-white px-1.5"/>
            </div>
          </div>
        )}

        {/* Countertop material */}
        <div>
          <p className="text-[9px] text-slate-500 mb-0.5">Countertop</p>
          <div className="grid grid-cols-3 gap-0.5">
            {[['concrete','Concrete'],['granite','Granite'],['quartzite','Quartzite'],['tile','Tile'],['none','None']].map(([val,lbl]) => (
              <button key={val} onClick={() => updateCfg({ ledge: val })}
                className={cn("py-0.5 text-[9px] rounded font-medium transition-colors",
                  ledge === val ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Front elevation sketch ───────────────────────────────────────── */}
      <div className="px-3">
        <div className="flex justify-between text-[9px] text-slate-400 mb-1">
          <span className="font-bold">{fmtIn(totalIn)} total · {sections.length} sections</span>
          {sections.length > 0 && (
            <span className="text-slate-600">
              used: {fmtIn(sections.reduce((s, sec) => s + (sec.widthIn || 0), 0))}
            </span>
          )}
        </div>

        {sections.length === 0 ? (
          <div className="h-12 flex flex-col items-center justify-center rounded border border-dashed border-slate-600 text-[9px] text-slate-500 gap-1">
            <span>Add sections below — they fill the {fmtIn(totalIn)} width</span>
          </div>
        ) : (
          <div className="overflow-x-auto pb-0.5">
            {/* Top inch labels */}
            <div className="flex mb-0.5" style={{ minWidth: sections.length * 32 }}>
              {sections.map((sec, i) => (
                <div key={sec.id || i} style={{ flex: sec.widthIn || 24, minWidth: 32 }}
                  className="text-[8px] text-slate-400 text-center truncate leading-none px-0.5">
                  {sec.widthIn}″
                </div>
              ))}
            </div>
            {/* Section blocks */}
            <div className="flex rounded overflow-hidden border border-slate-600 h-12"
              style={{ minWidth: sections.length * 32 }}>
              {sections.map((sec, i) => {
                const appLabel = sec.applianceName
                  ? sec.applianceName.split(' ').map(w2 => w2[0]).join('')
                  : 'APP';
                return (
                  <button key={sec.id || i}
                    style={{ flex: sec.widthIn || 24, minWidth: 32, backgroundColor: SEC_COLORS[sec.type] || SEC_COLORS.filler }}
                    onClick={() => setSelIdx(selIdx === i ? null : i)}
                    className={cn("flex flex-col items-center justify-center text-[8px] font-bold border-r border-slate-600 last:border-r-0 transition-all gap-0.5",
                      selIdx === i ? "ring-1 ring-inset ring-amber-400 text-amber-300" : "text-slate-300 hover:brightness-125")}>
                    <span className="truncate px-0.5">
                      {sec.type === 'appliance' ? appLabel : SEC_LABELS[sec.type] || '?'}
                    </span>
                    <span className="text-[7px] opacity-60">{fmtIn(sec.widthIn || 24)}</span>
                  </button>
                );
              })}
            </div>
            {/* Scale bar at bottom */}
            <div className="flex items-center mt-1 gap-1">
              <div className="h-px flex-1 bg-slate-700"/>
              <span className="text-[7px] text-slate-600 shrink-0">{fmtIn(totalIn)}</span>
              <div className="h-px flex-1 bg-slate-700"/>
            </div>
          </div>
        )}
      </div>

      {/* ── Add section ─────────────────────────────────────────────────── */}
      <div className="px-3">
        <p className="text-[9px] text-slate-500 mb-1">Add Section <span className="text-slate-600">(splits width evenly)</span></p>
        <div className="grid grid-cols-3 gap-0.5">
          {[['drawer','Drawer'],['door','Door'],['appliance','Appliance'],['sink','Sink'],['open','Open'],['filler','Filler']].map(([type,lbl]) => (
            <button key={type} onClick={() => addSection(type)}
              className="flex items-center justify-center gap-0.5 py-1 text-[9px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">
              <Plus className="w-2.5 h-2.5"/>{lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ── Selected section editor ──────────────────────────────────────── */}
      {selSec && (
        <div className="mx-3 rounded-lg bg-slate-800/80 border border-amber-700/40 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-amber-300 capitalize">
              {selSec.type === 'appliance' ? (selSec.applianceName || 'Appliance') : `${selSec.type} section`}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => moveSection(selIdx, -1)} disabled={selIdx === 0}
                className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors text-[9px] px-1">◀</button>
              <button onClick={() => moveSection(selIdx, 1)} disabled={selIdx === sections.length - 1}
                className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors text-[9px] px-1">▶</button>
              <button onClick={() => removeSection(selIdx)}
                className="text-slate-500 hover:text-rose-400 transition-colors ml-1">
                <Trash2 className="w-3 h-3"/>
              </button>
            </div>
          </div>

          {/* Width — redistributes others automatically */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[9px] text-slate-500">Width</p>
              <p className="text-[8px] text-slate-600">others auto-adjust</p>
            </div>
            <div className="flex gap-1 items-center">
              <Input type="number" min={6} max={totalIn - (sections.length - 1) * 6} value={selSec.widthIn || 24}
                onChange={e => updateSectionWidth(selIdx, Number(e.target.value))}
                className="h-6 text-[10px] bg-slate-900 border-slate-600 text-white px-1.5 flex-1"/>
              <span className="text-[9px] text-amber-300 font-bold shrink-0">{fmtIn(selSec.widthIn || 24)}</span>
            </div>
            {/* Quick preset widths */}
            <div className="flex gap-0.5 mt-1 flex-wrap">
              {[6,9,12,15,18,21,24,30,36].filter(v => v <= totalIn - (sections.length - 1) * 6).map(v => (
                <button key={v} onClick={() => updateSectionWidth(selIdx, v)}
                  className={cn("px-1.5 py-0.5 text-[8px] rounded transition-colors",
                    (selSec.widthIn || 24) === v ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                  {v}″
                </button>
              ))}
            </div>
          </div>

          {/* Drawer count */}
          {selSec.type === 'drawer' && (
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Drawers</p>
              <div className="flex gap-1">
                {[1,2,3,4,5,6].map(n => (
                  <button key={n} onClick={() => updateSection(selIdx, { drawerCount: n })}
                    className={cn("flex-1 py-0.5 text-[10px] rounded font-bold transition-colors",
                      (selSec.drawerCount || 3) === n ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Door count */}
          {selSec.type === 'door' && (
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Doors</p>
              <div className="flex gap-1">
                {[1,2].map(n => (
                  <button key={n} onClick={() => updateSection(selIdx, { doorCount: n })}
                    className={cn("flex-1 py-0.5 text-[10px] rounded font-bold transition-colors",
                      (selSec.doorCount || 1) === n ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                    {n} Door{n > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Appliance picker */}
          {selSec.type === 'appliance' && (
            <div className="space-y-1.5">
              <p className="text-[9px] text-slate-500">Appliance</p>
              <div className="max-h-32 overflow-y-auto space-y-0.5 pr-0.5">
                {APPLIANCE_CATALOG.map(app => (
                  <button key={app.id}
                    onClick={() => {
                      updateSectionWidth(selIdx, app.widthIn);
                      setTimeout(() => {
                        onUpdate(el.id, {
                          kitchenConfig: {
                            ...cfg,
                            sections: cfg.sections
                              ? cfg.sections.map((s, i) => i === selIdx
                                  ? { ...s, applianceType: app.id, applianceName: app.label, applianceWidthIn: app.widthIn, applianceDepthIn: app.depthIn }
                                  : s)
                              : [],
                          }
                        });
                      }, 0);
                    }}
                    className={cn("w-full text-left px-2 py-1 text-[9px] rounded transition-colors flex justify-between",
                      selSec.applianceType === app.id
                        ? "bg-amber-900/60 text-amber-200 border border-amber-700/50"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600")}>
                    <span className="font-semibold">{app.label}</span>
                    <span className="text-slate-400">{app.widthIn}″</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sink basin size */}
          {selSec.type === 'sink' && (
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Basin</p>
              <div className="flex gap-1">
                {[['21″ single', 21],['27″ single', 27],['33″ double', 33]].map(([lbl, v]) => (
                  <button key={v} onClick={() => updateSection(selIdx, { applianceWidthIn: v })}
                    className={cn("flex-1 py-0.5 text-[9px] rounded font-bold transition-colors",
                      (selSec.applianceWidthIn || 21) === v ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 2D Site Plan Drawing ────────────────────────────────────────────────────

function planDimLine(ctx, x1, y1, x2, y2, label, vertical = false) {
  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.fillStyle   = '#333';
  ctx.lineWidth   = 0.8;
  const angle     = Math.atan2(y2 - y1, x2 - x1);
  const arr       = 7;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const tip = (tx, ty, d) => {
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + d * arr * Math.cos(angle + 0.35), ty + d * arr * Math.sin(angle + 0.35));
    ctx.lineTo(tx + d * arr * Math.cos(angle - 0.35), ty + d * arr * Math.sin(angle - 0.35));
    ctx.closePath(); ctx.fill();
  };
  tip(x1, y1, 1); tip(x2, y2, -1);
  const px = Math.sin(angle), py = -Math.cos(angle);
  [[x1,y1],[x2,y2]].forEach(([ex,ey]) => {
    ctx.beginPath(); ctx.moveTo(ex+px*3,ey+py*3); ctx.lineTo(ex+px*12,ey+py*12); ctx.stroke();
  });
  ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  const mx = (x1+x2)/2, my = (y1+y2)/2;
  if (vertical) {
    ctx.save(); ctx.translate(mx-9, my); ctx.rotate(-Math.PI/2);
    ctx.fillText(label, 0, 0); ctx.restore();
  } else {
    ctx.fillText(label, mx, my-8);
  }
  ctx.restore();
}

function planNorthArrow(ctx, cx, cy) {
  ctx.save();
  const r = 16;
  ctx.strokeStyle = '#1A1A1A'; ctx.fillStyle = '#1A1A1A'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy+r*0.7); ctx.lineTo(cx, cy-r*0.7); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy-r*0.7);
  ctx.lineTo(cx-r*0.28, cy-r*0.15);
  ctx.lineTo(cx+r*0.28, cy-r*0.15);
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy-r-4);
  ctx.restore();
}

function drawSitePlan(canvas, elements, lotW, lotD, lotOX, lotOZ, design) {
  const ctx = canvas.getContext('2d');
  const CW = canvas.width, CH = canvas.height;
  const MAR = 55, TITLE_H = 130;
  const DRAW_W = CW - 2*MAR, DRAW_H = CH - 2*MAR - TITLE_H;

  const SCALE     = Math.min(DRAW_W/lotW, DRAW_H/lotD) * 0.82;
  const lotPxW    = lotW * SCALE, lotPxH = lotD * SCALE;
  const lotOriX   = MAR + (DRAW_W - lotPxW) / 2;
  const lotOriY   = MAR + (DRAW_H - lotPxH) / 2;

  const toCanvas  = (sx, sz) => ({
    x: lotOriX + (sx - lotOX + lotW/2) * SCALE,
    y: lotOriY + (sz - lotOZ + lotD/2) * SCALE,
  });

  // ── Page background ──────────────────────────────────────────────
  ctx.fillStyle = '#F5F3EE'; ctx.fillRect(0, 0, CW, CH);

  // Outer + inner border
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, CW-8, CH-8);
  ctx.strokeRect(MAR-12, MAR-12, CW-2*(MAR-12), CH-2*(MAR-12));

  // Header
  ctx.fillStyle = '#1A1A1A';
  ctx.font = 'bold 17px Arial'; ctx.textAlign = 'center';
  ctx.fillText('SITE PLAN — PROPOSED OUTDOOR IMPROVEMENTS', CW/2, MAR-18);

  // ── Grass context ────────────────────────────────────────────────
  ctx.fillStyle = '#C8E6B0';
  ctx.fillRect(MAR, MAR, DRAW_W, DRAW_H);

  // ── Lot fill ─────────────────────────────────────────────────────
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(lotOriX, lotOriY, lotPxW, lotPxH);

  // ── Lot boundary ─────────────────────────────────────────────────
  ctx.strokeStyle = '#B45309'; ctx.lineWidth = 2;
  ctx.setLineDash([12,5]); ctx.strokeRect(lotOriX, lotOriY, lotPxW, lotPxH); ctx.setLineDash([]);

  // ── Corner markers ───────────────────────────────────────────────
  [[0,0],[lotPxW,0],[0,lotPxH],[lotPxW,lotPxH]].forEach(([dx,dy]) => {
    ctx.beginPath();
    ctx.arc(lotOriX+dx, lotOriY+dy, 3.5, 0, Math.PI*2);
    ctx.fillStyle='#B45309'; ctx.fill();
  });

  // ── Elements ─────────────────────────────────────────────────────
  elements.forEach(el => {
    const c = toCanvas(el.x, el.z);
    const ew = el.w*SCALE, eh = el.d*SCALE;
    const hexStr = typeof el.color==='number'
      ? '#'+el.color.toString(16).padStart(6,'0')
      : (el.color||'#888888');
    const rot = (el.rotation||0) * Math.PI / 180;

    ctx.save();
    ctx.translate(c.x, c.y);
    if (rot) ctx.rotate(rot);

    // Fill
    ctx.globalAlpha = 0.22; ctx.fillStyle = hexStr;
    ctx.fillRect(-ew/2, -eh/2, ew, eh);

    // Hatch patterns
    ctx.globalAlpha = 0.35;
    if (el.type==='pool_rect'||el.type==='pool_freeform') {
      ctx.strokeStyle = '#1E88E5'; ctx.lineWidth = 1;
      for (let xi=-ew/2; xi<ew/2; xi+=7) {
        ctx.beginPath(); ctx.moveTo(xi,-eh/2); ctx.lineTo(xi,eh/2); ctx.stroke();
      }
    } else if (el.type==='patio'||el.type==='pavers'||el.type==='driveway') {
      const gsz = Math.max(6, Math.min(16, SCALE*0.8));
      ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5;
      for (let xi=-ew/2; xi<ew/2; xi+=gsz) {
        ctx.beginPath(); ctx.moveTo(xi,-eh/2); ctx.lineTo(xi,eh/2); ctx.stroke();
      }
      for (let yi=-eh/2; yi<eh/2; yi+=gsz) {
        ctx.beginPath(); ctx.moveTo(-ew/2,yi); ctx.lineTo(ew/2,yi); ctx.stroke();
      }
    } else if (el.type==='lawn'||el.type==='putting_green'||el.type==='golf_green') {
      ctx.fillStyle = '#4CAF50'; ctx.globalAlpha = 0.35;
      ctx.fillRect(-ew/2, -eh/2, ew, eh);
    }

    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = hexStr; ctx.lineWidth = 1.5;
    ctx.strokeRect(-ew/2, -eh/2, ew, eh);

    // Label
    const minDim = Math.min(ew, eh);
    if (minDim > 18) {
      ctx.fillStyle = '#111'; ctx.textAlign = 'center';
      const fs = Math.max(7, Math.min(11, minDim*0.22));
      ctx.font = `bold ${fs}px Arial`;
      ctx.fillText(el.label.toUpperCase(), 0, minDim>35 ? -fs*0.4 : 0);
      if (minDim > 34) {
        ctx.font = `${Math.max(6, fs-1)}px Arial`;
        ctx.fillStyle = '#444';
        ctx.fillText(`${Math.round(el.w)}′ × ${Math.round(el.d)}′`, 0, fs*0.9);
      }
    }
    ctx.restore();
  });

  // ── Dimension lines ───────────────────────────────────────────────
  const DO = 30;
  planDimLine(ctx, lotOriX, lotOriY+lotPxH+DO, lotOriX+lotPxW, lotOriY+lotPxH+DO, `${Math.round(lotW)}′`);
  planDimLine(ctx, lotOriX+lotPxW+DO, lotOriY, lotOriX+lotPxW+DO, lotOriY+lotPxH, `${Math.round(lotD)}′`, true);

  // ── Scale bar ─────────────────────────────────────────────────────
  const ftOptions = [5,10,15,20,25,30,40,50];
  const sbFt = ftOptions.find(f => f*SCALE >= 40) || 50;
  const sbPx = sbFt * SCALE;
  const sbX = lotOriX, sbY = lotOriY - 24;
  ctx.strokeStyle='#333'; ctx.fillStyle='#333'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(sbX,sbY); ctx.lineTo(sbX+sbPx,sbY); ctx.stroke();
  [[sbX,sbY],[sbX+sbPx,sbY]].forEach(([ex,ey])=>{
    ctx.beginPath(); ctx.moveTo(ex,ey-5); ctx.lineTo(ex,ey+5); ctx.stroke();
  });
  ctx.font='10px Arial'; ctx.textAlign='center'; ctx.fillText(`${sbFt}′`, sbX+sbPx/2, sbY-8);
  const fpi = (96/SCALE);
  ctx.textAlign='left'; ctx.font='italic 10px Arial';
  ctx.fillText(`Scale: 1″ = ${fpi<1?Math.round(1/fpi*12)+'″':Math.round(fpi)+'′'}`, sbX+sbPx+12, sbY+4);

  // ── North arrow ───────────────────────────────────────────────────
  planNorthArrow(ctx, lotOriX+lotPxW-24, lotOriY+28);

  // ── Title block ───────────────────────────────────────────────────
  const tbY = CH - TITLE_H;
  ctx.strokeStyle='#111'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(MAR-12, tbY); ctx.lineTo(CW-MAR+12, tbY); ctx.stroke();

  const now = new Date();
  const dStr = now.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
  const sqft = (Math.round(lotW)*Math.round(lotD)).toLocaleString();
  const col1=MAR, col2=CW*0.38, col3=CW*0.72;
  const row=(n)=>tbY+20+n*20;

  const field = (label, val, x, y) => {
    ctx.fillStyle='#555'; ctx.font='bold 10px Arial'; ctx.textAlign='left';
    ctx.fillText(label, x, y);
    ctx.fillStyle='#111'; ctx.font='11px Arial';
    ctx.fillText(val||'—', x+ctx.measureText(label).width+6, y);
  };

  field('PROJECT:', design?.title||'Outdoor Design', col1, row(0));
  field('CLIENT:', design?.client_name||'', col1, row(1));
  field('ADDRESS:', design?.address||'', col1, row(2));
  field('LOT SIZE:', `${Math.round(lotW)}′ × ${Math.round(lotD)}′  (${sqft} sq ft)`, col1, row(3));

  field('DRAWN BY:', 'Clardy Design', col2, row(0));
  field('DATE:', dStr, col2, row(1));
  field('ELEMENTS:', `${elements.length} items`, col2, row(2));
  const totalCost = elements.reduce((s,e)=>s+calcElementCost(e).total,0);
  if (totalCost>0) field('EST. COST:', `$${totalCost.toLocaleString()}`, col2, row(3));

  ctx.textAlign='center';
  const noteX = col3 + (CW-MAR-col3)/2;
  ctx.fillStyle='#B45309'; ctx.font='bold 10px Arial';
  ctx.fillText('⚠ PRELIMINARY DESIGN ONLY', noteX, row(0));
  ctx.fillStyle='#666'; ctx.font='9px Arial';
  ['NOT FOR CONSTRUCTION WITHOUT','ENGINEER REVIEW AND STAMP','Clardy Contracting  •  clardy.io',`Sheet 1 of 1`].forEach((t,i)=>{
    ctx.fillText(t, noteX, row(1)+i*14);
  });
}

// ─── Photo Scale Calibrator ─────────────────────────────────────────────────
// Lets user click 2 points on the background photo and enter a known distance
// to calibrate the scene scale, then applies it to lotW / lotD.
function ScaleCalibrator({ onApply, onClose }) {
  const [pts,    setPts]    = useState([]);   // [{x,y}] normalized 0-1
  const [distFt, setDistFt] = useState("");
  const overlayRef = useRef(null);

  const handleClick = e => {
    if (pts.length >= 2) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    setPts(prev => [...prev, { x: nx, y: ny }]);
  };

  const pixelDist = pts.length === 2
    ? Math.sqrt((pts[1].x - pts[0].x) ** 2 + (pts[1].y - pts[0].y) ** 2)
    : 0;
  const feetPerUnit = distFt && pixelDist > 0 ? parseFloat(distFt) / pixelDist : null;

  const apply = () => {
    if (!feetPerUnit || feetPerUnit <= 0) return;
    onApply(feetPerUnit);
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30 cursor-crosshair"
      style={{ background: "rgba(0,0,0,0.18)" }}
      onClick={handleClick}
    >
      {/* Instruction banner */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs font-semibold px-4 py-2 rounded-full pointer-events-none select-none shadow-lg">
        {pts.length === 0 && "Click point 1 on a known object"}
        {pts.length === 1 && "Click point 2 on the same object"}
        {pts.length === 2 && "Enter the real-world distance below"}
      </div>

      {/* Markers */}
      {pts.map((pt, i) => (
        <div key={i} className="absolute pointer-events-none"
          style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%`, transform: "translate(-50%,-50%)" }}>
          <div className="w-5 h-5 rounded-full border-2 border-amber-400 bg-amber-400/30 flex items-center justify-center">
            <span className="text-[9px] text-amber-200 font-bold">{i + 1}</span>
          </div>
        </div>
      ))}

      {/* Line between points */}
      {pts.length === 2 && (() => {
        const x1 = pts[0].x * 100, y1 = pts[0].y * 100;
        const x2 = pts[1].x * 100, y2 = pts[1].y * 100;
        const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        return (
          <div className="absolute pointer-events-none"
            style={{ left: `${x1}%`, top: `${y1}%`, width: `${len}%`, height: 2,
              background: "rgba(251,191,36,0.8)", transformOrigin: "0 50%",
              transform: `rotate(${ang}deg)` }}/>
        );
      })()}

      {/* Distance input panel */}
      {pts.length === 2 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-amber-500/40 rounded-xl px-5 py-4 flex flex-col gap-3 shadow-2xl"
          onClick={e => e.stopPropagation()}>
          <p className="text-xs text-slate-300 font-semibold">How many feet between those two points?</p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number" min="0.5" step="0.5"
              value={distFt}
              onChange={e => setDistFt(e.target.value)}
              onKeyDown={e => e.key === "Enter" && apply()}
              placeholder="e.g. 8"
              className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
            />
            <span className="text-slate-400 text-xs">feet</span>
          </div>
          {feetPerUnit && (
            <p className="text-[10px] text-amber-300">
              Scale: 1 unit width ≈ {feetPerUnit.toFixed(1)} ft
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={apply} disabled={!distFt || !feetPerUnit}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-bold py-1.5 rounded-lg transition-colors">
              Apply Scale
            </button>
            <button onClick={() => setPts([])}
              className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
              Reset
            </button>
            <button onClick={onClose}
              className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportPlanModal({ elements, lotW, lotD, lotOX, lotOZ, design, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawSitePlan(canvasRef.current, elements, lotW, lotD, lotOX, lotOZ, design);
  }, [elements, lotW, lotD, lotOX, lotOZ, design]);

  const downloadPng = () => {
    const c = canvasRef.current; if (!c) return;
    const a = document.createElement('a');
    a.download = `site-plan-${(design?.title||'design').replace(/\s+/g,'-')}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  const printPdf = () => {
    const c = canvasRef.current; if (!c) return;
    const img = c.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Site Plan</title>
      <style>*{margin:0;padding:0}@page{size:landscape;margin:0}
      body{display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;background:#fff}
      img{max-width:100%;max-height:100%;object-fit:contain}</style></head>
      <body><img src="${img}"/><script>window.onload=()=>{setTimeout(()=>window.print(),200)}<\/script></body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400"/>
            <h2 className="text-white font-bold text-base">2D Site Plan</h2>
            <span className="text-slate-400 text-xs ml-2">Trade & permit ready</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadPng}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5"/> Download PNG
            </button>
            <button onClick={printPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
              <FileText className="w-3.5 h-3.5"/> Print / Save PDF
            </button>
            <button onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors text-lg font-bold px-2">×</button>
          </div>
        </div>

        {/* Canvas preview */}
        <div className="flex-1 overflow-auto p-4 bg-slate-800/50">
          <canvas ref={canvasRef} width={1100} height={850}
            className="w-full rounded shadow-xl border border-slate-700 bg-white"/>
        </div>

        {/* Footer note */}
        <div className="px-5 py-2.5 border-t border-slate-700 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-slate-500">
            High-res PNG (1100×850) · Print to PDF via browser print dialog for permit submission
          </p>
          <p className="text-[10px] text-slate-500">
            {elements.length} elements · {Math.round(lotW)}′ × {Math.round(lotD)}′
          </p>
        </div>
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

// Resize image to max 1024px and return base64 string (no data: prefix)
async function resizeAndEncode(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const scale = MAX / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
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
  const [lotOX, setLotOX]               = useState(0);   // lot center X offset in scene-feet
  const [lotOZ, setLotOZ]               = useState(0);   // lot center Z offset in scene-feet
  const [lotEditMode, setLotEditMode]   = useState(false);
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
  const [svMode, setSvMode]             = useState(false);   // street view overlay mode
  const [svHeading, setSvHeading]       = useState(180);
  const [svPitch, setSvPitch]           = useState(-5);
  const [svFov, setSvFov]               = useState(90);
  const [svUrl, setSvUrl]               = useState(null);
  const [svLoading, setSvLoading]       = useState(false);
  const [svError, setSvError]           = useState(null);
  // Photo upload overlay mode — user's own photo as background
  const [photoMode, setPhotoMode]       = useState(false);
  const [photoUrl, setPhotoUrl]         = useState(null);    // blob URL of uploaded image
  const photoInputRef                   = useRef(null);
  const [aiAnalyzing, setAiAnalyzing]   = useState(false);
  const [aiScene, setAiScene]           = useState(null);
  const [aiError, setAiError]           = useState(null);
  const photoModeRef                    = useRef(false);
  const [showExport, setShowExport]     = useState(false);
  const [scaleMode, setScaleMode]       = useState(false);

  const needsRenderRef  = useRef(true);
  const invalidate      = () => { needsRenderRef.current = true; };
  const mountRef        = useRef(null);
  const rendererRef     = useRef(null);
  const sceneRef        = useRef(null);
  const cameraRef       = useRef(null);
  const controlsRef     = useRef(null);
  const groupsRef       = useRef({});
  const groundGroupRef  = useRef(null);
  const satMeshRef      = useRef(null);
  const selectedIdRef   = useRef(null);
  const elementsRef     = useRef([]);
  const lotRef          = useRef({w:DEFAULT_LOT_W,d:DEFAULT_LOT_D,ox:0,oz:0});
  const lotEditModeRef  = useRef(false);
  const handleMeshesRef = useRef([]);
  const animIdRef       = useRef(null);
  const snapRef         = useRef(false);
  const skyDomeRef      = useRef(null);
  const composerRef     = useRef(null);

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
        const ox=d.canvas_data.lotOX||0, oz=d.canvas_data.lotOZ||0;
        setLotW(lw); setLotD(ld); setLotOX(ox); setLotOZ(oz);
        lotRef.current={w:lw,d:ld,ox,oz};
        if(d.canvas_data.geoCoords) setGeoCoords(d.canvas_data.geoCoords);
      } else { setShowLotSetup(true); }
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[designId]);

  // ── Three.js init (runs once on mount) ───────────────────────────────────
  useEffect(()=>{
    const mount = mountRef.current;
    if(!mount) return;

    // Scene — sky dome handles the background; null lets alpha pass in photo/sv mode
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(0xC8E8F5, 0.0007);
    sceneRef.current = scene;

    // Single perspective camera — avoids orthographic degenerate-direction issues
    const W = mount.clientWidth || mount.offsetWidth || 800;
    const H = mount.clientHeight || mount.offsetHeight || 600;
    const camera = new THREE.PerspectiveCamera(50, W/H, 0.5, 5000);
    camera.position.set(0, 200, 180);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer — alpha:true lets us make the canvas transparent in street view mode
    const renderer = new THREE.WebGLRenderer({antialias:false, alpha:false, powerPreference:'high-performance', logarithmicDepthBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setSize(W, H, false);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    rendererRef.current = renderer;

    // High-res equirectangular env map for IBL (metals, glass, water reflections)
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512; envCanvas.height = 256;
    const envCtx = envCanvas.getContext('2d');
    const envGrad = envCtx.createLinearGradient(0,0,0,256);
    envGrad.addColorStop(0,'#0A3860');    // zenith deep blue
    envGrad.addColorStop(0.3,'#1A5E9A'); // upper sky
    envGrad.addColorStop(0.5,'#5899C8'); // mid sky
    envGrad.addColorStop(0.62,'#C0DDEF'); // horizon haze
    envGrad.addColorStop(0.7,'#D8E8C4'); // ground sky-bounce
    envGrad.addColorStop(1,'#607848');   // ground
    envCtx.fillStyle=envGrad; envCtx.fillRect(0,0,512,256);
    // Sun disc
    const sunDisc=envCtx.createRadialGradient(360,82,0,360,82,22);
    sunDisc.addColorStop(0,'rgba(255,240,180,0.95)'); sunDisc.addColorStop(0.4,'rgba(255,220,100,0.5)'); sunDisc.addColorStop(1,'rgba(255,200,80,0)');
    envCtx.fillStyle=sunDisc; envCtx.fillRect(300,40,140,100);
    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    envTex.dispose(); pmrem.dispose();

    // OrbitControls — no damping for instant response
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.zoomSpeed = 1.2;
    controlsRef.current = controls;

    // Physically-based sky (Preetham atmospheric scattering model)
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);
    const skyUni = sky.material.uniforms;
    skyUni['turbidity'].value      = 2.2;
    skyUni['rayleigh'].value       = 1.1;
    skyUni['mieCoefficient'].value = 0.006;
    skyUni['mieDirectionalG'].value= 0.82;
    const SUN_ELEV = 48, SUN_AZ = 220;
    const sunSphPos = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(90 - SUN_ELEV),
      THREE.MathUtils.degToRad(SUN_AZ)
    );
    skyUni['sunPosition'].value.copy(sunSphPos);
    skyDomeRef.current = sky;

    // Lighting — physically-motivated: strong sun + sky bounce + warm ground fill
    // Minimal ambient — IBL + hemisphere handle most fill
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));

    // Primary sun — position matched to Sky sun position
    const sun = new THREE.DirectionalLight(0xFFF5D8, 4.8);
    sun.position.copy(sunSphPos).multiplyScalar(220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left=-280; sun.shadow.camera.right=280;
    sun.shadow.camera.top=280;   sun.shadow.camera.bottom=-280;
    sun.shadow.camera.near=1;    sun.shadow.camera.far=800;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);

    // Sky hemisphere — top=sky blue, bottom=green-earth bounce
    scene.add(new THREE.HemisphereLight(0x7AB8D4, 0x4A7040, 1.4));

    // Warm fill from opposite side (simulates indirect bounce off warm surfaces)
    const fill = new THREE.DirectionalLight(0xFFDDA0, 0.55);
    fill.position.set(-80, 55, -80);
    scene.add(fill);

    // ── EffectComposer: SSAO + SMAA + OutputPass ────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ssao = new SSAOPass(scene, camera, W, H);
    ssao.kernelRadius = 1.8;
    ssao.minDistance  = 0.002;
    ssao.maxDistance  = 0.18;
    composer.addPass(ssao);
    const smaa = new SMAAPass(W * renderer.getPixelRatio(), H * renderer.getPixelRatio());
    composer.addPass(smaa);
    composer.addPass(new OutputPass());
    composerRef.current = composer;

    // Drag / click
    const dragPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let dragging=false, dragId=null;
    let lotDragging=false, lotDragType=null, lotDragFixed=null;
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

      // ── Lot handle drag ─────────────────────────────────────────────────────
      if(lotEditModeRef.current && handleMeshesRef.current.length>0){
        const hHits=raycaster.intersectObjects(handleMeshesRef.current,false);
        if(hHits.length){
          const type=hHits[0].object.userData.handleType;
          lotDragging=true; lotDragType=type; controls.enabled=false;
          renderer.domElement.style.cursor="crosshair";
          if(type!=="center"){
            const {w,d,ox,oz}=lotRef.current;
            const opp={NW:{x:ox+w/2,z:oz+d/2},NE:{x:ox-w/2,z:oz+d/2},SW:{x:ox+w/2,z:oz-d/2},SE:{x:ox-w/2,z:oz-d/2}};
            lotDragFixed=opp[type];
          } else {
            const pt=planeHit();
            if(pt) dragOffset.set(lotRef.current.ox-pt.x,0,lotRef.current.oz-pt.z);
          }
          return;
        }
      }

      // ── Element drag ────────────────────────────────────────────────────────
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
      ndc(e);
      if(lotDragging){
        const pt=planeHit(); if(!pt) return;
        if(lotDragType==="center"){
          const nx=pt.x+dragOffset.x, nz=pt.z+dragOffset.z;
          lotRef.current.ox=nx; lotRef.current.oz=nz;
          setLotOX(nx); setLotOZ(nz);
        } else {
          const {x:fx,z:fz}=lotDragFixed;
          const newW=Math.max(20,Math.abs(pt.x-fx));
          const newD=Math.max(20,Math.abs(pt.z-fz));
          const newOX=(pt.x+fx)/2, newOZ=(pt.z+fz)/2;
          lotRef.current={w:newW,d:newD,ox:newOX,oz:newOZ};
          setLotW(newW); setLotD(newD); setLotOX(newOX); setLotOZ(newOZ);
        }
        needsRenderRef.current=true;
        return;
      }
      if(!dragging||!dragId){
        // Hover cursor: show grab when over a draggable element
        const hMeshes=[];
        Object.values(groupsRef.current).forEach(g=>g.traverse(c=>{if(c.isMesh&&c.name!=="selection_ring")hMeshes.push(c);}));
        const hHits=raycaster.intersectObjects(hMeshes,false);
        renderer.domElement.style.cursor=hHits.length?"grab":"auto";
        return;
      }
      const pt=planeHit(); const gr=groupsRef.current[dragId];
      if(pt&&gr){
        let nx=pt.x+dragOffset.x, nz=pt.z+dragOffset.z;
        if(snapRef.current){const s=2;nx=Math.round(nx/s)*s;nz=Math.round(nz/s)*s;}
        // Clamp to lot boundaries
        const {w:lw,d:ld,ox:lox,oz:loz}=lotRef.current;
        const dragEl=elementsRef.current.find(el=>el.id===dragId);
        const hw=(dragEl?.w||4)/2, hd=(dragEl?.d||4)/2;
        nx=Math.max(lox-lw/2+hw, Math.min(lox+lw/2-hw, nx));
        nz=Math.max(loz-ld/2+hd, Math.min(loz+ld/2-hd, nz));
        gr.position.x=nx; gr.position.z=nz;
        needsRenderRef.current=true;
      }
    };
    const onPointerUp = () => {
      if(lotDragging){
        lotDragging=false; lotDragType=null; lotDragFixed=null;
        controls.enabled=true; renderer.domElement.style.cursor="auto";
        return;
      }
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
      composerRef.current?.setSize(W2, H2);
      needsRenderRef.current = true;
    };
    window.addEventListener("resize", onResize);
    setTimeout(onResize, 100);

    // On-demand rendering — only draw when something actually changed
    controls.addEventListener('change', ()=>{ needsRenderRef.current=true; });

    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      controls.update();
      if(!needsRenderRef.current) return;
      needsRenderRef.current = false;
      const sel=selectedIdRef.current;
      Object.entries(groupsRef.current).forEach(([id,g])=>{
        const ring=g.getObjectByName("selection_ring");
        if(ring) ring.visible = id===sel;
      });
      if(composerRef.current) composerRef.current.render();
      else renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup",   onPointerUp);
      controls.dispose(); composerRef.current?.dispose(); renderer.dispose();
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  },[]);

  // ── Keep refs in sync ────────────────────────────────────────────────────
  useEffect(()=>{ lotEditModeRef.current=lotEditMode; },[lotEditMode]);
  useEffect(()=>{ photoModeRef.current=photoMode; },[photoMode]);

  // ── Street view: fetch image and check response before rendering ────────
  const loadStreetView = useCallback(async ()=>{
    if(!geoCoords) return;
    setSvLoading(true); setSvError(null); setSvUrl(null);
    const url=`/api/streetview?lat=${geoCoords.lat}&lon=${geoCoords.lon}&heading=${svHeading}&pitch=${svPitch}&fov=${svFov}`;
    try {
      const r = await fetch(url);
      if(!r.ok){
        const body = await r.json().catch(()=>({error:`HTTP ${r.status}`}));
        setSvError(body.error || `Request failed (${r.status})`);
        return;
      }
      const blob = await r.blob();
      // Revoke previous object URL to avoid memory leaks
      setSvUrl(prev=>{ if(prev?.startsWith("blob:")) URL.revokeObjectURL(prev); return null; });
      setSvUrl(URL.createObjectURL(blob));
    } catch(e){
      setSvError(`Network error: ${e.message}`);
    } finally {
      setSvLoading(false);
    }
  },[geoCoords,svHeading,svPitch,svFov]);

  // ── AI: map detected feature types to catalog items ──────────────────────
  const AI_TYPE_MAP = {
    concrete_patio: 'patio', deck: 'patio', raised_bed: 'patio',
    fence: 'retaining_wall', retaining_wall: 'retaining_wall', shed: 'retaining_wall',
    tree: 'tree_shade', shrub: 'shrub', lawn: 'lawn',
    pool: 'pool_rect', pergola: 'pergola',
  };

  const applyAiScene = useCallback((aiData)=>{
    // Update lot dimensions from AI estimate
    const w = Math.max(20, Math.min(aiData.spaceWidth  || 40, 200));
    const d = Math.max(20, Math.min(aiData.spaceDepth  || 60, 200));
    setLotW(w); setLotD(d); setLotOX(0); setLotOZ(0);
    lotRef.current = { w, d, ox: 0, oz: 0 };

    // Set camera to match detected perspective
    const cam = cameraRef.current; const ctrl = controlsRef.current;
    if (cam && ctrl) {
      const h    = Math.max(3, aiData.cameraHeightFt || 5.5);
      const tilt = Math.max(5, Math.min(aiData.cameraTiltDeg || 20, 55)) * Math.PI / 180;
      const eyeDist = h / Math.tan(tilt);
      cam.position.set(0, h, d * 0.5 + eyeDist);
      cam.lookAt(0, 0, 0);
      ctrl.target.set(0, 0, 0);
      ctrl.maxPolarAngle = Math.PI * 0.78;
      ctrl.minPolarAngle = Math.PI * 0.05;
      ctrl.minAzimuthAngle = -Math.PI * 0.35;
      ctrl.maxAzimuthAngle =  Math.PI * 0.35;
      ctrl.update();
    }

    // Build elements from detected features
    const features = aiData.existingFeatures || [];
    const newEls = features.map(f => {
      const type = AI_TYPE_MAP[f.type] || 'patio';
      const cfg  = ITEM_MAP[type] || { label: f.type, color: 0x888888 };
      return {
        id:       `ai_${f.type}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        type,
        label:    cfg.label || f.type,
        color:    cfg.color ?? 0x888888,
        w:        Math.max(2, f.widthFt  || cfg.w || 10),
        d:        Math.max(2, f.depthFt  || cfg.d || 10),
        rotation: 0,
        x:        f.xFt  || 0,
        z:        (f.zFt || 0) - d * 0.5 + (f.depthFt || 10) * 0.5,
      };
    });

    if (newEls.length > 0) setElements(prev => [...prev, ...newEls]);
    invalidate();
  }, []);

  // ── Photo upload: enter overlay mode with user's own photo ───────────────
  const analyzePhoto = useCallback(async (file)=>{
    setAiAnalyzing(true); setAiError(null); setAiScene(null);
    try {
      const b64 = await resizeAndEncode(file);
      if (!b64) throw new Error('Could not read image');
      const r = await fetch('/api/analyze-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, mediaType: 'image/jpeg' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        setAiError(err.error || 'Analysis failed');
        return;
      }
      const scene = await r.json();
      setAiScene(scene);
      applyAiScene(scene);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiAnalyzing(false);
    }
  }, [applyAiScene]);

  const applyPhotoFile = useCallback((file)=>{
    if(!file||!file.type.startsWith('image/')) return;
    if(photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoMode(true);
    setSvMode(false);
    setAiScene(null);
    setAiError(null);
    analyzePhoto(file);
  },[photoUrl, analyzePhoto]);

  const handlePhotoUpload = useCallback((e)=>{
    applyPhotoFile(e.target.files?.[0]);
  },[applyPhotoFile]);

  const [dragOver, setDragOver] = useState(false);

  const onDropzoneDragOver = useCallback((e)=>{
    e.preventDefault();
    if(e.dataTransfer.types.includes('Files')) setDragOver(true);
  },[]);
  const onDropzoneDragLeave = useCallback(()=>setDragOver(false),[]);
  const onDropzoneDrop = useCallback((e)=>{
    e.preventDefault(); setDragOver(false);
    applyPhotoFile(e.dataTransfer.files?.[0]);
  },[applyPhotoFile]);

  useEffect(()=>{
    const scene=sceneRef.current; if(!scene) return;
    const ground=groundGroupRef.current; const sat=satMeshRef.current;
    const cam=cameraRef.current; const ctrl=controlsRef.current;
    if(photoMode){
      scene.background=null; scene.fog=null;
      if(skyDomeRef.current) skyDomeRef.current.visible=false;
      if(ground) ground.visible=false;
      if(sat) sat.visible=false;
      if(cam&&ctrl){
        const {w,d,ox,oz}=lotRef.current;
        const h=5.5, eyeDist=30;
        cam.position.set(ox, h, oz+d*0.5+eyeDist);
        cam.lookAt(ox,0,oz);
        ctrl.target.set(ox,0,oz);
        // Constrain rotation so elements stay anchored to photo angle
        ctrl.maxPolarAngle=Math.PI*0.78;
        ctrl.minPolarAngle=Math.PI*0.05;
        ctrl.minAzimuthAngle=-Math.PI*0.35;
        ctrl.maxAzimuthAngle= Math.PI*0.35;
        ctrl.update();
      }
      invalidate();
    } else if(!svMode){
      scene.background=null;
      scene.fog=new THREE.FogExp2(0xC8E8F5,0.0007);
      if(skyDomeRef.current) skyDomeRef.current.visible=true;
      if(ground) ground.visible=true;
      if(sat) sat.visible=!!geoCoords;
      if(ctrl){
        ctrl.minAzimuthAngle=-Infinity;
        ctrl.maxAzimuthAngle= Infinity;
        ctrl.minPolarAngle=0;
        ctrl.maxPolarAngle=Math.PI/2.05;
      }
      invalidate();
    }
  },[photoMode]);

  // ── Street view: toggle Three.js transparent/opaque mode ─────────────────
  useEffect(()=>{
    const scene=sceneRef.current;
    if(!scene) return;
    const cam=cameraRef.current; const ctrl=controlsRef.current;
    const ground=groundGroupRef.current; const sat=satMeshRef.current;
    if(svMode){
      // Transparent canvas — real photo shows through from behind
      scene.background=null; scene.fog=null;
      if(skyDomeRef.current) skyDomeRef.current.visible=false;
      if(ground) ground.visible=false;
      if(sat) sat.visible=false;
      // Street-level camera facing the front of the lot
      if(cam&&ctrl){
        const {w,d,ox,oz}=lotRef.current;
        cam.position.set(ox, 5, oz+d*0.55+20);
        cam.lookAt(ox,3,oz-d*0.1);
        ctrl.target.set(ox,3,oz-d*0.1);
        ctrl.maxPolarAngle=Math.PI*0.85;
        ctrl.update();
      }
      if(geoCoords && !svUrl) loadStreetView();
    } else {
      scene.background=null;
      scene.fog=new THREE.FogExp2(0xC8E8F5,0.0007);
      if(skyDomeRef.current) skyDomeRef.current.visible=true;
      if(ground) ground.visible=true;
      if(sat) sat.visible=true;
    }
  },[svMode]);

  // ── Top / 3D view preset ─────────────────────────────────────────────────
  useEffect(()=>{
    const cam=cameraRef.current; const controls=controlsRef.current;
    if(!cam||!controls) return;
    const {w,d,ox,oz}=lotRef.current;
    const dist=Math.max(w,d);
    if(viewMode==="top"){
      cam.position.set(ox, dist*2.8, oz+dist*0.3);
      cam.lookAt(ox,0,oz);
      controls.target.set(ox,0,oz);
      controls.maxPolarAngle=Math.PI/2.05;
    } else {
      // Ground-level 3D: stand outside the front edge, eye height, look into yard
      cam.position.set(ox, 6, oz+d*0.65);
      cam.lookAt(ox, 2, oz-d*0.2);
      controls.target.set(ox,2,oz-d*0.2);
      controls.maxPolarAngle=Math.PI*0.82; // allow looking up slightly
    }
    controls.update();
  },[viewMode]);

  // ── Ground / boundary builder ─────────────────────────────────────────────
  function buildAndAddGround(scene, w, d, ox=0, oz=0, editMode=false){
    if(groundGroupRef.current){
      groundGroupRef.current.traverse(o=>{if(o.isMesh||o.isLine){o.geometry?.dispose();o.material?.dispose();}});
      scene.remove(groundGroupRef.current);
    }
    handleMeshesRef.current=[];
    const g=new THREE.Group();

    // Wide grass base — MeshStandardMaterial for proper lighting + shadows
    const gMesh=new THREE.Mesh(
      new THREE.PlaneGeometry(w*60,d*60),
      new THREE.MeshStandardMaterial({map:grassTexture(),roughness:0.92,metalness:0,envMapIntensity:0.3})
    );
    gMesh.rotation.x=-Math.PI/2; gMesh.position.y=-0.1; gMesh.receiveShadow=true; g.add(gMesh);
    // Invisible drag hit plane
    const hit=new THREE.Mesh(new THREE.PlaneGeometry(w*60,d*60),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
    hit.rotation.x=-Math.PI/2; g.add(hit);

    // Lot boundary group (offset to lot center)
    const bGroup=new THREE.Group(); bGroup.position.set(ox,0,oz); g.add(bGroup);

    // Boundary line
    const h=0.25;
    const pts=[new THREE.Vector3(-w/2,h,-d/2),new THREE.Vector3(w/2,h,-d/2),
               new THREE.Vector3(w/2,h,d/2), new THREE.Vector3(-w/2,h,d/2),new THREE.Vector3(-w/2,h,-d/2)];
    bGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xF59E0B,linewidth:2})));

    // Dimension labels (thin planes with canvas texture)
    const makeLabel=(text,px,py,pz,ry=0)=>{
      const c=document.createElement("canvas"); c.width=256; c.height=64;
      const ctx=c.getContext("2d");
      ctx.fillStyle="rgba(0,0,0,0)"; ctx.clearRect(0,0,256,64);
      ctx.fillStyle="#F59E0B"; ctx.font="bold 28px sans-serif"; ctx.textAlign="center";
      ctx.fillText(text,128,40);
      const t=new THREE.CanvasTexture(c);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w>d?w*0.4:d*0.4,6),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
      m.position.set(px,py,pz); m.rotation.y=ry; bGroup.add(m);
    };
    makeLabel(`${Math.round(w)}′`,0,2,d/2+4);
    makeLabel(`${Math.round(d)}′`,-(w/2+4),2,0,Math.PI/2);

    if(editMode){
      // Corner resize handles
      [['NW',-w/2,-d/2],['NE',w/2,-d/2],['SW',-w/2,d/2],['SE',w/2,d/2]].forEach(([name,cx,cz])=>{
        const h=new THREE.Mesh(new THREE.BoxGeometry(5,5,5),new THREE.MeshBasicMaterial({color:0xFFD700}));
        h.position.set(cx,2.5,cz); h.userData={isLotHandle:true,handleType:name};
        bGroup.add(h); handleMeshesRef.current.push(h);
      });
      // Center move handle
      const ctr=new THREE.Mesh(new THREE.SphereGeometry(3.5,10,10),new THREE.MeshBasicMaterial({color:0xFF6B00}));
      ctr.position.set(0,3,0); ctr.userData={isLotHandle:true,handleType:"center"};
      bGroup.add(ctr); handleMeshesRef.current.push(ctr);
    } else {
      [[w/2,-d/2],[w/2,d/2],[-w/2,-d/2],[-w/2,d/2]].forEach(([cx,cz])=>{
        const m=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,3,8),new THREE.MeshBasicMaterial({color:0xF59E0B}));
        m.position.set(cx,1.5,cz); bGroup.add(m);
      });
    }

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
      setSatLoaded(true); invalidate();
    }).catch(()=>setSatLoaded(false)).finally(()=>setSatLoading(false));
  },[geoCoords,lotW,lotD]);

  // ── Sync lot → scene ─────────────────────────────────────────────────────
  useEffect(()=>{
    const scene=sceneRef.current; if(!scene) return;
    lotRef.current={w:lotW,d:lotD,ox:lotOX,oz:lotOZ};
    // In photo mode, build ground (for the invisible drag plane) but keep it hidden
    buildAndAddGround(scene,lotW,lotD,lotOX,lotOZ,lotEditMode && !photoMode);
    if(photoMode && groundGroupRef.current) groundGroupRef.current.visible=false;
    invalidate();
    if(!satMeshRef.current && !photoMode){
      const cam=cameraRef.current; const controls=controlsRef.current;
      if(cam&&controls){
        const dist=Math.max(lotW,lotD);
        cam.position.set(lotOX,dist*2.8,lotOZ+dist*0.3);
        cam.lookAt(lotOX,0,lotOZ); controls.target.set(lotOX,0,lotOZ); controls.update();
      }
    }
  },[lotW,lotD,lotOX,lotOZ,lotEditMode,photoMode]);

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
        try {
          const gr=buildStructureGroup(el);
          gr.position.set(el.x??0, 0, el.z??0);
          gr.rotation.y=(el.rotation||0)*Math.PI/180;
          scene.add(gr); groupsRef.current[el.id]=gr;
        } catch(e) {
          console.error('buildStructureGroup failed for', el.id, e);
          // Placeholder so the element stays selectable/visible until next rebuild
          const ph=new THREE.Group();
          ph.position.set(el.x??0, 0, el.z??0);
          scene.add(ph); groupsRef.current[el.id]=ph;
        }
      } else {
        groupsRef.current[el.id].rotation.y=(el.rotation||0)*Math.PI/180;
      }
    });
    invalidate();
  },[elements]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave=useCallback(async()=>{
    if(!designId) return;
    setSaving(true);
    try {
      await base44.entities.Design.update(designId,{
        canvas_data:{elements:elementsRef.current,lotW,lotD,lotOX,lotOZ,geoCoords},
      });
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    } finally{ setSaving(false); }
  },[designId,lotW,lotD,lotOX,lotOZ,geoCoords]);

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
    const el={
      id, type:item.type, label:item.label, color:item.color, w:item.w, d:item.d, rotation:0,
      x:(Math.random()-0.5)*w*0.4, z:(Math.random()-0.5)*d*0.4,
      ...(KITCHEN_ELEMENT_TYPES.has(item.type)
        ? { kitchenConfig: { levels:1, ledge:'concrete', sections:[], barHeightIn:42, barDepthIn:14 } }
        : {}),
      ...(DEFAULT_BUILD_CONFIGS[item.type] ? { buildConfig: { ...DEFAULT_BUILD_CONFIGS[item.type] } } : {}),
    };
    setElements(prev=>[...prev,el]);
    setSelectedId(id); selectedIdRef.current=id; setActivePanel("props");
  };

  const updateElement=(id,patch)=>{
    setElements(prev=>prev.map(el=>el.id===id?{...el,...patch}:el));
    if(patch.color!==undefined||patch.w!==undefined||patch.d!==undefined||patch.kitchenConfig!==undefined||patch.buildConfig!==undefined){
      const scene=sceneRef.current;
      if(scene&&groupsRef.current[id]){
        // Keep old group in scene until the new one successfully rebuilds
        // (useEffect will remove the old group when it adds the new one)
        const old=groupsRef.current[id];
        scene.remove(old);
        delete groupsRef.current[id];
      }
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

        {/* View toggle — hidden in photo mode (camera is fixed to photo angle) */}
        {!photoMode && (
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
        )}

        <button onClick={()=>setSnapGrid(s=>!s)}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            snapGrid?"bg-blue-600 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
          <Grid3x3 className="w-3.5 h-3.5"/> Snap
        </button>

        {!photoMode && (
          <button onClick={()=>setShowLotSetup(true)}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
              geoCoords&&satLoaded?"bg-emerald-700 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
            <RulerIcon className="w-3.5 h-3.5"/>
            {satLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : null}
            {geoCoords&&satLoaded ? "Aerial ✓" : geoCoords ? "Aerial…" : `${Math.round(lotW)}′×${Math.round(lotD)}′`}
          </button>
        )}

        {!photoMode && (
          <button onClick={()=>setLotEditMode(m=>!m)}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              lotEditMode
                ?"bg-yellow-500 text-black border-yellow-400"
                :"bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-600")}>
            <Maximize2 className="w-3.5 h-3.5"/>
            {lotEditMode?"Done Editing":"Edit Boundary"}
          </button>
        )}

        {!photoMode && (
          <button onClick={()=>setSvMode(m=>!m)}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              svMode
                ?"bg-sky-500 text-white border-sky-400"
                :"bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-600")}>
            <Camera className="w-3.5 h-3.5"/>
            {svMode?"Exit Street View":"Street View"}
          </button>
        )}

        {/* Upload your own photo → AI analyzes → 3D scene */}
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
          onChange={handlePhotoUpload}/>
        <button
          onClick={()=>{ if(photoMode){ setPhotoMode(false); setAiScene(null); setAiError(null); } else { photoInputRef.current?.click(); } }}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            aiAnalyzing
              ?"bg-amber-500 text-black border-amber-400"
              :photoMode
                ?"bg-emerald-500 text-white border-emerald-400"
                :"bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-600")}>
          {aiAnalyzing
            ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
            : <Download className="w-3.5 h-3.5 rotate-180"/>}
          {aiAnalyzing?"Analyzing…":photoMode?"Exit Photo":"AI Photo Mode"}
        </button>

        {totalCost>0&&(
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-900/30 px-2.5 py-1.5 rounded-lg border border-amber-800/40">
            <DollarSign className="w-3.5 h-3.5"/> ${totalCost.toLocaleString()}
          </div>
        )}

        <button onClick={()=>setShowExport(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors shrink-0">
          <FileText className="w-3.5 h-3.5"/> Export Plan
        </button>

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
        <div className="flex-1 relative overflow-hidden bg-slate-900"
          onDragOver={onDropzoneDragOver}
          onDragLeave={onDropzoneDragLeave}
          onDrop={onDropzoneDrop}>

          {/* Drag-and-drop highlight */}
          {dragOver&&(
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-emerald-900/70 backdrop-blur-sm border-4 border-dashed border-emerald-400 pointer-events-none">
              <Download className="w-16 h-16 text-emerald-300 rotate-180 mb-3"/>
              <p className="text-emerald-200 text-xl font-bold">Drop photo to analyze</p>
              <p className="text-emerald-400 text-sm mt-1">AI will build a 3D scene from your photo</p>
            </div>
          )}

          {/* Uploaded photo background */}
          {photoMode && photoUrl && (
            <img src={photoUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="Property photo"/>
          )}
          {photoMode && !photoUrl && (
            <div className="absolute inset-0 flex items-center justify-center z-0 bg-slate-800">
              <p className="text-slate-400 text-sm">No photo loaded</p>
            </div>
          )}

          {/* Scale calibration button (photo + satellite mode) */}
          {(photoMode && photoUrl) && !scaleMode && (
            <button
              onClick={()=>setScaleMode(true)}
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-600/40 transition-colors shadow-lg">
              <RulerIcon className="w-3.5 h-3.5"/> Calibrate Scale
            </button>
          )}

          {/* Scale calibrator overlay */}
          {scaleMode && (photoMode || svMode) && (
            <ScaleCalibrator
              onApply={feetPerUnit => {
                // feetPerUnit = how many feet the full image width represents
                // Keep current aspect ratio for depth
                const newLotW = Math.round(Math.max(20, Math.min(300, feetPerUnit)));
                const ratio = lotRef.current.d / (lotRef.current.w || 1);
                const newLotD = Math.round(Math.max(20, Math.min(300, newLotW * ratio)));
                setLotW(newLotW); setLotD(newLotD);
                lotRef.current = { ...lotRef.current, w: newLotW, d: newLotD };
                setScaleMode(false);
              }}
              onClose={() => setScaleMode(false)}
            />
          )}

          {/* AI analyzing overlay */}
          {aiAnalyzing && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
              <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl px-8 py-6 flex flex-col items-center gap-3 shadow-2xl">
                <Loader2 className="w-10 h-10 text-amber-400 animate-spin"/>
                <p className="text-white font-semibold text-base">AI is analyzing your space…</p>
                <p className="text-slate-400 text-sm text-center max-w-xs">Detecting dimensions, ground type, and existing features to build your 3D scene</p>
              </div>
            </div>
          )}

          {/* Street view background photo — sits behind transparent Three.js canvas */}
          {svMode && svUrl && (
            <img
              src={svUrl}
              className="absolute inset-0 w-full h-full object-cover z-0"
              alt="Street View"
              onError={()=>setSvError("Street view image unavailable — check Google Maps API key")}
            />
          )}
          {svMode && !svUrl && !svLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-0 bg-slate-800 gap-3">
              <Camera className="w-12 h-12 text-slate-500"/>
              <p className="text-slate-400 text-sm text-center max-w-xs">
                {!geoCoords
                  ? "Enter a property address first using the lot button above."
                  : "Click \"Load Street View\" to fetch the photo."}
              </p>
              {geoCoords&&(
                <button onClick={loadStreetView}
                  className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-xs px-4 py-2 rounded-lg font-medium transition-colors">
                  <Camera className="w-3.5 h-3.5"/> Load Street View
                </button>
              )}
            </div>
          )}
          {svMode && svError && (
            <div className="absolute inset-0 flex items-center justify-center z-0 bg-slate-800">
              <div className="text-center max-w-sm px-4">
                <p className="text-rose-400 text-sm font-semibold mb-1">Street View Unavailable</p>
                <p className="text-slate-400 text-xs">{svError}</p>
                <p className="text-slate-500 text-xs mt-2">Add <code className="bg-slate-700 px-1 rounded">GOOGLE_MAPS_API_KEY</code> to Vercel environment variables.</p>
              </div>
            </div>
          )}

          {/* Three.js canvas — transparent in street view mode, opaque otherwise */}
          <div ref={mountRef} className="absolute inset-0 z-10"/>

          {/* Loading overlay */}
          {loading&&(
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-30">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500"/>
            </div>
          )}

          {/* Street view controls — compact bottom bar */}
          {svMode&&(
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 bg-black/80 backdrop-blur-sm text-white rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-2xl select-none">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide shrink-0">Heading</span>
              {[["N",0],["E",90],["S",180],["W",270]].map(([lbl,deg])=>(
                <button key={lbl} onClick={()=>{ setSvHeading(deg); setTimeout(loadStreetView,50); }}
                  className={cn("w-6 h-6 rounded text-[9px] font-bold transition-colors shrink-0",
                    svHeading===deg?"bg-sky-500 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600")}>
                  {lbl}
                </button>
              ))}
              <input type="range" min={0} max={359} value={svHeading}
                onChange={e=>setSvHeading(Number(e.target.value))}
                onMouseUp={loadStreetView} onTouchEnd={loadStreetView}
                className="w-28 accent-sky-500"/>
              <span className="text-xs text-slate-300 w-8 shrink-0">{svHeading}°</span>
              <div className="w-px h-6 bg-slate-600"/>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide shrink-0">Pitch</span>
              <input type="range" min={-45} max={45} value={svPitch}
                onChange={e=>setSvPitch(Number(e.target.value))}
                onMouseUp={loadStreetView} onTouchEnd={loadStreetView}
                className="w-20 accent-sky-500"/>
              <div className="w-px h-6 bg-slate-600"/>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide shrink-0">Zoom</span>
              <input type="range" min={50} max={120} value={svFov}
                onChange={e=>setSvFov(Number(e.target.value))}
                onMouseUp={loadStreetView} onTouchEnd={loadStreetView}
                className="w-20 accent-sky-500"/>
              <button onClick={loadStreetView}
                className="flex items-center gap-1 bg-sky-600 hover:bg-sky-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors shrink-0">
                <RotateCcw className="w-3 h-3"/> Reload
              </button>
            </div>
          )}

          {satLoading&&!svMode&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin"/>Loading aerial photo…
            </div>
          )}
          {lotEditMode&&!svMode&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-yellow-500/90 text-black text-xs px-4 py-2 rounded-full pointer-events-none select-none font-semibold shadow-lg">
              Boundary Edit Mode — Drag orange ball to move lot · Drag yellow corners to resize
            </div>
          )}
          {svMode&&svUrl&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-sky-600/90 text-white text-xs px-4 py-2 rounded-full pointer-events-none select-none font-semibold shadow-lg flex items-center gap-2">
              <Camera className="w-3.5 h-3.5"/> Street View — Add elements from palette to overlay on the photo
            </div>
          )}
          {photoMode&&photoUrl&&!aiAnalyzing&&!aiScene&&!aiError&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-emerald-600/90 text-white text-xs px-4 py-2 rounded-full pointer-events-none select-none font-semibold shadow-lg flex items-center gap-2">
              <Download className="w-3.5 h-3.5 rotate-180"/> Photo Overlay — Add elements from palette · Orbit to match your camera angle
            </div>
          )}
          {photoMode&&aiScene&&!aiAnalyzing&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-500/95 text-black text-xs px-4 py-2 rounded-full pointer-events-none select-none font-semibold shadow-lg flex items-center gap-2">
              <Box className="w-3.5 h-3.5"/> AI Scene Built — {aiScene.existingFeatures?.length||0} features detected · Now add your design elements
            </div>
          )}
          {photoMode&&aiError&&!aiAnalyzing&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-sm w-full bg-rose-700/95 text-white text-xs px-4 py-3 rounded-xl select-none shadow-lg space-y-1.5">
              <p className="font-bold">AI Photo Analysis Failed</p>
              <p className="text-rose-200 leading-snug break-words">{aiError}</p>
              {aiError.includes('ANTHROPIC_API_KEY') && (
                <p className="text-rose-300 text-[10px]">Add ANTHROPIC_API_KEY to your Vercel environment variables and redeploy.</p>
              )}
              <button onClick={()=>{ if(photoUrl) fetch(photoUrl).then(r=>r.blob()).then(b=>analyzePhoto(new File([b],'photo.jpg',{type:'image/jpeg'}))); }}
                className="mt-1 underline pointer-events-auto hover:text-rose-200 transition-colors font-semibold">Retry</button>
            </div>
          )}
          {!geoCoords&&!satLoading&&!lotEditMode&&!svMode&&(
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-black/60 text-slate-300 text-xs px-3 py-1.5 rounded-full pointer-events-none select-none">
              Click the lot button above to enter an address and load the aerial photo
            </div>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/60 text-white text-[10px] px-4 py-1.5 rounded-full pointer-events-none select-none backdrop-blur-sm">
            {photoMode
              ? aiAnalyzing
                ? "AI is analyzing your photo and building a 3D scene…"
                : aiScene
                  ? `${aiScene.description || 'Space analyzed'} · Drag elements from palette to add to the 3D scene`
                  : "Orbit to match your photo angle · Add elements from palette to see them on your property"
              : svMode
                ? "Adjust heading/pitch/zoom · Add elements from the palette to overlay on the photo"
                : viewMode==="top"
                  ? "Scroll to zoom · Drag to pan · Click palette to add elements · Drag elements to move"
                  : "Scroll to zoom · Left drag to orbit · Right drag to pan · Click elements to select"}
          </div>
        </div>

        {/* Right layers */}
        <div className="w-40 bg-slate-950 border-l border-slate-700 flex flex-col shrink-0 text-white">
          <div className="p-3 border-b border-slate-700 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Project</p>
            <div><p className="text-[10px] text-slate-500">Elements</p><p className="text-xl font-bold">{elements.length}</p></div>
            <div>
              <p className="text-[10px] text-slate-500">Lot Size</p>
              <p className="text-xs font-semibold text-slate-300">{Math.round(lotW)}′ × {Math.round(lotD)}′</p>
              <p className="text-[10px] text-amber-400 font-bold">{(Math.round(lotW)*Math.round(lotD)).toLocaleString()} sq ft</p>
              <p className="text-[10px] text-slate-500">{((Math.round(lotW)*Math.round(lotD))/43560).toFixed(3)} acres</p>
            </div>
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

      {showExport&&(
        <ExportPlanModal
          elements={elements}
          lotW={lotW} lotD={lotD}
          lotOX={lotOX} lotOZ={lotOZ}
          design={design}
          onClose={()=>setShowExport(false)}
        />
      )}
    </div>
  );
}
