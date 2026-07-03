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



  /**
   * Search filter check
   */
  matchesSearch(node, query) {
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
}
