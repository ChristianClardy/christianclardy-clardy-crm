import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, Copy, ChevronDown, ChevronUp, Wand2, X, Check, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import TemplateRowEditor from "@/components/templates/TemplateRowEditor";
import MaterialLibrary from "@/components/workspace/MaterialLibrary";
import EstimateTemplates from "@/components/workspace/EstimateTemplates";

const BASIC_CONSTRUCTION_TEMPLATE = [
  { id: "s1", section: "Site Preparation", task: "Site Preparation", is_section_header: true },
  { id: "r1", section: "Site Preparation", task: "Site survey & staking", is_section_header: false },
  { id: "r2", section: "Site Preparation", task: "Lot clearing & demolition", is_section_header: false },
  { id: "r3", section: "Site Preparation", task: "Grading & drainage", is_section_header: false },
  { id: "r4", section: "Site Preparation", task: "Temporary utilities setup", is_section_header: false },
  { id: "s2", section: "Foundation", task: "Foundation", is_section_header: true },
  { id: "r5", section: "Foundation", task: "Excavation", is_section_header: false },
  { id: "r6", section: "Foundation", task: "Footings", is_section_header: false },
  { id: "r7", section: "Foundation", task: "Foundation walls / slab", is_section_header: false },
  { id: "r8", section: "Foundation", task: "Waterproofing & drainage", is_section_header: false },
  { id: "r9", section: "Foundation", task: "Backfill", is_section_header: false },
  { id: "s3", section: "Framing", task: "Framing", is_section_header: true },
  { id: "r10", section: "Framing", task: "Floor framing", is_section_header: false },
  { id: "r11", section: "Framing", task: "Wall framing", is_section_header: false },
  { id: "r12", section: "Framing", task: "Roof framing", is_section_header: false },
  { id: "r13", section: "Framing", task: "Sheathing & wrap", is_section_header: false },
  { id: "s4", section: "Exterior", task: "Exterior", is_section_header: true },
  { id: "r14", section: "Exterior", task: "Roofing", is_section_header: false },
  { id: "r15", section: "Exterior", task: "Siding / cladding", is_section_header: false },
  { id: "r16", section: "Exterior", task: "Windows & exterior doors", is_section_header: false },
  { id: "r17", section: "Exterior", task: "Exterior trim & finish", is_section_header: false },
  { id: "s5", section: "Rough-In", task: "Rough-In (MEP)", is_section_header: true },
  { id: "r18", section: "Rough-In", task: "Plumbing rough-in", is_section_header: false },
  { id: "r19", section: "Rough-In", task: "Electrical rough-in", is_section_header: false },
  { id: "r20", section: "Rough-In", task: "HVAC rough-in & ductwork", is_section_header: false },
  { id: "r21", section: "Rough-In", task: "Rough-in inspections", is_section_header: false },
  { id: "s6", section: "Insulation", task: "Insulation", is_section_header: true },
  { id: "r22", section: "Insulation", task: "Wall insulation", is_section_header: false },
  { id: "r23", section: "Insulation", task: "Ceiling / attic insulation", is_section_header: false },
  { id: "r24", section: "Insulation", task: "Vapor barrier", is_section_header: false },
  { id: "s7", section: "Drywall", task: "Drywall", is_section_header: true },
  { id: "r25", section: "Drywall", task: "Hang drywall", is_section_header: false },
  { id: "r26", section: "Drywall", task: "Tape, mud & sand", is_section_header: false },
  { id: "r27", section: "Drywall", task: "Prime coat", is_section_header: false },
  { id: "s8", section: "Interior Finishes", task: "Interior Finishes", is_section_header: true },
  { id: "r28", section: "Interior Finishes", task: "Interior doors & trim", is_section_header: false },
  { id: "r29", section: "Interior Finishes", task: "Flooring installation", is_section_header: false },
  { id: "r30", section: "Interior Finishes", task: "Cabinetry & millwork", is_section_header: false },
  { id: "r31", section: "Interior Finishes", task: "Countertops", is_section_header: false },
  { id: "r32", section: "Interior Finishes", task: "Tile work", is_section_header: false },
  { id: "r33", section: "Interior Finishes", task: "Paint – finish coats", is_section_header: false },
  { id: "s9", section: "Mechanical Finishes", task: "Mechanical Finishes (MEP)", is_section_header: true },
  { id: "r34", section: "Mechanical Finishes", task: "Plumbing fixtures & trim", is_section_header: false },
  { id: "r35", section: "Mechanical Finishes", task: "Electrical fixtures & panels", is_section_header: false },
  { id: "r36", section: "Mechanical Finishes", task: "HVAC equipment & finish", is_section_header: false },
  { id: "s10", section: "Final", task: "Final & Closeout", is_section_header: true },
  { id: "r37", section: "Final", task: "Final inspections", is_section_header: false },
  { id: "r38", section: "Final", task: "Punch list", is_section_header: false },
  { id: "r39", section: "Final", task: "Landscaping & site cleanup", is_section_header: false },
  { id: "r40", section: "Final", task: "Certificate of Occupancy", is_section_header: false },
];

