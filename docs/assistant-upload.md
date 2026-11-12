# Assistant file upload

`POST /api/assistant-upload` lets an external assistant file a document into Clardy.io. The assistant authenticates with its own bearer token. It does not use a staff login, and it never sees the Supabase service role key.

The route uploads the bytes to the public storage bucket `Attachements` at `uploads/{epoch-ms}-{random}.{ext}`, then inserts one `attachments` row. Migration 064 sets `origin_entity_type` / `origin_entity_id` and re-links the row onto the contact or the open project. The response is read back after that, so `entity_type` and `entity_id` are where the file ended up.

The route only writes storage and `attachments`. It does not change a lead, client, or project, so it does not send email or SMS.

## Environment variables

Set these in the Vercel project `christianclardy-clardy-crm`, for Production and Preview. Do not commit them.

| Name | What to do |
| --- | --- |
| `ASSISTANT_UPLOAD_TOKEN` | **Add this.** A long random secret, for example `openssl rand -base64 32`. The assistant sends it as `Authorization: Bearer …`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Already used by the deployed API** (`api/upload.js`, `api/cron.js`, `api/docusign-send.js`, `api/invite.js`). Those routes return 500 if it is missing. This endpoint uses the same variable and does not need a second key. Confirm it is set for Production and Preview; do not rotate it for this change. |

This agent could not list the Vercel env dashboard (the team connection returned 403, and the CLI is not logged in). It did not create or change any secret.

## Request

`Authorization: Bearer $ASSISTANT_UPLOAD_TOKEN`

`Content-Type` is either `application/json` or `multipart/form-data`.

| Field | Required | Notes |
| --- | --- | --- |
| `entity_type` | yes | `lead`, `client`, or `project` |
| `entity_id` | yes | UUID of that record. The route checks that it exists. |
| `filename` | yes | Stored on the row. The storage object name is generated. |
| `category` | no | `photo`, `permit`, `contract`, `proposal`, `invoice`, `misc`, or `other`. Default `other`. |
| `file_type` | no | MIME type. Default is the upload's type, or `application/octet-stream`. |
| `file` | multipart | The file itself. Use this or one of the JSON sources below. |
| `file_base64` | JSON | Base64, or a `data:*;base64,` URL. |
| `source_url` | JSON | `http` or `https` URL of the file. The server downloads it. |
| `replace_attachment_id` | no | UUID of an existing row whose `url` is a Google Drive or Docs link. The uploaded file replaces that URL. No second row is created. |

Send exactly one of `file`, `file_base64`, or `source_url`.

The file itself must be 25 MB or smaller. Vercel rejects a request body over about 4.5 MB before this function runs, so a multipart or base64 upload has to fit under that platform cap (base64 is about a third larger than the file). For a larger file, put the bytes somewhere with a direct `https` link and send `source_url`. The server downloads up to 25 MB. Private addresses, localhost, and link-local or metadata hosts are refused, and a URL that returns a web page (a normal Drive "view" link does this) is refused. Use a direct download link.

Every new row is stored with `organization_id` `2c9485d2-9b17-48d4-bea7-72770c1e9eb9` (Clardy Construction) and `uploaded_by` `Assistant`.

## Response

`200` JSON:

```json
{
  "id": "attachment uuid",
  "url": "https://fneasddxtejasvsojgcu.supabase.co/storage/v1/object/public/Attachements/uploads/1731430000000-ab12cd34.pdf",
  "filename": "Proposal - Hale Patio.pdf",
  "entity_type": "project",
  "entity_id": "project uuid",
  "category": "proposal",
  "file_type": "application/pdf",
  "file_size": 48211,
  "replaced": false
}
```

`replaced` is `true` when a Drive link row was updated instead of inserted. `entity_type` may be `project` even when you passed a lead, because the carry trigger moved the new row.

| Status | Meaning |
| --- | --- |
| 401 | Missing or wrong bearer token. A staff session token is not accepted. |
| 404 | No lead, client, project, or attachment with that id. |
| 409 | `replace_attachment_id` is filed on a different record than the ids you sent. |
| 413 | File is over 25 MB. |
| 500 | `ASSISTANT_UPLOAD_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY` is not set. |

## Examples

File a proposal that is already base64:

```bash
curl -sS -X POST https://<your-deployment>/api/assistant-upload \
  -H "Authorization: Bearer $ASSISTANT_UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "lead",
    "entity_id": "LEAD-UUID",
    "filename": "Proposal - Hale Patio.pdf",
    "category": "proposal",
    "file_type": "application/pdf",
    "file_base64": "'"$(base64 < proposal.pdf)"'"
  }'
```

Download a file from a public URL and file it on a contact:

```bash
curl -sS -X POST https://<your-deployment>/api/assistant-upload \
  -H "Authorization: Bearer $ASSISTANT_UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "client",
    "entity_id": "CLIENT-UUID",
    "filename": "Invoice 1042.pdf",
    "category": "invoice",
    "source_url": "https://example.com/invoice-1042.pdf"
  }'
```

Multipart, same shape as a browser upload:

```bash
curl -sS -X POST https://<your-deployment>/api/assistant-upload \
  -H "Authorization: Bearer $ASSISTANT_UPLOAD_TOKEN" \
  -F entity_type=project \
  -F entity_id=PROJECT-UUID \
  -F filename="Site photo.jpg" \
  -F category=photo \
  -F file=@photo.jpg
```

## Replacing a Google Drive link

Some attachment rows store a Drive or Docs URL instead of a file in the bucket. To swap that link for the uploaded file, pass the row's id as `replace_attachment_id` plus the entity the row is on now. The route updates `url`, `filename`, `file_type`, and `file_size` on that same row. It does not insert a copy, and it will not overwrite a file that is already in Supabase storage.

If the row has no `organization_id`, the update sets the Clardy Construction organization. A category is updated only when you send one.

```bash
curl -sS -X POST https://<your-deployment>/api/assistant-upload \
  -H "Authorization: Bearer $ASSISTANT_UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "lead",
    "entity_id": "LEAD-UUID",
    "replace_attachment_id": "ATTACHMENT-UUID",
    "filename": "Proposal - Hale Patio.pdf",
    "category": "proposal",
    "file_type": "application/pdf",
    "file_base64": "'"$(base64 < proposal.pdf)"'"
  }'
```

Find the row first (the assistant's read-only SQL is enough):

```sql
select id, entity_type, entity_id, filename, url
from attachments
where url ilike '%drive.google.com%'
   or url ilike '%docs.google.com%'
   or url ilike '%drive.usercontent.google.com%';
```
