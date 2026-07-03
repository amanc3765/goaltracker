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
    const treeData = this.store.getTree();
    const searchQuery = this.store.searchQuery;

    this.container.replaceChildren();

    if (!treeData || treeData.length === 0) {
      this.renderEmptyState();
      return;
    }

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

    if (visibleCount === 0 && searchQuery) {
      this.renderNoSearchResults();
      return;
    }

    this.container.appendChild(rootList);

    // Initialize SortableJS for root level (Programs)
    this.initSortable(rootList, 'program', null);
  }

  renderEmptyState() {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const icon = this.createSvgIcon('folder-plus', 'empty-icon');
    
    const title = document.createElement('div');
    title.className = 'empty-title';
    title.textContent = 'No Goals Created Yet';

    const desc = document.createElement('div');
    desc.className = 'empty-desc';
    desc.textContent = 'Start tracking your life goals across Year, Quarter, Month, and Week horizons.';

    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = '+ Add Program';
    btn.addEventListener('click', () => this.store.addChildNode(null));

    empty.append(icon, title, desc, btn);
    this.container.appendChild(empty);
  }

  renderNoSearchResults() {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const title = document.createElement('div');
    title.className = 'empty-title';
    title.textContent = 'No matching goals found';

    const desc = document.createElement('div');
    desc.className = 'empty-desc';
    desc.textContent = `No items match "${this.store.searchQuery}". Try a different keyword.`;

    empty.append(title, desc);
    this.container.appendChild(empty);
  }

  /**
   * Recursively build node DOM element
   */
  createNodeElement(node, searchQuery) {
    const matchesSelf = this.store.matchesSearch(node, searchQuery);
    let childMatchCount = 0;
    
    const childrenContainer = document.createElement('div');
    childrenContainer.className = `node-children-container ${node.collapsed ? 'collapsed' : ''}`;
    childrenContainer.dataset.type = node.type;
    childrenContainer.dataset.parentId = node.id;

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        const childEl = this.createNodeElement(child, searchQuery);
        if (childEl) {
          childrenContainer.appendChild(childEl);
          childMatchCount++;
        }
      });
    }

    // Hide node if search filter is active and neither self nor children match
    if (searchQuery && !matchesSelf && childMatchCount === 0) {
      return null;
    }

    // If searchQuery matched a child, force-expand parent
    if (searchQuery && childMatchCount > 0) {
      childrenContainer.classList.remove('collapsed');
    }

    const nodeWrapper = document.createElement('div');
    nodeWrapper.className = `tree-node ${this.focusedNodeId === node.id ? 'focused' : ''} ${node.completed ? 'completed' : ''}`;
    nodeWrapper.dataset.id = node.id;
    nodeWrapper.dataset.type = node.type;
    nodeWrapper.setAttribute('tabindex', '0');

    // Focus handler
    nodeWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFocusedNode(node.id);
      if (this.onSelectNode) this.onSelectNode(node);
    });

    const card = document.createElement('div');
    card.className = 'node-card';

    // LEFT SECTION
    const leftSec = document.createElement('div');
    leftSec.className = 'node-left';

    // Drag Handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.appendChild(this.createSvgIcon('drag'));
    leftSec.appendChild(dragHandle);

    // Chevron Toggle (if allowed children exist or entity type is not task)
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
      // Task Checkbox
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
    }

    // Type Badge
    const typeBadge = document.createElement('span');
    typeBadge.className = 'type-badge';
    typeBadge.dataset.type = node.type;
    typeBadge.textContent = node.type;
    leftSec.appendChild(typeBadge);

    // Title Wrapper & Editable Title
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'node-title-wrapper';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'node-title';
    titleSpan.textContent = node.title || 'Untitled';
    titleSpan.title = 'Click to edit title inline';

    // Inline title edit on click
    titleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startInlineTitleEdit(titleSpan, node);
    });

    titleWrapper.appendChild(titleSpan);
    leftSec.appendChild(titleWrapper);

    // MIDDLE SECTION: Animated Progress Bar
    const middleSec = document.createElement('div');
    middleSec.className = 'node-middle';

    const progressBg = document.createElement('div');
    progressBg.className = 'progress-bar-bg';

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = `${Math.min(100, Math.max(0, node.progress || 0))}%`;

    progressBg.appendChild(progressFill);

    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    progressText.textContent = `${node.progress || 0}%`;

    middleSec.append(progressBg, progressText);

    // RIGHT SECTION: Priority Badge, Deadline, Actions
    const rightSec = document.createElement('div');
    rightSec.className = 'node-right';

    // Priority Pill
    const priorityPill = document.createElement('div');
    priorityPill.className = 'priority-pill';
    priorityPill.dataset.priority = node.priority || 'medium';
    
    const dot = document.createElement('span');
    dot.className = 'priority-dot';
    const prioLabel = document.createElement('span');
    prioLabel.textContent = (node.priority || 'medium').charAt(0).toUpperCase() + (node.priority || 'medium').slice(1);
    
    priorityPill.append(dot, prioLabel);

    // Priority quick switch dropdown on click
    priorityPill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPriorityPicker(priorityPill, node);
    });

    rightSec.appendChild(priorityPill);

    // Deadline Badge
    if (node.deadline || node.type !== 'task') {
      const deadlineBadge = document.createElement('div');
      deadlineBadge.className = 'deadline-badge';
      
      const status = this.getDeadlineStatus(node.deadline);
      if (status.isOverdue) deadlineBadge.classList.add('overdue');
      else if (status.isDueSoon) deadlineBadge.classList.add('due-soon');

      const calIcon = this.createSvgIcon(status.isOverdue ? 'warning' : 'calendar');
      const dateText = document.createElement('span');
      dateText.textContent = status.label;

      deadlineBadge.append(calIcon, dateText);
      deadlineBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onSelectNode) this.onSelectNode(node);
      });
      rightSec.appendChild(deadlineBadge);
    }

    // Hover Action Buttons (+ Child, Delete)
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'node-actions';

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
      if (confirm(`Delete "${node.title}" and all its sub-items?`)) {
        this.store.deleteNode(node.id);
      }
    });
    actionsGroup.appendChild(delBtn);

    rightSec.appendChild(actionsGroup);

    // Assemble Card
    card.append(leftSec, middleSec, rightSec);
    nodeWrapper.append(card, childrenContainer);

    // Setup SortableJS on child container if childType is valid
    if (childType) {
      this.initSortable(childrenContainer, childType, node.id);
    }

    return nodeWrapper;
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
      { id: 'critical', label: 'Critical 🔴' },
      { id: 'high', label: 'High 🟠' },
      { id: 'medium', label: 'Medium 🔵' },
      { id: 'low', label: 'Low ⚪' }
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
    dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(dropdown);

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  getDeadlineStatus(deadlineStr) {
    if (!deadlineStr) return { label: 'Set date', isOverdue: false, isDueSoon: false };

    const deadline = new Date(deadlineStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    const formatted = deadline.toLocaleDateString(undefined, options);

    if (diffDays < 0) {
      return { label: `Overdue (${formatted})`, isOverdue: true, isDueSoon: false };
    } else if (diffDays === 0) {
      return { label: 'Due today', isOverdue: false, isDueSoon: true };
    } else if (diffDays <= 3) {
      return { label: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`, isOverdue: false, isDueSoon: true };
    } else {
      return { label: formatted, isOverdue: false, isDueSoon: false };
    }
  }

  initSortable(containerEl, itemType, parentId) {
    if (typeof Sortable === 'undefined') return;

    const instance = new Sortable(containerEl, {
      group: `level-${itemType}`,
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      draggable: `.tree-node[data-type="${itemType}"]`,
      onEnd: (evt) => {
        const movedNodeId = evt.item.dataset.id;
        const newParentContainer = evt.to;
        const newParentId = newParentContainer.dataset.parentId || null;
        const newIndex = evt.newIndex;

        this.store.moveNode(movedNodeId, newParentId, newIndex);
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
