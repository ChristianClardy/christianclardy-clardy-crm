// Decisions for follow-ups and appointment reminders. No database and no sends.
//   node --test scripts/test-followups.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../api/_lib/followupEngine.js');
const messaging = require('../api/_lib/messaging.js');

const OUTDOOR = '687dd747-560c-4ce4-8d84-b181db5edbc4';
const ARCHIVED = 'a7c41e00-0000-4000-8000-000000000325';
const NOW = new Date('2026-11-04T15:00:00Z'); // 9:00am America/Chicago (CST)

const outdoor = { id: OUTDOOR, name: 'Principle Outdoor Living ', is_active: true };
const archived = { id: ARCHIVED, name: 'Archived – March 2026 Lead Import', is_active: false };

function settings() {
  return { timezone: 'America/Chicago', quiet_start: 20, quiet_end: 8, followup_mode: 'live' };
}

test('merge fields match the drip sender, including a blank fallback', () => {
  const text = 'Hi {{first_name|there}} from {{company_name}}';
  const fields = { first_name: '', company_name: 'Principle Outdoor Living' };
  assert.equal(engine.render(text, fields), messaging.render(text, fields));
  assert.equal(engine.render(text, fields), 'Hi there from Principle Outdoor Living');
});

test('phone and email normalization match the sender', () => {
  assert.equal(engine.normalizePhone('(214) 555-0199'), messaging.normalizePhone('(214) 555-0199'));
  assert.equal(engine.normalizePhone('12145550199'), '+12145550199');
  assert.equal(engine.normalizePhone('nope'), '');
  assert.equal(engine.normalizeEmail(' Pat@Example.com '), 'pat@example.com');
});

test('wall-clock appointment times are Central, including daylight saving', () => {
  const winter = engine.wallTimeToUtc('2026-11-04T15:00:00', 'America/Chicago');
  assert.equal(winter.toISOString(), '2026-11-04T21:00:00.000Z');
  const summer = engine.wallTimeToUtc('2026-07-04 15:00:00', 'America/Chicago');
  assert.equal(summer.toISOString(), '2026-07-04T20:00:00.000Z');
});

test('texts are quiet overnight in Central time and resume at 8am', () => {
  const night = new Date('2026-11-05T03:30:00Z'); // 9:30pm CST
  const morning = new Date('2026-11-05T14:00:00Z'); // 8:00am CST
  assert.equal(engine.isQuiet(settings(), night), true);
  assert.equal(engine.isQuiet(settings(), morning), false);
  assert.equal(engine.isQuiet({ quiet_start: 8, quiet_end: 8 }, night), false);
  const next = engine.nextSendableTime(settings(), night);
  assert.equal(engine.hourIn('America/Chicago', next) >= 8 && engine.hourIn('America/Chicago', next) < 20, true);
});

test('a text that would land after the appointment is skipped, not delayed overnight', () => {
  const now = new Date('2026-11-05T03:30:00Z'); // 9:30pm
  const early = engine.wallTimeToUtc('2026-11-05T06:00:00', 'America/Chicago');
  const skipped = engine.smsPlan({ now, settings: settings(), appointmentStartUtc: early });
  assert.equal(skipped.action, 'skip');
  const later = engine.wallTimeToUtc('2026-11-05T15:00:00', 'America/Chicago');
  const waiting = engine.smsPlan({ now, settings: settings(), appointmentStartUtc: later });
  assert.equal(waiting.action, 'wait');
  const day = engine.smsPlan({ now: NOW, settings: settings(), appointmentStartUtc: later });
  assert.equal(day.action, 'send');
});

test('stage timer does not message leads who were already past it when the rule was turned on', () => {
  const anchor = new Date(NOW.getTime() - 10 * 3600000).toISOString();
  const past = engine.idleDecision({
    anchor, amount: 4, unit: 'hours', now: NOW, enabledAt: NOW.toISOString(), catchUp: false,
  });
  assert.equal(past.state, 'already_past');
  const caught = engine.idleDecision({
    anchor, amount: 4, unit: 'hours', now: NOW, enabledAt: NOW.toISOString(), catchUp: true,
  });
  assert.equal(caught.state, 'due');
  const waiting = engine.idleDecision({
    anchor: new Date(NOW.getTime() - 2 * 3600000).toISOString(),
    amount: 4, unit: 'hours', now: NOW, enabledAt: new Date(NOW.getTime() - 86400000).toISOString(), catchUp: false,
  });
  assert.equal(waiting.state, 'not_yet');
  const opened = new Date(NOW.getTime() - 6 * 3600000).toISOString();
  const crossed = engine.idleDecision({
    anchor: new Date(NOW.getTime() - 5 * 3600000).toISOString(),
    amount: 4, unit: 'hours', now: NOW, enabledAt: opened, catchUp: false,
  });
  assert.equal(crossed.state, 'due');
});

