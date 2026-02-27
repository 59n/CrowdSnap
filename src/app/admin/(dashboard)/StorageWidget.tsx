"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/components/TranslationProvider";

export default function StorageWidget() {
  const [data, setData] = useState<{
    totalGB: number;
    usedGB: number;
    freeGB: number;
    percentage: number;
    isWarning: boolean;
    isCritical: boolean;
  } | null>(null);

  const [error, setError] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    fetch('/api/admin/storage')
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return null;

  if (!data) return (
    <Card className="animate-pulse bg-muted/20">
      <CardContent className="h-24"></CardContent>
    </Card>
  );

  return (
    <Card className={`border shadow-sm ${data.isCritical ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : data.isWarning ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-border'}`}>
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-xs font-medium flex justify-between items-center text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <HardDrive className={`w-3.5 h-3.5 ${data.isCritical ? 'text-red-600' : ''}`} /> 
            {t("storage.capacity")}
          </div>
          {data.isWarning && (
             <AlertTriangle className={`w-3.5 h-3.5 ${data.isCritical ? 'text-red-500' : 'text-amber-500'}`} />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-3">
        <div className="flex flex-col mb-1.5">
            <div className={`text-base font-bold drop-shadow-sm ${data.isCritical ? 'text-red-600 dark:text-red-400' : ''} leading-none`}>
                {data.freeGB.toFixed(1)} GB {t("storage.free")}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
                {data.usedGB.toFixed(1)} GB / {data.totalGB.toFixed(1)} GB {t("storage.used")}
            </div>
        </div>
        
        {/* Progress Bar Container */}
        <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
            <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  data.isCritical ? 'bg-red-500' : data.isWarning ? 'bg-amber-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, data.percentage)}%` }}
            />
        </div>
        
        {data.isWarning && (
            <p className={`text-[10px] mt-2 font-medium leading-tight ${data.isCritical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-500'}`}>
                {data.isCritical 
                    ? t("storage.critical") 
                    : t("storage.warning")}
            </p>
        )}
      </CardContent>
    </Card>
  );
}
