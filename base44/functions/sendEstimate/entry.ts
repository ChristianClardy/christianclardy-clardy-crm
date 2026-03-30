import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { estimate_id, recipient_email, recipient_name, company_name } = await req.json();

    const estimate = await base44.entities.Estimate.get(estimate_id);
    if (!estimate) return Response.json({ error: 'Estimate not found' }, { status: 404 });

    const client = estimate.client_id
      ? await base44.entities.Client.get(estimate.client_id).catch(() => null)
      : null;

    const toEmail = recipient_email || client?.email;
    const toName = recipient_name || client?.name || 'Valued Client';
    const fromCompany = company_name || 'Clarity Construction';

    if (!toEmail) return Response.json({ error: 'No recipient email provided' }, { status: 400 });

    // Build line items HTML
    const lineItemsHtml = estimate.line_items?.map(item => {
      if (item.is_section_header) {
        return `<tr style="background:#3d3530;"><td colspan="5" style="padding:8px 12px;color:#fff;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${item.section || item.description}</td></tr>`;
      }
      const amount = (Number(item.qty) || 0) * (Number(item.unit_cost) || 0);
      return `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 12px;font-size:13px;color:#374151;">${item.description || ''}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:center;">${item.qty || ''}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:center;">${item.unit || ''}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right;">$${Number(item.unit_cost || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:500;text-align:right;">$${amount.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
      </tr>`;
    }).join('') || '';

    const body = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Georgia,serif;background:#f5f0eb;margin:0;padding:24px;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:#3d3530;padding:28px 32px;display:flex;align-items:center;gap:16px;">
      <div style="background:#b5965a;border-radius:8px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:20px;">🏗️</div>
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${fromCompany}</div>
        <div style="color:#b5965a;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px;">Construction Estimate</div>
      </div>
      <div style="margin-left:auto;text-align:right;">
        ${estimate.estimate_number ? `<div style="color:#c9ac76;font-size:13px;font-weight:600;">${estimate.estimate_number}</div>` : ''}
        ${estimate.issue_date ? `<div style="color:#7a6e66;font-size:12px;margin-top:2px;">Issued: ${estimate.issue_date}</div>` : ''}
        ${estimate.expiry_date ? `<div style="color:#7a6e66;font-size:12px;">Expires: ${estimate.expiry_date}</div>` : ''}
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="color:#3d3530;font-size:15px;margin:0 0 4px 0;">Dear ${toName},</p>
      <p style="color:#5a4f48;font-size:14px;margin:0 0 24px 0;">Thank you for the opportunity. Please find your estimate for <strong>${estimate.title}</strong> below.</p>

      <!-- Line Items Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8f6f3;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Description</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Qty</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Unit</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Unit Cost</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
        <div style="min-width:240px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
            <span style="color:#6b7280;font-size:13px;">Subtotal</span>
            <span style="color:#374151;font-size:13px;font-weight:500;">$${Number(estimate.subtotal||0).toLocaleString('en-US',{minimumFractionDigits:2})}</span>
          </div>
          ${Number(estimate.tax_rate) > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
            <span style="color:#6b7280;font-size:13px;">Tax (${estimate.tax_rate}%)</span>
            <span style="color:#374151;font-size:13px;font-weight:500;">$${Number(estimate.tax_amount||0).toLocaleString('en-US',{minimumFractionDigits:2})}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:4px;">
            <span style="color:#3d3530;font-size:15px;font-weight:700;">Total</span>
            <span style="color:#b5965a;font-size:18px;font-weight:700;">$${Number(estimate.total||0).toLocaleString('en-US',{minimumFractionDigits:2})}</span>
          </div>
        </div>
      </div>

      ${estimate.notes ? `<div style="background:#f8f6f3;border-radius:8px;padding:14px 16px;margin-bottom:16px;"><p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Notes</p><p style="margin:0;color:#5a4f48;font-size:13px;">${estimate.notes.replace(/\n/g,'<br>')}</p></div>` : ''}
      ${estimate.terms ? `<div style="background:#f8f6f3;border-radius:8px;padding:14px 16px;"><p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a6e66;font-weight:600;">Terms & Conditions</p><p style="margin:0;color:#5a4f48;font-size:13px;">${estimate.terms.replace(/\n/g,'<br>')}</p></div>` : ''}

      <p style="color:#7a6e66;font-size:13px;margin-top:24px;">If you have any questions, please don't hesitate to reach out. We look forward to working with you.</p>
      <p style="color:#3d3530;font-size:14px;font-weight:600;margin-top:4px;">${fromCompany}</p>
    </div>
  </div>
</body>
</html>`;

    await base44.integrations.Core.SendEmail({
      to: toEmail,
      subject: `Estimate: ${estimate.title}${estimate.estimate_number ? ` (${estimate.estimate_number})` : ''}`,
      body,
    });

    // Update estimate status and sent_to_email
    await base44.entities.Estimate.update(estimate_id, {
      status: 'sent',
      sent_to_email: toEmail,
    });

    return Response.json({ success: true, sent_to: toEmail });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});