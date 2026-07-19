/**
 * Tree View Renderer for Personal Goals Tracker
 * Securely constructs DOM elements without innerHTML XSS vulnerabilities.
 * Configures SortableJS drag-and-drop instances with hierarchy level safety.
 */

import { TYPE_HIERARCHY } from './store.js';

export class TreeRenderer {
  constructor(containerEl, store, options = {}) {
    this.container = containerEl;
    this.store = store;
    this.onSelectNode = options.onSelectNode || null;
    this.sortableInstances = [];
    this.focusedNodeId = null;
  }

  render() {
    this.cleanupSortables();
    const treeData = this.store.getSortedTree();
    const searchQuery = this.store.searchQuery;

    this.container.replaceChildren();

    if (!treeData || treeData.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Render Table Header Row with Column Sorting Arrows
    const tableHeader = this.renderTableHeader();
    this.container.appendChild(tableHeader);

    const rootList = document.createElement('div');
    rootList.className = 'node-children-container root-container';
    rootList.dataset.type = 'root';


    let visibleCount = 0;

    treeData.forEach((node) => {
      const nodeEl = this.createNodeElement(node, searchQuery);
      if (nodeEl) {
        rootList.appendChild(nodeEl);
        visibleCount++;
      }
    });

    if (visibleCount === 0 && (searchQuery || this.store.hideCompleted)) {
      this.renderNoSearchResults();
      return;
    }

    this.container.appendChild(rootList);

    // Initialize SortableJS for all containers after appending to DOM
    this.initAllSortables();
  }

  renderCompletedTree(targetContainer) {
    if (!targetContainer) return;
    targetContainer.innerHTML = '';

    const header = this.renderTableHeader(true);
    targetContainer.appendChild(header);

    const sortedTree = this.store.getSortedTree();
    const nonTaskNodes = sortedTree.filter(n => n.type !== 'task');

    if (nonTaskNodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<p class="empty-title">No higher-level goals found</p>`;
      targetContainer.appendChild(empty);
      return;
    }

    const rootList = document.createElement('div');
    rootList.className = 'tree-root-list';

    nonTaskNodes.forEach(node => {
      const el = this.createNodeElement(node, null, true);
      if (el) rootList.appendChild(el);
    });

    targetContainer.appendChild(rootList);
  }


  renderTableHeader(isCompletedView = false) {
    const headerRow = document.createElement('div');
    headerRow.className = 'tree-table-header';


    const currentSort = this.store.sortBy;

    const createHeaderCol = (fieldKey, label, className) => {
      const col = document.createElement('div');
      col.className = `table-header-col ${className}`;

      const text = document.createElement('span');
      text.className = 'header-col-label';
      text.textContent = label;

      const arrow = document.createElement('span');
      arrow.className = 'header-col-arrow';

      const isCurrentField = currentSort.startsWith(fieldKey);
      if (isCurrentField) {
        col.classList.add('active-sort');
        const isDesc = currentSort.endsWith('-desc');
        arrow.textContent = isDesc ? '↓' : '↑';
      } else {
        arrow.textContent = '↕';
        arrow.classList.add('muted-arrow');
      }


      col.append(text, arrow);
      col.style.cursor = 'pointer';
      col.title = `Click to sort by ${label}`;

      col.addEventListener('click', () => {
        if (!isCurrentField) {
          this.store.setSortBy(`${fieldKey}-asc`);
        } else if (currentSort.endsWith('-asc')) {
          this.store.setSortBy(`${fieldKey}-desc`);
        } else {
          this.store.setSortBy('manual');
        }
      });

      return col;
    };

    const leftSpacer = document.createElement('div');
    leftSpacer.className = 'table-header-spacer';

    const colTitle = createHeaderCol('title', 'Goal Title', 'col-main');
    const colType = createHeaderCol('type', 'Type', 'col-type');
    const colStatus = createHeaderCol('status', 'Status', 'col-status');
    const colPriority = createHeaderCol('priority', 'Priority', 'col-priority');
    const colProgress = createHeaderCol('progress', 'Progress', 'col-progress');

    const isAchievementMode = this.store ? this.store.showOnlyAchievements : false;

    if (isCompletedView) {
      headerRow.append(leftSpacer, colTitle, colStatus, colPriority, colType);
    } else if (isAchievementMode) {
      const colActions = document.createElement('div');
      colActions.className = 'table-header-col col-actions';
      headerRow.append(leftSpacer, colTitle, colStatus, colPriority, colProgress, colType, colActions);
    } else {
      const colDeadline = createHeaderCol('deadline', 'Deadline', 'col-deadline');
      const colTimeLeft = createHeaderCol('deadline', 'Time Left', 'col-timeleft');
      const colActions = document.createElement('div');
      colActions.className = 'table-header-col col-actions';
      headerRow.append(leftSpacer, colTitle, colDeadline, colStatus, colPriority, colTimeLeft, colProgress, colType, colActions);
    }


    return headerRow;
  }




  renderEmptyState() {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Add Program';
    btn.addEventListener('click', () => this.store.addChildNode(null));

    empty.appendChild(btn);
    this.container.appendChild(empty);
  }


  renderNoSearchResults() {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const title = document.createElement('div');
    title.className = 'empty-title';

    const desc = document.createElement('div');
    desc.className = 'empty-desc';

    if (this.store.searchQuery) {
      title.textContent = 'No matching goals found';
      desc.textContent = `No items match "${this.store.searchQuery}". Try a different keyword.`;
    } else {
      title.textContent = 'All goals hidden';
      desc.textContent = 'Toggle "Show completed goals" to see completed goals.';
    }

    empty.append(title, desc);
    this.container.appendChild(empty);
  }

  /**
   * Recursively build node DOM element
   */
  createNodeElement(node, searchQuery, isCompletedView = false) {
    if (isCompletedView && node.type === 'task') return null;

    const isAchievementMode = this.store.showOnlyAchievements;

    // Achievement Mode Logic: Only show completed tasks/milestones and their ancestor Programs/Projects (no uncompleted tasks/milestones!)
    if (isAchievementMode) {
      if (node.type === 'task') {
        const isDone = node.completed || node.status === 'completed' || node.progress === 100;
        if (!isDone) return null;
      }
    }

    const matchesSelf = this.store.matchesSearch(node, searchQuery);
    let childMatchCount = 0;
    
    const childrenContainer = document.createElement('div');
    childrenContainer.className = `node-children-container ${node.collapsed ? 'collapsed' : ''}`;
    childrenContainer.dataset.type = node.type;
    childrenContainer.dataset.parentId = node.id;

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (isCompletedView && child.type === 'task') return;
        const childEl = this.createNodeElement(child, searchQuery, isCompletedView);
        if (childEl) {
          childrenContainer.appendChild(childEl);
          childMatchCount++;
        }
      });
    }

    if (isAchievementMode) {
      if (node.type === 'milestone') {
        const isDone = node.completed || node.status === 'completed' || node.progress === 100;
        if (!isDone && childMatchCount === 0) {
          return null;
        }
      } else if (node.type !== 'task' && childMatchCount === 0) {
        return null;
      }
      childrenContainer.classList.remove('collapsed');
    }

    // Hide node if search filter or hideCompleted filter is active and neither self nor children match
    const isFiltering = searchQuery || (this.store.hideCompleted && !isAchievementMode);
    if (isFiltering && !matchesSelf && childMatchCount === 0) {
      return null;
    }

    // If searchQuery matched a child, force-expand parent
    if (searchQuery && childMatchCount > 0) {
      childrenContainer.classList.remove('collapsed');
    }

    const nodeWrapper = document.createElement('div');
    const isCompletedClass = (!isAchievementMode && node.completed) ? 'completed' : '';
    nodeWrapper.className = `tree-node ${this.focusedNodeId === node.id ? 'focused' : ''} ${isCompletedClass}`;

    if (node.type === 'program' && !node.collapsed) {
      nodeWrapper.classList.add('expanded-program');
    }
    nodeWrapper.dataset.id = node.id;
    nodeWrapper.dataset.type = node.type;
    nodeWrapper.setAttribute('tabindex', '0');


    // Focus handler
    nodeWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFocusedNode(node.id);
    });


    const card = document.createElement('div');
    card.className = 'node-card';

    // 1. LEFT SECTION: Drag, Chevron/Check, Title & Description Preview
    const leftSec = document.createElement('div');
    leftSec.className = 'col-main';

    // Drag Handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.appendChild(this.createSvgIcon('drag'));
    leftSec.appendChild(dragHandle);

    // Chevron Toggle or Checkbox
    if (node.type !== 'task') {
      const chevron = document.createElement('button');
      chevron.className = `chevron-toggle ${node.collapsed ? 'collapsed' : ''}`;
      chevron.appendChild(this.createSvgIcon('chevron'));
      chevron.title = node.collapsed ? 'Expand children' : 'Collapse children';
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.toggleCollapse(node.id);
      });
      leftSec.appendChild(chevron);
    } else {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-checkbox';
      checkbox.checked = !!node.completed;
      checkbox.addEventListener('click', (e) => e.stopPropagation());
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.store.updateNode(node.id, { completed: checkbox.checked });
      });
      leftSec.appendChild(checkbox);

      // Red Pick-Up Dot button for Task Execution List
      const isTaskCompleted = !!node.completed || node.status === 'completed';
      if (!isTaskCompleted) {
        const pickupDot = document.createElement('button');
        pickupDot.className = `pickup-dot ${node.pickedUp ? 'active' : ''}`;
        pickupDot.title = node.pickedUp ? 'Remove from Daily To-Do list' : 'Pick up task for Daily To-Do list';
        pickupDot.addEventListener('click', (e) => {
          e.stopPropagation();
          const isPicked = this.store.togglePickupTask(node.id);
          if (typeof window.showToast === 'function') {
            window.showToast(isPicked ? 'Task added to Daily To-Do list ⚡' : 'Task removed from Daily To-Do list');
          }
        });
        leftSec.appendChild(pickupDot);
      }
    }


    // Title Wrapper & Editable Title
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'node-title-wrapper';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'node-title';
    titleSpan.textContent = node.title || 'Untitled';
    titleSpan.title = 'Click to edit title inline';
    titleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startInlineTitleEdit(titleSpan, node);
    });
    titleWrapper.appendChild(titleSpan);

    leftSec.appendChild(titleWrapper);


    // 2. TYPE & DOMAIN COLUMN
    const colType = document.createElement('div');
    colType.className = 'col-type';

    if (node.type === 'program') {
      const domainPill = document.createElement('span');
      domainPill.className = 'domain-pill';
      domainPill.dataset.domain = node.domain || 'work';

      const domainIcons = {
        health: '🏃‍♂️',
        finance: '💰',
        relationship: '❤️',
        work: '💼',
        growth: '🌱'
      };

      const domainLabels = {
        health: 'Health',
        finance: 'Finance',
        relationship: 'Relationship',
        work: 'Work',
        growth: 'Growth'
      };


      const domKey = node.domain || 'work';
      domainPill.textContent = `${domainIcons[domKey] || '💼'} ${domainLabels[domKey] || 'Work'}`;
      domainPill.title = 'Click to change domain';

      domainPill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDomainPicker(domainPill, node);
      });

      colType.appendChild(domainPill);
    } else {
      const typeBadge = document.createElement('span');
      typeBadge.className = 'type-badge';
      typeBadge.dataset.type = node.type;
      typeBadge.textContent = node.type;
      typeBadge.title = 'Click to change goal type';
      typeBadge.style.cursor = 'pointer';
      typeBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showTypePicker(typeBadge, node);
      });
      colType.appendChild(typeBadge);
    }



    // 3. STATUS COLUMN (Not Started, In Progress, Completed)
    const colStatus = document.createElement('div');
    colStatus.className = 'col-status';
    const statusPill = document.createElement('div');
    statusPill.className = 'status-pill';
    statusPill.dataset.status = node.status || 'not-started';

    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot';

    const statusLabels = {
      'not-started': 'Not Started',
      'in-progress': 'In Progress',
      'completed': 'Completed'
    };

    const statusLabel = document.createElement('span');
    statusLabel.textContent = statusLabels[node.status] || 'Not Started';

    statusPill.append(statusDot, statusLabel);
    statusPill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showStatusPicker(statusPill, node);
    });
    colStatus.appendChild(statusPill);

    // 4. PRIORITY COLUMN
    const colPriority = document.createElement('div');
    colPriority.className = 'col-priority';
    const priorityPill = document.createElement('div');
    priorityPill.className = 'priority-pill';
    priorityPill.dataset.priority = node.priority || 'medium';
    const dot = document.createElement('span');
    dot.className = 'priority-dot';
    const prioLabel = document.createElement('span');
    prioLabel.textContent = (node.priority || 'medium').charAt(0).toUpperCase() + (node.priority || 'medium').slice(1);
    priorityPill.append(dot, prioLabel);
    priorityPill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPriorityPicker(priorityPill, node);
    });
    colPriority.appendChild(priorityPill);

    // 5. DEADLINE COLUMN (Date Text & Datepicker)
    const colDeadline = document.createElement('div');
    colDeadline.className = 'col-deadline';
    const deadlineText = document.createElement('span');
    deadlineText.className = 'deadline-simple-text';
    const status = this.getDeadlineStatus(node.deadline, node.type, node.createdAt);


    const isCompleted = !!node.completed || node.status === 'completed';

    deadlineText.textContent = status.formattedDate;
    deadlineText.title = 'Click to set deadline';
    if (isCompleted) {
      deadlineText.classList.add('completed-deadline');
    } else if (status.isOverdue) {
      deadlineText.classList.add('overdue');
    } else if (status.isDueSoon) {
      deadlineText.classList.add('due-soon');
    }
    
    deadlineText.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openDeadlinePicker(deadlineText, node);
    });
    colDeadline.appendChild(deadlineText);

    // 5b. TIME LEFT COLUMN (Time Remaining Bar & Inverted Color Coding)
    const colTimeLeft = document.createElement('div');
    colTimeLeft.className = 'col-timeleft';

    if (!isCompleted && node.deadline && status.timePct !== null) {
      const timeText = document.createElement('span');
      timeText.className = 'time-left-text';
      if (status.isOverdue) timeText.classList.add('overdue');
      timeText.textContent = status.label;

      const timeBg = document.createElement('div');
      timeBg.className = 'time-bar-bg';
      const timeFill = document.createElement('div');
      timeFill.className = 'time-bar-fill';
      timeFill.style.width = `${Math.min(100, Math.max(0, status.timePct))}%`;

      // Time Remaining Color Thresholds: Red if overdue or < 25%, Green when > 75%, Yellow when 25%-75%
      if (status.isOverdue || status.timePct < 25) {
        timeFill.dataset.level = 'low'; // Red if overdue or < 25% time left
      } else if (status.timePct > 75) {
        timeFill.dataset.level = 'high'; // Green when > 75% time left
      } else {
        timeFill.dataset.level = 'medium'; // Yellow when 25% - 75% time left
      }


      timeBg.appendChild(timeFill);
      colTimeLeft.append(timeText, timeBg);
    } else {
      const timeMuted = document.createElement('span');
      timeMuted.className = 'time-left-muted';
      timeMuted.textContent = '-';
      colTimeLeft.appendChild(timeMuted);
    }

    // 6. PROGRESS COLUMN (Programs, Projects, Milestones only; Tasks are binary 0/1)
    const colProgress = document.createElement('div');
    colProgress.className = 'col-progress';

    if (node.type !== 'task') {
      const progressBg = document.createElement('div');
      progressBg.className = 'progress-bar-bg';
      const progressFill = document.createElement('div');
      progressFill.className = 'progress-bar-fill';
      const pVal = node.progress || 0;
      progressFill.style.width = `${Math.min(100, Math.max(0, pVal))}%`;

      if (pVal < 25) {
        progressFill.dataset.level = 'low';
      } else if (pVal < 50) {
        progressFill.dataset.level = 'medium';
      } else {
        progressFill.dataset.level = 'high';
      }

      progressBg.appendChild(progressFill);

      const progressText = document.createElement('span');
      progressText.className = 'progress-text';
      progressText.textContent = `${pVal}%`;

      colProgress.append(progressBg, progressText);
    } else {
      const progressMuted = document.createElement('span');
      progressMuted.className = 'time-left-muted';
      progressMuted.textContent = '-';
      colProgress.appendChild(progressMuted);
    }



    // 7. ACTIONS COLUMN
    const colActions = document.createElement('div');
    colActions.className = 'col-actions';
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'node-actions';

    if (isAchievementMode) {
      if (node.type === 'task') {
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete-btn';
        delBtn.title = 'Delete item';
        delBtn.appendChild(this.createSvgIcon('trash'));
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showConfirmDialog({
            title: 'Delete Goal Item',
            message: `Are you sure you want to delete <strong>"${node.title}"</strong> and all its sub-items?`,
            confirmText: 'Delete',
            onConfirm: () => {
              this.store.deleteNode(node.id);
            }
          });
        });
        actionsGroup.appendChild(delBtn);
      }
    } else {
      const moveUpBtn = document.createElement('button');
      moveUpBtn.className = 'icon-btn';
      moveUpBtn.title = 'Move up';
      moveUpBtn.appendChild(this.createSvgIcon('arrow-up'));
      moveUpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.moveNodeRelative(node.id, -1);
      });
      actionsGroup.appendChild(moveUpBtn);

      const moveDownBtn = document.createElement('button');
      moveDownBtn.className = 'icon-btn';
      moveDownBtn.title = 'Move down';
      moveDownBtn.appendChild(this.createSvgIcon('arrow-down'));
      moveDownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.moveNodeRelative(node.id, 1);
      });
      actionsGroup.appendChild(moveDownBtn);

      const childType = TYPE_HIERARCHY[node.type];
      if (childType) {
        const addBtn = document.createElement('button');
        addBtn.className = 'icon-btn';
        addBtn.title = `+ Add ${childType.charAt(0).toUpperCase() + childType.slice(1)}`;
        addBtn.appendChild(this.createSvgIcon('plus'));
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.store.addChildNode(node.id);
        });
        actionsGroup.appendChild(addBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn delete-btn';
      delBtn.title = 'Delete item';
      delBtn.appendChild(this.createSvgIcon('trash'));
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showConfirmDialog({
          title: 'Delete Goal Item',
          message: `Are you sure you want to delete <strong>"${node.title}"</strong> and all its sub-items?`,
          confirmText: 'Delete',
          onConfirm: () => {
            this.store.deleteNode(node.id);
          }
        });
      });
      actionsGroup.appendChild(delBtn);
    }

    colActions.appendChild(actionsGroup);

    // Assemble Card in exact field order: Title -> Deadline -> Status -> Priority -> Time Left -> Progress -> Type -> Actions
    if (isCompletedView) {
      card.append(leftSec, colStatus, colPriority, colType);
    } else if (isAchievementMode) {
      card.append(leftSec, colStatus, colPriority, colProgress, colType, colActions);
    } else {
      card.append(leftSec, colDeadline, colStatus, colPriority, colTimeLeft, colProgress, colType, colActions);
    }

    nodeWrapper.append(card, childrenContainer);

    return nodeWrapper;
  }


  initAllSortables() {
    this.cleanupSortables();
    if (typeof Sortable === 'undefined') return;

    // Root level programs container
    const rootContainer = this.container.querySelector('.root-container');
    if (rootContainer) {
      this.initSortable(rootContainer, 'program', null);
    }

    // All nested children containers
    const childContainers = this.container.querySelectorAll('.node-children-container:not(.root-container)');
    childContainers.forEach(container => {
      const parentType = container.dataset.type;
      const parentId = container.dataset.parentId;
      const childType = TYPE_HIERARCHY[parentType];
      if (childType) {
        this.initSortable(container, childType, parentId);
      }
    });
  }

  setFocusedNode(id) {

    this.focusedNodeId = id;
    document.querySelectorAll('.tree-node').forEach(el => {
      if (el.dataset.id === id) {
        el.classList.add('focused');
      } else {
        el.classList.remove('focused');
      }
    });
  }

  startInlineTitleEdit(titleSpan, node) {
    const parent = titleSpan.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'node-title-input';
    input.value = node.title || '';

    const commit = () => {
      const val = input.value.trim();
      if (val && val !== node.title) {
        this.store.updateNode(node.id, { title: val });
      } else {
        this.render();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        this.render();
      }
    });

    input.addEventListener('blur', commit);

    parent.replaceChild(input, titleSpan);
    input.focus();
    input.select();
  }

  showPriorityPicker(anchorEl, node) {
    document.querySelectorAll('.priority-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'priority-dropdown';

    const priorities = [
      { id: 'urgent', label: 'Urgent 🔴' },
      { id: 'high', label: 'High 🟠' },
      { id: 'medium', label: 'Medium 🟡' },
      { id: 'low', label: 'Low 🟢' }
    ];


    priorities.forEach(p => {
      const opt = document.createElement('div');
      opt.className = 'priority-option';
      opt.textContent = p.label;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.updateNode(node.id, { priority: p.id });
        dropdown.remove();
      });
      dropdown.appendChild(opt);
    });

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    const dropHeight = dropdown.offsetHeight || 160;
    if (rect.bottom + dropHeight > window.innerHeight - 20) {
      dropdown.style.top = `${Math.max(10, rect.top - dropHeight - 4)}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }


    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  showStatusPicker(anchorEl, node) {
    document.querySelectorAll('.priority-dropdown, .status-dropdown, .domain-dropdown, .type-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown';

    const statuses = [
      { id: 'not-started', label: 'Not Started ⚪' },
      { id: 'in-progress', label: 'In Progress 🟡' },
      { id: 'completed', label: 'Completed 🟢' }
    ];

    statuses.forEach(s => {
      const opt = document.createElement('div');
      opt.className = 'status-option';
      opt.textContent = s.label;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.updateNode(node.id, { status: s.id });
        dropdown.remove();
      });
      dropdown.appendChild(opt);
    });

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    const dropHeight = dropdown.offsetHeight || 140;
    if (rect.bottom + dropHeight > window.innerHeight - 20) {
      dropdown.style.top = `${Math.max(10, rect.top - dropHeight - 4)}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  showDomainPicker(anchorEl, node) {
    document.querySelectorAll('.priority-dropdown, .status-dropdown, .domain-dropdown, .type-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'domain-dropdown';

    const domains = [
      { id: 'health', label: '🏃‍♂️ Health' },
      { id: 'finance', label: '💰 Finance' },
      { id: 'relationship', label: '❤️ Relationship' },
      { id: 'work', label: '💼 Work' },
      { id: 'growth', label: '🌱 Growth' }
    ];

    domains.forEach(d => {
      const opt = document.createElement('div');
      opt.className = 'domain-option';
      opt.textContent = d.label;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.updateNode(node.id, { domain: d.id });
        dropdown.remove();
      });
      dropdown.appendChild(opt);
    });

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    const dropHeight = dropdown.offsetHeight || 180;
    if (rect.bottom + dropHeight > window.innerHeight - 20) {
      dropdown.style.top = `${Math.max(10, rect.top - dropHeight - 4)}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  showTypePicker(anchorEl, node) {
    document.querySelectorAll('.priority-dropdown, .status-dropdown, .domain-dropdown, .type-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'type-dropdown';

    const types = [
      { id: 'program', label: 'Program' },
      { id: 'project', label: 'Project' },
      { id: 'milestone', label: 'Milestone' },
      { id: 'task', label: 'Task' }
    ];

    types.forEach(t => {
      const opt = document.createElement('div');
      opt.className = 'type-option';
      opt.textContent = t.label;
      if (node.type === t.id) opt.classList.add('selected');

      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.changeNodeType(node.id, t.id);
        dropdown.remove();
      });
      dropdown.appendChild(opt);
    });

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    const dropHeight = dropdown.offsetHeight || 160;
    if (rect.bottom + dropHeight > window.innerHeight - 20) {
      dropdown.style.top = `${Math.max(10, rect.top - dropHeight - 4)}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  showLevelPicker(anchorEl) {
    document.querySelectorAll('.priority-dropdown, .status-dropdown, .domain-dropdown, .type-dropdown, .level-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'level-dropdown';

    const levels = [
      { id: 'collapse-all', label: '📁 Collapse All' },
      { id: 'program', label: '🔷 Program' },
      { id: 'project', label: '🔮 Project' },
      { id: 'milestone', label: '💎 Milestone' },
      { id: 'task', label: '⚡ Task' }
    ];


    levels.forEach(lvl => {
      const opt = document.createElement('div');
      opt.className = 'level-option';
      opt.textContent = lvl.label;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.expandTreeToLevel(lvl.id);
        dropdown.remove();
      });
      dropdown.appendChild(opt);
    });

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    const dropHeight = dropdown.offsetHeight || 160;
    if (rect.bottom + dropHeight > window.innerHeight - 20) {
      dropdown.style.top = `${Math.max(10, rect.top - dropHeight - 4)}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  showColumnPicker(anchorEl) {
    document.querySelectorAll('.priority-dropdown, .status-dropdown, .domain-dropdown, .type-dropdown, .level-dropdown, .column-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'column-dropdown';

    const header = document.createElement('div');
    header.className = 'column-dropdown-header';
    
    const title = document.createElement('span');
    title.className = 'column-dropdown-title';
    title.textContent = 'Toggle Columns';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'column-dropdown-reset';
    resetBtn.textContent = 'Show All';
    resetBtn.title = 'Reset all columns to visible';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.store.resetColumnVisibility();
      this.renderColumnPickerItems(itemsContainer);
    });

    header.append(title, resetBtn);
    dropdown.appendChild(header);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'column-dropdown-items';
    this.renderColumnPickerItems(itemsContainer);

    dropdown.appendChild(itemsContainer);

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    const dropHeight = dropdown.offsetHeight || 260;
    if (rect.bottom + dropHeight > window.innerHeight - 20) {
      dropdown.style.top = `${Math.max(10, rect.top - dropHeight - 4)}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  renderColumnPickerItems(container) {
    container.replaceChildren();

    const columns = [
      { id: 'title', label: 'Goal Title' },
      { id: 'deadline', label: 'Deadline' },
      { id: 'status', label: 'Status' },
      { id: 'priority', label: 'Priority' },
      { id: 'timeleft', label: 'Time Left' },
      { id: 'progress', label: 'Progress' },
      { id: 'type', label: 'Type' },
      { id: 'actions', label: 'Actions' }
    ];

    const vis = this.store.columnVisibility || {};

    columns.forEach(col => {
      const isVisible = vis[col.id] !== false;

      const row = document.createElement('label');
      row.className = 'column-option';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'column-option-checkbox';
      checkbox.checked = isVisible;

      const labelText = document.createElement('span');
      labelText.className = 'column-option-label';
      labelText.textContent = col.label;

      row.append(checkbox, labelText);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const nextState = !checkbox.checked;
        checkbox.checked = nextState;
        this.store.toggleColumnVisibility(col.id);
      });

      container.appendChild(row);
    });
  }




  showConfirmDialog({ title, message, confirmText = 'Delete', cancelText = 'Cancel', onConfirm }) {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-card';

    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-icon-danger">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </div>
        <h3 class="modal-title">${title}</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary modal-cancel-btn">${cancelText}</button>
        <button class="btn-danger modal-confirm-btn">${confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('active'), 10);

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
    };

    modal.querySelector('.modal-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    modal.querySelector('.modal-confirm-btn').addEventListener('click', () => {
      close();
      if (onConfirm) onConfirm();
    });
  }

  openDeadlinePicker(anchorEl, node) {

    if (typeof flatpickr === 'undefined') {
      const newDate = prompt('Enter deadline (YYYY-MM-DD):', node.deadline || '');
      if (newDate !== null) {
        this.store.updateNode(node.id, { deadline: newDate.trim() });
      }
      return;
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.style.position = 'absolute';
    input.style.opacity = '0';
    input.style.width = '0';
    input.style.height = '0';

    const rect = anchorEl.getBoundingClientRect();
    input.style.top = `${rect.bottom + window.scrollY}px`;
    input.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(input);

    const fp = flatpickr(input, {
      dateFormat: 'Y-m-d',
      defaultDate: node.deadline || null,
      onChange: (selectedDates, dateStr) => {
        this.store.updateNode(node.id, { deadline: dateStr });
        try { fp.destroy(); } catch (e) {}
        input.remove();
      },
      onClose: () => {
        setTimeout(() => {
          try { fp.destroy(); } catch (e) {}
          input.remove();
        }, 100);
      }
    });

    fp.open();
  }



  getDeadlineStatus(deadlineStr, nodeType = 'task', createdAtStr = null) {
    if (!deadlineStr) return { label: '-', formattedDate: 'Set date', isOverdue: false, isDueSoon: false, timePct: null };

    // Set deadline to end of target day (23:59:59) so the full target day is included
    const deadline = new Date(deadlineStr);
    deadline.setHours(23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate;
    if (createdAtStr) {
      startDate = new Date(createdAtStr);
    } else {
      startDate = new Date('2026-07-04');
    }
    startDate.setHours(0, 0, 0, 0);

    if (startDate >= deadline) {
      startDate = new Date(today);
    }

    const totalDays = Math.max(1, Math.ceil((deadline - startDate) / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

    let timePct = 0;
    if (remainingDays <= 0) {
      timePct = 0;
    } else {
      timePct = Math.min(100, Math.max(0, Math.round((remainingDays / totalDays) * 100)));
    }

    const options = { month: 'short', day: 'numeric' };
    const formattedDate = deadline.toLocaleDateString(undefined, options);

    if (remainingDays <= 0) {
      return { label: `0 / ${totalDays}d remaining`, formattedDate, isOverdue: true, isDueSoon: false, timePct: 0 };
    } else {
      return { label: `${remainingDays} / ${totalDays}d remaining`, formattedDate, isOverdue: false, isDueSoon: remainingDays <= 3, timePct };
    }
  }







  initSortable(containerEl, itemType, parentId) {
    if (typeof Sortable === 'undefined') return;

    const instance = new Sortable(containerEl, {
      group: {
        name: `level-${itemType}`,
        pull: true,
        put: true
      },
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      draggable: `.tree-node[data-type="${itemType}"]`,
      forceFallback: true,
      fallbackTolerance: 3,
      fallbackClass: 'sortable-drag',
      swapThreshold: 0.65,
      onEnd: (evt) => {
        const movedNodeId = evt.item.dataset.id;
        const newParentContainer = evt.to;
        const newParentId = newParentContainer.dataset.parentId || null;
        
        // Find next sibling element in the DOM to determine insertion position
        const nextSiblingEl = evt.item.nextElementSibling;
        const beforeNodeId = nextSiblingEl ? nextSiblingEl.dataset.id : null;

        this.store.moveNode(movedNodeId, newParentId, beforeNodeId);
      }
    });

    this.sortableInstances.push(instance);
  }



  cleanupSortables() {
    this.sortableInstances.forEach(inst => {
      try { inst.destroy(); } catch (e) {}
    });
    this.sortableInstances = [];
  }

  createSvgIcon(name, extraClass = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    if (extraClass) svg.setAttribute('class', extraClass);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    if (name === 'chevron') {
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', '6 9 12 15 18 9');
      svg.appendChild(polyline);
    } else if (name === 'drag') {
      svg.setAttribute('stroke-width', '2.5');
      const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle1.setAttribute('cx', '9'); circle1.setAttribute('cy', '6'); circle1.setAttribute('r', '1');
      const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle2.setAttribute('cx', '15'); circle2.setAttribute('cy', '6'); circle2.setAttribute('r', '1');
      const circle3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle3.setAttribute('cx', '9'); circle3.setAttribute('cy', '12'); circle3.setAttribute('r', '1');
      const circle4 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle4.setAttribute('cx', '15'); circle4.setAttribute('cy', '12'); circle4.setAttribute('r', '1');
      const circle5 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle5.setAttribute('cx', '9'); circle5.setAttribute('cy', '18'); circle5.setAttribute('r', '1');
      const circle6 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle6.setAttribute('cx', '15'); circle6.setAttribute('cy', '18'); circle6.setAttribute('r', '1');
      svg.append(circle1, circle2, circle3, circle4, circle5, circle6);
    } else if (name === 'plus') {
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '5'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '19');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '5'); l2.setAttribute('y1', '12'); l2.setAttribute('x2', '19'); l2.setAttribute('y2', '12');
      svg.append(l1, l2);
    } else if (name === 'trash') {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', '3 6 5 6 21 6');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
      svg.append(poly, path);
    } else if (name === 'calendar') {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '3'); rect.setAttribute('y', '4'); rect.setAttribute('width', '18'); rect.setAttribute('height', '18'); rect.setAttribute('rx', '2'); rect.setAttribute('ry', '2');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '16'); l1.setAttribute('y1', '2'); l1.setAttribute('x2', '16'); l1.setAttribute('y2', '6');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '8'); l2.setAttribute('y1', '2'); l2.setAttribute('x2', '8'); l2.setAttribute('y2', '6');
      const l3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l3.setAttribute('x1', '3'); l3.setAttribute('y1', '10'); l3.setAttribute('x2', '21'); l3.setAttribute('y2', '10');
      svg.append(rect, l1, l2, l3);
    } else if (name === 'warning') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '9'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '13');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '12'); l2.setAttribute('y1', '17'); l2.setAttribute('x2', '12.01'); l2.setAttribute('y2', '17');
      svg.append(path, l1, l2);
    } else if (name === 'arrow-up') {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      p.setAttribute('points', '18 15 12 9 6 15');
      svg.appendChild(p);
    } else if (name === 'arrow-down') {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      p.setAttribute('points', '6 9 12 15 18 9');
      svg.appendChild(p);
    } else if (name === 'folder-plus') {

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '11'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '17');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '9'); l2.setAttribute('y1', '14'); l2.setAttribute('x2', '15'); l2.setAttribute('y2', '14');
      svg.append(path, l1, l2);
    }

    return svg;
  }
}
