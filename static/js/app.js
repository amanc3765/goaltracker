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


window.showToast = showToast;

function getDueDateGroupInfo(deadlineStr) {
  if (!deadlineStr) {
    return { order: 9999, key: 'no-deadline', label: 'No Deadline', icon: '🗓️', isOverdue: false, isToday: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = deadlineStr.split('-');
  let d;
  if (parts.length === 3) {
    d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  } else {
    d = new Date(deadlineStr);
  }
  d.setHours(0, 0, 0, 0);

  const diffTime = d - today;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { order: -100 + diffDays, key: `overdue-${deadlineStr}`, label: `Overdue (${deadlineStr})`, icon: '⚠️', isOverdue: true, isToday: false };
  } else if (diffDays === 0) {
    return { order: 0, key: 'today', label: 'Due Today', icon: '⚡', isOverdue: false, isToday: true };
  } else if (diffDays === 1) {
    return { order: 1, key: 'tomorrow', label: 'Due Tomorrow', icon: '📅', isOverdue: false, isToday: false };
  } else {
    const formatted = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return { order: diffDays, key: deadlineStr, label: `Due ${formatted}`, icon: '📅', isOverdue: false, isToday: false };
  }
}

function renderTodoView() {
  const badgeEl = document.getElementById('todo-badge-count');
  const pendingCountEl = document.getElementById('todo-pending-count');
  const pendingListEl = document.getElementById('todo-pending-list');

  if (!pendingListEl) return;

  const pickedUpTasks = store.getPickedUpTasks();

  if (badgeEl) badgeEl.textContent = pickedUpTasks.length;
  if (pendingCountEl) pendingCountEl.textContent = `${pickedUpTasks.length} Pending`;

  // Render Active To-Do List Grouped & Sorted by Due Date
  pendingListEl.innerHTML = '';

  if (pickedUpTasks.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'todo-empty-state';
    emptyState.innerHTML = `
      <div class="empty-icon">📌</div>
      <p style="font-weight:600; color:var(--text-primary);">No tasks picked up yet!</p>
      <span class="empty-subtext">Click the small red dot on any task in the Goals Tree to add it to your daily to-do list.</span>
    `;
    pendingListEl.appendChild(emptyState);
  } else {
    const groupsMap = new Map();

    pickedUpTasks.forEach(task => {
      const gInfo = getDueDateGroupInfo(task.deadline);
      if (!groupsMap.has(gInfo.key)) {
        groupsMap.set(gInfo.key, { info: gInfo, tasks: [] });
      }
      groupsMap.get(gInfo.key).tasks.push(task);
    });

    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => a.info.order - b.info.order);

    const createTaskRow = (task) => {
      const row = document.createElement('div');
      row.className = 'todo-item-row';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'task-checkbox';
      check.checked = false;
      check.addEventListener('change', () => {
        store.updateNode(task.id, { completed: true, pickedUp: false });
        showToast('Task marked as completed! 🎉');
      });

      const info = document.createElement('div');
      info.className = 'todo-item-info';

      const title = document.createElement('div');
      title.className = 'todo-item-title';
      
      const titleText = document.createElement('span');
      titleText.textContent = task.title;
      title.appendChild(titleText);

      const res = store.findNode(task.id);
      if (res && res.parent) {
        const parentSpan = document.createElement('span');
        parentSpan.className = 'todo-item-parent-badge';
        parentSpan.textContent = ` [${res.parent.title}]`;
        parentSpan.style.fontSize = '11px';
        parentSpan.style.color = 'var(--text-muted)';
        parentSpan.style.marginLeft = '8px';
        parentSpan.style.fontWeight = 'normal';
        title.appendChild(parentSpan);
      }

      const deadlineSpan = document.createElement('span');
      deadlineSpan.className = 'todo-deadline-badge';
      deadlineSpan.style.cursor = 'pointer';
      deadlineSpan.title = 'Click to change deadline';
      const status = renderer ? renderer.getDeadlineStatus(task.deadline, 'task', task.createdAt) : null;
      const dateText = status ? status.formattedDate : (task.deadline || 'Set deadline');
      deadlineSpan.textContent = `📅 ${dateText}`;
      if (status && status.isOverdue) deadlineSpan.classList.add('overdue');
      else if (status && status.isDueSoon) deadlineSpan.classList.add('due-soon');

      deadlineSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (renderer) {
          renderer.openDeadlinePicker(deadlineSpan, task);
        }
      });

      const pickupBtn = document.createElement('button');
      pickupBtn.className = 'pickup-dot active';
      pickupBtn.title = 'Remove from Daily To-Do';
      pickupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.togglePickupTask(task.id);
        showToast('Task removed from To-Do list');
      });

      info.append(pickupBtn, title, deadlineSpan);

      const locateBtn = document.createElement('button');
      locateBtn.className = 'todo-locate-btn';
      locateBtn.title = 'Locate in Goals Tree';
      locateBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
        </svg>
      `;
      locateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        locateNodeInTree(task.id);
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'todo-remove-btn';
      removeBtn.title = 'Un-pick task';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        store.togglePickupTask(task.id);
        showToast('Task removed from To-Do list');
      });

      row.append(check, info, locateBtn, removeBtn);
      return row;
    };

    sortedGroups.forEach(group => {
      const dateGroupEl = document.createElement('div');
      dateGroupEl.className = 'todo-date-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = `todo-date-header ${group.info.isOverdue ? 'overdue' : ''} ${group.info.isToday ? 'today' : ''}`;
      
      const icon = document.createElement('span');
      icon.className = 'todo-date-header-icon';
      icon.textContent = group.info.icon;

      const title = document.createElement('span');
      title.className = 'todo-date-header-title';
      title.textContent = group.info.label;

      const count = document.createElement('span');
      count.className = 'todo-date-header-count';
      count.textContent = group.tasks.length;

      groupHeader.append(icon, title, count);
      dateGroupEl.appendChild(groupHeader);

      group.tasks.forEach(task => {
        dateGroupEl.appendChild(createTaskRow(task));
      });

      pendingListEl.appendChild(dateGroupEl);
    });
  }
}

function locateNodeInTree(nodeId) {
  if (store.showOnlyAchievements) {
    store.showOnlyAchievements = false;
    const filterAchievementsBtn = document.getElementById('btn-filter-achievements');
    if (filterAchievementsBtn) filterAchievementsBtn.classList.remove('active');
  }

  store.expandParentsOfNode(nodeId);

  setTimeout(() => {
    renderer.setFocusedNode(nodeId);
    const targetNodeEl = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (targetNodeEl) {
      targetNodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetNodeEl.classList.add('locate-pulse');
      setTimeout(() => targetNodeEl.classList.remove('locate-pulse'), 2000);
    }
  }, 100);
}


function renderCompletedSummaryView() {
  if (!renderer) return;
  const completedContainer = document.getElementById('completed-tree-container');
  if (completedContainer) {
    renderer.renderCompletedTree(completedContainer);
  }
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
  renderTodoView();

  const filterAchievementsBtn = document.getElementById('btn-filter-achievements');
  if (filterAchievementsBtn) {
    filterAchievementsBtn.addEventListener('click', () => {
      const isActive = store.toggleAchievementFilter();
      filterAchievementsBtn.classList.toggle('active', isActive);
    });
  }

  const showLevelBtn = document.getElementById('btn-show-level');
  if (showLevelBtn) {
    showLevelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderer.showLevelPicker(showLevelBtn);
    });
  }



  function applyColumnVisibility(vis) {
    const container = document.querySelector('.app-container') || document.body;
    const cols = ['title', 'type', 'status', 'priority', 'deadline', 'timeleft', 'progress', 'actions'];
    cols.forEach(col => {
      container.classList.toggle(`hide-col-${col}`, vis && vis[col] === false);
    });


  }

  // Initial column visibility application
  applyColumnVisibility(store.columnVisibility);

  // Store subscription: re-render UI & trigger backend auto-save
  store.subscribe(() => {
    renderer.render();
    renderSummaryDashboard();
    renderTodoView();
    applyColumnVisibility(store.columnVisibility);
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





  // Sort Select Listener
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      store.setSortBy(e.target.value);
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
