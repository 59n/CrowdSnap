"use client";

import { useState, useEffect, useMemo } from "react";
import { Trash2, Download, Image as ImageIcon, Film, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/components/TranslationProvider";

interface Upload {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export default function UploadGrid({ uploads: initialUploads, eventId }: { uploads: Upload[], eventId: string }) {
  const [uploads, setUploads] = useState(initialUploads);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<string>("newest");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const itemsPerPage = 20;
  const { t } = useTranslation();

  const router = useRouter();

  const filteredAndSortedUploads = useMemo(() => {
    let result = [...uploads];
    
    // Sort
    result.sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === "largest") return b.size - a.size;
      return a.size - b.size; // smallest
    });

    // Filter
    if (filterType === "images") {
      result = result.filter(u => u.mimeType.startsWith("image/"));
    } else if (filterType === "videos") {
      result = result.filter(u => u.mimeType.startsWith("video/"));
    }

    return result;
  }, [uploads, sortOrder, filterType]);

  const totalPages = Math.ceil(filteredAndSortedUploads.length / itemsPerPage);
  const paginatedUploads = filteredAndSortedUploads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [sortOrder, filterType]);

  const selectedImage = selectedIndex !== null ? filteredAndSortedUploads[selectedIndex] : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "ArrowLeft") {
        setSelectedIndex(selectedIndex === 0 ? filteredAndSortedUploads.length - 1 : selectedIndex - 1);
      } else if (e.key === "ArrowRight") {
        setSelectedIndex(selectedIndex === filteredAndSortedUploads.length - 1 ? 0 : selectedIndex + 1);
      } else if (e.key === "Escape") {
        setSelectedIndex(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, filteredAndSortedUploads.length]);

  useEffect(() => {
    if (selectedIndex !== null) {
      setTimeout(() => {
        const el = document.getElementById(`thumb-${selectedIndex}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 10);
    }
  }, [selectedIndex]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t("uploadGrid.confirmDelete", { name }))) return;

    try {
      const res = await fetch(`/api/admin/uploads/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");
      
      setUploads((prev) => prev.filter((u) => u.id !== id));
      toast.success(t("uploadGrid.fileDeleted"));
      router.refresh();
    } catch (error) {
      toast.error(t("uploadGrid.failedDelete"));
    }
  };

  if (uploads.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl bg-muted/10">
        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">{t("uploadGrid.noUploads")}</h3>
        <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
          {t("uploadGrid.noUploadsDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {uploads.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center bg-muted/20 p-2 rounded-lg border border-border/50">
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0" style={{ scrollbarWidth: "none" }}>
            <Button 
              variant={filterType === "all" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setFilterType("all")}
              className="rounded-full flex-shrink-0"
            >
              {t("uploadGrid.all")}
            </Button>
            <Button 
              variant={filterType === "images" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setFilterType("images")}
              className="rounded-full flex-shrink-0"
            >
              <ImageIcon className="w-4 h-4 mr-2" /> {t("uploadGrid.images")}
            </Button>
            <Button 
              variant={filterType === "videos" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setFilterType("videos")}
              className="rounded-full flex-shrink-0"
            >
              <Film className="w-4 h-4 mr-2" /> {t("uploadGrid.videos")}
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={async () => {
                if (!confirm(t("uploadGrid.confirmDeleteAll1", { count: uploads.length }))) return;
                if (!confirm(t("uploadGrid.confirmDeleteAll2", { count: uploads.length }))) return;
                if (!confirm(t("uploadGrid.confirmDeleteAll3"))) return;
                
                setIsDeletingAll(true);
                try {
                  const res = await fetch(`/api/admin/events/${eventId}/uploads`, { method: "DELETE" });
                  if (!res.ok) throw new Error("Failed to delete all uploads");
                  setUploads([]);
                  toast.success(t("uploadGrid.allUploadsDeleted"));
                  // Hard refresh to completely clear the UI state and re-fetch from the server
                  window.location.reload();
                } catch (error) {
                  toast.error(t("uploadGrid.failedDeleteAll"));
                  setIsDeletingAll(false);
                }
              }}
              disabled={isDeletingAll}
              className="rounded-full flex-shrink-0"
            >
              <Trash2 className="w-4 h-4 mr-2" /> {isDeletingAll ? t("uploadGrid.deleting") : t("uploadGrid.deleteAll")}
            </Button>
          </div>

          <select  
            className="text-sm bg-background border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-auto"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">{t("uploadGrid.newestFirst")}</option>
            <option value="oldest">{t("uploadGrid.oldestFirst")}</option>
            <option value="largest">{t("uploadGrid.largestFirst")}</option>
            <option value="smallest">{t("uploadGrid.smallestFirst")}</option>
          </select>
        </div>
      )}

      {paginatedUploads.length === 0 && uploads.length > 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl bg-muted/10">
          <h3 className="text-lg font-medium">{t("uploadGrid.noResults")}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{t("uploadGrid.tryChangingFilters")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {paginatedUploads.map((upload) => {
            // Find global index for lightbox navigation
            const globalIndex = filteredAndSortedUploads.findIndex(u => u.id === upload.id);
            
            return (
              <Card 
                key={upload.id} 
                className="overflow-hidden group relative border-muted/60 cursor-pointer"
                onClick={() => setSelectedIndex(globalIndex)}
              >
                <div className="aspect-square relative bg-muted flex items-center justify-center">
                  {upload.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                          src={`/api/admin/uploads/${upload.id}`} 
                          alt={upload.originalName}
                          loading="lazy"
                          className="object-cover w-full h-full"
                      />
                  ) : (
                      <video 
                          src={`/api/admin/uploads/${upload.id}#t=0.001`} 
                          className="object-cover w-full h-full"
                          preload="metadata"
                          muted 
                          playsInline
                      />
                  )}
                  
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-xs text-white truncate mb-1" title={upload.originalName}>
                      {upload.originalName}
                    </p>
                    <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" asChild>
                        <a href={`/api/admin/uploads/${upload.id}`} download={upload.originalName} target="_blank">
                           <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      <Button 
                        size="icon" 
                        variant="destructive" 
                        className="h-8 w-8 rounded-full"
                        onClick={() => handleDelete(upload.id, upload.originalName)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("uploadGrid.page")} {currentPage} {t("uploadGrid.of")} {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <AnimatePresence>
        {selectedImage && selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 md:p-8"
            onClick={() => setSelectedIndex(null)}
          >
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full z-[60]"
              onClick={() => setSelectedIndex(null)}
            >
              <X className="w-6 h-6" />
            </Button>
            
            {filteredAndSortedUploads.length > 1 && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full z-[60] h-10 w-10 md:h-14 md:w-14"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(selectedIndex === 0 ? filteredAndSortedUploads.length - 1 : selectedIndex - 1);
                  }}
                >
                  <ChevronLeft className="w-8 h-8 md:w-12 md:h-12" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full z-[60] h-10 w-10 md:h-14 md:w-14"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(selectedIndex === filteredAndSortedUploads.length - 1 ? 0 : selectedIndex + 1);
                  }}
                >
                  <ChevronRight className="w-8 h-8 md:w-12 md:h-12" />
                </Button>
              </>
            )}

            <motion.div 
              key={selectedImage.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-full max-h-full flex flex-col items-center justify-center outline-none pb-28"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedImage.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                      src={`/api/admin/uploads/${selectedImage.id}`} 
                      alt={selectedImage.originalName}
                      className="max-w-full max-h-[70vh] object-contain rounded-md shadow-2xl bg-black"
                  />
              ) : (
                  <video 
                      src={`/api/admin/uploads/${selectedImage.id}`} 
                      className="max-w-full max-h-[70vh] rounded-md shadow-2xl bg-black outline-none"
                      controls
                      playsInline
                      autoPlay
                  />
              )}
              
              <div className="mt-4 text-center text-white/90">
                <p className="font-medium text-lg drop-shadow-md">{selectedImage.originalName}</p>
                <p className="text-sm text-white/70 drop-shadow-md">{(selectedImage.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            </motion.div>

            {/* Thumbnail Strip */}
            <div 
              className="absolute bottom-6 left-0 right-0 flex justify-center w-full z-50 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2 md:gap-3 px-4 overflow-x-auto pb-4 max-w-[90vw] snap-x scroll-smooth" style={{ scrollbarWidth: "none" }}>
                {filteredAndSortedUploads.map((u, i) => (
                  <button 
                    id={`thumb-${i}`}
                    key={u.id}
                    onClick={() => setSelectedIndex(i)}
                    className={`relative h-16 w-16 md:h-20 md:w-20 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all transform snap-center ${
                      i === selectedIndex 
                        ? 'border-white ring-2 ring-white/20 ring-offset-2 ring-offset-black scale-110 opacity-100 z-10' 
                        : 'border-transparent opacity-40 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    {u.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                            src={`/api/admin/uploads/${u.id}`} 
                            alt={u.originalName}
                            loading="lazy"
                            className="object-cover w-full h-full"
                        />
                    ) : (
                        <video 
                            src={`/api/admin/uploads/${u.id}#t=0.001`} 
                            className="object-cover w-full h-full"
                            preload="metadata"
                            muted 
                            playsInline
                        />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
