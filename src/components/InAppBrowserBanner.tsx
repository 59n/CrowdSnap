"use client";

import React, { useState, useEffect } from "react";
import { Compass, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "./TranslationProvider";

export default function InAppBrowserBanner() {
  const { t } = useTranslation();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    // Check if user already dismissed it this session
    try {
      if (sessionStorage.getItem("cs_inapp_dismissed") === "1") return;
    } catch {
      // sessionStorage might fail in strict private mode
    }

    const ua = navigator.userAgent || "";
    const isSocialInApp = /FBAN|FBAV|Instagram|ByteLocale|TikTok|MicroMessenger|Snapchat|Line\/|Twitter|LinkedInApp|Pinterest/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isIOSWebView = isIOS && !ua.includes("Safari") && !ua.includes("CriOS");

    if (isSocialInApp || isIOSWebView) {
      setShowBanner(true);
    }
  }, []);

  const dismiss = () => {
    setShowBanner(false);
    try {
      sessionStorage.setItem("cs_inapp_dismissed", "1");
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="w-full max-w-xl mx-auto mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-sm text-xs sm:text-sm"
        >
          <Compass className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            {t("guest.inAppBrowserWarning")}
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-md hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors shrink-0"
            aria-label={t("guest.inAppDismiss")}
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
