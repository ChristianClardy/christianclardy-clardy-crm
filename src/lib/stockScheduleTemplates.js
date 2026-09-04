// Built-in construction schedule templates — a free, deterministic
// replacement for what used to be AI-generated (Template Picker's
// "Generate" button, Workplace Items' AI template button). Same categories,
// hand-authored once instead of asked of an LLM on every click, so the
// result is identical and free every time. Rows match the shape
// src/components/sheet/ProjectSheetView.jsx and Projects.jsx already expect
// (id, section, task, is_section_header, start_date, end_date, duration,
// status) — a user can edit/reorder/save these like any other sheet once
// applied, same as before.

function row(id, section, task, isHeader, duration = "") {
  return { id, section, task, is_section_header: isHeader, start_date: "", end_date: "", duration, status: "not_started" };
}

function section(id, name, tasks) {
  const rows = [row(id, name, name, true)];
  tasks.forEach(([task, duration], i) => rows.push(row(`${id}-${i + 1}`, name, task, false, duration)));
  return rows;
}

function template(key, label, emoji, sections) {
  return { key, label, emoji, rows: sections.flat() };
}

export const STOCK_SCHEDULE_TEMPLATES = [
  template("new_home_build", "New Home Build", "🏠", [
    section("s1", "Site Prep & Foundation", [
      ["Clear, grade, and stake the site", "3 days"],
      ["Excavate and pour footings", "2 days"],
      ["Foundation walls / slab pour", "3 days"],
      ["Foundation inspection", "1 day"],
      ["Waterproofing and backfill", "2 days"],
    ]),
    section("s2", "Framing", [
      ["Floor system framing", "3 days"],
      ["Wall framing", "5 days"],
      ["Roof framing and sheathing", "4 days"],
      ["Windows and exterior doors installed", "2 days"],
      ["Framing inspection", "1 day"],
    ]),
    section("s3", "Rough-In (MEP)", [
      ["Plumbing rough-in", "3 days"],
      ["Electrical rough-in", "3 days"],
      ["HVAC rough-in", "3 days"],
      ["Rough-in inspections", "1 day"],
    ]),
    section("s4", "Exterior", [
      ["Roofing installation", "3 days"],
      ["House wrap and siding/masonry", "5 days"],
      ["Exterior paint/finish", "3 days"],
    ]),
    section("s5", "Insulation & Drywall", [
      ["Insulation installation", "2 days"],
      ["Insulation inspection", "1 day"],
      ["Drywall hang, tape, and finish", "6 days"],
      ["Interior paint (first coat)", "3 days"],
    ]),
    section("s6", "Interior Finish", [
      ["Cabinets and countertops", "4 days"],
      ["Interior trim and doors", "4 days"],
      ["Flooring installation", "5 days"],
      ["Plumbing and electrical fixtures/trim-out", "3 days"],
      ["Final paint touch-up", "1 day"],
    ]),
    section("s7", "Final", [
      ["Final grading and landscaping", "3 days"],
      ["Driveway/walkways", "2 days"],
      ["Final inspections", "1 day"],
      ["Punch list and cleaning", "2 days"],
      ["Certificate of occupancy", "1 day"],
    ]),
  ]),

  template("pool_installation", "Pool Installation", "🏊", [
    section("s1", "Layout & Excavation", [
      ["Layout and stake pool shape", "1 day"],
      ["Excavation", "2 days"],
      ["Plumbing rough-in (main drains, skimmers, returns)", "2 days"],
      ["Steel/rebar structure", "2 days"],
      ["Pre-gunite inspection", "1 day"],
    ]),
    section("s2", "Shell", [
      ["Gunite/shotcrete shell", "1 day"],
      ["Shell cure time", "7 days"],
      ["Tile and coping installation", "3 days"],
      ["Decking forms and pour", "3 days"],
    ]),
    section("s3", "Equipment & Electrical", [
      ["Equipment pad plumbing", "2 days"],
      ["Pump, filter, and heater installation", "2 days"],
      ["Electrical bonding, grounding, and pool lights", "2 days"],
      ["Automation/control system install", "1 day"],
      ["Electrical and equipment inspection", "1 day"],
    ]),
    section("s4", "Interior Finish & Startup", [
      ["Interior finish (plaster/pebble/quartz) application", "2 days"],
      ["Pool fill", "1 day"],
      ["Water chemistry startup and equipment testing", "2 days"],
      ["Pressure test plumbing", "1 day"],
    ]),
    section("s5", "Final", [
      ["Fence/safety barrier installation", "2 days"],
      ["Landscaping around pool area", "3 days"],
      ["Final walkthrough and punch list", "1 day"],
      ["Owner orientation (equipment, chemicals, warranty)", "1 day"],
    ]),
  ]),

  template("outdoor_structure", "Outdoor Structure", "🏗️", [
    section("s1", "Foundation", [
      ["Layout and permits", "1 day"],
      ["Footings/piers excavation and pour", "2 days"],
      ["Foundation inspection", "1 day"],
    ]),
    section("s2", "Framing & Roofing", [
      ["Post and beam framing", "3 days"],
      ["Roof framing/rafters", "2 days"],
      ["Roofing material installation", "2 days"],
      ["Framing inspection", "1 day"],
    ]),
    section("s3", "Finish", [
      ["Electrical (fans, lighting, outlets)", "2 days"],
      ["Ceiling/soffit finish", "2 days"],
      ["Trim, stain/paint", "2 days"],
      ["Final walkthrough and cleanup", "1 day"],
    ]),
  ]),

  template("kitchen_remodel", "Kitchen Remodel", "🍳", [
    section("s1", "Demo & Rough-In", [
      ["Protect adjacent rooms, disconnect utilities", "1 day"],
      ["Demolition (cabinets, counters, flooring)", "2 days"],
      ["Plumbing rough-in changes", "2 days"],
      ["Electrical rough-in changes", "2 days"],
      ["Rough-in inspection", "1 day"],
    ]),
    section("s2", "Walls & Flooring", [
      ["Drywall patch/repair", "2 days"],
      ["Flooring installation", "3 days"],
      ["Wall paint/finish", "2 days"],
    ]),
    section("s3", "Cabinets & Counters", [
      ["Cabinet installation", "3 days"],
      ["Countertop template", "1 day"],
      ["Countertop installation", "2 days"],
      ["Backsplash tile", "2 days"],
    ]),
    section("s4", "Fixtures & Appliances", [
      ["Plumbing fixture install (sink, faucet)", "1 day"],
      ["Electrical fixture/outlet trim-out", "1 day"],
      ["Appliance installation and hookup", "1 day"],
      ["Final punch list and cleaning", "1 day"],
    ]),
  ]),

  template("bathroom_remodel", "Bathroom Remodel", "🛁", [
    section("s1", "Demo & Rough-In", [
      ["Demolition (fixtures, tile, flooring)", "1 day"],
      ["Plumbing rough-in changes", "2 days"],
      ["Electrical rough-in changes", "1 day"],
      ["Waterproofing/membrane at wet areas", "1 day"],
      ["Rough-in inspection", "1 day"],
    ]),
    section("s2", "Tile & Surfaces", [
      ["Floor tile installation", "2 days"],
      ["Shower/tub surround tile", "3 days"],
      ["Grout and seal", "1 day"],
    ]),
    section("s3", "Fixtures & Finish", [
      ["Vanity and countertop installation", "1 day"],
      ["Toilet, sink, shower/tub fixture installation", "1 day"],
      ["Mirror, lighting, and accessories", "1 day"],
      ["Final punch list and cleaning", "1 day"],
    ]),
  ]),

  template("roof_replacement", "Roof Replacement", "🏚️", [
    section("s1", "Tear-Off", [
      ["Protect landscaping and property", "1 day"],
      ["Tear off existing roofing", "1 day"],
      ["Decking inspection and repair", "1 day"],
    ]),
    section("s2", "Installation", [
      ["Underlayment installation", "1 day"],
      ["Flashing, valleys, and vents", "1 day"],
      ["Shingle/roofing material installation", "2 days"],
      ["Ridge caps and final details", "1 day"],
    ]),
    section("s3", "Final", [
      ["Gutter install/reattachment", "1 day"],
      ["Cleanup and magnetic nail sweep", "1 day"],
      ["Final inspection and warranty paperwork", "1 day"],
    ]),
  ]),

  template("deck_patio", "Deck / Patio", "🌿", [
    section("s1", "Design & Footings", [
      ["Layout and permits", "1 day"],
      ["Footing excavation and pour", "2 days"],
      ["Footing inspection", "1 day"],
    ]),
    section("s2", "Framing & Decking", [
      ["Post and beam framing", "2 days"],
      ["Joist framing", "2 days"],
      ["Decking material installation", "3 days"],
      ["Framing inspection", "1 day"],
    ]),
    section("s3", "Railings & Finish", [
      ["Railing installation", "2 days"],
      ["Stairs installation", "1 day"],
      ["Stain/seal finish", "1 day"],
      ["Final walkthrough", "1 day"],
    ]),
  ]),

  template("garage_addition", "Garage Addition", "🚗", [
    section("s1", "Foundation", [
      ["Layout and permits", "1 day"],
      ["Excavation and footings", "2 days"],
      ["Slab pour", "1 day"],
      ["Foundation inspection", "1 day"],
    ]),
    section("s2", "Framing & Exterior", [
      ["Wall and roof framing", "4 days"],
      ["Garage door opening and installation", "1 day"],
      ["Siding/exterior finish to match house", "3 days"],
      ["Roofing", "2 days"],
      ["Framing inspection", "1 day"],
    ]),
    section("s3", "Electrical & Finish", [
      ["Electrical rough-in and trim-out", "2 days"],
      ["Drywall (if finished interior)", "3 days"],
      ["Man door and hardware", "1 day"],
      ["Final inspection and cleanup", "1 day"],
    ]),
  ]),

  template("room_addition", "Room Addition", "🏡", [
    section("s1", "Foundation", [
      ["Layout and permits", "1 day"],
      ["Excavation and footings", "2 days"],
      ["Foundation/slab pour", "2 days"],
      ["Foundation inspection", "1 day"],
    ]),
    section("s2", "Framing & Rough-In", [
      ["Wall and roof framing, tie-in to existing structure", "4 days"],
      ["Windows and exterior doors", "2 days"],
      ["Plumbing rough-in (if applicable)", "2 days"],
      ["Electrical rough-in", "2 days"],
      ["HVAC extension rough-in", "2 days"],
      ["Rough-in inspection", "1 day"],
    ]),
    section("s3", "Insulation & Drywall", [
      ["Insulation", "1 day"],
      ["Drywall hang, tape, finish", "4 days"],
      ["Interior paint", "2 days"],
    ]),
    section("s4", "Finish", [
      ["Flooring installation", "3 days"],
      ["Trim and doors", "2 days"],
      ["Fixture and outlet trim-out", "1 day"],
      ["Final punch list and cleaning", "1 day"],
    ]),
  ]),

  template("commercial_buildout", "Commercial Build-Out", "🏢", [
    section("s1", "Demo & Layout", [
      ["Site walk and permits", "2 days"],
      ["Demolition", "2 days"],
      ["Layout and wall framing", "3 days"],
    ]),
    section("s2", "MEP Rough-In", [
      ["Plumbing rough-in", "3 days"],
      ["Electrical rough-in", "3 days"],
      ["HVAC rough-in/ductwork", "3 days"],
      ["MEP inspections", "1 day"],
    ]),
    section("s3", "Finish-Out", [
      ["Drywall hang, tape, finish", "4 days"],
      ["Ceiling grid and tile", "2 days"],
      ["Flooring installation", "3 days"],
      ["Paint", "2 days"],
    ]),
    section("s4", "Final", [
      ["Fixture and equipment installation", "2 days"],
      ["Signage installation", "1 day"],
      ["Final inspections and certificate of occupancy", "2 days"],
      ["Final cleaning and punch list", "1 day"],
    ]),
  ]),

  template("landscape_hardscape", "Landscape & Hardscape", "🌳", [
    section("s1", "Grading & Layout", [
      ["Site layout and utility locates", "1 day"],
      ["Grading and drainage work", "2 days"],
      ["Irrigation rough-in", "2 days"],
    ]),
    section("s2", "Hardscape", [
      ["Base prep (gravel/sand compaction)", "2 days"],
      ["Paver/hardscape installation", "3 days"],
      ["Retaining walls (if applicable)", "2 days"],
    ]),
    section("s3", "Softscape & Final", [
      ["Planting beds and soil prep", "1 day"],
      ["Tree, shrub, and plant installation", "2 days"],
      ["Sod/seed installation", "1 day"],
      ["Irrigation testing and final walkthrough", "1 day"],
    ]),
  ]),

  template("hvac_replacement", "HVAC Replacement", "❄️", [
    section("s1", "Removal & Prep", [
      ["Site assessment and permits", "1 day"],
      ["Existing equipment removal", "1 day"],
      ["Ductwork inspection and modifications", "1 day"],
    ]),
    section("s2", "Installation", [
      ["New unit installation (indoor/outdoor)", "1 day"],
      ["Refrigerant line set and electrical connection", "1 day"],
      ["Thermostat/control installation", "1 day"],
    ]),
    section("s3", "Testing & Final", [
      ["System startup and refrigerant charge", "1 day"],
      ["Airflow testing and balancing", "1 day"],
      ["Final inspection and owner walkthrough", "1 day"],
    ]),
  ]),
];
