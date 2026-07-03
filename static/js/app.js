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
    } catch (err) {
      console.error('Failed to save goals:', err);
    }
  }, 50);
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

  // Instantiate Tree Renderer
  renderer = new TreeRenderer(treeContainer, store);

  // Initial render
  renderer.render();
  renderSummaryDashboard();

  // Store subscription: re-render UI & trigger backend auto-save
  store.subscribe(() => {
    renderer.render();
    renderSummaryDashboard();
    triggerAutoSave();
  });



  const toggleCollapseBtn = document.getElementById('toggle-collapse-btn');
  let isAllCollapsed = false;

  // Add Top-Level Program Button
  if (addProgramBtn) {
    addProgramBtn.addEventListener('click', () => {
      store.addChildNode(null);
    });
  }

  // Toggle Collapse / Expand All Button
  if (toggleCollapseBtn) {
    toggleCollapseBtn.addEventListener('click', () => {
      isAllCollapsed = !isAllCollapsed;
      store.setAllCollapsed(isAllCollapsed);
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

/**
 * Render Top Summary Dashboard Cards
 */
function renderSummaryDashboard() {
  const container = document.getElementById('summary-dashboard');
  if (!container || !store) return;

  const stats = store.getSummaryStats();

  const createCircularSvg = (completed, total, colorClass = 'cyan') => {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const radius = 21;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    return `
      <div class="summary-circular-wrapper">
        <svg class="summary-circular-svg" width="52" height="52" viewBox="0 0 52 52">
          <circle class="summary-circle-bg" cx="26" cy="26" r="${radius}"></circle>
          <circle class="summary-circle-fill ${colorClass}" cx="26" cy="26" r="${radius}"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <div class="summary-circular-text">${completed}/${total}</div>
      </div>
    `;
  };


  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-card-header">
        <span class="summary-card-title">Programs</span>
        <span class="summary-card-icon">🔷</span>
      </div>
      <div class="summary-card-value">${stats.numPrograms}</div>
    </div>

    <div class="summary-card">
      <div class="summary-card-header">
        <span class="summary-card-title">Projects</span>
        <span class="summary-card-icon">🔮</span>
      </div>
      <div class="summary-card-value">${stats.numProjects}</div>
    </div>

    <div class="summary-card">
      <div class="summary-card-header">
        <span class="summary-card-title">Milestones</span>
        <span class="summary-card-icon">💎</span>
      </div>
      <div class="summary-card-body">
        ${createCircularSvg(stats.completedMilestones, stats.totalMilestones, 'cyan')}
      </div>
    </div>

    <div class="summary-card">
      <div class="summary-card-header">
        <span class="summary-card-title">Tasks Completed</span>
        <span class="summary-card-icon">❇️</span>
      </div>
      <div class="summary-card-body">
        ${createCircularSvg(stats.completedTasks, stats.totalTasks, 'emerald')}
      </div>
    </div>
  `;
}

