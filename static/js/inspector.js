/**
 * Side Inspector Drawer Panel for Personal Goals Tracker
 */

export class InspectorPanel {
  constructor(overlayEl, drawerEl, store) {
    this.overlay = overlayEl;
    this.drawer = drawerEl;
    this.store = store;
    this.currentNodeId = null;
    this.fpInstance = null;
    this.init();
  }

  init() {
    // Close on overlay backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Close button
    const closeBtn = this.drawer.querySelector('.inspector-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  open(nodeId) {
    const res = this.store.findNode(nodeId);
    if (!res) return;

    this.currentNodeId = nodeId;
    this.renderNodeDetails(res.node);

    this.overlay.classList.add('open');
  }

  close() {
    this.overlay.classList.remove('open');
    if (this.fpInstance) {
      this.fpInstance.destroy();
      this.fpInstance = null;
    }
    this.currentNodeId = null;
  }

  renderNodeDetails(node) {
    const body = this.drawer.querySelector('.inspector-body');
    body.replaceChildren();

    // Type & ID Header
    const headerRow = document.createElement('div');
    headerRow.className = 'form-group';
    
    const typeBadge = document.createElement('span');
    typeBadge.className = 'type-badge';
    typeBadge.dataset.type = node.type;
    typeBadge.textContent = node.type.toUpperCase();
    headerRow.appendChild(typeBadge);

    // Title Form Group
    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    const titleLabel = document.createElement('label');
    titleLabel.className = 'form-label';
    titleLabel.textContent = 'Title';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'form-input';
    titleInput.value = node.title || '';
    titleInput.addEventListener('change', () => {
      const val = titleInput.value.trim();
      if (val) this.store.updateNode(node.id, { title: val });
    });
    titleGroup.append(titleLabel, titleInput);

    // Priority & Deadline Form Row
    const rowGroup = document.createElement('div');
    rowGroup.className = 'form-row';

    // Priority
    const prioGroup = document.createElement('div');
    prioGroup.className = 'form-group';
    const prioLabel = document.createElement('label');
    prioLabel.className = 'form-label';
    prioLabel.textContent = 'Priority';

    const prioSelect = document.createElement('select');
    prioSelect.className = 'form-select';
    ['critical', 'high', 'medium', 'low'].forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      if (node.priority === p) opt.selected = true;
      prioSelect.appendChild(opt);
    });
    prioSelect.addEventListener('change', () => {
      this.store.updateNode(node.id, { priority: prioSelect.value });
    });
    prioGroup.append(prioLabel, prioSelect);

    // Deadline
    const deadlineGroup = document.createElement('div');
    deadlineGroup.className = 'form-group';
    const deadlineLabel = document.createElement('label');
    deadlineLabel.className = 'form-label';
    deadlineLabel.textContent = 'Deadline';

    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'text';
    deadlineInput.className = 'form-input';
    deadlineInput.placeholder = 'YYYY-MM-DD';
    deadlineInput.value = node.deadline || '';
    deadlineGroup.append(deadlineLabel, deadlineInput);

    rowGroup.append(prioGroup, deadlineGroup);

    // Initialize Flatpickr on deadlineInput if flatpickr loaded
    if (typeof flatpickr !== 'undefined') {
      this.fpInstance = flatpickr(deadlineInput, {
        dateFormat: 'Y-m-d',
        defaultDate: node.deadline || null,
        onChange: (selectedDates, dateStr) => {
          this.store.updateNode(node.id, { deadline: dateStr });
        }
      });
    } else {
      deadlineInput.addEventListener('change', () => {
        this.store.updateNode(node.id, { deadline: deadlineInput.value });
      });
    }

    // Progress Indicator Group
    const progressGroup = document.createElement('div');
    progressGroup.className = 'form-group';
    const progressLabel = document.createElement('label');
    progressLabel.className = 'form-label';
    progressLabel.textContent = `Progress (${node.progress || 0}%)`;

    const progressBg = document.createElement('div');
    progressBg.className = 'progress-bar-bg';
    progressBg.style.height = '10px';
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


