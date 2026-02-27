"use client";

import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/TranslationProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface QRExportWidgetProps {
  url: string;
}

export default function QRExportWidget({ url }: QRExportWidgetProps) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<"light" | "dark" | "transparent">("light");
  const svgRef = useRef<SVGSVGElement>(null);

  // Define colors based on selected theme
  const getThemeColors = () => {
    switch (theme) {
      case "dark":
        return { fg: "#ffffff", bg: "#000000" };
      case "transparent":
        return { fg: "#000000", bg: "transparent" };
      case "light":
      default:
        return { fg: "#000000", bg: "#ffffff" };
    }
  };

  const { fg, bg } = getThemeColors();

  const handleDownloadSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `crowdsnap-qr-${theme}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = () => {
    if (!svgRef.current) return;
    
    // Create a canvas to draw the SVG onto
    const canvas = document.createElement("canvas");
    // Render at high resolution (1024x1024)
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Serialize SVG with exact dimensions
    const svgElement = svgRef.current.cloneNode(true) as SVGSVGElement;
    svgElement.setAttribute("width", size.toString());
    svgElement.setAttribute("height", size.toString());
    const svgData = new XMLSerializer().serializeToString(svgElement);
    
    const img = new Image();
    // Convert SVG to base64 for the image source
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
    
    img.onload = () => {
      // If transparent, we don't need to fill a background
      if (theme !== "transparent") {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
      }
      
      // Draw the QR SVG
      ctx.drawImage(img, 0, 0, size, size);
      
      // Convert to PNG and trigger download
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `crowdsnap-qr-${theme}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 
        The actual interactive SVG we render on screen 
        We use a wrapper to show the transparent pattern if applicable
      */}
      <div 
        className="p-4 rounded-xl shadow-sm border shrink-0 transition-colors relative overflow-hidden"
        style={{ 
            backgroundColor: theme === "transparent" ? "transparent" : bg,
            backgroundImage: theme === "transparent" 
              ? 'repeating-conic-gradient(#f1f5f9 0% 25%, white 0% 50%)' 
              : 'none',
            backgroundPosition: "0 0, 8px 8px",
            backgroundSize: "16px 16px"
        }}
      >
        <QRCodeSVG 
          value={url} 
          size={160} 
          fgColor={fg}
          bgColor={bg === "transparent" ? "#ffffff00" : bg}
          level="H"
          includeMargin={false}
          ref={svgRef}
        />
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Palette className="w-4 h-4 mr-2" /> {t("qrExport.style")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>{t("qrExport.qrBackground")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme("light")} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border bg-white"></div> {t("qrExport.white")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border bg-black"></div> {t("qrExport.black")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("transparent")} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border bg-transparent" style={{ backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, white 0% 50%)', backgroundSize: "8px 8px" }}></div> {t("qrExport.transparent")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Download className="w-4 h-4 mr-2" /> {t("qrExport.download")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDownloadPNG}>
              {t("qrExport.downloadPng")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadSVG}>
              {t("qrExport.downloadSvg")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
