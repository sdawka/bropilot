// Toast notification system for error handling and user feedback

export type ToastType = 'error' | 'warning' | 'success' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
  duration: number;
  dismissable: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Toast state - reactive
export const toastState = $state({
  toasts: [] as Toast[],
});

let toastCounter = 0;

/**
 * Show a toast notification
 */
export function showToast(options: {
  type: ToastType;
  message: string;
  detail?: string;
  duration?: number;
  dismissable?: boolean;
  action?: { label: string; onClick: () => void };
}): string {
  const id = `toast-${++toastCounter}`;
  const toast: Toast = {
    id,
    type: options.type,
    message: options.message,
    detail: options.detail,
    duration: options.duration ?? (options.type === 'error' ? 8000 : 4000),
    dismissable: options.dismissable ?? true,
    action: options.action,
  };

  toastState.toasts = [...toastState.toasts, toast];

  // Auto-dismiss after duration (unless duration is 0)
  if (toast.duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, toast.duration);
  }

  return id;
}

/**
 * Dismiss a specific toast
 */
export function dismissToast(id: string): void {
  toastState.toasts = toastState.toasts.filter(t => t.id !== id);
}

/**
 * Dismiss all toasts
 */
export function dismissAllToasts(): void {
  toastState.toasts = [];
}

// Convenience methods for common toast types

export function showError(message: string, detail?: string): string {
  return showToast({ type: 'error', message, detail });
}

export function showWarning(message: string, detail?: string): string {
  return showToast({ type: 'warning', message, detail });
}

export function showSuccess(message: string, detail?: string): string {
  return showToast({ type: 'success', message, detail });
}

export function showInfo(message: string, detail?: string): string {
  return showToast({ type: 'info', message, detail });
}

/**
 * Show an error with a retry action
 */
export function showRetryableError(
  message: string,
  onRetry: () => void,
  detail?: string
): string {
  return showToast({
    type: 'error',
    message,
    detail,
    duration: 0, // Don't auto-dismiss retryable errors
    action: {
      label: 'Try again',
      onClick: () => {
        onRetry();
      },
    },
  });
}

/**
 * Convert technical error messages to user-friendly ones
 */
export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Network errors
    if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'The request took too long. Please try again.';
    }
    if (msg.includes('aborted')) {
      return 'The request was cancelled.';
    }

    // HTTP errors
    if (msg.includes('401') || msg.includes('unauthorized')) {
      return 'You are not authorized. Please refresh the page.';
    }
    if (msg.includes('403') || msg.includes('forbidden')) {
      return 'Access denied.';
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return 'The requested resource was not found.';
    }
    if (msg.includes('500') || msg.includes('internal server error')) {
      return 'Something went wrong on our end. Please try again.';
    }
    if (msg.includes('502') || msg.includes('bad gateway')) {
      return 'The server is temporarily unavailable. Please try again.';
    }
    if (msg.includes('503') || msg.includes('service unavailable')) {
      return 'The service is temporarily unavailable. Please try again shortly.';
    }

    // Database errors
    if (msg.includes('sqlite') || msg.includes('database')) {
      return 'A database error occurred. Please try again.';
    }

    // Return the original message if we can't make it friendlier
    return error.message;
  }

  return String(error);
}
