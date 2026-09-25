import { useEffect, useState } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt` once, early — often before
// any React component mounts — so capture it at module load (imported from
// main.jsx) and hand it to whichever install button asks later.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  return {
    installed: isStandalone(),
    canPrompt: !!deferredPrompt,
    async prompt() {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notify();
      return outcome === 'accepted';
    },
  };
}

// Which set of install steps to show. Install support differs a lot by
// browser: only Chrome/Edge/Samsung prompt natively, iPhone needs Safari's
// Share menu, Mac Safari uses File → Add to Dock, Firefox desktop can't.
export function installPlatform() {
  const ua = window.navigator.userAgent;
  if (isIOS()) {
    if (/CriOS|FxiOS|EdgiOS|GSA\//.test(ua)) return 'ios-other-browser';
    if (/FBAN|FBAV|Instagram|Line\//.test(ua)) return 'ios-in-app';
    return 'ios-safari';
  }
  if (/Android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung';
    if (/Firefox/i.test(ua)) return 'android-firefox';
    return 'android-chrome';
  }
  if (/Edg\//.test(ua)) return 'desktop-edge';
  if (/Firefox/i.test(ua)) return 'desktop-firefox';
  if (/Chrome|Chromium/.test(ua)) return 'desktop-chrome';
  if (/Safari/.test(ua) && /Macintosh/.test(ua)) return 'mac-safari';
  return 'desktop-other';
}

export function isPhone() {
  return installPlatform().startsWith('ios') || installPlatform().startsWith('android');
}
