"use client";

import { useTranslation } from "./TranslationProvider";
import { Button } from "./ui/button";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0 rounded-full md:w-auto md:px-3 md:h-9 md:rounded-md flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <Languages className="h-4 w-4" />
          <span className="hidden md:inline-block text-xs uppercase font-medium">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("en")}
            disabled={locale === "en"}
        >
          <span className="text-sm">🇬🇧</span> English
        </DropdownMenuItem>
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("nl")}
            disabled={locale === "nl"}
        >
          <span className="text-sm">🇳🇱</span> Nederlands
        </DropdownMenuItem>
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("es")}
            disabled={locale === "es"}
        >
          <span className="text-sm">🇪🇸</span> Español
        </DropdownMenuItem>
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("fr")}
            disabled={locale === "fr"}
        >
          <span className="text-sm">🇫🇷</span> Français
        </DropdownMenuItem>
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("de")}
            disabled={locale === "de"}
        >
          <span className="text-sm">🇩🇪</span> Deutsch
        </DropdownMenuItem>
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("it")}
            disabled={locale === "it"}
        >
          <span className="text-sm">🇮🇹</span> Italiano
        </DropdownMenuItem>
        <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocale("pt")}
            disabled={locale === "pt"}
        >
          <span className="text-sm">🇵🇹</span> Português
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
