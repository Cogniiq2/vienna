import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource-variable/manrope/index.css';
import './styles/base.css';
import './styles/components.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './i18n/LanguageProvider';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LanguageProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </LanguageProvider>
    </StrictMode>,
  );
}
