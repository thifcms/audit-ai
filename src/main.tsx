import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import './index.css';

window.addEventListener('error', e => {
  if (e.message === 'ResizeObserver loop limit exceeded' || e.message === 'ResizeObserver loop completed with undelivered notifications.') {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

// Patch for Google Translate removeChild error
const originalRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function(child) {
  if (child.parentNode !== this) {
    if (console) {
      console.error('The node to be removed is not a child of this node.', this, child);
    }
    return child;
  }
  return originalRemoveChild.apply(this, [child]);
};

// Patch for Google Translate insertBefore error
const originalInsertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function(newNode, referenceNode) {
  if (referenceNode && referenceNode.parentNode !== this) {
    if (console) {
      console.error('The reference node is not a child of this node.', this, referenceNode);
    }
    return originalInsertBefore.apply(this, [newNode, null]);
  }
  return originalInsertBefore.apply(this, [newNode, referenceNode]);
};

console.log("[Main] Starting initialization...");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackMessage="Ops! Ocorreu um erro fatal no sistema.">
      {(() => {
        console.log("[Main] Rendering ErrorBoundary content...");
        return <App />;
      })()}
    </ErrorBoundary>
  </StrictMode>,
);
console.log("[Main] Initialization script finished.");
