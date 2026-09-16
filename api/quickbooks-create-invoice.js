// Creates a QuickBooks invoice from a Supabase invoice record.
// POST: accepts { invoice_id, profile_id? }.
//
// Steps:
//  1. Load invoice, project, client from Supabase.
//  2. Resolve company_profile with QB connected (prefer project.company_id).
//  3. Refresh QB token if within 5 minutes of expiry.
//  4. Ensure client has a QB customer (create if missing, persist qb_customer_id).
//  5. Create the QB invoice.
//  6. Update Supabase invoice with qb_invoice_id, qb_payment_link, qb_sync_status, invoice_status.
//  7. Return { qb_invoice_id, qb_payment_link, success: true }.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const { refreshQBTokenIfNeeded, loadQBCredentials } = require('./quickbooks-refresh');

async function fetchProfiles(filter) {
  const url = `${SUPABASE_URL}/rest/v1/company_profiles?select=id,settings${filter}`;
  const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return r.json();
}

async function loadProfile(company_id) {
  if (company_id) {
    const scoped = await fetchProfiles(`&company_id=eq.${encodeURIComponent(company_id)}`);
    const scopedWithQB = scoped.find((p) => p.settings?.quickbooks?.access_token);
    if (scopedWithQB) return scopedWithQB;
    if (scoped.length) return scoped[0];
  }
  const all = await fetchProfiles('');
  return all.find((p) => p.settings?.quickbooks?.access_token) || all[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { invoice_id, profile_id } = body || {};
    if (!invoice_id) return res.status(400).json({ error: 'invoice_id is required.' });

    // 1. Load invoice.
    const invRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoice_id}&select=*&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const invoices = await invRes.json();
    const invoice = invoices[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    // 2. Load linked project.
    const projRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?id=eq.${invoice.linked_job_id}&select=*&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const projects = await projRes.json();
    const project = projects[0] || null;

    // 3. Load client.
    let client = null;
    if (project?.client_id) {
      const clientRes = await fetch(
        `${SUPABASE_URL}/rest/v1/clients?id=eq.${project.client_id}&select=*&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const clients = await clientRes.json();
      client = clients[0] || null;
    }
    if (!client) return res.status(400).json({ error: 'Could not resolve client for this invoice.' });

    // 4. Load company profile with QB connected.
    const companyId = profile_id ? null : project?.company_id;
    let profile = profile_id
      ? await (async () => {
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/company_profiles?id=eq.${profile_id}&select=id,settings&limit=1`,
            { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
          );
          const rows = await r.json();
          return rows[0] || null;
        })()
      : await loadProfile(companyId);

    if (!profile?.settings?.quickbooks?.access_token) {
      return res.status(400).json({ error: 'QuickBooks is not connected. Configure it in Settings.' });
    }

    // 5. Refresh token if needed.
    let qb = await refreshQBTokenIfNeeded(profile.settings.quickbooks, profile.id);

    // Determine API base URL from credentials.
    const creds = await loadQBCredentials();
    const apiBase = creds?.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
    const realm_id = qb.realm_id;
    if (!realm_id) return res.status(400).json({ error: 'realm_id missing from QB settings.' });

    const qbHeaders = {
      Authorization: `Bearer ${qb.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 6. Ensure QB Customer exists for the client.
    let qb_customer_id = client.qb_customer_id || null;
    if (!qb_customer_id) {
      const customerBody = {
        DisplayName: client.name || client.full_name || `Client ${client.id}`,
        ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
        ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone } } : {}),
        BillAddr: {
          ...(client.address     ? { Line1: client.address }        : {}),
          ...(client.city        ? { City: client.city }            : {}),
          ...(client.state       ? { CountrySubDivisionCode: client.state } : {}),
          ...(client.postal_code ? { PostalCode: client.postal_code } : {}),
        },
      };

      const custRes = await fetch(`${apiBase}/v3/company/${realm_id}/customer`, {
        method: 'POST',
        headers: qbHeaders,
        body: JSON.stringify(customerBody),
      });
      const custData = await custRes.json();
      if (!custRes.ok) {
        return res.status(custRes.status).json({
          error: custData?.Fault?.Error?.[0]?.Message || 'Failed to create QB customer.',
        });
      }

      qb_customer_id = custData?.Customer?.Id || null;
      if (!qb_customer_id) return res.status(500).json({ error: 'QB customer created but ID not returned.' });

      // Persist QB customer ID back to Supabase clients table.
      await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${client.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ qb_customer_id }),
      });
    }

    // 7. Create QB Invoice.
    const invoiceBody = {
      Line: [
        {
          Amount: invoice.amount,
          DetailType: 'SalesItemLineDetail',
          Description: invoice.notes || invoice.invoice_name || '',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' },
            Qty: 1,
            UnitPrice: invoice.amount,
          },
        },
      ],
      CustomerRef: { value: String(qb_customer_id) },
      ...(invoice.due_date ? { DueDate: invoice.due_date } : {}),
      ...(invoice.invoice_id  ? { DocNumber: String(invoice.invoice_id) }  : {}),
      ...(invoice.invoice_type ? { PrivateNote: invoice.invoice_type } : {}),
      BillEmail: { Address: client.email || '' },
      EmailStatus: 'NeedToSend',
    };

    const qbInvRes = await fetch(`${apiBase}/v3/company/${realm_id}/invoice`, {
      method: 'POST',
      headers: qbHeaders,
      body: JSON.stringify(invoiceBody),
    });
    const qbInvData = await qbInvRes.json();
    if (!qbInvRes.ok) {
      return res.status(qbInvRes.status).json({
        error: qbInvData?.Fault?.Error?.[0]?.Message || 'Failed to create QB invoice.',
      });
    }

    // 8. Get QB invoice ID.
    const qb_invoice_id = qbInvData?.Invoice?.Id || null;
    if (!qb_invoice_id) return res.status(500).json({ error: 'QB invoice created but ID not returned.' });

    // 9. Construct payment link.
    const paymentBase = creds?.environment === 'production'
      ? 'https://app.qbo.intuit.com'
      : 'https://sandbox.qbo.intuit.com';
    const qb_payment_link = `${paymentBase}/app/invoice?txnId=${qb_invoice_id}`;

    // 10. Update Supabase invoices table.
    const now = new Date().toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoice_id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        qb_invoice_id,
        qb_sync_status:   'synced',
        qb_last_synced_at: now,
        qb_payment_link,
        invoice_status:   'Sent',
      }),
    });

    // 11. Return result.
    return res.status(200).json({ qb_invoice_id, qb_payment_link, success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
