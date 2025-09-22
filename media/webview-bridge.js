// VS Code API setup
const vscode = acquireVsCodeApi();

// Message bridge for webview buttons
document.addEventListener('click', e => {
  const target = e.target.closest('[data-cmd]');
  if (!target) return;

  e.preventDefault();
  e.stopPropagation();

  const command = target.dataset.cmd;
  const args = target.dataset.args ? JSON.parse(target.dataset.args) : {};

  vscode.postMessage({
    type: 'cmd',
    id: command,
    payload: args
  });
});

// Form submission handler
document.addEventListener('submit', e => {
  const form = e.target;
  if (!form.dataset.cmd) return;

  e.preventDefault();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  vscode.postMessage({
    type: 'cmd',
    id: form.dataset.cmd,
    payload
  });
});

// Input change handler for live updates
document.addEventListener('input', e => {
  const input = e.target;
  if (!input.dataset.cmd) return;

  // Debounce rapid input changes
  clearTimeout(input._updateTimer);
  input._updateTimer = setTimeout(() => {
    vscode.postMessage({
      type: 'cmd',
      id: input.dataset.cmd,
      payload: { value: input.value, name: input.name }
    });
  }, 300);
});

// Utility functions for webview content
window.gluefulUtils = {
  // Post a command message
  postMessage: (command, data = {}) => {
    vscode.postMessage({ type: 'cmd', id: command, payload: data });
  },

  // Set loading state for an element
  setLoading: (element, loading = true) => {
    if (loading) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = 'Loading...';
    } else {
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
    }
  },

  // Show a status message
  showStatus: (message, type = 'info') => {
    const statusEl = document.getElementById('status') || createStatusElement();
    statusEl.textContent = message;
    statusEl.className = `status status-${type}`;
    statusEl.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
};

function createStatusElement() {
  const statusEl = document.createElement('div');
  statusEl.id = 'status';
  statusEl.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 10px 15px;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    z-index: 1000;
    display: none;
  `;
  document.body.appendChild(statusEl);
  return statusEl;
}

// Error handling
window.addEventListener('error', (e) => {
  console.error('Webview error:', e.error);
  vscode.postMessage({
    type: 'error',
    message: e.error?.message || 'Unknown error',
    stack: e.error?.stack
  });
});

// Unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  vscode.postMessage({
    type: 'error',
    message: e.reason?.message || 'Unhandled promise rejection',
    stack: e.reason?.stack
  });
});

console.log('Glueful webview bridge loaded');