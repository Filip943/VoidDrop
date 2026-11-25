import type { AccentColor } from '../types';

export interface AccentThemeTokens {
  id: AccentColor;
  label: string;
  swatchClass: string;
  solidBtn: string;
  softBtn: string;
  activeNav: string;
  text: string;
  borderActive: string;
  progressBg: string;
  ringFocus: string;
}

export const ACCENT_THEMES: Record<AccentColor, AccentThemeTokens> = {
  cyan: {
    id: 'cyan',
    label: 'Cyjan Void',
    swatchClass: 'bg-cyan-400',
    solidBtn: 'bg-cyan-400 text-[#05070B] hover:bg-cyan-300',
    softBtn: 'bg-cyan-400/15 border-cyan-400/30 text-cyan-200 hover:bg-cyan-400 hover:text-[#05070B]',
    activeNav: 'bg-[#131928] text-cyan-300 border-cyan-400/25',
    text: 'text-cyan-300',
    borderActive: 'border-cyan-400 bg-cyan-400/10',
    progressBg: 'bg-cyan-400',
    ringFocus: 'focus:border-cyan-400 focus:ring-cyan-400/20',
  },
  violet: {
    id: 'violet',
    label: 'Neonowy Fiolet',
    swatchClass: 'bg-violet-400',
    solidBtn: 'bg-violet-400 text-[#05070B] hover:bg-violet-300',
    softBtn: 'bg-violet-400/15 border-violet-400/30 text-violet-200 hover:bg-violet-400 hover:text-[#05070B]',
    activeNav: 'bg-[#171429] text-violet-300 border-violet-400/25',
    text: 'text-violet-300',
    borderActive: 'border-violet-400 bg-violet-400/10',
    progressBg: 'bg-violet-400',
    ringFocus: 'focus:border-violet-400 focus:ring-violet-400/20',
  },
  emerald: {
    id: 'emerald',
    label: 'Szmaragdowy Impuls',
    swatchClass: 'bg-emerald-400',
    solidBtn: 'bg-emerald-400 text-[#05070B] hover:bg-emerald-300',
    softBtn: 'bg-emerald-400/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-400 hover:text-[#05070B]',
    activeNav: 'bg-[#10201C] text-emerald-300 border-emerald-400/25',
    text: 'text-emerald-300',
    borderActive: 'border-emerald-400 bg-emerald-400/10',
    progressBg: 'bg-emerald-400',
    ringFocus: 'focus:border-emerald-400 focus:ring-emerald-400/20',
  },
  amber: {
    id: 'amber',
    label: 'Bursztynowy Rdzeń',
    swatchClass: 'bg-amber-400',
    solidBtn: 'bg-amber-400 text-[#05070B] hover:bg-amber-300',
    softBtn: 'bg-amber-400/15 border-amber-400/30 text-amber-200 hover:bg-amber-400 hover:text-[#05070B]',
    activeNav: 'bg-[#211B11] text-amber-300 border-amber-400/25',
    text: 'text-amber-300',
    borderActive: 'border-amber-400 bg-amber-400/10',
    progressBg: 'bg-amber-400',
    ringFocus: 'focus:border-amber-400 focus:ring-amber-400/20',
  },
  rose: {
    id: 'rose',
    label: 'Karminowy Laser',
    swatchClass: 'bg-rose-400',
    solidBtn: 'bg-rose-400 text-[#05070B] hover:bg-rose-300',
    softBtn: 'bg-rose-400/15 border-rose-400/30 text-rose-200 hover:bg-rose-400 hover:text-[#05070B]',
    activeNav: 'bg-[#23121A] text-rose-300 border-rose-400/25',
    text: 'text-rose-300',
    borderActive: 'border-rose-400 bg-rose-400/10',
    progressBg: 'bg-rose-400',
    ringFocus: 'focus:border-rose-400 focus:ring-rose-400/20',
  },
};

export function getAccentTheme(color: AccentColor | undefined): AccentThemeTokens {
  return ACCENT_THEMES[color || 'cyan'] || ACCENT_THEMES.cyan;
}
