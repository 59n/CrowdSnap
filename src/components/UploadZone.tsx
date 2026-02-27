"use client";

import React, { useCallback, useState } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, X, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { toast } from "sonner";

interface UploadZoneProps {
  eventId: string;
}

import { useTranslation } from "./TranslationProvider";

export default function UploadZone({ eventId }: UploadZoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(Array.from(e.target.files));
    }
  };

  const handleFilesSelected = (newFiles: File[]) => {
    // Basic frontend validation for allowed types
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "video/mp4", "video/quicktime", "video/webm"];
    const validFiles = newFiles.filter((f) => allowed.includes(f.type) || allowed.includes(f.type.toLowerCase()));
    const invalidFiles = newFiles.filter((f) => !allowed.includes(f.type) && !allowed.includes(f.type.toLowerCase()));
    
    if (invalidFiles.length > 0) {
      toast.error(t("guest.someSkipped"));
      setSkippedFiles((prev) => [...prev, ...invalidFiles]);
    }

    setFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setProgress(0);
    
    let successCount = 0;
    let failCount = 0;

    const CONCURRENCY_LIMIT = 3; // Upload 3 files simultaneously
    let currentIndex = 0;
    const fileProgresses = new Array(files.length).fill(0);

    const uploadNext = async (): Promise<void> => {
      // Get the next index in a thread-safe way conceptually
      const i = currentIndex++;
      if (i >= files.length) return;
      
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        await new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/upload/${eventId}`, true);
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              fileProgresses[i] = (event.loaded / event.total) * 100;
              const overallProgress = fileProgresses.reduce((sum, curr) => sum + curr, 0) / files.length;
              setProgress(Math.round(overallProgress));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              successCount++;
              resolve(true);
            } else {
              try {
                const res = JSON.parse(xhr.responseText);
                toast.error(res.error || `Failed to upload ${file.name}`);
              } catch {
                toast.error(`Failed to upload ${file.name}`);
              }
              failCount++;
              resolve(false);
            }
          };

          xhr.onerror = () => {
            toast.error(`${t("guest.networkError")} ${file.name}`);
            failCount++;
            resolve(false);
          };

          xhr.send(formData);
        });
      } catch (error) {
        failCount++;
      }
      
      // When done with this file, loop and pick up the next file in the queue
      await uploadNext();
    };

    // Spawn workers up to the concurrency limit
    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY_LIMIT, files.length); w++) {
      workers.push(uploadNext());
    }
    
    // Wait for all workers to finish the whole queue
    await Promise.all(workers);

    setUploading(false);
    setProgress(100);
    
    if (successCount > 0) {
        toast.success(`${t("guest.success")} ${successCount} ${t("guest.files")}`);
        setFiles([]); // Clear queue on success
        setUploadComplete(true);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <motion.div
        animate={{ scale: isDragging ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`relative flex flex-col items-center justify-center w-full h-56 md:h-64 border-2 border-dashed rounded-xl overflow-hidden backdrop-blur-sm transition-colors ${
          isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/30 bg-muted/30"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-br from-primary/5 to-transparent opacity-50"></div>
        {uploadComplete ? (
          <div className="flex flex-col items-center justify-center pt-5 pb-6 z-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <CheckCircle2 className="w-16 h-16 mb-4 text-green-500" />
            </motion.div>
            <p className="mb-2 text-lg text-foreground font-semibold">
              {t("guest.thankYou")}
            </p>
            <p className="text-sm text-muted-foreground mb-4">{t("guest.safelyShared")}</p>
            <Button variant="outline" size="sm" onClick={() => setUploadComplete(false)} className="z-30 relative">
              {t("guest.uploadMore")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center pt-5 pb-6 z-10">
              <UploadCloud className={`w-12 h-12 mb-4 ${isDragging ? "text-primary" : "text-muted-foreground/60"}`} />
              <p className="mb-2 text-sm text-foreground/80 font-medium">
                <span className="font-semibold text-primary">{t("guest.clickToUpload")}</span> {t("guest.orDragAndDrop")}
              </p>
              <p className="text-xs text-muted-foreground">{t("guest.supportedFiles")}</p>
            </div>
            <input
              id="dropzone-file"
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              multiple
              onChange={handleFileInput}
              disabled={uploading}
              accept="image/*,video/mp4,video/quicktime,video/webm"
            />
          </>
        )}
      </motion.div>

      {files.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border rounded-xl overflow-hidden shadow-sm"
        >
          <div className="p-4 border-b bg-muted/40 flex justify-between items-center">
            <h3 className="font-medium flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-primary" />
              {files.length} {files.length !== 1 ? t("guest.filesSelected") : t("guest.fileSelected")}
            </h3>
            <Button onClick={uploadFiles} disabled={uploading}>
              {uploading ? t("guest.uploading") : t("guest.uploadAll")}
            </Button>
          </div>
          
          {uploading && (
             <div className="p-4 border-b bg-muted/20">
                 <div className="flex justify-between text-xs mb-1.5 text-muted-foreground">
                     <span>{t("guest.uploadingFiles")}</span>
                     <span>{progress}%</span>
                 </div>
                 <Progress value={progress} className="h-2" />
             </div>
          )}

          <ul className="max-h-60 overflow-y-auto p-2">
            <AnimatePresence>
              {files.map((file, index) => (
                <motion.li
                  key={`${file.name}-${index}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        {file.type.startsWith('image/') ? (
                             // Sneak peak for images
                             // eslint-disable-next-line @next/next/no-img-element
                            <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover rounded" />
                        ) : (
                            <UploadCloud className="w-5 h-5 text-muted-foreground" />
                        )}
                    </div>
                    <div className="truncate">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button
                        onClick={() => removeFile(index)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-2"
                    >
                        <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      )}

      {skippedFiles.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl overflow-hidden shadow-sm"
        >
          <div className="p-4 border-b border-red-200 dark:border-red-900 bg-red-100/50 dark:bg-red-900/30 flex justify-between items-center">
            <h3 className="font-medium text-red-800 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {skippedFiles.length} {t("guest.skippedFiles")}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setSkippedFiles([])} className="h-8 text-red-700 hover:text-red-900 hover:bg-red-200 dark:text-red-300 dark:hover:text-red-100 dark:hover:bg-red-900">
              {t("guest.dismiss")}
            </Button>
          </div>
          
          <ul className="max-h-60 overflow-y-auto p-2">
            <AnimatePresence>
              {skippedFiles.map((file, index) => (
                <motion.li
                  key={`skipped-${file.name}-${index}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between p-2 hover:bg-red-100/30 dark:hover:bg-red-900/20 rounded-lg group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded bg-red-200/50 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                        {file.type.startsWith('image/') ? (
                             // Sneak peak for images
                             // eslint-disable-next-line @next/next/no-img-element
                            <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover rounded opacity-70 grayscale" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-500/70" />
                        )}
                    </div>
                    <div className="truncate">
                        <p className="text-sm font-medium text-red-900 dark:text-red-200 truncate line-through opacity-80">{file.name}</p>
                        <p className="text-xs text-red-700 dark:text-red-400">{t("guest.unsupportedFormat")} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button
                        onClick={() => setSkippedFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                    >
                        <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      )}
    </div>
  );
}