const PRESET_ITEMS_BY_SECTION = {
  "Site Preparation": ["Site survey & staking", "Lot clearing & demolition", "Grading & drainage", "Erosion control", "Temporary utilities setup", "Permit acquisition"],
  "Foundation": ["Excavation", "Footings", "Foundation walls / slab", "Waterproofing & drainage", "Backfill", "Foundation inspection"],
  "Framing": ["Floor framing", "Wall framing", "Roof framing", "Sheathing & wrap", "Framing inspection"],
  "Exterior": ["Roofing", "Siding / cladding", "Windows & exterior doors", "Exterior trim & finish", "Gutters & downspouts"],
  "Rough-In (MEP)": ["Plumbing rough-in", "Electrical rough-in", "HVAC rough-in & ductwork", "Rough-in inspections"],
  "Insulation": ["Wall insulation", "Ceiling / attic insulation", "Vapor barrier", "Spray foam"],
  "Drywall": ["Hang drywall", "Tape, mud & sand", "Prime coat"],
  "Interior Finishes": ["Interior doors & trim", "Flooring installation", "Cabinetry & millwork", "Countertops", "Tile work", "Paint – finish coats", "Stair installation"],
  "Mechanical Finishes": ["Plumbing fixtures & trim", "Electrical fixtures & panels", "HVAC equipment & finish"],
  "Final & Closeout": ["Final inspections", "Punch list", "Landscaping & site cleanup", "Certificate of Occupancy", "Owner walkthrough"],
};

