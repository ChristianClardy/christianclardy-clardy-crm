import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';
const DELAY_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  const apiKey = Deno.env.get('ACCULYNX_API_KEY');
  if (!apiKey) throw new Error('ACCULYNX_API_KEY secret is not set');
  return apiKey;
}

function authHeaders() {
  return {
    accept: 'application/json',
    Authorization: `Bearer ${getApiKey()}`,
  };
}

async function acculynxGet(path) {
  const response = await fetch(`${ACCULYNX_API}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`AccuLynx ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function toItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.payments)) return payload.payments;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.payments)) return payload.data.payments;
  if (Array.isArray(payload?.overview?.payments)) return payload.overview.payments;
  if (Array.isArray(payload?.overview?.items)) return payload.overview.items;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result?.payments)) return payload.result.payments;
  return [];
}

function toDateString(value) {
  if (!value) return '';
  return String(value).split('T')[0];
}

function normalizeMethod(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('ach') || raw.includes('e-check') || raw.includes('echeck')) return 'ACH';
  if (raw.includes('check')) return 'Check';
  if (raw.includes('cash')) return 'Cash';
  if (raw.includes('credit') || raw.includes('card') || raw.includes('visa') || raw.includes('mastercard')) return 'Credit Card';
  if (raw.includes('finance')) return 'Financing';
  return 'Other';
}

function buildPaymentPayload(project, item) {
  const amount = parseFloat(
    item?.amountReceived ??
    item?.amount ??
    item?.paymentAmount ??
    item?.amountPaid ??
    item?.total ??
    0
  ) || 0;

  const paymentDate = toDateString(
    item?.paymentDate ??
    item?.receivedDate ??
    item?.dateReceived ??
    item?.date ??
    item?.createdDate
  );

  const rawMethod =
    item?.paymentMethod?.name ??
    item?.paymentMethod ??
    item?.method?.name ??
    item?.method ??
    item?.type?.name ??
    item?.type ??
    '';

  const externalId = String(
    item?.id ??
    item?.paymentId ??
    item?.payment?.id ??
    `${project.acculynx_job_id}-${paymentDate || 'unknown'}-${amount}-${rawMethod || 'other'}`
  );

  const noteParts = [
    item?.referenceNumber,
    item?.reference,
    item?.memo,
    item?.note,
    item?.description,
    item?.convenienceFee ? `Convenience fee: ${item.convenienceFee}` : '',
  ].filter(Boolean);

  return {
    linked_job_id: project.id,
    acculynx_id: externalId,
    amount_received: amount,
    payment_date: paymentDate,
    payment_method: normalizeMethod(rawMethod),
    notes: noteParts.join(' | '),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    getApiKey();

    const projects = await base44.asServiceRole.entities.Project.list('-updated_date', 5000);
    const syncedProjects = projects.filter((project) => project.acculynx_job_id);

    if (syncedProjects.length === 0) {
      return Response.json({ message: 'No AccuLynx-linked projects found', synced: 0, created: 0, updated: 0 });
    }

    const existingPayments = await base44.asServiceRole.entities.Payment.list('-payment_date', 5000);
    const paymentByExternalId = {};

    for (const payment of existingPayments) {
      if (payment.acculynx_id) {
        paymentByExternalId[payment.acculynx_id] = payment;
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const project of syncedProjects) {
      const paymentResponse = await acculynxGet(`/jobs/${project.acculynx_job_id}/payments`);
      const items = toItems(paymentResponse);

      for (const item of items) {
        const payload = buildPaymentPayload(project, item);

        if (!payload.payment_date || payload.amount_received <= 0) {
          skipped++;
          continue;
        }

        const existing = paymentByExternalId[payload.acculynx_id];

        if (existing) {
          await base44.asServiceRole.entities.Payment.update(existing.id, payload);
          paymentByExternalId[payload.acculynx_id] = { ...existing, ...payload };
          updated++;
        } else {
          const createdPayment = await base44.asServiceRole.entities.Payment.create(payload);
          paymentByExternalId[payload.acculynx_id] = createdPayment;
          created++;
        }
      }

      await sleep(DELAY_MS);
    }

    const allPayments = await base44.asServiceRole.entities.Payment.list('-payment_date', 5000);
    const totalsByProjectId = {};

    for (const payment of allPayments) {
      if (!payment.linked_job_id) continue;
      totalsByProjectId[payment.linked_job_id] = (totalsByProjectId[payment.linked_job_id] || 0) + (Number(payment.amount_received) || 0);
    }

    for (const project of syncedProjects) {
      const collectedToDate = totalsByProjectId[project.id] || 0;
      const totalJobValue = project.total_job_value || project.contract_value || 0;
      await base44.asServiceRole.entities.Project.update(project.id, {
        collected_to_date: collectedToDate,
        remaining_balance: totalJobValue - collectedToDate,
      });
    }

    return Response.json({
      message: `Synced ${created + updated} AccuLynx payments`,
      synced: created + updated,
      created,
      updated,
      skipped,
      projects: syncedProjects.length,
    });
  } catch (error) {
    console.error('acculynxSyncPayments error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});