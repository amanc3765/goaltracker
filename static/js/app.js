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

function renderTodoView() {
  const badgeEl = document.getElementById('todo-badge-count');
  const pendingCountEl = document.getElementById('todo-pending-count');
  const pendingListEl = document.getElementById('todo-pending-list');
  const historyListEl = document.getElementById('todo-history-list');

  if (!pendingListEl || !historyListEl) return;

  const pickedUpTasks = store.getPickedUpTasks();
  const priorityWeights = { urgent: 4, critical: 4, high: 3, medium: 2, low: 1 };
  pickedUpTasks.sort((a, b) => {
    const pA = priorityWeights[a.priority] || 2;
    const pB = priorityWeights[b.priority] || 2;
    return pB - pA;
  });

  if (badgeEl) badgeEl.textContent = pickedUpTasks.length;
  if (pendingCountEl) pendingCountEl.textContent = `${pickedUpTasks.length} Pending`;

  // Render Section A: Active To-Do List
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
    pickedUpTasks.forEach(task => {
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
      title.textContent = task.title;

      const meta = document.createElement('div');
      meta.className = 'todo-item-meta';

      const priorityPill = document.createElement('span');
      priorityPill.className = 'priority-pill';
      priorityPill.dataset.priority = task.priority || 'medium';
      priorityPill.textContent = (task.priority || 'medium').toUpperCase();

      const pathSpan = document.createElement('span');
      pathSpan.className = 'todo-path-badge';
      pathSpan.textContent = task.contextPath || '';

      meta.append(priorityPill, pathSpan);
      info.append(title, meta);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'todo-remove-btn';
      removeBtn.title = 'Un-pick task';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        store.togglePickupTask(task.id);
        showToast('Task removed from To-Do list');
      });

      row.append(check, info, removeBtn);
      pendingListEl.appendChild(row);
    });
  }

  // Render Section B: Completed Task History (Grouped by Date, Latest First, Collapsed by default)
  historyListEl.innerHTML = '';
  const historyData = store.getCompletedHistoryGroupedByDate();

  if (historyData.length === 0) {
    const emptyHist = document.createElement('div');
    emptyHist.className = 'todo-empty-state';
    emptyHist.innerHTML = `<span class="empty-subtext">No completed task history available yet.</span>`;
    historyListEl.appendChild(emptyHist);
  } else {
    historyData.forEach(group => {
      const accordion = document.createElement('div');
      accordion.className = 'history-accordion collapsed';

      const header = document.createElement('div');
      header.className = 'history-accordion-header';

      const formattedDate = new Date(group.date).toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      header.innerHTML = `
        <div class="history-date-info">
          <span class="accordion-chevron">▶</span>
          <span class="history-date-title">${formattedDate}</span>
        </div>
        <span class="history-count-badge">${group.tasks.length} ${group.tasks.length === 1 ? 'task' : 'tasks'} completed</span>
      `;

      const content = document.createElement('div');
      content.className = 'history-accordion-content';

      // Group tasks by Program -> Project -> Milestone
      const hierarchy = {};
      group.tasks.forEach(t => {
        const pKey = t.programTitle || 'General Program';
        const prKey = t.projectTitle || 'General Project';
        const mKey = t.milestoneTitle || 'General Milestone';

        if (!hierarchy[pKey]) hierarchy[pKey] = { domain: t.domain, projects: {} };
        if (!hierarchy[pKey].projects[prKey]) hierarchy[pKey].projects[prKey] = {};
        if (!hierarchy[pKey].projects[prKey][mKey]) hierarchy[pKey].projects[prKey][mKey] = [];

        hierarchy[pKey].projects[prKey][mKey].push(t);
      });

      const domainIcons = { health: '🏃‍♂️', finance: '💰', relationship: '❤️', work: '💼', growth: '🌱' };


      Object.keys(hierarchy).forEach(progTitle => {
        const progData = hierarchy[progTitle];
        const progGroupEl = document.createElement('div');
        progGroupEl.className = 'history-program-group';

        const progHeader = document.createElement('div');
        progHeader.className = 'history-program-header';
        progHeader.innerHTML = `
          <span class="history-domain-icon">${domainIcons[progData.domain] || '💼'}</span>
          <span class="history-program-title">${progTitle}</span>
        `;
        progGroupEl.appendChild(progHeader);

        Object.keys(progData.projects).forEach(projTitle => {
          const projGroupEl = document.createElement('div');
          projGroupEl.className = 'history-project-group';

          const projHeader = document.createElement('div');
          projHeader.className = 'history-project-header';
          projHeader.innerHTML = `<span class="history-project-badge">PROJECT</span> ${projTitle}`;
          projGroupEl.appendChild(projHeader);

          Object.keys(progData.projects[projTitle]).forEach(msTitle => {
            const msGroupEl = document.createElement('div');
            msGroupEl.className = 'history-milestone-group';

            const msHeader = document.createElement('div');
            msHeader.className = 'history-milestone-header';
            msHeader.innerHTML = `<span class="history-milestone-badge">MILESTONE</span> ${msTitle}`;
            msGroupEl.appendChild(msHeader);

            const taskList = document.createElement('div');
            taskList.className = 'history-task-list';

            const priorityWeights = { urgent: 4, critical: 4, high: 3, medium: 2, low: 1 };
            const sortedTasks = [...progData.projects[projTitle][msTitle]].sort((a, b) => {
              const pA = priorityWeights[a.priority] || 2;
              const pB = priorityWeights[b.priority] || 2;
              return pB - pA;
            });

            sortedTasks.forEach(t => {
              const item = document.createElement('div');
              item.className = 'history-task-item';
              const priority = t.priority || 'medium';
              item.innerHTML = `
                <div class="history-task-check">✓</div>
                <span class="priority-dot" data-priority="${priority}" title="${priority.toUpperCase()} Priority"></span>
                <span class="history-task-title">${t.title}</span>
              `;
              taskList.appendChild(item);
            });



            msGroupEl.appendChild(taskList);
            projGroupEl.appendChild(msGroupEl);
          });

          progGroupEl.appendChild(projGroupEl);
        });

        content.appendChild(progGroupEl);
      });


      header.addEventListener('click', () => {
        accordion.classList.toggle('collapsed');
      });

      accordion.append(header, content);
      historyListEl.appendChild(accordion);
    });
  }
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

  // View Tab Switcher logic
  const tabTreeBtn = document.getElementById('tab-btn-tree');
  const tabTodoBtn = document.getElementById('tab-btn-todo');
  const tabCompletedBtn = document.getElementById('tab-btn-completed');

  const viewTreeEl = document.getElementById('view-tree');
  const viewTodoEl = document.getElementById('view-todo');
  const viewCompletedEl = document.getElementById('view-completed-summary');

  const switchView = (activeTab, activeView) => {
    [tabTreeBtn, tabTodoBtn, tabCompletedBtn].forEach(b => b && b.classList.remove('active'));
    [viewTreeEl, viewTodoEl, viewCompletedEl].forEach(v => {
      if (v) {
        v.classList.add('hidden');
        v.classList.remove('active');
      }
    });

    if (activeTab) activeTab.classList.add('active');
    if (activeView) {
      activeView.classList.remove('hidden');
      activeView.classList.add('active');
    }
  };

  if (tabTreeBtn) {
    tabTreeBtn.addEventListener('click', () => {
      switchView(tabTreeBtn, viewTreeEl);
    });
  }

  if (tabTodoBtn) {
    tabTodoBtn.addEventListener('click', () => {
      switchView(tabTodoBtn, viewTodoEl);
      renderTodoView();
    });
  }

  const filterAchievementsBtn = document.getElementById('btn-filter-achievements');
  if (filterAchievementsBtn) {
    filterAchievementsBtn.addEventListener('click', () => {
      const isActive = store.toggleAchievementFilter();
      filterAchievementsBtn.classList.toggle('active', isActive);
      if (isActive) {
        showToast('Filtering completed achievements 🏆 (without strikethrough)');
      } else {
        showToast('Showing all goals tree');
      }
    });
  }

  // Store subscription: re-render UI & trigger backend auto-save
  store.subscribe(() => {
    renderer.render();
    renderSummaryDashboard();
    renderTodoView();
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

  // Toggle Hide/Show Completed Button
  const toggleHideCompletedBtn = document.getElementById('toggle-hide-completed-btn');
  if (toggleHideCompletedBtn) {
    toggleHideCompletedBtn.addEventListener('click', () => {
      const isHidden = store.toggleHideCompleted();
      if (isHidden) {
        toggleHideCompletedBtn.classList.add('active');
        toggleHideCompletedBtn.title = 'Show completed goals';
        toggleHideCompletedBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        `;
      } else {
        toggleHideCompletedBtn.classList.remove('active');
        toggleHideCompletedBtn.title = 'Hide completed goals';
        toggleHideCompletedBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
      }
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

    <div class="summary-card priority-guidelines-card">
      <div class="summary-card-header">
        <span class="summary-card-title">Priority Guidelines</span>
        <span class="summary-card-icon">🎯</span>
      </div>
      <div class="priority-guide-list">
        <div class="guide-item urgent"><span class="guide-dot urgent"></span><span><strong>Urgent:</strong> Must do ASAP</span></div>
        <div class="guide-item high"><span class="guide-dot high"></span><span><strong>High:</strong> Must do today</span></div>
        <div class="guide-item medium"><span class="guide-dot medium"></span><span><strong>Medium:</strong> Should do, flexible timeline</span></div>

        <div class="guide-item low"><span class="guide-dot low"></span><span><strong>Low:</strong> Optional / Nice to have</span></div>
      </div>
    </div>
  `;
}
