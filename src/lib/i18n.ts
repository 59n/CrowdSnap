import 'server-only';
import { cookies } from 'next/headers';

const dictionaries = {
  en: () => import('@/dictionaries/en.json').then((module) => module.default),
  nl: () => import('@/dictionaries/nl.json').then((module) => module.default),
};

export type Locale = keyof typeof dictionaries;

export const getLocale = async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value as Locale;
  return dictionaries[locale] ? locale : 'en';
};

export const getDictionary = async (forceLocale?: Locale) => {
  const locale = forceLocale || await getLocale();
  return dictionaries[locale]();
};
