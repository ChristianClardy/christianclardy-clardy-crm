import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";

export default function FinanceDashboard() {
  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = () => {
      Promise.all([
        base44.entities.Project.list("-updated_date", 2000),
        base44.entities.Payment.list("-payment_date", 2000),
        base44.entities.Invoice.list("-due_date", 2000),
        base44.entities.ChangeOrder.list("-updated_date", 2000),
        base44.entities.Estimate.list("-updated_date", 2000),
      ]).then(([projectData, paymentData, invoiceData, changeOrderData, estimateData]) => {
        setProjects(projectData);
        setPayments(paymentData);
        setInvoices(invoiceData);
        setChangeOrders(changeOrderData);
        setEstimates(estimateData);
        setLoading(false);
      });
    };

    loadData();
    const unsubProjects = base44.entities.Project.subscribe(() => loadData());
    const unsubPayments = base44.entities.Payment.subscribe(() => loadData());
    const unsubInvoices = base44.entities.Invoice.subscribe(() => loadData());
    const unsubChangeOrders = base44.entities.ChangeOrder.subscribe(() => loadData());

    return () => {
      unsubProjects();
      unsubPayments();
      unsubInvoices();
      unsubChangeOrders();
    };
  }, []);

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const totalContractValue = projects.reduce((sum, project) => sum + (project.contract_value || 0), 0);
  const paymentsCollectedThisMonth = payments.filter((payment) => (payment.payment_date || "").startsWith(monthPrefix)).reduce((sum, payment) => sum + (payment.amount_received || 0), 0);
  const outstandingInvoices = invoices.filter((invoice) => ["Sent", "Partial", "Overdue"].includes(invoice.invoice_status));
  const approvedChangeOrderRevenue = changeOrders.filter((item) => item.approval_status === "Approved").reduce((sum, item) => sum + (item.revenue_change || 0), 0);
  const estimateMap = Object.fromEntries(estimates.map((estimate) => [estimate.id, estimate]));

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Finance Dashboard</h1>
        <p className="mt-1 text-slate-500">Contract value, collections, outstanding balances, and change order revenue.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total Contract Value" value={`$${totalContractValue.toLocaleString()}`} />
        <MetricCard label="Payments Collected This Month" value={`$${paymentsCollectedThisMonth.toLocaleString()}`} accent="text-emerald-700" />
        <MetricCard label="Outstanding Invoices" value={outstandingInvoices.length} accent="text-amber-700" />
        <MetricCard label="Approved CO Revenue" value={`$${approvedChangeOrderRevenue.toLocaleString()}`} accent="text-violet-700" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Remaining Balances by Job</h2>
          <div className="mt-4 space-y-2">
            {projects.filter((project) => (project.remaining_balance || 0) > 0).slice(0, 10).map((project) => (
              <div key={project.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-600">{project.name}</span>
                <span className="font-semibold text-slate-900">${Number(project.remaining_balance || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Estimated Gross Profit by Job</h2>
          <div className="mt-4 space-y-2">
            {projects.slice(0, 10).map((project) => {
              const estimate = estimateMap[project.linked_estimate_id];
              const grossProfit = estimate?.estimated_gross_profit || ((estimate?.estimated_revenue || 0) - (estimate?.estimated_material_cost || 0) - (estimate?.estimated_labor_cost || 0) - (estimate?.estimated_subcontractor_cost || 0));
              return (
                <div key={project.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-600">{project.name}</span>
                  <span className="font-semibold text-slate-900">${Number(grossProfit || 0).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}