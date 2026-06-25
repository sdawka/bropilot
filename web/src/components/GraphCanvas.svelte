<script lang="ts">
  import { SvelteFlow, Background, Controls, MiniMap } from '@xyflow/svelte';
  import dagre from '@dagrejs/dagre';
  import '@xyflow/svelte/dist/style.css';
  import { appState, selectNode, focusNode, toggleSpace, toggleExpanded, setSearchQuery, setSnapshots, addSnapshot, setExportModal, toggleLegend, getNodeKindCounts, getConnectedNodes, getSiblingNodes, setFocusedPanel, setCompleteness, setChangeHistory, setIsUndoing, setIsRedoing, setValidationResult, getNodesWithIssues } from '../lib/stores.svelte.js';
  import { KIND_TO_SPACE, SPACE_COLORS, type Space, type Snapshot } from '../lib/types.js';
  import { saveSnapshot, loadSnapshot, listSnapshots, exportMarkdown, fetchCompleteness, undoChange, redoChange, fetchChangeHistory, fetchGraph, loadBootstrap, DEMO_GRAPHS, type DemoGraphId, setOnHistoryUpdateCallback, validateGraph, streamState } from '../lib/api.svelte.js';
  import { setGraph } from '../lib/stores.svelte.js';
  import GraphNode from './GraphNode.svelte';
  import CompletenessPanel from './CompletenessPanel.svelte';
  import ValidationPanel from './ValidationPanel.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';

  interface Props {
    onfocuspanel?: () => void;
    onSuggestionClick?: (prompt: string) => void;
  }

  let { onfocuspanel, onSuggestionClick }: Props = $props();

  type FlowNode = {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  };

  type FlowEdge = {
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
    animated?: boolean;
    style?: string;
  };

  const nodeTypes = { custom: GraphNode };

  let snapshotName = $state('');
  let showSnapshotDropdown = $state(false);
  let isExporting = $state(false);
  let isSavingSnapshot = $state(false);
  let isLoadingDemo = $state(false);
  let showDemoConfirmDialog = $state(false);
  let isLoadingSnapshot = $state(false);
  let isInitialLoading = $state(true);

  // Track if graph is updating from stream
  const isGraphUpdating = $derived(streamState.isStreaming);

  // Check if graph is empty (for welcome state)
  const isGraphEmpty = $derived(appState.graph.nodes.length === 0);

  // Load demo handler
  let selectedDemoGraph = $state<DemoGraphId>('bropilot');
  let showDemoDropdown = $state(false);

  async function handleLoadDemo(graphId?: DemoGraphId) {
    if (graphId) {
      selectedDemoGraph = graphId;
    }
    showDemoDropdown = false;
    // If graph has content, show confirmation dialog
    if (!isGraphEmpty) {
      showDemoConfirmDialog = true;
      return;
    }
    await loadDemoGraph();
  }

  async function loadDemoGraph() {
    if (isLoadingDemo) return;
    isLoadingDemo = true;
    showDemoConfirmDialog = false;

    try {
      const result = await loadBootstrap(selectedDemoGraph);
      if (result.success && result.graph) {
        setGraph(result.graph);
        // Fit view after a short delay to allow layout to update
        setTimeout(() => {
          flowInstance?.fitView();
        }, 100);
      }
    } finally {
      isLoadingDemo = false;
    }
  }

  function cancelDemoConfirm() {
    showDemoConfirmDialog = false;
    showDemoDropdown = false;
  }

  // Undo/Redo handlers
  async function handleUndo() {
    if (appState.isUndoing || !appState.canUndo) return;
    setIsUndoing(true);
    try {
      const result = await undoChange();
      if (result.success) {
        // Refresh graph and history
        const [graph, history] = await Promise.all([
          fetchGraph(),
          fetchChangeHistory()
        ]);
        setGraph(graph);
        setChangeHistory(history);
      }
    } finally {
      setIsUndoing(false);
    }
  }

  async function handleRedo() {
    if (appState.isRedoing || !appState.canRedo) return;
    setIsRedoing(true);
    try {
      const result = await redoChange();
      if (result.success) {
        // Refresh graph and history
        const [graph, history] = await Promise.all([
          fetchGraph(),
          fetchChangeHistory()
        ]);
        setGraph(graph);
        setChangeHistory(history);
      }
    } finally {
      setIsRedoing(false);
    }
  }

  // Export undo/redo handlers for keyboard shortcuts
  export { handleUndo, handleRedo };

  async function handleSaveSnapshot() {
    if (!snapshotName.trim() || isSavingSnapshot) return;
    isSavingSnapshot = true;
    const snapshot = await saveSnapshot(snapshotName.trim());
    if (snapshot) {
      addSnapshot(snapshot);
      snapshotName = '';
    }
    isSavingSnapshot = false;
  }

  async function handleLoadSnapshot(snapshot: Snapshot) {
    if (isLoadingSnapshot) return;
    isLoadingSnapshot = true;
    try {
      const graph = await loadSnapshot(snapshot.id);
      if (graph) {
        setGraph(graph);
      }
    } finally {
      isLoadingSnapshot = false;
      showSnapshotDropdown = false;
    }
  }

  async function handleExport() {
    if (isExporting) return;
    isExporting = true;
    const markdown = await exportMarkdown();
    setExportModal(true, markdown);
    isExporting = false;
  }

  function handleSearchChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    setSearchQuery(value);
  }

  $effect(() => {
    // Mark initial loading complete after short delay
    const initTimeout = setTimeout(() => {
      isInitialLoading = false;
    }, 500);

    listSnapshots().then(setSnapshots);
    // Also fetch initial change history for undo/redo state
    fetchChangeHistory().then(setChangeHistory);
    // Set up callback to refresh history when graph mutations happen via chat
    setOnHistoryUpdateCallback(() => {
      fetchChangeHistory().then(setChangeHistory);
    });
    // Cleanup on unmount
    return () => {
      setOnHistoryUpdateCallback(null);
      clearTimeout(initTimeout);
    };
  });

  // Fetch completeness when the graph changes
  let lastNodeCount = -1;
  $effect(() => {
    const nodeCount = appState.graph.nodes.length;
    // Only refetch if node count changed (debounce rapid updates)
    if (nodeCount !== lastNodeCount) {
      lastNodeCount = nodeCount;
      fetchCompleteness().then(setCompleteness);
    }
  });

  // Auto-validate graph when it changes (debounced)
  let validationTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastValidationHash = '';
  $effect(() => {
    // Create a simple hash of the graph state to detect meaningful changes
    const graphHash = `${appState.graph.nodes.length}-${appState.graph.edges.length}-${appState.graph.nodes.map(n => n.id).join(',')}`;
    if (graphHash === lastValidationHash) return;
    lastValidationHash = graphHash;

    // Debounce validation to avoid rapid calls
    if (validationTimeout) clearTimeout(validationTimeout);
    validationTimeout = setTimeout(() => {
      validateGraph().then(setValidationResult);
    }, 500);

    return () => {
      if (validationTimeout) clearTimeout(validationTimeout);
    };
  });

  function buildLayout(): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const { nodes, edges } = appState.graph;
    const visibleSpaces = appState.visibleSpaces;
    const expandedIds = appState.expandedNodeIds;
    const matchingIds = appState.matchingNodeIds;
    const hasSearch = appState.searchQuery.trim().length > 0;

    // Get validation issues for node highlighting
    const { errors: errorNodeIds, warnings: warningNodeIds } = getNodesWithIssues();

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const filteredNodes = nodes.filter(n => visibleSpaces.has(KIND_TO_SPACE[n.kind]));
    const filteredIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(e => filteredIds.has(e.srcId) && filteredIds.has(e.dstId));

    if (filteredNodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Group nodes by space, then by kind within each space
    const SPACE_ORDER: Space[] = ['basics', 'problem', 'solution', 'crosscutting'];

    // Define kind order within each space for logical grouping
    const KIND_ORDER: Record<Space, string[]> = {
      basics: ['name', 'purpose', 'capability'],
      problem: ['persona', 'usecase', 'flow', 'screen', 'requirement', 'constraint', 'assumption'],
      solution: ['entity', 'relationship', 'module', 'component', 'interface', 'api', 'event', 'state', 'behaviour', 'logic'],
      crosscutting: ['repository', 'tests', 'observability', 'external', 'design'],
    };

    // Build nested structure: space -> kind -> nodes
    const nodesBySpaceAndKind = new Map<Space, Map<string, typeof filteredNodes>>();
    for (const space of SPACE_ORDER) {
      nodesBySpaceAndKind.set(space, new Map());
    }
    for (const n of filteredNodes) {
      const space = KIND_TO_SPACE[n.kind];
      const kindMap = nodesBySpaceAndKind.get(space)!;
      if (!kindMap.has(n.kind)) {
        kindMap.set(n.kind, []);
      }
      kindMap.get(n.kind)!.push(n);
    }

    // Sort nodes within each kind group by title
    for (const [_, kindMap] of nodesBySpaceAndKind) {
      for (const [_, kindNodes] of kindMap) {
        kindNodes.sort((a, b) => a.title.localeCompare(b.title));
      }
    }

    // Layout constants
    const NODE_WIDTH = 190;
    const NODE_HEIGHT = 65;
    const NODE_GAP_X = 30;
    const NODE_GAP_Y = 15;
    const KIND_GROUP_GAP = 35;
    const SPACE_GAP = 80;
    const MAX_NODES_PER_COLUMN = 8; // Wrap to new sub-column after this many nodes in a kind group
    const positions = new Map<string, { x: number; y: number }>();

    let xOffset = 50;
    for (const space of SPACE_ORDER) {
      const kindMap = nodesBySpaceAndKind.get(space)!;
      if (kindMap.size === 0) continue;

      // Get kinds in defined order, then any extras
      const orderedKinds = KIND_ORDER[space].filter(k => kindMap.has(k));
      const extraKinds = [...kindMap.keys()].filter(k => !orderedKinds.includes(k));
      const allKinds = [...orderedKinds, ...extraKinds];

      // Calculate how many sub-columns this space needs
      let maxSubCols = 1;
      for (const kind of allKinds) {
        const kindNodes = kindMap.get(kind)!;
        const subCols = Math.ceil(kindNodes.length / MAX_NODES_PER_COLUMN);
        maxSubCols = Math.max(maxSubCols, subCols);
      }

      let yOffset = 50;

      for (const kind of allKinds) {
        const kindNodes = kindMap.get(kind)!;
        const numSubCols = Math.ceil(kindNodes.length / MAX_NODES_PER_COLUMN);
        const nodesPerCol = Math.ceil(kindNodes.length / numSubCols);

        // Layout nodes in a grid within this kind group
        let kindMaxY = yOffset;
        for (let i = 0; i < kindNodes.length; i++) {
          const n = kindNodes[i];
          const col = Math.floor(i / nodesPerCol);
          const row = i % nodesPerCol;

          const isExpanded = expandedIds.has(n.id);
          const height = isExpanded ? 140 : NODE_HEIGHT;

          const x = xOffset + col * (NODE_WIDTH + NODE_GAP_X) + NODE_WIDTH / 2;
          const y = yOffset + row * (height + NODE_GAP_Y) + height / 2;

          positions.set(n.id, { x, y });
          kindMaxY = Math.max(kindMaxY, y + height / 2);
        }

        yOffset = kindMaxY + KIND_GROUP_GAP;
      }

      // Move to next space
      xOffset += maxSubCols * (NODE_WIDTH + NODE_GAP_X) + SPACE_GAP;
    }

    const flowNodes: FlowNode[] = filteredNodes.map(n => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const isExpanded = expandedIds.has(n.id);
      const width = isExpanded ? 280 : 180;
      const height = isExpanded ? 140 : 60;
      const isHighlighted = hasSearch && matchingIds.has(n.id);
      const isDimmed = hasSearch && !matchingIds.has(n.id);
      const hasError = errorNodeIds.has(n.id);
      const hasWarning = warningNodeIds.has(n.id);
      return {
        id: n.id,
        type: 'custom',
        position: { x: pos.x - width / 2, y: pos.y - height / 2 },
        data: { ...n, isHighlighted, isDimmed, hasError, hasWarning },
      };
    });

    const flowEdges: FlowEdge[] = filteredEdges.map(e => {
      const srcNode = nodeMap.get(e.srcId);
      const srcKind = srcNode?.kind ?? 'name';
      return {
        id: e.id,
        source: e.srcId,
        target: e.dstId,
        type: 'default',
        label: e.type,
        animated: appState.selectedNodeId === e.srcId || appState.selectedNodeId === e.dstId,
        style: `stroke: ${SPACE_COLORS[KIND_TO_SPACE[srcKind]]}; stroke-width: 2px;`,
      };
    });

    console.log('Layout edges:', flowEdges.length, flowEdges.slice(0, 3));
    return { nodes: flowNodes, edges: flowEdges };
  }

  // Use $state for xyflow - it needs mutable arrays
  let xyNodes = $state<FlowNode[]>([]);
  let xyEdges = $state<FlowEdge[]>([]);

  // Keep a derived for other uses that need the raw layout
  const layout = $derived(buildLayout());

  // Sync layout changes to xyflow state
  $effect(() => {
    const newLayout = buildLayout();
    xyNodes = newLayout.nodes;
    xyEdges = newLayout.edges;
  });

  let flowInstance: { fitView: () => void; setCenter: (x: number, y: number, opts?: { zoom?: number }) => void } | null = null;
  let canvasEl: HTMLDivElement;
  let searchInputEl: HTMLInputElement;

  const SPACES: Space[] = ['basics', 'problem', 'solution', 'crosscutting'];

  $effect(() => {
    const focusId = appState.focusedNodeId;
    if (focusId && flowInstance) {
      const node = layout.nodes.find(n => n.id === focusId);
      if (node) {
        flowInstance.setCenter(node.position.x + 90, node.position.y + 30, { zoom: 1.5 });
      }
    }
  });

  // Exported methods for parent to call
  export function focus() {
    canvasEl?.focus();
    onfocuspanel?.();
  }

  export function fitView() {
    flowInstance?.fitView();
  }

  export function focusSearch() {
    searchInputEl?.focus();
    onfocuspanel?.();
  }

  function handleCanvasFocus() {
    onfocuspanel?.();
  }

  function handleCanvasKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    // Don't handle keys when typing in input
    if (isInputFocused) return;

    const selectedId = appState.selectedNodeId;

    // Arrow key navigation
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();

      if (!selectedId) {
        // If no node selected, select the first visible node
        if (layout.nodes.length > 0) {
          focusNode(layout.nodes[0].id);
        }
        return;
      }

      const { incoming, outgoing } = getConnectedNodes(selectedId);
      const siblings = getSiblingNodes(selectedId);

      let nextNode: string | null = null;

      if (e.key === 'ArrowUp' && incoming.length > 0) {
        // Navigate to incoming (parent) node
        nextNode = incoming[0].id;
      } else if (e.key === 'ArrowDown' && outgoing.length > 0) {
        // Navigate to outgoing (child) node
        nextNode = outgoing[0].id;
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && siblings.length > 0) {
        // Navigate between siblings
        const currentIndex = siblings.findIndex(n => n.id === selectedId);
        if (e.key === 'ArrowLeft') {
          // Find previous sibling or wrap to end
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : siblings.length - 1;
          nextNode = siblings[prevIndex]?.id ?? siblings[0].id;
        } else {
          // Find next sibling or wrap to start
          const nextIndex = currentIndex < siblings.length - 1 ? currentIndex + 1 : 0;
          nextNode = siblings[nextIndex]?.id ?? siblings[0].id;
        }
      }

      if (nextNode) {
        focusNode(nextNode);
      }
      return;
    }

    // Enter to expand/collapse
    if (e.key === 'Enter' && selectedId) {
      e.preventDefault();
      toggleExpanded(selectedId);
      return;
    }

    // Space to open inspector (just focus node which shows inspector)
    if (e.key === ' ' && selectedId) {
      e.preventDefault();
      focusNode(selectedId);
      return;
    }

    // f to fit view
    if (e.key === 'f') {
      e.preventDefault();
      flowInstance?.fitView();
      return;
    }

    // 1-4 to toggle space visibility
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      const spaceIndex = parseInt(e.key) - 1;
      if (spaceIndex < SPACES.length) {
        toggleSpace(SPACES[spaceIndex]);
      }
      return;
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="graph-canvas"
  bind:this={canvasEl}
  tabindex="0"
  onfocus={handleCanvasFocus}
  onkeydown={handleCanvasKeydown}
  role="application"
  aria-label="Graph canvas"