    progressGroup.append(progressLabel, progressBg);

    // Description Form Group
    const descGroup = document.createElement('div');
    descGroup.className = 'form-group';
    const descLabel = document.createElement('label');
    descLabel.className = 'form-label';
    descLabel.textContent = 'Description (Markdown supported)';

    const descTextarea = document.createElement('textarea');
    descTextarea.className = 'form-textarea';
    descTextarea.value = node.description || '';
    descTextarea.placeholder = 'Add multi-line description, targets, notes...';

    const previewLabel = document.createElement('label');
    previewLabel.className = 'form-label';
    previewLabel.textContent = 'Preview';
    previewLabel.style.marginTop = '8px';

    const previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    this.updateMarkdownPreview(previewDiv, node.description);

    descTextarea.addEventListener('input', () => {
      const val = descTextarea.value;
      this.updateMarkdownPreview(previewDiv, val);
    });

    descTextarea.addEventListener('change', () => {
      this.store.updateNode(node.id, { description: descTextarea.value });
    });

    descGroup.append(descLabel, descTextarea, previewLabel, previewDiv);

    // Children Summary List
    const childrenGroup = document.createElement('div');
    childrenGroup.className = 'form-group';
    const childrenLabel = document.createElement('label');
    childrenLabel.className = 'form-label';
    const childCount = node.children ? node.children.length : 0;
    childrenLabel.textContent = `Sub-Items (${childCount})`;

    childrenGroup.appendChild(childrenLabel);

    if (node.children && node.children.length > 0) {
      const subList = document.createElement('div');
      subList.style.display = 'flex';
      subList.style.flexDirection = 'column';
      subList.style.gap = '6px';

      node.children.forEach(child => {
        const subRow = document.createElement('div');
        subRow.style.display = 'flex';
        subRow.style.alignItems = 'center';
        subRow.style.justifyContent = 'space-between';
        subRow.style.padding = '6px 10px';
        subRow.style.backgroundColor = 'var(--bg-card)';
        subRow.style.borderRadius = '6px';
        subRow.style.border = '1px solid var(--border-color)';

        const subTitle = document.createElement('span');
        subTitle.style.fontSize = '12px';
        subTitle.style.fontWeight = '500';
        subTitle.textContent = child.title;

        const subProg = document.createElement('span');
        subProg.style.fontSize = '11px';
        subProg.style.color = 'var(--text-muted)';
        subProg.textContent = `${child.progress}%`;

        subRow.append(subTitle, subProg);
        subList.appendChild(subRow);
      });

      childrenGroup.appendChild(subList);
    } else {
      const emptyChild = document.createElement('div');
      emptyChild.style.fontSize = '12px';
      emptyChild.style.color = 'var(--text-muted)';
      emptyChild.textContent = 'No sub-items';
      childrenGroup.appendChild(emptyChild);
    }

    // Delete Button
    const actionsGroup = document.createElement('div');
    actionsGroup.style.marginTop = 'auto';
    actionsGroup.style.paddingTop = '16px';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-secondary';
    delBtn.style.color = '#F87171';
    delBtn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    delBtn.style.width = '100%';
    delBtn.style.justifyContent = 'center';
    delBtn.textContent = 'Delete Goal';

    delBtn.addEventListener('click', () => {
      if (confirm(`Delete "${node.title}"?`)) {
        this.store.deleteNode(node.id);
        this.close();
      }
    });

    actionsGroup.appendChild(delBtn);

    body.append(headerRow, titleGroup, rowGroup, progressGroup, descGroup, childrenGroup, actionsGroup);
  }

  updateMarkdownPreview(container, text) {
    if (!text || !text.trim()) {
      container.textContent = 'No description added.';
      return;
    }

    if (typeof marked !== 'undefined' && marked.parse) {
      try {
        const html = marked.parse(text);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        container.replaceChildren(...doc.body.childNodes);
      } catch (e) {
        container.textContent = text;
      }
    } else {
      container.textContent = text;
    }
  }
}