test('old stage label "new" matches a New Lead rule, and the archived company is excluded', () => {
  assert.equal(engine.stageMatches('new', 'New Lead'), true);
  assert.equal(engine.stageMatches('New Lead', 'New Lead'), true);
  assert.equal(engine.stageMatches('Contacted', 'New Lead'), false);
  assert.equal(engine.isArchivedCompany(archived), true);
  assert.equal(engine.isArchivedCompany({ id: 'x', name: 'Archived something', is_active: true }), true);
  assert.equal(engine.isArchivedCompany(outdoor), false);
});

test('dry run does not send, opt-outs and missing numbers are skipped, activity holds the rule', () => {
  const lead = {
    id: 'lead-1', company_id: OUTDOOR, full_name: 'Jordan Rivera', email: 'Jordan@example.com',
    phone: '2145550199', status: 'new', status_changed_at: new Date(NOW.getTime() - 5 * 3600000).toISOString(),
    linked_contact_id: 'client-1', assigned_sales_rep: 'Chris',
  };
  const rule = {
    id: 'rule-1', company_id: OUTDOOR, name: 'New lead, no contact', kind: 'stage_idle', enabled: true,
    enabled_at: new Date(NOW.getTime() - 86400000).toISOString(), catch_up: false,
    lead_stage: 'New Lead', idle_amount: 4, idle_unit: 'hours',
    send_email: true, send_sms: true, create_todo: true, email_subject: 'Hi {{first_name}}',
    email_body: 'Hello {{first_name}} from {{company_name}}', sms_body: 'Hi {{first_name}}',
    todo_title: 'Call {{full_name}}',
  };
  const base = {
    rules: [rule],
    companiesById: { [OUTDOOR]: outdoor, [ARCHIVED]: archived },
    settingsByCompany: { [OUTDOOR]: settings() },
    leads: [lead],
    leadsById: { [lead.id]: lead },
    clientsById: { 'client-1': { id: 'client-1', first_name: 'Jordan', email: 'Jordan@example.com', phone: '2145550199' } },
    projectsById: {},
    employeesByName: { chris: { full_name: 'Chris', email: 'chris@example.com', phone: '2145550100' } },
    hasActivity: () => false,
    optOuts: new Set(),
    now: NOW,
  };
  const dry = engine.buildActions({ ...base, mode: 'dry_run' });
  assert.equal(dry.actions.length, 3);
  assert.ok(dry.actions.every((a) => a.disposition === 'dry_run'));
  assert.equal(dry.actions.find((a) => a.channel === 'email').body, 'Hello Jordan from Principle Outdoor Living');
  assert.equal(dry.actions.find((a) => a.channel === 'email').to, 'jordan@example.com');

  const live = engine.buildActions({ ...base, mode: 'live' });
  assert.ok(live.actions.every((a) => a.disposition === 'send'));

  const stopped = engine.buildActions({
    ...base, mode: 'live', optOuts: new Set(['sms:+12145550199']),
  });
  assert.equal(stopped.actions.find((a) => a.channel === 'sms').disposition, 'skip');
  assert.match(stopped.actions.find((a) => a.channel === 'sms').reason, /STOP/);
  assert.equal(stopped.actions.find((a) => a.channel === 'email').disposition, 'send');

  const busy = engine.buildActions({ ...base, mode: 'live', hasActivity: () => true });
  assert.equal(busy.actions.length, 0);

  const off = engine.buildActions({ ...base, mode: 'off' });
  assert.equal(off.actions.length, 0);

  const keys = new Set(live.actions.map((a) => a.dedupeKey));
  assert.equal(keys.size, 3);
  assert.ok([...keys].every((k) => k.startsWith('live:')));
  assert.ok(dry.actions.every((a) => a.dedupeKey.startsWith('dry_run:')));
});

