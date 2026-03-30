import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bot, Send, Loader2, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_COMMANDS = [
  "Mark Foundation complete",
  "Push all dates back 2 weeks",
  "Set status to in progress",
  "Add Final Inspection task",
];

export default function AITaskManager({ project, tasks = [], sheetRows = [], onRefresh = () => {}, onUpdateSheetRows }) {
  const [collapsed, setCollapsed] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const context = buildContext();
      const prompt = buildPrompt(context, userText);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            explanation: { type: "string" },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["update_project", "update_task", "create_task", "delete_task", "update_sheet_row", "create_sheet_row", "delete_sheet_row", "update_all_sheet_rows"] },
                  task_id: { type: "string" },
                  sheet_row_id: { type: "string" },
                  data: { type: "object" },
                  match_field: { type: "string" },
                  match_value: { type: "string" },
                },
                required: ["type", "data"],
              },
            },
          },
          required: ["explanation", "actions"],
        },
      });

      const { explanation, actions } = result;
      const actionResults = [];
      let sheetChanged = false;
      let updatedRows = sheetRows ? [...sheetRows] : [];

      for (const action of actions || []) {
        try {
          if (action.type === "update_project") {
            await base44.entities.Project.update(project.id, action.data);
            actionResults.push("✓ Project updated");
          } else if (action.type === "update_task" && action.task_id) {
            await base44.entities.Task.update(action.task_id, action.data);
            const t = tasks.find((t) => t.id === action.task_id);
            actionResults.push(`✓ Task "${t?.name || action.task_id}" updated`);
          } else if (action.type === "create_task") {
            await base44.entities.Task.create({ ...action.data, project_id: project.id, order: tasks.length });
            actionResults.push(`✓ Task "${action.data.name}" created`);
          } else if (action.type === "delete_task" && action.task_id) {
            const t = tasks.find((t) => t.id === action.task_id);
            await base44.entities.Task.delete(action.task_id);
            actionResults.push(`✓ Task "${t?.name || action.task_id}" deleted`);
          } else if (action.type === "create_sheet_row") {
            const newRow = {
              id: Math.random().toString(36).slice(2, 10),
              is_section_header: false,
              section: "",
              task: "",
              assigned_to: "",
              start_date: "",
              end_date: "",
              duration: "",
              status: "Not Started",
              percent_complete: 0,
              notes: "",
              ...action.data,
            };
            updatedRows = [...updatedRows, newRow];
            sheetChanged = true;
            actionResults.push(`✓ Sheet row "${newRow.task || "New Task"}" added`);
          } else if (action.type === "delete_sheet_row") {
            let targetId = action.sheet_row_id;
            if (!targetId && action.match_field && action.match_value) {
              const match = updatedRows.find(r => String(r[action.match_field] || "").toLowerCase().includes(action.match_value.toLowerCase()));
              targetId = match?.id;
            }
            if (targetId) {
              const row = updatedRows.find(r => r.id === targetId);
              updatedRows = updatedRows.filter(r => r.id !== targetId);
              sheetChanged = true;
              actionResults.push(`✓ Sheet row "${row?.task || targetId}" deleted`);
            }
          } else if (action.type === "update_sheet_row") {
            let targetId = action.sheet_row_id;
            if (!targetId && action.match_field && action.match_value) {
              const match = updatedRows.find(r => String(r[action.match_field] || "").toLowerCase().includes(action.match_value.toLowerCase()));
              targetId = match?.id;
            }
            if (targetId) {
              updatedRows = updatedRows.map(r => r.id === targetId ? { ...r, ...action.data } : r);
              sheetChanged = true;
              const row = updatedRows.find(r => r.id === targetId);
              actionResults.push(`✓ Sheet row "${row?.task || row?.section || targetId}" updated`);
            }
          } else if (action.type === "update_all_sheet_rows") {
            updatedRows = updatedRows.map(r => r.is_section_header ? r : { ...r, ...action.data });
            sheetChanged = true;
            actionResults.push(`✓ All sheet rows updated`);
          }
        } catch (err) {
          actionResults.push(`✗ Failed: ${err.message}`);
        }
      }

      if (sheetChanged && onUpdateSheetRows) {
        onUpdateSheetRows(updatedRows);
      }

      setMessages([
        ...newMessages,
        { role: "assistant", content: explanation, actions: actionResults },
      ]);

      if (actionResults.some((r) => r.startsWith("✓"))) {
        onRefresh();
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: `Sorry, something went wrong: ${err.message}`, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const buildContext = () => {
    const taskLines = tasks.map(
      (t) => `  - ID: ${t.id} | "${t.name}" | Status: ${t.status} | Priority: ${t.priority} | Start: ${t.start_date || "none"} | End: ${t.end_date || "none"} | Assigned: ${t.assigned_to || "none"}`
    );
    const sheetLines = sheetRows
      ? sheetRows.filter(r => !r.is_section_header).map(
          (r) => `  - ID: ${r.id} | Task: "${r.task}" | Status: ${r.status || "none"} | Start: ${r.start_date || "none"} | End: ${r.end_date || "none"} | Assigned: ${r.assigned_to || "none"} | Progress: ${r.percent_complete || 0}%`
        )
      : [];

    return `Project:
- ID: ${project.id} | Name: ${project.name} | Status: ${project.status} | ${project.percent_complete || 0}% complete
- Start: ${project.start_date || "none"} | End: ${project.end_date || "none"}

Project Tasks (${tasks.length}):
${taskLines.join("\n") || "  (none)"}

Project Sheet Rows (${sheetLines.length}):
${sheetLines.join("\n") || "  (none)"}`;
  };

  const buildPrompt = (context, userCommand) => `You are an AI project manager for a construction app.
Today: ${new Date().toISOString().split("T")[0]}

${context}

User command: "${userCommand}"

Available action types:
- update_project: { data: { field: value, ... } }
- update_task: { task_id, data }
- create_task: { data: { name, status, priority, start_date, end_date, assigned_to } }
- delete_task: { task_id }
- update_sheet_row: update a specific project sheet row. Use sheet_row_id if known, OR use match_field + match_value to find the row (e.g. match_field: "task", match_value: "Foundation"). data = fields to update (status, start_date, end_date, percent_complete, assigned_to, etc.)
- create_sheet_row: add a NEW row to the project sheet. data = { task, status, start_date, end_date, assigned_to, notes, percent_complete }. Use this when user asks to "add a task" to the sheet.
- delete_sheet_row: remove a row from the sheet. Use sheet_row_id or match_field + match_value.
- update_all_sheet_rows: apply data changes to ALL non-header sheet rows (e.g. push dates back)

Rules:
- For date shifts like "push back 2 weeks", add 14 days to all existing dates. Calculate new YYYY-MM-DD values.
- Valid task statuses: not_started, in_progress, completed, blocked
- Valid sheet row statuses: Not Started, In Progress, On Hold, Completed, Blocked
- Valid project statuses: planning, in_progress, on_hold, completed, cancelled
- Only make changes that are clearly requested. Be brief and friendly in explanation.`;

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 shadow-lg backdrop-blur transition-all hover:bg-amber-50"
        >
          <Sparkles className="w-3 h-3" />
          AI
          {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {!collapsed && (
          <div className="w-64 bg-white/95 rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden backdrop-blur" style={{ maxHeight: "52vh" }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0 bg-slate-50">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3 h-3 text-white" />
              </div>
              <p className="text-[11px] font-semibold text-slate-700 flex-1 truncate">AI Manager</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-2 min-h-0">
              {messages.length === 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Quick commands:</p>
                  {QUICK_COMMANDS.map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => sendMessage(cmd)}
                      disabled={loading}
                      className="w-full text-left text-[11px] px-2 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors leading-tight"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-1.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[88%] rounded-xl px-2 py-1.5 text-[10px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-slate-800 text-white"
                      : msg.error
                      ? "bg-rose-50 text-rose-800 border border-rose-200"
                      : "bg-slate-50 text-slate-800 border border-slate-200"
                  )}>
                    <p>{msg.content}</p>
                    {msg.actions?.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {msg.actions.map((a, j) => (
                          <p key={j} className={cn("text-[10px] font-medium", a.startsWith("✓") ? "text-emerald-700" : "text-rose-600")}>
                            {a}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-1.5">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                    <span className="text-[11px] text-slate-500">Working...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="px-2 pb-2 pt-2 border-t border-slate-100 flex-shrink-0">
              <div className="flex gap-1.5 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a change..."
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none text-[11px] border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="h-8 w-8 flex-shrink-0 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all hover:scale-105"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)" }}
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[9px] text-slate-400 mt-1 pl-0.5">↵ Send · ⇧↵ New line</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}