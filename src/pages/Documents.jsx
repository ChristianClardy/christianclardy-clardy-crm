import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CompanyDocumentsSection from "@/components/documents/CompanyDocumentsSection";
import { getSelectedCompanyScope, subscribeToCompanyScope } from "@/lib/companyScope";
import {
  Search, FileText, Image, File, Download, FolderOpen,
  BookOpen, Paperclip,
} from "lucide-react";

function FileIcon({ fileType }) {
  if (fileType?.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

const TABS = [
  { key: "library",  label: "Document Library",  icon: BookOpen },
  { key: "files",    label: "Project Files",      icon: Paperclip },
];

export default function Documents() {
  const [attachments, setAttachments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedCompanyScope, setSelectedCompanyScope] = useState(getSelectedCompanyScope());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("library");

  useEffect(() => {
    loadData();
    const unsub = subscribeToCompanyScope(setSelectedCompanyScope);
    return () => unsub();
  }, []);

  const loadData = async () => {
    const [attachmentData, projectData, taskData] = await Promise.all([
      base44.entities.Attachment.list("-created_date", 2000),
      base44.entities.Project.list("-updated_date", 500),
      base44.entities.Task.list("-updated_date", 2000),
    ]);
    setAttachments(attachmentData);
    setProjects(projectData);
    setTasks(taskData);
    setLoading(false);
  };

  const visibleProjects = useMemo(
    () => selectedCompanyScope === "all"
      ? projects
      : projects.filter((p) => p.company_id === selectedCompanyScope),
    [projects, selectedCompanyScope]
  );
  const projectMap = useMemo(() => Object.fromEntries(visibleProjects.map((p) => [p.id, p])), [visibleProjects]);
  const taskMap   = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);

  const filteredAttachments = attachments.filter((doc) => {
    const task    = taskMap[doc.entity_id];
    const project = doc.entity_type === "project" ? projectMap[doc.entity_id] : projectMap[task?.project_id];
    if (selectedCompanyScope !== "all" && !project) return false;
    const q = search.toLowerCase();
    return !q ||
      (doc.file_name || "").toLowerCase().includes(q) ||
      (doc.uploaded_by || "").toLowerCase().includes(q) ||
      (project?.name || "").toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">Documents</h1>
          <p className="mt-1 text-slate-500">Manage company templates and browse project files.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === "files" && (
              <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{filteredAttachments.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Document Library tab */}
      {activeTab === "library" && (
        <CompanyDocumentsSection selectedCompanyScope={selectedCompanyScope} search={search} />
      )}

      {/* Project Files tab */}
      {activeTab === "files" && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Total Files</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{filteredAttachments.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Project Files</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{filteredAttachments.filter((d) => d.entity_type === "project").length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Task Files</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{filteredAttachments.filter((d) => d.entity_type === "task").length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Projects With Files</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {new Set(
                  filteredAttachments.map((d) =>
                    d.entity_type === "project" ? d.entity_id : taskMap[d.entity_id]?.project_id
                  ).filter(Boolean)
                ).size}
              </p>
            </div>
          </div>

          {/* Files table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {filteredAttachments.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <FolderOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="font-medium">No project files found</p>
                <p className="mt-1 text-sm">Files uploaded to projects or tasks will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3">File</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Project</th>
                      <th className="px-5 py-3">Uploaded By</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttachments.map((doc) => {
                      const task    = taskMap[doc.entity_id];
                      const project = doc.entity_type === "project" ? projectMap[doc.entity_id] : projectMap[task?.project_id];
                      return (
                        <tr key={doc.id} className="border-b border-slate-100 hover:bg-amber-50/40">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <FileIcon fileType={doc.file_type} />
                              <div>
                                <p className="font-medium text-slate-900">{doc.file_name}</p>
                                {task && <p className="text-xs text-slate-400">{task.name || task.title}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <Badge className="capitalize bg-slate-100 text-slate-600">{doc.entity_type}</Badge>
                          </td>
                          <td className="px-5 py-4">
                            {project ? (
                              <Link to={createPageUrl(`ProjectDetail?id=${project.id}&tab=files`)} className="font-medium text-amber-700 hover:text-amber-800">
                                {project.name}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-600">{doc.uploaded_by || "—"}</td>
                          <td className="px-5 py-4 text-slate-500">
                            {doc.created_date ? new Date(doc.created_date).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-amber-700 hover:text-amber-800"
                            >
                              <Download className="h-4 w-4" /> Open
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
