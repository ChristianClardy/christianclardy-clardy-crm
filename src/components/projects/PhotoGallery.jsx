import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "before", label: "Before", color: "bg-blue-100 text-blue-700" },
  { value: "during", label: "During Construction", color: "bg-amber-100 text-amber-700" },
  { value: "after", label: "After Completion", color: "bg-emerald-100 text-emerald-700" },
];

export default function PhotoGallery({ projectId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [formData, setFormData] = useState({ category: "during", caption: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef();

  useEffect(() => {
    loadPhotos();
  }, [projectId]);

  const loadPhotos = async () => {
    setLoading(true);
    const data = await base44.entities.ProjectPhoto.filter({ project_id: projectId }, "-created_date");
    setPhotos(data);
    setLoading(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
    await base44.entities.ProjectPhoto.create({
      project_id: projectId,
      url: file_url,
      category: formData.category,
      caption: formData.caption,
    });
    setIsDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormData({ category: "during", caption: "" });
    loadPhotos();
    setUploading(false);
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this photo?")) {
      await base44.entities.ProjectPhoto.delete(id);
      loadPhotos();
    }
  };

  const openDialog = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormData({ category: "during", caption: "" });
    setIsDialogOpen(true);
  };

  const filtered = activeCategory === "all" ? photos : photos.filter((p) => p.category === activeCategory);

  const countByCategory = (cat) => photos.filter((p) => p.category === cat).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Photo Gallery</h2>
          <p className="text-sm text-slate-500">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={openDialog} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
          <Plus className="w-4 h-4 mr-1" />
          Add Photo
        </Button>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            activeCategory === "all"
              ? "bg-slate-800 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          All ({photos.length})
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              activeCategory === cat.value
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {cat.label} ({countByCategory(cat.value)})
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((photo) => {
            const cat = CATEGORIES.find((c) => c.value === photo.category);
            return (
              <div
                key={photo.id}
                className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 cursor-pointer"
                onClick={() => setLightboxPhoto(photo)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || "Project photo"}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200" />
                {cat && (
                  <span className={cn("absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium", cat.color)}>
                    {cat.label}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {photo.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">{photo.caption}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No photos yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload photos to document project progress</p>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Photo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label>Photo *</Label>
              <div
                className="mt-1.5 border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-amber-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded-lg object-contain" />
                ) : (
                  <div className="py-4">
                    <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Click to select a photo</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Caption</Label>
              <Input
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                placeholder="Optional description..."
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={!selectedFile || uploading}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption || "Photo"}
              className="max-h-[80vh] max-w-full rounded-xl object-contain"
            />
            <div className="flex items-center gap-3">
              {(() => {
                const cat = CATEGORIES.find((c) => c.value === lightboxPhoto.category);
                return cat ? (
                  <span className={cn("text-sm px-3 py-1 rounded-full font-medium", cat.color)}>{cat.label}</span>
                ) : null;
              })()}
              {lightboxPhoto.caption && (
                <p className="text-white/80 text-sm">{lightboxPhoto.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}