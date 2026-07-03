/**
 * State store for Personal Goals Tracker
 * Handles state management, node lookup, progress calculation roll-ups, and hierarchy validation.
 */

export const TYPE_HIERARCHY = {
  root: 'program',
  program: 'project',
  project: 'milestone',
  milestone: 'task',
  task: null
};

export class GoalStore {
  constructor(initialData = []) {
    this.tree = initialData;
    this.selectedNodeId = null;
    this.searchQuery = '';
    this.hideCompleted = false;
    this.sortBy = 'priority-desc';
    this.listeners = [];
    this.recalculateAllProgress();
  }




  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.recalculateAllProgress();
    this.listeners.forEach(listener => listener(this.tree));
  }

  getTree() {
    return this.tree;
  }

  setTree(newTree) {
    this.tree = newTree;
    this.notify();
  }

  /**
   * Recalculates progress recursively bottom-up:
   * Task: 100 if completed else 0
   * Milestone: Avg of child tasks
   * Project: Avg of child milestones
   * Program: Avg of child projects
   */
  recalculateAllProgress() {
    const calculateNodeProgress = (node) => {
      if (!node.children) node.children = [];

      if (!node.status) {
        node.status = node.completed ? 'completed' : 'not-started';
      }

      if (node.type === 'task') {
        if (node.status === 'completed' || node.completed) {
          node.completed = true;
          node.status = 'completed';
          node.progress = 100;
        } else if (node.status === 'in-progress') {
          node.completed = false;
          node.progress = 50;
        } else {
          node.completed = false;
          node.status = 'not-started';
          node.progress = 0;
        }
        return node.progress;
      }

      if (node.children.length === 0) {
        if (!node.status) node.status = 'not-started';
        if (node.status === 'completed') node.progress = 100;
        else if (node.status === 'in-progress' && (!node.progress || node.progress === 0)) node.progress = 50;
        else if (node.status === 'not-started') node.progress = 0;
        return node.progress || 0;
      }

      let sum = 0;
      node.children.forEach(child => {
        sum += calculateNodeProgress(child);
      });

      node.progress = Math.round(sum / node.children.length);

      // Auto update status based on calculated progress
      if (node.progress === 100) node.status = 'completed';
      else if (node.progress > 0) node.status = 'in-progress';
      else node.status = 'not-started';

      return node.progress;
    };

    this.tree.forEach(prog => calculateNodeProgress(prog));
  }

  /**
   * Get overall summary statistics
   */
  getSummaryStats() {
    let numPrograms = 0;
    let numProjects = 0;
    let totalMilestones = 0;
    let completedMilestones = 0;
    let totalTasks = 0;
    let completedTasks = 0;

    const traverse = (nodes) => {
      nodes.forEach(node => {
        if (node.type === 'program') numPrograms++;
        else if (node.type === 'project') numProjects++;
        else if (node.type === 'milestone') {
          totalMilestones++;
          if (node.status === 'completed' || node.progress === 100) completedMilestones++;
        } else if (node.type === 'task') {
          totalTasks++;
          if (node.completed || node.status === 'completed' || node.progress === 100) completedTasks++;
        }

        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      });
    };

    traverse(this.tree);

    return {
      numPrograms,
      numProjects,
      totalMilestones,
      completedMilestones,
      totalTasks,
      completedTasks
    };
  }



  /**
   * Find node and its parent by ID
   */
  findNode(id, nodes = this.tree, parent = null) {
    for (const node of nodes) {
      if (node.id === id) {
        return { node, parent };
      }
      if (node.children && node.children.length > 0) {
        const found = this.findNode(id, node.children, node);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Create a new child under parentId (or root if parentId is null)
   */
  addChildNode(parentId = null) {
    let parentType = 'root';
    let targetChildren = this.tree;

    if (parentId) {
      const res = this.findNode(parentId);
      if (!res) return null;
      parentType = res.node.type;
      if (!res.node.children) res.node.children = [];
      targetChildren = res.node.children;
      // Auto expand parent
      res.node.collapsed = false;
    }

    const childType = TYPE_HIERARCHY[parentType];
    if (!childType) {
      console.warn(`Cannot add child under node of type ${parentType}`);
      return null;
    }

    const defaultTitles = {
      program: 'New Program',
      project: 'New Project',
      milestone: 'New Milestone',
      task: 'New Task'
    };

    const newNode = {
      id: `${childType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: defaultTitles[childType] || 'New Goal',
      type: childType,
      domain: childType === 'program' ? 'work' : undefined,
      status: 'not-started',
      description: '',
      priority: childType === 'task' ? 'medium' : 'high',
      deadline: '',
      createdAt: new Date().toISOString().split('T')[0],
      progress: 0,
      collapsed: false,
      completed: false,
      children: []
    };



    targetChildren.push(newNode);
    this.selectedNodeId = newNode.id;
    this.notify();
    return newNode;
  }

  /**
   * Update fields of a node
   */
  updateNode(id, fields) {
    const res = this.findNode(id);
    if (!res) return false;

    if (fields.deadline !== undefined) {
      fields.deadlineSetAt = new Date().toISOString().split('T')[0];
    }

    if (fields.status !== undefined) {

      if (fields.status === 'completed') {
        res.node.completed = true;
        res.node.progress = 100;
      } else if (fields.status === 'in-progress') {
        res.node.completed = false;
        if (res.node.type === 'task') res.node.progress = 50;
      } else if (fields.status === 'not-started') {
        res.node.completed = false;
        if (res.node.type === 'task') res.node.progress = 0;
      }
    }

    Object.assign(res.node, fields);
    
    // If updating task completion status, auto recalculate progress
    if (res.node.type === 'task' && fields.completed !== undefined) {
      res.node.progress = res.node.completed ? 100 : 0;
      res.node.status = res.node.completed ? 'completed' : 'not-started';
    }

    this.notify();
    return true;
  }


  /**
   * Delete node by ID
   */
  deleteNode(id) {
    const res = this.findNode(id);
    if (!res) return false;

    if (!res.parent) {
      this.tree = this.tree.filter(n => n.id !== id);
    } else {
      res.parent.children = res.parent.children.filter(n => n.id !== id);
    }

    if (this.selectedNodeId === id) {
      this.selectedNodeId = null;
    }

    this.notify();
    return true;
  }

  /**
   * Toggle node collapsed state
   */
  toggleCollapse(id) {
    const res = this.findNode(id);
    if (!res) return;
    res.node.collapsed = !res.node.collapsed;
    this.notify();
  }

  /**
   * Expand or collapse all non-task nodes in tree
   */
  setAllCollapsed(collapsedState) {
    const applyCollapse = (node) => {
      if (node.type !== 'task') {
        node.collapsed = collapsedState;
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(applyCollapse);
      }
    };
    this.tree.forEach(applyCollapse);
    this.notify();
  }


  /**
   * Move node to a new parent or new position in tree
   */
  moveNode(nodeId, newParentId, newIndex) {
    const res = this.findNode(nodeId);
    if (!res) return false;

    const movingNode = res.node;

    // Validate type hierarchy
    let expectedParentType = 'root';
    if (newParentId) {
      const parentRes = this.findNode(newParentId);
      if (!parentRes) return false;
      expectedParentType = parentRes.node.type;
    }

    if (TYPE_HIERARCHY[expectedParentType] !== movingNode.type) {
      console.warn(`Invalid move: ${movingNode.type} cannot be child of ${expectedParentType}`);
      return false;
    }

    // Determine current parent array
    let sourceArray = this.tree;
    if (res.parent) {
      sourceArray = res.parent.children;
    }

    const oldIndex = sourceArray.findIndex(n => n.id === nodeId);
    if (oldIndex === -1) return false;

    // Determine target parent array
    let targetArray = this.tree;
    if (newParentId) {
      const targetParentRes = this.findNode(newParentId);
      if (!targetParentRes.node.children) targetParentRes.node.children = [];
      targetArray = targetParentRes.node.children;
    }

    // Remove from source location
    sourceArray.splice(oldIndex, 1);

    // Clamp newIndex
    const clampedIndex = Math.max(0, Math.min(newIndex, targetArray.length));
    targetArray.splice(clampedIndex, 0, movingNode);

    this.notify();
    return true;
  }

  /**
   * Move node up (-1) or down (+1) within its current sibling list
   */
  moveNodeRelative(nodeId, direction) {
    const res = this.findNode(nodeId);
    if (!res) return false;

    let targetArray = this.tree;
    if (res.parent) {
      targetArray = res.parent.children;
    }

    const currentIndex = targetArray.findIndex(n => n.id === nodeId);
    if (currentIndex === -1) return false;

    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= targetArray.length) return false;

    const [moved] = targetArray.splice(currentIndex, 1);
    targetArray.splice(newIndex, 0, moved);

    this.notify();
    return true;
  }



  toggleHideCompleted() {
    this.hideCompleted = !this.hideCompleted;
    this.notify();
    return this.hideCompleted;
  }

  isNodeCompleted(node) {
    return node.completed || node.status === 'completed' || node.progress === 100;
  }

  /**
   * Search and completion filter check
   */
  matchesSearch(node, query) {
    if (this.hideCompleted && this.isNodeCompleted(node)) {
      return false;
    }
    if (!query) return true;
    const q = query.toLowerCase();
    const titleMatch = node.title && node.title.toLowerCase().includes(q);
    const descMatch = node.description && node.description.toLowerCase().includes(q);
    return titleMatch || descMatch;
  }

  setSearchQuery(query) {
    this.searchQuery = query;
    this.notify();
  }

  setSortBy(sortKey) {
    this.sortBy = sortKey;
    this.notify();
  }

  getSortedTree() {
    if (this.sortBy === 'manual') return this.tree;
    return this.sortNodes([...this.tree]);
  }

  sortNodes(nodes) {
    if (!nodes || nodes.length === 0) return [];

    const priorityRanks = { urgent: 4, high: 3, medium: 2, low: 1 };
    const statusRanks = { 'not-started': 1, 'in-progress': 2, 'completed': 3 };
    const typeRanks = { program: 4, project: 3, milestone: 2, task: 1 };

    const sorted = [...nodes].sort((a, b) => {
      switch (this.sortBy) {
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '');
        case 'type-asc':
          return (typeRanks[a.type] || 0) - (typeRanks[b.type] || 0);
        case 'type-desc':
          return (typeRanks[b.type] || 0) - (typeRanks[a.type] || 0);
        case 'priority-desc':
          return (priorityRanks[b.priority || 'medium'] || 0) - (priorityRanks[a.priority || 'medium'] || 0);
        case 'priority-asc':
          return (priorityRanks[a.priority || 'medium'] || 0) - (priorityRanks[b.priority || 'medium'] || 0);
        case 'status-asc':
          return (statusRanks[a.status || 'not-started'] || 0) - (statusRanks[b.status || 'not-started'] || 0);
        case 'status-desc':
          return (statusRanks[b.status || 'not-started'] || 0) - (statusRanks[a.status || 'not-started'] || 0);
        case 'deadline-asc':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        case 'deadline-desc':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(b.deadline) - new Date(a.deadline);
        case 'progress-desc':
          return (b.progress || 0) - (a.progress || 0);
        case 'progress-asc':
          return (a.progress || 0) - (b.progress || 0);
        default:
          return 0;
      }
    });


    return sorted.map(node => {
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: this.sortNodes(node.children)
        };
      }
      return node;
    });
  }
}


