import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerServiceWorker } from './shared/lib/pwa/register'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Production builds only (never dev or demo). A UI can listen for "mindsahaay:sw-update" and call detail.apply().
void registerServiceWorker({
  onUpdateAvailable: (apply) => {
    window.dispatchEvent(new CustomEvent('mindsahaay:sw-update', { detail: { apply } }))
  },
})