test('appointment reminders fire inside the window, skip cancelled, and can notify the rep', () => {
  const start = '2026-11-04T12:00:00'; // noon Chicago = 18:00 UTC, 3 hours after NOW (9am)
  const event = {
    id: 'event-1', title: 'Site visit', start_datetime: start, all_day: false, status: 'scheduled',
    lead_id: 'lead-1', company_id: OUTDOOR, assigned_to: 'Chris',
  };
  const lead = {
    id: 'lead-1', company_id: OUTDOOR, full_name: 'Jordan Rivera', email: 'j@example.com', phone: '2145550199',
    status: 'Appointment Scheduled',
  };
  const rule = {
    id: 'rule-apt', company_id: OUTDOOR, name: 'Appointment reminder, 24 hours', kind: 'appointment',
    enabled: true, minutes_before: 1440, send_email: true, send_sms: true, notify_rep: true, notify_rep_channel: 'email',
    email_subject: '{{appointment_title}} {{appointment_time}}', email_body: 'See you {{appointment_date}} at {{appointment_time}}',
    sms_body: 'Reminder {{appointment_time}}',
    rep_email_subject: 'Upcoming {{full_name}}', rep_email_body: '{{appointment_title}}',
  };
  const planned = engine.buildActions({
    rules: [rule],
    companiesById: { [OUTDOOR]: outdoor },
    settingsByCompany: { [OUTDOOR]: settings() },
    leads: [],
    events: [event],
    leadsById: { 'lead-1': lead },
    clientsById: {},
    projectsById: {},
    employeesByName: { chris: { email: 'chris@example.com', phone: '2145550100' } },
    now: NOW,
    mode: 'live',
  });
  const channels = planned.actions.map((a) => a.channel).sort();
  assert.deepEqual(channels, ['email', 'rep_email', 'sms']);
  assert.equal(planned.actions.find((a) => a.channel === 'rep_email').to, 'chris@example.com');
  assert.match(planned.actions.find((a) => a.channel === 'email').body, /12:00 PM/);
  assert.ok(planned.actions.every((a) => a.disposition === 'send'));

  const tooEarly = engine.buildActions({
    ...argumentsOf(planned, rule, event, lead),
    now: new Date('2026-11-03T16:00:00Z'), // day before, more than 24h out
  });
  assert.equal(tooEarly.actions.length, 0);

  const cancelled = engine.buildActions({
    ...argumentsOf(planned, rule, { ...event, status: 'cancelled' }, lead),
    now: NOW,
  });
  assert.equal(cancelled.actions.length, 0);

  const archivedEvent = engine.buildActions({
    rules: [{ ...rule, company_id: ARCHIVED }],
    companiesById: { [ARCHIVED]: archived },
    settingsByCompany: {},
    events: [{ ...event, company_id: ARCHIVED }],
    leadsById: { 'lead-1': { ...lead, company_id: ARCHIVED } },
    clientsById: {},
    projectsById: {},
    now: NOW,
    mode: 'live',
  });
  assert.equal(archivedEvent.actions.length, 0);
});

function argumentsOf(_planned, rule, event, lead) {
  return {
    rules: [rule],
    companiesById: { [OUTDOOR]: outdoor },
    settingsByCompany: { [OUTDOOR]: settings() },
    events: [event],
    leadsById: { 'lead-1': lead },
    clientsById: {},
    projectsById: {},
    employeesByName: { chris: { email: 'chris@example.com', phone: '2145550100' } },
    mode: 'live',
  };
}

test('a human note counts as activity and an automated follow-up does not', () => {
  const anchor = '2026-11-01T00:00:00Z';
  assert.equal(engine.activitySince(anchor, [{ created_at: '2026-11-02T00:00:00Z' }]), true);
  assert.equal(engine.activitySince(anchor, [{ created_at: '2026-10-01T00:00:00Z' }]), false);
  assert.equal(engine.isHumanMessage({ direction: 'inbound', sent_by: null }), true);
  assert.equal(engine.isHumanMessage({ direction: 'outbound', sent_by: 'follow-up: New lead' }), false);
  assert.equal(engine.isHumanMessage({ direction: 'outbound', sent_by: 'automation' }), false);
  assert.equal(engine.isHumanMessage({ direction: 'outbound', sent_by: 'chris@example.com' }), true);
});