export default function WorkplaceItems() {
  const [activeSection, setActiveSection] = useState("project_templates");
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    rows: [],
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await base44.entities.ProjectSheetTemplate.list("-updated_date");
      setTemplates(data);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const [showItemPicker, setShowItemPicker] = useState(false);
  const [pickerSection, setPickerSection] = useState(Object.keys(PRESET_ITEMS_BY_SECTION)[0]);
  const [customItemText, setCustomItemText] = useState("");
  const [isSection, setIsSection] = useState(false);
  const [showAIPicker, setShowAIPicker] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Undo / Redo history for rows
  const [rowHistory, setRowHistory] = useState({ past: [], future: [] });

  const setRows = useCallback((newRows) => {
    setRowHistory(h => ({ past: [...h.past, formData.rows], future: [] }));
    setFormData(prev => ({ ...prev, rows: newRows }));
  }, [formData.rows]);

  const handleUndo = useCallback(() => {
    setRowHistory(h => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      setFormData(fd => ({ ...fd, rows: prev }));
      return { past: h.past.slice(0, -1), future: [formData.rows, ...h.future] };
    });
  }, [formData.rows]);

  const handleRedo = useCallback(() => {
    setRowHistory(h => {
      if (!h.future.length) return h;
      const next = h.future[0];
      setFormData(fd => ({ ...fd, rows: next }));
      return { past: [...h.past, formData.rows], future: h.future.slice(1) };
    });
  }, [formData.rows]);

  const AI_TEMPLATE_CATEGORIES = [
    { label: "New Home Build", emoji: "🏠", prompt: "full new home construction from site prep to certificate of occupancy" },
    { label: "Pool Installation", emoji: "🏊", prompt: "residential swimming pool installation including excavation, shell, plumbing, electrical, decking and landscaping" },
    { label: "Outdoor Structure", emoji: "🏗️", prompt: "outdoor structure such as a pergola, gazebo, or covered patio including foundation, framing, roofing and finishing" },
    { label: "Kitchen Remodel", emoji: "🍳", prompt: "full kitchen remodel including demo, rough-in, cabinets, countertops, appliances and finish work" },
    { label: "Bathroom Remodel", emoji: "🛁", prompt: "full bathroom remodel including demo, plumbing, tile, fixtures and finish work" },
    { label: "Roof Replacement", emoji: "🏚️", prompt: "full roof replacement including tear-off, decking inspection, underlayment, shingles and gutters" },
    { label: "Deck / Patio", emoji: "🌿", prompt: "deck or patio construction including design, footings, framing, decking material and railings" },
    { label: "Garage Addition", emoji: "🚗", prompt: "attached or detached garage addition including foundation, framing, electrical, doors and finishing" },
    { label: "Room Addition", emoji: "🏡", prompt: "home room addition including foundation, framing, MEP rough-in, insulation, drywall and finishes" },
    { label: "Commercial Build-Out", emoji: "🏢", prompt: "commercial interior build-out including framing, MEP, drywall, flooring, ceilings and finishes" },
    { label: "Landscape & Hardscape", emoji: "🌳", prompt: "landscaping and hardscaping project including grading, irrigation, hardscape installation and planting" },
    { label: "HVAC Replacement", emoji: "❄️", prompt: "full HVAC system replacement including equipment removal, new unit installation, ductwork and testing" },
  ];

  const generateAITemplate = async (category) => {
    setAiGenerating(true);
    setShowAIPicker(false);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a detailed construction project schedule template for: ${category.prompt}.
Return a JSON array of rows. Each row must have these exact fields:
- id: unique string like "s1" for section headers or "r1" for tasks
- section: the section name this row belongs to
- task: the display text for the row
- is_section_header: true for section headers, false for task rows

Organize into logical phases/sections. Include 5-10 tasks per section. Be specific and practical for a professional construction company.`,
        response_json_schema: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  section: { type: "string" },
                  task: { type: "string" },
                  is_section_header: { type: "boolean" }
                }
              }
            }
          }
        }
      });
      if (result?.rows?.length) {
        setRows(result.rows);
        setFormData(prev => ({ ...prev, name: prev.name || category.label }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  const openDialog = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        description: template.description || "",
        rows: template.rows || [],
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: "",
        description: "",
        rows: [],
      });
    }
    setShowItemPicker(false);
    setCustomItemText("");
    setIsSection(false);
    setRowHistory({ past: [], future: [] });
    setIsDialogOpen(true);
  };

  const loadBasicTemplate = () => {
    setRows([...BASIC_CONSTRUCTION_TEMPLATE]);
    setFormData(prev => ({ ...prev, name: prev.name || "Home Building – Basic Construction" }));
  };

  const addPresetItem = (task, sectionName) => {
    const newRow = { id: `r${Date.now()}`, section: sectionName, task, is_section_header: false };
    setRows([...formData.rows, newRow]);
  };

  const addCustomItem = () => {
    if (!customItemText.trim()) return;
    const newRow = {
      id: `r${Date.now()}`,
      section: isSection ? customItemText.trim() : pickerSection,
      task: customItemText.trim(),
      is_section_header: isSection,
    };
    setRows([...formData.rows, newRow]);
    setCustomItemText("");
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await base44.entities.ProjectSheetTemplate.update(editingTemplate.id, formData);
      } else {
        await base44.entities.ProjectSheetTemplate.create(formData);
      }
      setIsDialogOpen(false);
      loadTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (confirm("Delete this template?")) {
      try {
        await base44.entities.ProjectSheetTemplate.delete(templateId);
        loadTemplates();
      } catch (error) {
        console.error("Error deleting template:", error);
      }
    }
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      await base44.entities.ProjectSheetTemplate.create({
        name: `${template.name} (Copy)`,
        description: template.description,
        rows: template.rows,
      });
      loadTemplates();
    } catch (error) {
      console.error("Error duplicating template:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Workspace Items</h1>
        <p className="text-slate-500 mt-1">Manage templates, materials, and workspace settings</p>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: "project_templates", label: "Project Schedule Templates" },
          { key: "estimate_templates", label: "Estimate Templates" },
          { key: "materials", label: "Material Library" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={cn("text-sm px-4 py-2 rounded-lg font-medium transition-all", activeSection === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Material Library */}
      {activeSection === "materials" && <MaterialLibrary />}

      {/* Estimate Templates */}
      {activeSection === "estimate_templates" && <EstimateTemplates />}

      {/* Project Sheet Templates Section */}
      {activeSection === "project_templates" && <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Project Schedule Templates</h2>
          <Button onClick={() => openDialog()} className="bg-gradient-to-r from-amber-500 to-orange-500" size="sm">
            <Plus className="w-4 h-4 mr-2" /> New Template
          </Button>
        </div>

        {templates.length > 0 ? (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() =>
                      setExpandedTemplate(expandedTemplate === template.id ? null : template.id)
                    }
                    className="flex-1 text-left flex items-center gap-3 hover:opacity-70 transition-opacity"
                  >
                    {expandedTemplate === template.id ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{template.name}</p>
                      {template.description && (
                        <p className="text-sm text-slate-500">{template.description}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {template.rows?.length || 0} items
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDuplicateTemplate(template)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDialog(template)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {expandedTemplate === template.id && template.rows?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                    {template.rows.map((row, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "text-sm p-2 rounded",
                          row.is_section_header
                            ? "bg-slate-100 font-semibold text-slate-900"
                            : "bg-slate-50 text-slate-700"
                        )}
                      >
                        {row.task || row.section}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">No templates yet. Create one to get started.</p>
        )}
      </div>}

      {/* Template Dialog — always rendered so it can open from any section */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTemplate} className="space-y-4">
            <div>
              <Label>Template Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Residential Construction"
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description for this template"
                className="mt-1.5"
                rows={2}
              />
            </div>

            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-900">Template Items</p>
                <div className="flex gap-2">
                  {formData.rows.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadBasicTemplate}
                      className="text-amber-700 border-amber-300 hover:bg-amber-50 gap-1.5"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Basic Template
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAIPicker(v => !v)}
                    className="text-purple-700 border-purple-300 hover:bg-purple-50 gap-1.5"
                    disabled={aiGenerating}
                  >
                    {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiGenerating ? "Generating…" : "AI Templates"}
                  </Button>
                </div>
              </div>

              {/* AI Template Picker */}
              {showAIPicker && !aiGenerating && (
                <div className="mb-3 border border-purple-200 rounded-xl bg-purple-50 p-3">
                  <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Choose a project type — AI will generate a full schedule
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {AI_TEMPLATE_CATEGORIES.map(cat => (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => generateAITemplate(cat)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-purple-200 text-sm text-slate-700 hover:border-purple-400 hover:bg-purple-50 transition-all text-left"
                      >
                        <span className="text-base">{cat.emoji}</span>
                        <span className="text-xs font-medium leading-tight">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {aiGenerating && (
                <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-purple-200 bg-purple-50 text-sm text-purple-700">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  AI is generating your template schedule…
                </div>
              )}

              {/* Rows editor with drag-and-drop, bulk select, undo/redo */}
              <div className="mb-3">
                <TemplateRowEditor
                  rows={formData.rows}
                  onChange={setRows}
                  history={rowHistory}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                />
              </div>

              {/* Add Item toggle */}
              {!showItemPicker ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowItemPicker(true)}
                  className="w-full border-dashed"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              ) : (
                <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
                  {/* Toggle section vs task */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSection(false)}
                      className={cn("flex-1 text-xs py-1.5 rounded border transition-all", !isSection ? "bg-white border-amber-400 text-amber-700 font-medium" : "border-slate-200 text-slate-500")}
                    >
                      Task / Row
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSection(true)}
                      className={cn("flex-1 text-xs py-1.5 rounded border transition-all", isSection ? "bg-white border-amber-400 text-amber-700 font-medium" : "border-slate-200 text-slate-500")}
                    >
                      Section Header
                    </button>
                  </div>

                  {!isSection && (
                    <>
                      {/* Section picker */}
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Section</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(PRESET_ITEMS_BY_SECTION).map(sec => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setPickerSection(sec)}
                              className={cn("text-xs px-2 py-1 rounded border transition-all", pickerSection === sec ? "bg-amber-500 text-white border-amber-500" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300")}
                            >
                              {sec}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Preset items for selected section */}
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Quick add from section</p>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {PRESET_ITEMS_BY_SECTION[pickerSection]?.map(item => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => addPresetItem(item, pickerSection)}
                              className="text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:border-amber-400 hover:text-amber-700 transition-all"
                            >
                              + {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Custom text input */}
                  <div className="flex gap-2">
                    <Input
                      value={customItemText}
                      onChange={e => setCustomItemText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomItem())}
                      placeholder={isSection ? "Section name..." : "Custom item name..."}
                      className="h-8 text-sm"
                    />
                    <Button type="button" size="sm" onClick={addCustomItem} className="bg-amber-500 hover:bg-amber-600 h-8 px-3">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowItemPicker(false)} className="h-8 px-2 text-slate-400">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500">
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}