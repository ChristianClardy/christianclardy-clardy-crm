// Exact request bytes for Stripe-Signature. Vercel parses req.body when the
// handler reads it, and it does not set req.rawBody. Read the stream first,
// the same way api/quickbooks.js reads the Intuit webhook. Re-serializing a
// parsed object is not used: the signature would not match.

function readRawBody(req) {
  if (!req) return Promise.resolve(null);
  if (typeof req.rawBody === 'string') return Promise.resolve(req.rawBody);
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  if (req.readableEnded || req.complete) return Promise.resolve(null);
  if (typeof req.on !== 'function') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw || null);
    });
    req.on('error', reject);
  });
}

module.exports = { readRawBody };
