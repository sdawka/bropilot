// Network state management and offline detection

import { showWarning, showSuccess, dismissToast } from './toast.svelte.js';

export const networkState = $state({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSlowConnection: false,
  lastOnlineTime: Date.now(),
});

// Track pending operations when offline
const pendingOperations: Array<{
  id: string;
  name: string;
  execute: () => Promise<void>;
}> = [];

let offlineToastId: string | null = null;

/**
 * Initialize network listeners
 * Call this once when the app starts
 */
export function initNetworkListeners(): () => void {
  if (typeof window === 'undefined') return () => {};

  function handleOnline() {
    networkState.isOnline = true;
    networkState.lastOnlineTime = Date.now();

    // Dismiss offline toast if shown
    if (offlineToastId) {
      dismissToast(offlineToastId);
      offlineToastId = null;
    }

    showSuccess('Back online', pendingOperations.length > 0
      ? `${pendingOperations.length} pending operation(s) will resume`
      : undefined
    );

    // Execute pending operations
    executePendingOperations();
  }

  function handleOffline() {
    networkState.isOnline = false;
    offlineToastId = showWarning(
      'You are offline',
      'Changes will be saved when you reconnect'
    );
  }

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Check connection quality using Network Information API if available
  const connection = (navigator as NavigatorWithConnection).connection;
  if (connection) {
    function updateConnectionQuality() {
      const conn = (navigator as NavigatorWithConnection).connection;
      if (conn) {
        // Consider slow if effective type is slow-2g or 2g
        networkState.isSlowConnection =
          conn.effectiveType === 'slow-2g' ||
          conn.effectiveType === '2g' ||
          (conn.downlink !== undefined && conn.downlink < 0.5);
      }
    }

    connection.addEventListener('change', updateConnectionQuality);
    updateConnectionQuality();
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Queue an operation to run when online
 */
export function queueOfflineOperation(
  id: string,
  name: string,
  execute: () => Promise<void>
): void {
  // Remove any existing operation with same ID
  const existingIndex = pendingOperations.findIndex(op => op.id === id);
  if (existingIndex >= 0) {
    pendingOperations.splice(existingIndex, 1);
  }

  pendingOperations.push({ id, name, execute });
}

/**
 * Execute all pending operations
 */
async function executePendingOperations(): Promise<void> {
  while (pendingOperations.length > 0 && networkState.isOnline) {
    const op = pendingOperations.shift();
    if (op) {
      try {
        await op.execute();
      } catch (error) {
        console.error(`Failed to execute pending operation "${op.name}":`, error);
        // Don't re-queue failed operations to avoid infinite loops
      }
    }
  }
}

/**
 * Check if we should attempt an operation
 * Returns false if offline and operation requires network
 */
export function canPerformNetworkOperation(): boolean {
  return networkState.isOnline;
}

/**
 * Get number of pending operations
 */
export function getPendingOperationsCount(): number {
  return pendingOperations.length;
}

// TypeScript types for Network Information API
interface NetworkInformation {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}
