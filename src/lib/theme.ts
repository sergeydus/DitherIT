export const THEME_STORAGE_KEY = 'ditherit-theme';
export type ThemePreference = 'system' | 'light' | 'dark';
export function themePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

// Static local code in <head> applies preference before body content can paint.
// Blocked storage falls back to the OS; only theme preference is persisted.
export const THEME_BOOTSTRAP = `(()=>{let p='system';try{const v=localStorage.getItem('${THEME_STORAGE_KEY}');if(v==='light'||v==='dark')p=v;}catch{}const r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;})();`;
