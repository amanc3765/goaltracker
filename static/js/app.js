/**
 * Main Application Controller for Personal Goals Tracker
 */

import { fetchGoals, saveGoals } from './api.js';
import { GoalStore } from './store.js';
import { TreeRenderer } from './tree.js';
import { InspectorPanel } from './inspector.js';

let store;
let renderer;
let inspector;
let saveDebounceTimer = null;

function showToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function triggerAutoSave() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    try {
      await saveGoals(store.getTree());
      showToast('Changes saved');
    } catch (err) {
      showToast('Failed to save changes');
    }
  }, 400);
}

document.addEventListener('DOMContentLoaded', async () => {
  const treeContainer = document.getElementById('tree-container');
  const overlayEl = document.getElementById('inspector-overlay');
  const drawerEl = document.getElementById('inspector-drawer');
  const searchInput = document.getElementById('search-input');
  const addProgramBtn = document.getElementById('add-program-btn');

  // Fetch initial goal hierarchy from backend
  let initialData = [];
  try {
    initialData = await fetchGoals();
  } catch (err) {
    console.error('Failed to load initial goals data:', err);
  }

  // Instantiate Store
  store = new GoalStore(initialData);

  // Instantiate Inspector Panel
  inspector = new InspectorPanel(overlayEl, drawerEl, store);

  // Instantiate Tree Renderer
  renderer = new TreeRenderer(treeContainer, store, {
    onSelectNode: (node) => {
      inspector.open(node.id);
    }
  });

  // Initial render
  renderer.render();

  // Store subscription: re-render UI & trigger backend auto-save
  store.subscribe(() => {
    renderer.render();
    if (inspector.currentNodeId) {
      const res = store.findNode(inspector.currentNodeId);
      if (res) inspector.renderNodeDetails(res.node);
      else inspector.close();
    }
    triggerAutoSave();
  });

  // Add Top-Level Program Button
  if (addProgramBtn) {
    addProgramBtn.addEventListener('click', () => {
      store.addChildNode(null);
    });
  }

  // Real-time Search Input Listener
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      store.setSearchQuery(e.target.value);
    });
  }

  // Keyboard Shortcuts Handler
  document.addEventListener('keydown', (e) => {
    // Ignore global keyboard shortcuts when user is typing in an input/textarea
    const activeTag = document.activeElement.tagName.toLowerCase();
    const isEditing = activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable;

    // Ctrl+K / Cmd+K -> Focus Search Bar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    if (isEditing) return;

    // 'N' key -> New Program
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      store.addChildNode(null);
      showToast('Created new Program');
      return;
    }

    // Arrow keys Navigation (Up/Down)
    const nodes = Array.from(document.querySelectorAll('.tree-node'));
    if (nodes.length === 0) return;

    let currentIndex = nodes.findIndex(n => n.dataset.id === renderer.focusedNodeId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : 0;
      const nextNode = nodes[nextIndex];
      renderer.setFocusedNode(nextNode.dataset.id);
      nextNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : nodes.length - 1;
      const prevNode = nodes[prevIndex];
      renderer.setFocusedNode(prevNode.dataset.id);
      prevNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === ' ') {
      // Space -> Toggle task completion
      if (renderer.focusedNodeId) {
        const res = store.findNode(renderer.focusedNodeId);
        if (res && res.node.type === 'task') {
          e.preventDefault();
          store.updateNode(res.node.id, { completed: !res.node.completed });
        }
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Delete / Backspace -> Delete focused node
      if (renderer.focusedNodeId) {
        e.preventDefault();
        const res = store.findNode(renderer.focusedNodeId);
        if (res && confirm(`Delete "${res.node.title}"?`)) {
          store.deleteNode(res.node.id);
        }
      }
    }
  });
});
