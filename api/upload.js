// Serverless upload handler — uses service role key to bypass RLS
// POST /api/upload  (multipart/form-data)
// Fields: file (required), entity_type, entity_id, uploaded_by, file_type_category

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'Attachements';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
  }

  try {
    const { IncomingForm } = await import('formidable');
    const fs = await import('fs');

    const form = new IncomingForm({ keepExtensions: true });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Extract metadata fields
    const entity_type = Array.isArray(fields.entity_type) ? fields.entity_type[0] : fields.entity_type;
    const entity_id = Array.isArray(fields.entity_id) ? fields.entity_id[0] : fields.entity_id;
    const uploaded_by = Array.isArray(fields.uploaded_by) ? fields.uploaded_by[0] : (fields.uploaded_by || 'Team Member');
    const organization_id = Array.isArray(fields.organization_id) ? fields.organization_id[0] : fields.organization_id;

    const ext = file.originalFilename?.split('.').pop() || 'bin';
    const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const fileBuffer = fs.readFileSync(file.filepath);
    const mimeType = file.mimetype || 'application/octet-stream';

    // 1. Upload file to Supabase Storage
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': mimeType,
          'Cache-Control': '3600',
          'x-upsert': 'false',
        },
        body: fileBuffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(500).json({ error: `Storage upload failed: ${err}` });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

    // 2. Insert attachment record into DB (service role bypasses RLS)
    if (entity_type && entity_id) {
      const insertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/attachments`,
        {
          method: 'POST',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            entity_type,
            entity_id,
            filename: file.originalFilename || `file.${ext}`,
            url: publicUrl,
            file_type: mimeType,
            file_size: file.size,
            uploaded_by,
            ...(organization_id ? { organization_id } : {}),
          }),
        }
      );

      if (!insertRes.ok) {
        const err = await insertRes.text();
        return res.status(500).json({ error: `DB insert failed: ${err}` });
      }

      const [record] = await insertRes.json();
      return res.status(200).json({ file_url: publicUrl, attachment: record });
    }

    // If no entity info provided, just return the URL
    return res.status(200).json({ file_url: publicUrl });

  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
};
