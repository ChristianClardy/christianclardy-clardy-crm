-- src/pages/Projects.jsx has always set project_type (residential/commercial/
-- renovation/new_construction) when creating or editing a Project, and
-- src/components/projects/ProjectCard.jsx reads it to pick an accent color —
-- but the `projects` table itself never had this column (only
-- estimate_templates/scope_templates/estimates did), so every Project
-- create/update has been failing with a schema-cache error.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'residential';

NOTIFY pgrst, 'reload schema';
