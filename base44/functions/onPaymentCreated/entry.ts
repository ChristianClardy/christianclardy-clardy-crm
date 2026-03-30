import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const payment = payload?.data || payload;
    if (!payment?.linked_job_id) return Response.json({ ok: true });

    if (payment.linked_invoice_id) {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: payment.linked_invoice_id }, '-created_date', 1);
      const invoice = invoices[0];
      if (invoice) {
        const invoicePayments = await base44.asServiceRole.entities.Payment.filter({ linked_invoice_id: payment.linked_invoice_id }, '-payment_date', 500);
        const totalPaid = invoicePayments.reduce((sum, item) => sum + (Number(item.amount_received) || 0), 0);
        const status = totalPaid >= (invoice.amount || 0) ? 'Paid' : 'Partial';
        await base44.asServiceRole.entities.Invoice.update(invoice.id, { invoice_status: status });
      }
    }

    const projects = await base44.asServiceRole.entities.Project.filter({ id: payment.linked_job_id }, '-created_date', 1);
    const project = projects[0];
    if (project) {
      const projectPayments = await base44.asServiceRole.entities.Payment.filter({ linked_job_id: payment.linked_job_id }, '-payment_date', 5000);
      const collectedToDate = projectPayments.reduce((sum, item) => sum + (Number(item.amount_received) || 0), 0);
      const totalJobValue = project.total_job_value || project.contract_value || 0;
      const remainingBalance = totalJobValue - collectedToDate;
      const update = {
        collected_to_date: collectedToDate,
        remaining_balance: remainingBalance,
      };
      if (remainingBalance <= 0) {
        update.status = 'closed';
      }
      await base44.asServiceRole.entities.Project.update(project.id, update);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});