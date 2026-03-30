import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const followUp = payload?.data;
    const eventType = payload?.event?.type;
    const changedFields = payload?.changed_fields || [];

    if (!followUp || !followUp.follow_up_date) {
      return Response.json({ ok: true, skipped: true });
    }

    if (eventType === 'update' && changedFields.length === 1 && changedFields.includes('calendar_event_id')) {
      return Response.json({ ok: true, skipped: true });
    }

    const eventData = {
      title: `${followUp.lead_name || 'Lead'} • ${followUp.title}`,
      description: followUp.details || '',
      start_datetime: `${followUp.follow_up_date}T09:00`,
      end_datetime: `${followUp.follow_up_date}T09:30`,
      assigned_users: followUp.created_by ? [followUp.created_by] : [],
      event_type: 'task',
      status: followUp.status === 'completed' ? 'completed' : 'scheduled',
      visibility: 'team',
    };

    if (followUp.calendar_event_id) {
      await base44.asServiceRole.entities.CalendarEvent.update(followUp.calendar_event_id, eventData);
      return Response.json({ ok: true, action: 'updated' });
    }

    const createdEvent = await base44.asServiceRole.entities.CalendarEvent.create(eventData);
    await base44.asServiceRole.entities.LeadFollowUp.update(followUp.id, { calendar_event_id: createdEvent.id });

    return Response.json({ ok: true, action: 'created', calendar_event_id: createdEvent.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});