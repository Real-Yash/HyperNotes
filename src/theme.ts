export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  danger: string;
  chip: string;
  chipActive: string;
  onChipActive: string;
  overlay: string;
}

export const themes: Record<ThemeName, Theme> = {
  light: {
    name: 'light',
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    card: '#FAFAF8',
    border: '#E7E5E0',
    text: '#16150F',
    muted: '#7A766E',
    accent: '#D97706',
    onAccent: '#FFFFFF',
    danger: '#DC2626',
    chip: '#F0EFEC',
    chipActive: '#16150F',
    onChipActive: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.25)',
  },
  dark: {
    name: 'dark',
    bg: '#0F0E0B',
    surface: '#161511',
    card: '#1C1B16',
    border: '#2A2924',
    text: '#F3F1E9',
    muted: '#8F8B80',
    accent: '#F59E0B',
    onAccent: '#16150F',
    danger: '#F87171',
    chip: '#23221D',
    chipActive: '#F59E0B',
    onChipActive: '#16150F',
    overlay: 'rgba(0,0,0,0.5)',
  },
};
