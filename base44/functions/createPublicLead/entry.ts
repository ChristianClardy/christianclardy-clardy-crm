import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SOURCE_MAP = {
  website: 'Website',
  facebook: 'Facebook',
  google: 'Google',
  referral: 'Referral',
  realtor: 'Realtor',
  'yard sign': 'Yard Sign',
  'yard-sign': 'Yard Sign',
  yardsign: 'Yard Sign',
  'repeat customer': 'Repeat Customer',
  'repeat-customer': 'Repeat Customer',
  repeatcustomer: 'Repeat Customer',
  other: 'Other',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    const fullName = String(payload.full_name || `${payload.first_name || ''} ${payload.last_name || ''}`)
      .trim()
      .replace(/\s+/g, ' ');

    if (!fullName) {
      return Response.json({ error: 'Full name is required' }, { status: 400 });
    }

    const rawSource = String(payload.lead_source || payload.source || 'Website').toLowerCase();
    const leadSource = SOURCE_MAP[rawSource] || 'Other';
    const assignedSalesRep = String(payload.assigned_sales_rep || payload.rep || 'Website Inbox').trim() || 'Website Inbox';
    const submittedNotes = String(payload.notes || '').trim();
    const sourceNote = `Submitted from ${leadSource} lead form`;

    const lead = await base44.asServiceRole.entities.Lead.create({
      full_name: fullName,
      phone: payload.phone || '',
      email: payload.email || '',
      preferred_contact_method: payload.preferred_contact_method || 'phone',
      property_address: payload.property_address || '',
      city: payload.city || '',
      state: payload.state || '',
      zip: payload.zip || '',
      lead_source: leadSource,
      project_type: payload.project_type || 'Other',
      project_description: payload.project_description || '',
      budget_range: payload.budget_range || '',
      timeline: payload.timeline || '',
      status: 'New Lead',
      assigned_sales_rep: assignedSalesRep,
      follow_up_date: payload.follow_up_date || undefined,
      next_action: 'Initial contact',
      notes: submittedNotes ? `${sourceNote}\n\n${submittedNotes}` : sourceNote,
    });

    return Response.json({ success: true, lead_id: lead.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});