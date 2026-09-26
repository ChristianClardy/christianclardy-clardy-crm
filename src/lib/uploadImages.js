import { base44 } from "@/api/base44Client";

// Upload picked photos (camera or library) and return photo objects in the
// shape the Builder Portal stores in jsonb `photos` columns.
export async function uploadImages(fileList, { user, ...extra } = {}) {
  const out = [];
  for (const file of Array.from(fileList || [])) {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    out.push({
      url: file_url,
      filename: file.name,
      caption: "",
      uploaded_at: new Date().toISOString(),
      uploaded_by: user?.full_name || user?.email || "",
      ...extra,
    });
  }
  return out;
}
