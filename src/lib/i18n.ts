import 'server-only';
import { cache } from 'react';
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

// Per-request memoization (React cache) — avoids double dictionary loads in layout+page
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value as Locale;
  return dictionaries[locale] ? locale : 'en';
});

const dictMemo = new Map<Locale, Promise<unknown>>();

export const getDictionary = cache(async (forceLocale?: Locale) => {
  const locale = forceLocale || (await getLocale());
  let p = dictMemo.get(locale);
  if (!p) {
    p = dictionaries[locale]();
    dictMemo.set(locale, p);
  }
  return p as ReturnType<(typeof dictionaries)[Locale]>;
});

