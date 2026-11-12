// POST /api/assistant-upload
// Bearer ASSISTANT_UPLOAD_TOKEN only. See docs/assistant-upload.md.

const { handleAssistantUpload } = require('./_lib/assistantUpload.js');

module.exports = function handler(req, res) {
  return handleAssistantUpload(req, res);
};
