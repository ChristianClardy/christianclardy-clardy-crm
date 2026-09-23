import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/lib/installPrompt'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Installable app / offline shell (see public/sw.js). Production only so the
// Vite dev server's hot reload is never served from cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed', err));
  });
}
