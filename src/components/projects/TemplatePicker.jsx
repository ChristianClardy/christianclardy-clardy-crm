import { useState } from "react";
import { Sparkles, FileText, Check, ChevronDown, ChevronUp, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

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

/**
 * TemplatePicker
 * Props:
 *   savedTemplates: array of ProjectSheetTemplate records
 *   onSelect: ({ type: 'saved'|'ai', template }) => void
 *     - type 'saved': template = { id, name, rows }
 *     - type 'ai': template = { label, rows } (rows already generated)
 *   selectedLabel: string (display label of current selection)
 *   onClear: () => void
 */
export default function TemplatePicker({ savedTemplates, onSelect, selectedLabel, onClear }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("saved"); // 'saved' | 'ai'
  const [aiLoading, setAiLoading] = useState(null); // label of category being generated
  const [customDescription, setCustomDescription] = useState("");
  const [startDate, setStartDate] = useState("");

  const handleSelectSaved = (t) => {
    onSelect({ type: "saved", template: t });
    setOpen(false);
  };

  const handleSelectAI = async (cat) => {
    const descriptionContext = customDescription.trim()
      ? `\n\nAdditional project details from the contractor: ${customDescription.trim()}`
      : "";
    const dateContext = startDate
      ? `\n\nProject start date: ${startDate}. Generate realistic start_date and end_date values (YYYY-MM-DD) for each task row based on typical durations, starting from this date.`
      : "\n\nDo not include dates — leave start_date and end_date as empty strings.";

    setAiLoading(cat.label);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        model: "gpt_5_mini",
        prompt: `Generate a detailed construction project schedule for: ${cat.prompt}.${descriptionContext}${dateContext}

Return a JSON object with a "rows" array. Each row must have these exact fields:
- id: unique string like "s1" for section headers or "r1" for tasks
- section: the section name this row belongs to
- task: the display text for the row
- is_section_header: true for section headers, false for task rows
- start_date: YYYY-MM-DD string or empty string
- end_date: YYYY-MM-DD string or empty string
- duration: human readable string like "3 days", "2 weeks" (for task rows only)
- status: "not_started" for all rows

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
                  is_section_header: { type: "boolean" },
                  start_date: { type: "string" },
                  end_date: { type: "string" },
                  duration: { type: "string" },
                  status: { type: "string" }
                }
              }
            }
          }
        }
      });
      if (result?.rows?.length) {
        onSelect({ type: "ai", template: { label: cat.label, rows: result.rows } });
        setOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(null);
    }
  };

  const handleGenerateFromDescription = async () => {
    if (!customDescription.trim()) return;
    const dateContext = startDate
      ? `Project start date: ${startDate}. Generate realistic start_date and end_date values (YYYY-MM-DD) for each task based on typical durations.`
      : "Do not include dates — leave start_date and end_date as empty strings.";

    setAiLoading("Custom");
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        model: "gpt_5_mini",
        prompt: `Generate a detailed construction project schedule based on this project description:

"${customDescription.trim()}"

${dateContext}

Return a JSON object with a "rows" array. Each row must have:
- id: unique string like "s1" for section headers or "r1" for tasks
- section: the section/phase name
- task: the display text
- is_section_header: true for section headers, false for tasks
- start_date: YYYY-MM-DD or empty string
- end_date: YYYY-MM-DD or empty string
- duration: e.g. "3 days", "2 weeks" (task rows only)
- status: "not_started"

Organize into logical phases. Include 5-10 tasks per phase. Be specific and practical.`,
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
                  is_section_header: { type: "boolean" },
                  start_date: { type: "string" },
                  end_date: { type: "string" },
                  duration: { type: "string" },
                  status: { type: "string" }
                }
              }
            }
          }
        }
      });
      if (result?.rows?.length) {
        onSelect({ type: "ai", template: { label: "Custom: " + customDescription.slice(0, 40), rows: result.rows } });
        setOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(null);
    }
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full mt-1.5 flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors",
          selectedLabel
            ? "border-amber-400 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedLabel ? (
            <>
              <Check className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">{selectedLabel}</span>
            </>
          ) : (
            "Select a template (optional)"
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {selectedLabel && (
            <span
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-slate-400 hover:text-rose-500 transition-colors mr-1"
            >
              ✕
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setTab("saved")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                tab === "saved" ? "border-b-2 border-amber-500 text-amber-700 bg-amber-50" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Saved Templates
            </button>
            <button
              type="button"
              onClick={() => setTab("ai")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                tab === "ai" ? "border-b-2 border-purple-500 text-purple-700 bg-purple-50" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Templates
            </button>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto p-2">
            {tab === "saved" ? (
              savedTemplates.length > 0 ? (
                <div className="space-y-1">
                  {savedTemplates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectSaved(t)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{t.name}</p>
                        {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">{t.rows?.length || 0} items</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 text-sm py-6">No saved templates yet. Create some in Workspace Items.</p>
              )
            ) : (
              <div className="space-y-3">
                {aiLoading && (
                  <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-purple-50 text-sm text-purple-700">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Generating "{aiLoading}" schedule with AI…
                  </div>
                )}

                {/* Custom description box */}
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Describe Your Project
                  </p>
                  <textarea
                    value={customDescription}
                    onChange={e => setCustomDescription(e.target.value)}
                    placeholder="e.g. 2,400 sq ft custom home build with a detached 3-car garage, pool, and outdoor kitchen. Client wants to be done by Thanksgiving…"
                    rows={3}
                    className="w-full text-xs border border-purple-200 rounded-md px-2.5 py-2 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 placeholder:text-slate-400"
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full text-xs border border-purple-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                        placeholder="Start date (optional)"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!!aiLoading || !customDescription.trim()}
                      onClick={handleGenerateFromDescription}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                        customDescription.trim() && !aiLoading
                          ? "bg-purple-600 text-white hover:bg-purple-700"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      )}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate
                    </button>
                  </div>
                  <p className="text-xs text-purple-500">Or pick a category below (your description will be included)</p>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {AI_TEMPLATE_CATEGORIES.map(cat => (
                    <button
                      key={cat.label}
                      type="button"
                      disabled={!!aiLoading}
                      onClick={() => handleSelectAI(cat)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all",
                        aiLoading === cat.label
                          ? "border-purple-400 bg-purple-50"
                          : "border-slate-200 hover:border-purple-300 hover:bg-purple-50",
                        !!aiLoading && aiLoading !== cat.label && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="text-lg shrink-0">{cat.emoji}</span>
                      <span className="text-xs font-medium text-slate-700 leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}