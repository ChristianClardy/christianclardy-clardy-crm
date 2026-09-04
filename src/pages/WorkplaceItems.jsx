import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, Copy, ChevronDown, ChevronUp, Wand2, X, Check, LayoutTemplate } from "lucide-react";
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
import EstimateTemplates from "@/components/workspace/EstimateTemplates";
import { STOCK_SCHEDULE_TEMPLATES } from "@/lib/stockScheduleTemplates";

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
  const [showStockPicker, setShowStockPicker] = useState(false);

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

  const applyStockTemplate = (stock) => {
    setShowStockPicker(false);
    setRows(stock.rows);
    setFormData(prev => ({ ...prev, name: prev.name || stock.label }));
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
        <p className="text-slate-500 mt-1">Manage project and estimate templates</p>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: "project_templates", label: "Project Schedule Templates" },
          { key: "estimate_templates", label: "Estimate Templates" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={cn("text-sm px-4 py-2 rounded-lg font-medium transition-all", activeSection === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {tab.label}
          </button>
        ))}
      </div>

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
                    onClick={() => setShowStockPicker(v => !v)}
                    className="text-indigo-700 border-indigo-300 hover:bg-indigo-50 gap-1.5"
                  >
                    <LayoutTemplate className="w-3.5 h-3.5" />
                    Stock Templates
                  </Button>
                </div>
              </div>

              {/* Stock Template Picker */}
              {showStockPicker && (
                <div className="mb-3 border border-indigo-200 rounded-xl bg-indigo-50 p-3">
                  <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
                    <LayoutTemplate className="w-3.5 h-3.5" /> Choose a project type to start from a built-in schedule
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STOCK_SCHEDULE_TEMPLATES.map(stock => (
                      <button
                        key={stock.key}
                        type="button"
                        onClick={() => applyStockTemplate(stock)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-indigo-200 text-sm text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left"
                      >
                        <span className="text-base">{stock.emoji}</span>
                        <span className="text-xs font-medium leading-tight">{stock.label}</span>
                      </button>
                    ))}
                  </div>
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