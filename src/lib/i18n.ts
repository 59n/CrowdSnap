import 'server-only';
import { cookies } from 'next/headers';

const dictionaries = {
  en: () => import('@/dictionaries/en.json').then((module) => module.default),
  nl: () => import('@/dictionaries/nl.json').then((module) => module.default),
  es: () => import('@/dictionaries/es.json').then((module) => module.default),
  fr: () => import('@/dictionaries/fr.json').then((module) => module.default),
  de: () => import('@/dictionaries/de.json').then((module) => module.default),
  it: () => import('@/dictionaries/it.json').then((module) => module.default),
  pt: () => import('@/dictionaries/pt.json').then((module) => module.default),
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
