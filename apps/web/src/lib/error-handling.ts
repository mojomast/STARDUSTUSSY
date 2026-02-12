import { trackError } from './analytics';

interface ErrorLog {
  error: Error;
  timestamp: number;
  context?: Record<string, unknown>;
}

interface RetryConfig {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: unknown) => boolean;
}

class ErrorHandler {
  private errorLogs: ErrorLog[] = [];
  private maxLogs = 100;
  private callbacks: Set<(error: Error, context?: Record<string, unknown>) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupGlobalHandlers();
    }
  }

  private setupGlobalHandlers(): void {
    window.addEventListener('error', (event) => {
      this.handleError(
        new Error(event.message || 'Unknown error'),
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          source: 'window.onerror'
        }
      );
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(
        new Error(event.reason?.message || String(event.reason) || 'Unhandled promise rejection'),
        {
          promise: event.promise,
          source: 'unhandledrejection'
        }
      );
    });
  }

  private handleError(error: Error, context?: Record<string, unknown>): void {
    const log: ErrorLog = {
      error,
      timestamp: Date.now(),
      context
    };

    this.errorLogs.push(log);

    if (this.errorLogs.length > this.maxLogs) {
      this.errorLogs.shift();
    }

    trackError(error, context);

    this.callbacks.forEach(callback => callback(error, context));

    console.error('Error caught:', error, context);
  }

  public log(error: Error, context?: Record<string, unknown>): void {
    this.handleError(error, context);
  }

  public onError(callback: (error: Error, context?: Record<string, unknown>) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  public getErrors(): ErrorLog[] {
    return [...this.errorLogs];
  }

  public clearErrors(): void {
    this.errorLogs = [];
  }

  public getRecentErrors(minutes: number = 5): ErrorLog[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.errorLogs.filter(log => log.timestamp > cutoff);
  }
}

const errorHandler = new ErrorHandler();

export function logError(error: Error, context?: Record<string, unknown>): void {
  errorHandler.log(error, context);
}

export function onError(callback: (error: Error, context?: Record<string, unknown>) => void): () => void {
  return errorHandler.onError(callback);
}

export function getErrors(): ErrorLog[] {
  return errorHandler.getErrors();
}

export function clearErrors(): void {
  errorHandler.clearErrors();
}

export function getRecentErrors(minutes?: number): ErrorLog[] {
  return errorHandler.getRecentErrors(minutes);
}

export function setupGlobalHandlers(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('error', () => {
      logError(new Error('Unknown error'), {
        source: 'window.onerror'
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      logError(
        new Error(event.reason?.message || String(event.reason) || 'Unhandled promise rejection'),
        {
          source: 'unhandledrejection'
        }
      );
    });
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    retryableErrors = () => true
  } = config;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!retryableErrors(error) || attempt === maxAttempts) {
        logError(lastError, { attempt, maxAttempts, operation: 'withRetry' });
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);

      console.warn(`Retry attempt ${attempt}/${maxAttempts} failed. Retrying in ${delay}ms...`, error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const err = error as { message?: string; name?: string };
  const message = err.message?.toLowerCase() || '';
  const name = err.name?.toLowerCase() || '';

  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    name.includes('networkerror') ||
    error instanceof TypeError
  );
}

export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) return true;

  const err = error as { response?: { status?: number }; status?: number };
  const status = err.response?.status || err.status;
  if (status) {
    return status >= 500 || status === 429 || status === 408;
  }

  return false;
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  const err = error as { response?: { data?: { message?: string } }; message?: string };
  if (err?.response?.data?.message) {
    return err.response.data.message;
  }

  if (err?.message) {
    return err.message;
  }

  return 'An unexpected error occurred';
}

export function getUserFriendlyMessage(error: unknown): string {
  const message = getErrorMessage(error).toLowerCase();

  if (isNetworkError(error)) {
    return 'Network error. Please check your connection and try again.';
  }

  if (message.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }

  if (message.includes('unauthorized') || message.includes('401')) {
    return 'You need to log in to perform this action.';
  }

  if (message.includes('forbidden') || message.includes('403')) {
    return 'You don\'t have permission to perform this action.';
  }

  if (message.includes('not found') || message.includes('404')) {
    return 'The requested resource was not found.';
  }

  if (message.includes('validation') || message.includes('400')) {
    return 'Please check your input and try again.';
  }

  return 'Something went wrong. Please try again.';
}

export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue?: T
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logError(err, { operation: 'safeAsync' });
    return { data: defaultValue ?? null, error: err };
  }
}

export function safeSync<T>(
  fn: () => T,
  defaultValue?: T
): { data: T | null; error: Error | null } {
  try {
    const data = fn();
    return { data, error: null };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logError(err, { operation: 'safeSync' });
    return { data: defaultValue ?? null, error: err };
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(response: Response): ApiError {
    return new ApiError(
      `HTTP error! status: ${response.status}`,
      response.status
    );
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryConfig: RetryConfig = {}
): Promise<Response> {
  const defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: isRetryableError
  };

  return withRetry(async () => {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw ApiError.fromResponse(response);
    }

    return response;
  }, { ...defaultRetryConfig, ...retryConfig });
}

export function createErrorBoundary(
  Component: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>,
  fallback: React.ComponentType<{ error: Error; retry: () => void }>
): React.ComponentType<React.PropsWithChildren<Record<string, unknown>>> {
  return function ErrorBoundaryWrapper(props: React.PropsWithChildren<Record<string, unknown>>) {
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
      const unsubscribe = onError((err) => setError(err));
      return unsubscribe;
    }, []);

    if (error) {
      return React.createElement(fallback, {
        error,
        retry: () => setError(null)
      });
    }

    return React.createElement(Component, props);
  };
}

export function useErrorHandler(): (error: Error) => void {
  return React.useCallback((error: Error) => {
    logError(error);
  }, []);
}

export function useAsyncError(): () => void {
  const [, setError] = React.useState<unknown>();

  return React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}

export const ErrorHandler = errorHandler;
