const API_BASE = '/api';

interface ApiError {
  error: string;
  details?: unknown;
}

class ApiException extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiException';
    this.status = status;
    this.details = details;
  }
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('pos_auth_token');
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('X-Request-ID')) {
    headers.set('X-Request-ID', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    throw new ApiException(
      'Network error: Unable to reach server. Please check your connection.',
      0,
      networkError
    );
  }

  if (response.status === 401) {
    localStorage.removeItem('pos_auth_token');
    localStorage.removeItem('pos_user');
    if (!window.location.pathname.includes('login')) {
      window.dispatchEvent(new Event('pos_auth_expired'));
    }
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new ApiException(
      `Too many requests. Please wait ${retryAfter ? `${retryAfter} seconds` : 'a moment'} before trying again.`,
      429
    );
  }

  let data: ApiError & T;
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else if (response.status === 204) {
      data = {} as ApiError & T;
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text) as ApiError & T;
      } catch {
        data = { error: text || `HTTP ${response.status}` } as unknown as ApiError & T;
      }
    }
  } catch {
    data = { error: `Failed to parse server response (HTTP ${response.status})` } as unknown as ApiError & T;
  }

  if (!response.ok) {
    const errorMessage = (data as ApiError)?.error || `HTTP error! Status: ${response.status}`;
    throw new ApiException(errorMessage, response.status, (data as ApiError)?.details);
  }

  return data as T;
}

export { ApiException };
