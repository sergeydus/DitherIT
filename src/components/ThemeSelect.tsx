'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, themePreference, type ThemePreference } from '@/lib/theme';

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
}
function subscribe(listener: () => void) {
  const media = matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => { if (document.documentElement.dataset.themePreference === 'system') apply('system'); listener(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) { apply(themePreference(event.newValue)); listener(); }
  };
  media.addEventListener('change', onSystem);
  window.addEventListener('storage', onStorage);
  window.addEventListener('ditherit-theme-change', listener);
  onSystem();
  return () => {
    media.removeEventListener('change', onSystem);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('ditherit-theme-change', listener);
  };
}
const snapshot = () => themePreference(document.documentElement.dataset.themePreference);
const serverSnapshot = (): ThemePreference => 'system';

export function ThemeSelect() {
  const preference = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <div className="theme-control">
    <label htmlFor="theme">Theme</label>
    <select id="theme" className="control" value={preference} onChange={event => {
      const next = themePreference(event.target.value);
      apply(next);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Keep the session preference if storage is blocked. */ }
      window.dispatchEvent(new Event('ditherit-theme-change'));
    }}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </div>;
}