>
  <div class="toolbar">
    <div class="toolbar-left">
      <div class="space-filters">
        {#each SPACES as space, i}
          <button
            class="space-btn"
            class:active={appState.visibleSpaces.has(space)}
            style="--space-color: {SPACE_COLORS[space]}"
            onclick={() => toggleSpace(space)}
            title="{space} (press {i + 1})"
          >
            {space}
          </button>
        {/each}
      </div>
      <div class="search-box">
        <input
          type="text"
          placeholder="Search nodes... (/ or Cmd+K)"
          value={appState.searchQuery}
          oninput={handleSearchChange}
          bind:this={searchInputEl}
        />
        {#if appState.searchQuery}
          <span class="search-count">{appState.matchingNodeIds.size} found</span>
        {/if}
      </div>
    </div>
    <div class="toolbar-right">
      <div class="undo-redo-controls">
        <button
          class="icon-btn undo-btn"
          onclick={handleUndo}
          disabled={!appState.canUndo || appState.isUndoing}
          title="Undo (Cmd+Z)"
        >
          {#if appState.isUndoing}
            <LoadingSpinner size="xs" inline />
          {:else}
            Undo
          {/if}
        </button>
        <button
          class="icon-btn redo-btn"
          onclick={handleRedo}
          disabled={!appState.canRedo || appState.isRedoing}
          title="Redo (Cmd+Shift+Z)"
        >
          {#if appState.isRedoing}
            <LoadingSpinner size="xs" inline />
          {:else}
            Redo
          {/if}
        </button>
      </div>
      <div class="snapshot-controls">
        <input
          type="text"
          placeholder="Snapshot name"
          bind:value={snapshotName}
          class="snapshot-input"
          disabled={isSavingSnapshot}
        />
        <button
          class="icon-btn"
          onclick={handleSaveSnapshot}
          disabled={!snapshotName.trim() || isSavingSnapshot}
          title="Save snapshot"
        >
          {#if isSavingSnapshot}
            <LoadingSpinner size="xs" inline />
          {:else}
            Save
          {/if}
        </button>
        <div class="snapshot-dropdown-wrapper">
          <button
            class="icon-btn"
            onclick={() => showSnapshotDropdown = !showSnapshotDropdown}
            disabled={isLoadingSnapshot}
            title="Load snapshot"
          >
            {#if isLoadingSnapshot}
              <LoadingSpinner size="xs" inline />
            {:else}
              Restore
            {/if}
          </button>
          {#if showSnapshotDropdown && appState.snapshots.length > 0}
            <div class="snapshot-dropdown">
              {#each appState.snapshots as snapshot}
                <button
                  class="snapshot-item"
                  onclick={() => handleLoadSnapshot(snapshot)}
                  disabled={isLoadingSnapshot}
                >
                  <span class="snapshot-name">{snapshot.name}</span>
                  <span class="snapshot-date">{new Date(snapshot.createdAt).toLocaleDateString()}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <button
        class="icon-btn"
        onclick={handleExport}
        disabled={isExporting}
        title="Export as Markdown"
      >
        {#if isExporting}
          <LoadingSpinner size="xs" inline />
        {:else}
          Export
        {/if}
      </button>
      <button
        class="icon-btn"
        class:active={appState.showLegend}
        onclick={toggleLegend}
        title="Toggle legend"
      >
        Legend
      </button>
      <div class="stats">
        {layout.nodes.length} nodes / {layout.edges.length} edges
      </div>
    </div>
  </div>

  <div class="canvas">
    {#if layout.nodes.length > 0}
      <SvelteFlow
        nodes={xyNodes}
        edges={xyEdges}
        {nodeTypes}
        fitView
        nodesDraggable={true}
        nodesConnectable={false}
        colorMode="dark"
        onnodeclick={(e) => selectNode(e?.detail?.node?.id ?? null)}
        onpaneclick={() => selectNode(null)}
        oninit={(e) => { flowInstance = e?.detail ?? e; }}
      >
        <Background color="#30363d" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => SPACE_COLORS[KIND_TO_SPACE[(node.data as { kind: string }).kind as keyof typeof KIND_TO_SPACE] ?? 'basics']}
          maskColor="rgba(0,0,0,0.8)"
        />
      </SvelteFlow>
    {:else}
      <div class="welcome">
        <div class="welcome-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <h2 class="welcome-title">Welcome to Bropilot</h2>
        <p class="welcome-subtitle">Build your app spec as a knowledge graph</p>

        <div class="welcome-options">
          <div class="welcome-option">
            <div class="option-label">Start fresh</div>
            <p class="option-hint">Describe your app idea in the chat to begin building your spec</p>
          </div>

          <div class="welcome-divider">
            <span>or</span>
          </div>

          <div class="welcome-option">
            <div class="option-label">See an example</div>
            <p class="option-hint">Load a demo graph to explore</p>
            <div class="demo-buttons">
              {#each DEMO_GRAPHS as graph}
                <button
                  class="demo-btn"
                  onclick={() => handleLoadDemo(graph.id)}
                  disabled={isLoadingDemo}
                >
                  {#if isLoadingDemo && selectedDemoGraph === graph.id}
                    <LoadingSpinner size="sm" inline />
                    <span>Loading...</span>
                  {:else}
                    {graph.name}
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}

    {#if appState.showLegend}
      {@const kindCounts = getNodeKindCounts()}
      <div class="legend">
        <div class="legend-header">
          <span>Legend</span>
          <button class="legend-close" onclick={toggleLegend}>x</button>
        </div>
        <div class="legend-sections">
          {#each SPACES as space}
            {@const kinds = Object.entries(KIND_TO_SPACE).filter(([_, s]) => s === space).map(([k]) => k)}
            {@const spaceCount = kinds.reduce((sum, k) => sum + (kindCounts[k] || 0), 0)}
            {#if spaceCount > 0}
              <div class="legend-section" style="--space-color: {SPACE_COLORS[space]}">
                <div class="legend-space">
                  <span class="legend-color"></span>
                  <span class="legend-space-name">{space}</span>
                  <span class="legend-space-count">{spaceCount}</span>
                </div>
                <div class="legend-kinds">
                  {#each kinds as kind}
                    {#if kindCounts[kind]}
                      <span class="legend-kind">{kind}: {kindCounts[kind]}</span>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <CompletenessPanel onSuggestionClick={onSuggestionClick} />
    <ValidationPanel onSuggestionClick={onSuggestionClick} />

    {#if isGraphUpdating && layout.nodes.length > 0}
      <div class="graph-updating-indicator" aria-label="Graph updating">
        <LoadingSpinner size="sm" />
        <span>Updating graph...</span>
      </div>
    {/if}

    {#if isInitialLoading}
      <div class="initial-loading">
        <LoadingSpinner size="lg" label="Loading..." />
      </div>
    {/if}
  </div>

  {#if appState.showExportModal}
    <div
      class="modal-overlay"
      onclick={() => setExportModal(false)}
      onkeydown={(e) => { if (e.key === 'Escape') setExportModal(false); }}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <div class="modal-header">
          <span>Export Markdown</span>
          <button class="modal-close" onclick={() => setExportModal(false)}>x</button>
        </div>
        <div class="modal-body">
          <textarea class="export-content" readonly value={appState.exportContent}></textarea>
        </div>
        <div class="modal-footer">
          <button onclick={() => {
            navigator.clipboard.writeText(appState.exportContent);
          }}>
            Copy to Clipboard
          </button>
          <button onclick={() => setExportModal(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showDemoConfirmDialog}
    <div
      class="modal-overlay"
      onclick={cancelDemoConfirm}
      onkeydown={(e) => { if (e.key === 'Escape') cancelDemoConfirm(); }}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="modal confirm-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <div class="modal-header">
          <span>Load Demo Graph?</span>
          <button class="modal-close" onclick={cancelDemoConfirm}>x</button>
        </div>
        <div class="modal-body">
          <p>This will <strong>replace your current graph</strong> with Bropilot's self-spec demo.</p>
          <p class="confirm-warning">Your current {appState.graph.nodes.length} nodes and {appState.graph.edges.length} edges will be cleared.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick={cancelDemoConfirm}>
            Cancel
          </button>
          <button class="btn-danger" onclick={loadDemoGraph} disabled={isLoadingDemo}>
            {isLoadingDemo ? 'Loading...' : 'Replace with Demo'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .graph-canvas {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
    outline: none;
  }

  .graph-canvas:focus-within {
    outline: none;
  }

  .graph-canvas:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    gap: 12px;
    flex-wrap: wrap;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .space-filters {
    display: flex;
    gap: 6px;
  }

  .space-btn {
    font-size: 11px;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--space-color) 40%, transparent);
    color: var(--space-color);
    background: transparent;
    opacity: 0.5;
    transition: opacity 0.15s, background 0.15s;
  }

  .space-btn.active {
    opacity: 1;
    background: color-mix(in srgb, var(--space-color) 15%, transparent);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .search-box input {
    width: 160px;
    font-size: 12px;
    padding: 4px 8px;
  }

  .search-count {
    font-size: 10px;
    color: var(--accent);
  }

  .undo-redo-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-right: 8px;
    padding-right: 8px;
    border-right: 1px solid var(--border);
  }

  .undo-btn,
  .redo-btn {
    min-width: 48px;
  }

  .snapshot-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .snapshot-input {
    width: 100px;
    font-size: 11px;
    padding: 4px 6px;
  }

  .snapshot-dropdown-wrapper {
    position: relative;
  }

  .snapshot-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    min-width: 180px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 100;
  }

  .snapshot-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 0;
    background: transparent;
    text-align: left;
  }

  .snapshot-item:hover {
    background: var(--bg3);
  }

  .snapshot-item:first-child {
    border-radius: 6px 6px 0 0;
  }

  .snapshot-item:last-child {
    border-radius: 0 0 6px 6px;
  }

  .snapshot-name {
    font-size: 12px;
    color: var(--text);
  }

  .snapshot-date {
    font-size: 10px;
    color: var(--text3);
  }

  .icon-btn {
    font-size: 11px;
    padding: 4px 8px;
  }

  .icon-btn.active {
    background: var(--accent2);
    border-color: var(--accent);
  }

  .stats {
    font-size: 11px;
    color: var(--text3);
  }

  .canvas {
    flex: 1;
    position: relative;
  }

  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 40px;
    text-align: center;
  }

  .welcome-icon {
    color: var(--accent);
    opacity: 0.6;
    margin-bottom: 24px;
  }

  .welcome-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 8px 0;
  }

  .welcome-subtitle {
    font-size: 14px;
    color: var(--text3);
    margin: 0 0 40px 0;
  }

  .welcome-options {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    max-width: 400px;
  }

  .welcome-option {
    text-align: center;
  }

  .option-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text2);
    margin-bottom: 8px;
  }

  .option-hint {
    font-size: 13px;
    color: var(--text3);
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .welcome-divider {
    display: flex;
    align-items: center;
    width: 200px;
    color: var(--text3);
    font-size: 12px;
  }

  .welcome-divider::before,
  .welcome-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .welcome-divider span {
    padding: 0 12px;
  }

  .demo-buttons {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .demo-btn {
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    background: var(--bg3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, border-color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 140px;
  }

  .demo-btn:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    transform: translateY(-1px);
  }

  .demo-btn:disabled {
    opacity: 0.8;
    cursor: wait;
  }

  .confirm-modal {
    max-width: 440px;
  }

  .confirm-modal .modal-body p {
    margin: 0 0 12px 0;
    color: var(--text);
    line-height: 1.5;
  }

  .confirm-warning {
    font-size: 13px;
    color: var(--text3);
    padding: 12px;
    background: var(--bg3);
    border-radius: 6px;
    margin-top: 8px;
  }

  .btn-secondary {
    padding: 8px 16px;
    font-size: 13px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text2);
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--bg3);
    border-color: var(--text3);
  }

  .btn-danger {
    padding: 8px 16px;
    font-size: 13px;
    background: #da3633;
    border: none;
    color: #fff;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-danger:hover:not(:disabled) {
    background: #f85149;
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .legend {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    min-width: 180px;
    max-height: 300px;
    overflow-y: auto;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 10;
  }

  .legend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .legend-close {
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .legend-sections {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .legend-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .legend-space {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-color {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--space-color);
  }

  .legend-space-name {
    font-size: 11px;
    color: var(--space-color);
    font-weight: 600;
    text-transform: capitalize;
  }

  .legend-space-count {
    font-size: 10px;
    color: var(--text3);
    margin-left: auto;
  }

  .legend-kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding-left: 16px;
  }

  .legend-kind {
    font-size: 10px;
    color: var(--text3);
    background: var(--bg3);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 90%;
    max-width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .modal-close {
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 16px;
    line-height: 1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-body {
    flex: 1;
    padding: 16px;
    overflow: auto;
  }

  .export-content {
    width: 100%;
    min-height: 300px;
    font-family: monospace;
    font-size: 12px;
    resize: vertical;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }

  .graph-updating-indicator {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--bg2);
    border: 1px solid var(--accent);
    border-radius: 20px;
    font-size: 12px;
    color: var(--accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 15;
    animation: fadeIn 0.2s ease-out;
  }

  .initial-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    z-index: 20;
    animation: fadeOut 0.3s ease-out 0.3s forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; pointer-events: none; }
  }

  :global(.svelte-flow) {
    background: #0d1117 !important;
  }

  :global(.svelte-flow__edge-path) {
    stroke-width: 2;
  }

  :global(.svelte-flow__edge-text) {
    font-size: 10px;
    fill: var(--text3);
  }
</style>
