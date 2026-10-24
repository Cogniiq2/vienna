import { de } from './de';
import { sr } from './sr';
import type { Dictionary, Language } from './types';

export const dictionaries: Record<Language, Dictionary> = { sr, de };

export * from './types';
