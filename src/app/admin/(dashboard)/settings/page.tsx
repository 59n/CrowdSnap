import SettingsForm from "./SettingsForm";
import { getDictionary, getLocale } from "@/lib/i18n";

export default async function SettingsPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = (dict as any).settings ?? {
    title: "Settings",
    subtitle: "Manage storage, auth, and server configuration without editing .env by hand.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">{t.subtitle}</p>
      </div>
      <SettingsForm />
    </div>
  );
}
