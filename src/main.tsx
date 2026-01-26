import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/i18n';
import { ModalProvider } from './context/ModalContext';
import { PWAProvider } from './context/PWAContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}



const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <PWAProvider>
          <App />
        </PWAProvider>
      </ModalProvider>
    </QueryClientProvider>
  </StrictMode>,
)
