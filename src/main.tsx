import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AccessibilityMenu } from './components/AccessibilityMenu';
import { TutorialLinkOpener } from './components/TutorialVideos';
import { initAccessibility } from './services/accessibility';
import './index.css';

// Apply saved accessibility preferences before the first paint
initAccessibility();

createRoot(document.getElementById('root')!).render(
  <>
    <a href="#main-content" className="skip-link">
      דלג לתוכן הראשי
    </a>
    <App />
    <AccessibilityMenu />
    <TutorialLinkOpener />
  </>
);
