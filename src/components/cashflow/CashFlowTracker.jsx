import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Plus, Edit2, Trash2, DollarSign, TrendingUp, CheckCircle2, Clock, AlertCircle, Link2, ThumbsUp, ThumbsDown, Send } from "lucide-react";
import ProjectPaymentManager from "@/components/payments/ProjectPaymentManager";

const statusConfig = {
  pending:   { label: "Pending",   class: "bg-slate-100 text-slate-600",   icon: Clock },
  submitted: { label: "Submitted", class: "bg-blue-100 text-blue-700",    icon: AlertCircle },
  approved:  { label: "Approved",  class: "bg-amber-100 text-amber-700",  icon: TrendingUp },
  paid:      { label: "Paid",      class: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

const emptyForm = {
  title: "",
  percent_of_contract: "",
  amount: "",
  status: "pending",
  due_date: "",
  paid_date: "",
  notes: "",
  linked_task_id: "",
  retainage_percent: "10",
  retainage_released: false,
};

export default function CashFlowTracker({ projectId, contractValue = 0, acculynxJobId = "", onProjectUpdated, project, client, company }) {
  const [draws, setDraws] = useState([]);
  const [sheetRows, setSheetRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDraw, setEditingDraw] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [inputMode, setInputMode] = useState("percent");
  const [actionLoading, setActionLoading] = useState(null); // draw id being actioned

  useEffect(() => {
    loadDraws();
    loadSheetRows();
  }, [projectId]);

  const loadDraws = async () => {
    setLoading(true);
    const data = await base44.entities.Draw.filter({ project_id: projectId }, "draw_number");
    setDraws(data);
    setLoading(false);
  };

  const loadSheetRows = async () => {
    const sheets = await base44.entities.ProjectSheet.filter({ project_id: projectId });
    if (sheets.length > 0) {
      const rows = (sheets[0].rows || []).filter(r => !r.is_section_header && r.task);
      setSheetRows(rows);
    }
  };

  const openDialog = (draw = null) => {
    if (draw) {
      setEditingDraw(draw);
      setForm({
        title: draw.title,
        percent_of_contract: draw.percent_of_contract ?? "",
        amount: draw.amount ?? "",
        status: draw.status,
        due_date: draw.due_date || "",
        paid_date: draw.paid_date || "",
        notes: draw.notes || "",
        linked_task_id: draw.linked_task_id || "",
        retainage_percent: draw.retainage_percent ?? "10",
        retainage_released: draw.retainage_released ?? false,
      });
      setInputMode(draw.percent_of_contract ? "percent" : "amount");
    } else {
      setEditingDraw(null);
      setForm(emptyForm);
      setInputMode("percent");
    }
    setDialogOpen(true);
  };

  const handlePercentChange = (val) => {
    const pct = parseFloat(val) || 0;
    const amt = contractValue > 0 ? (pct / 100) * contractValue : 0;
    setForm(f => ({ ...f, percent_of_contract: val, amount: amt > 0 ? amt.toFixed(2) : "" }));
  };

  const handleAmountChange = (val) => {
    const amt = parseFloat(val) || 0;
    const pct = contractValue > 0 ? (amt / contractValue) * 100 : 0;
    setForm(f => ({ ...f, amount: val, percent_of_contract: pct > 0 ? pct.toFixed(2) : "" }));
  };

  const handleLinkedTaskChange = (taskId) => {
    if (!taskId || taskId === "__none__") {
      setForm(f => ({ ...f, linked_task_id: "" }));
      return;
    }
    const row = sheetRows.find(r => r.id === taskId);
    setForm(f => ({
      ...f,
      linked_task_id: taskId,
      title: f.title || (row ? row.task : f.title),
      due_date: row?.end_date ? row.end_date : f.due_date,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const prevStatus = editingDraw?.status;
    const newStatus = form.status;

    const drawAmt = parseFloat(form.amount) || 0;
    const retPct = parseFloat(form.retainage_percent) || 0;
    const retHeld = form.retainage_released ? 0 : (drawAmt * retPct) / 100;

    const payload = {
      project_id: projectId,
      title: form.title,
      percent_of_contract: parseFloat(form.percent_of_contract) || 0,
      amount: drawAmt,
      status: newStatus,
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      notes: form.notes,
      linked_task_id: form.linked_task_id || null,
      draw_number: editingDraw ? editingDraw.draw_number : (draws.length + 1),
      retainage_percent: retPct,
      retainage_held: retHeld,
      retainage_released: form.retainage_released,
    };

    let savedDraw;
    if (editingDraw) {
      savedDraw = await base44.entities.Draw.update(editingDraw.id, payload);
    } else {
      savedDraw = await base44.entities.Draw.create(payload);
    }

    // If status just became 'submitted', fire notification to PM
    if (newStatus === 'submitted' && prevStatus !== 'submitted') {
      const drawId = editingDraw ? editingDraw.id : savedDraw?.id;
      if (drawId) {
        await base44.functions.invoke('drawApprovalNotify', { draw_id: drawId });
      }
    }

    setDialogOpen(false);
    loadDraws();
  };

  const handleApprovalAction = async (draw, action) => {
    setActionLoading(draw.id + action);
    await base44.functions.invoke('drawApprovalAction', { draw_id: draw.id, action });
    setActionLoading(null);
    loadDraws();
  };

  const handleDelete = async (drawId) => {
    if (confirm("Delete this draw?")) {
      await base44.entities.Draw.delete(drawId);
      loadDraws();
    }
  };

  const totalPercent = draws.reduce((s, d) => s + (d.percent_of_contract || 0), 0);
  const totalAmount = draws.reduce((s, d) => s + (d.amount || 0), 0);
  const paidAmount = draws.filter(d => d.status === "paid").reduce((s, d) => s + (d.amount || 0), 0);
  const outstandingAmount = totalAmount - paidAmount;
  const totalRetainageHeld = draws.reduce((s, d) => s + (d.retainage_released ? 0 : (d.retainage_held || 0)), 0);
  const totalRetainageReleased = draws.reduce((s, d) => s + (d.retainage_released ? (d.retainage_held || 0) : 0), 0);

  const fmt = (n) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const linkedTaskName = (draw) => {
    if (!draw.linked_task_id) return null;
    const row = sheetRows.find(r => r.id === draw.linked_task_id);
    return row ? row.task : null;
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Contract Value</p>
          <p className="text-lg font-bold text-slate-900">{fmt(contractValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Total Draws</p>
          <p className="text-lg font-bold text-slate-900">{fmt(totalAmount)}</p>
          <p className="text-xs text-slate-400">{totalPercent.toFixed(1)}% of contract</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-xs text-emerald-600 mb-1">Paid</p>
          <p className="text-lg font-bold text-emerald-700">{fmt(paidAmount)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-xs text-amber-600 mb-1">Outstanding</p>
          <p className="text-lg font-bold text-amber-700">{fmt(outstandingAmount)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
          <p className="text-xs text-orange-600 mb-1">Retainage Withheld</p>
          <p className="text-lg font-bold text-orange-700">{fmt(totalRetainageHeld)}</p>
          {totalRetainageReleased > 0 && <p className="text-xs text-slate-400">{fmt(totalRetainageReleased)} released</p>}
        </div>
      </div>

      {/* Progress bar */}
      {contractValue > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-600 font-medium">Cash Flow Progress</span>
            <span className="text-slate-500">{fmt(paidAmount)} / {fmt(contractValue)}</span>
          </div>
          <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, contractValue > 0 ? (paidAmount / contractValue) * 100 : 0)}%` }}
            />
            <div
              className="absolute left-0 top-0 h-full bg-amber-300 rounded-full transition-all"
              style={{ width: `${Math.min(100, contractValue > 0 ? (totalAmount / contractValue) * 100 : 0)}%`, opacity: 0.4 }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Paid</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-300 inline-block" /> Scheduled</span>
          </div>
        </div>
      )}

      {/* Draws Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Draw Schedule</h3>
            <p className="text-xs text-slate-400 mt-0.5">Click any row to edit · Change status to "Submitted" to notify the PM</p>
          </div>
          <Button size="sm" onClick={() => openDialog()} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add Draw
          </Button>
        </div>

        {draws.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <DollarSign className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No draws scheduled yet</p>
            <p className="text-sm mt-1">Add your first draw to start tracking cash flow</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">#</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Draw</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">% of Contract</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Amount</th>
                  <th className="text-center px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Retainage</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Due Date</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Paid Date</th>
                  <th className="text-center px-4 py-3 text-slate-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((draw, idx) => {
                  const sc = statusConfig[draw.status] || statusConfig.pending;
                  const Icon = sc.icon;
                  const taskName = linkedTaskName(draw);
                  const isSubmitted = draw.status === 'submitted';
                  return (
                    <tr
                      key={draw.id}
                      className={cn("border-b border-slate-50 hover:bg-amber-50 cursor-pointer transition-colors", draw.status === "paid" && "opacity-70")}
                      onClick={() => openDialog(draw)}
                    >
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{draw.draw_number || idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{draw.title}</p>
                        {taskName && (
                          <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                            <Link2 className="w-3 h-3" /> {taskName}
                          </p>
                        )}
                        {draw.notes && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]">{draw.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-700">{(draw.percent_of_contract || 0).toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">{fmt(draw.amount)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={cn("text-xs font-medium gap-1 whitespace-nowrap", sc.class)}>
                          <Icon className="w-3 h-3" />
                          {sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {draw.retainage_held > 0 ? (
                          <span className={cn("text-xs font-medium", draw.retainage_released ? "text-emerald-600 line-through" : "text-orange-600")}>
                            {fmt(draw.retainage_held)}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{draw.due_date || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{draw.paid_date || "—"}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-center items-center">
                          {isSubmitted && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50 text-xs"
                                disabled={actionLoading === draw.id + 'approve'}
                                onClick={() => handleApprovalAction(draw, 'approve')}
                              >
                                <ThumbsUp className="w-3 h-3 mr-1" />
                                {actionLoading === draw.id + 'approve' ? '…' : 'Approve'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-rose-600 border-rose-200 hover:bg-rose-50 text-xs"
                                disabled={actionLoading === draw.id + 'reject'}
                                onClick={() => handleApprovalAction(draw, 'reject')}
                              >
                                <ThumbsDown className="w-3 h-3 mr-1" />
                                {actionLoading === draw.id + 'reject' ? '…' : 'Reject'}
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => handleDelete(draw.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {draws.length > 1 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td colSpan={2} className="px-4 py-3 text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-slate-700">{totalPercent.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-slate-900">{fmt(totalAmount)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <ProjectPaymentManager
        projectId={projectId}
        contractValue={contractValue}
        acculynxJobId={acculynxJobId}
        onUpdated={onProjectUpdated}
        project={project}
        client={client}
        company={company}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDraw ? "Edit Draw" : "Add Draw"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Link to Task */}
            {sheetRows.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <Label className="text-amber-800 font-semibold flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" /> Link to Project Sheet Task
                </Label>
                <Select
                  value={form.linked_task_id || "__none__"}
                  onValueChange={handleLinkedTaskChange}
                >
                  <SelectTrigger className="bg-white border-amber-200">
                    <SelectValue placeholder="Select a task…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No linked task —</SelectItem>
                    {sheetRows.map(row => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.task}{row.end_date ? ` (due ${row.end_date})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.linked_task_id && form.linked_task_id !== "__none__" && (
                  <p className="text-xs text-amber-700">Due date auto-filled from task end date.</p>
                )}
              </div>
            )}

            <div>
              <Label>Draw Title *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Draw #1 – Foundation Complete"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Amount</Label>
                <div className="flex gap-1 text-xs">
                  <button type="button" onClick={() => setInputMode("percent")}
                    className={cn("px-2 py-0.5 rounded transition-colors", inputMode === "percent" ? "bg-amber-100 text-amber-700 font-medium" : "text-slate-400 hover:text-slate-600")}>
                    % of Contract
                  </button>
                  <button type="button" onClick={() => setInputMode("amount")}
                    className={cn("px-2 py-0.5 rounded transition-colors", inputMode === "amount" ? "bg-amber-100 text-amber-700 font-medium" : "text-slate-400 hover:text-slate-600")}>
                    $ Amount
                  </button>
                </div>
              </div>
              {inputMode === "percent" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input type="number" min="0" max="100" step="0.1"
                      value={form.percent_of_contract}
                      onChange={e => handlePercentChange(e.target.value)}
                      placeholder="e.g. 25"
                    />
                    <p className="text-xs text-slate-400 mt-1">% of contract</p>
                  </div>
                  <div>
                    <div className="px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm font-medium text-slate-700">
                      {form.amount ? `$${parseFloat(form.amount).toLocaleString()}` : contractValue > 0 ? "—" : "Set contract value first"}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Calculated amount</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input type="number" min="0" step="0.01"
                      value={form.amount}
                      onChange={e => handleAmountChange(e.target.value)}
                      placeholder="e.g. 50000"
                    />
                    <p className="text-xs text-slate-400 mt-1">Dollar amount</p>
                  </div>
                  <div>
                    <div className="px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm font-medium text-slate-700">
                      {form.percent_of_contract ? `${parseFloat(form.percent_of_contract).toFixed(1)}%` : "—"}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">% of contract</p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                Status
                {form.status === 'submitted' && (
                  <span className="text-xs font-normal text-blue-600 flex items-center gap-1">
                    <Send className="w-3 h-3" /> PM will be notified on save
                  </span>
                )}
              </Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Paid Date</Label>
                <Input type="date" value={form.paid_date} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))} className="mt-1.5" />
              </div>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-3">
              <Label className="text-orange-800 font-semibold">Retainage</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Retainage %</Label>
                  <Input
                    type="number" min="0" max="100" step="0.5"
                    value={form.retainage_percent}
                    onChange={e => setForm(f => ({ ...f, retainage_percent: e.target.value }))}
                    className="mt-1 bg-white border-orange-200"
                    placeholder="10"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="px-3 py-2 border border-orange-200 rounded-md bg-white text-sm font-medium text-orange-700">
                    {form.amount && form.retainage_percent
                      ? fmt((parseFloat(form.amount) || 0) * (parseFloat(form.retainage_percent) || 0) / 100)
                      : "—"}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Withheld amount</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.retainage_released}
                  onChange={e => setForm(f => ({ ...f, retainage_released: e.target.checked }))}
                  className="rounded border-orange-300 text-orange-500"
                />
                Release retainage on this draw (final completion)
              </label>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1.5" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                {editingDraw ? "Save Changes" : "Add Draw"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}