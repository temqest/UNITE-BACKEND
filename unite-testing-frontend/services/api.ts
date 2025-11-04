export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

export interface ApiOptions<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  token?: string | null;
  headers?: Record<string, string>;
}

export async function apiFetch<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiOptions<TBody> = {}
): Promise<TResponse> {
  const { method = 'GET', body, token, headers = {} } = options;

  const url = `${API_BASE_URL}${path}`;
  const startedAt = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!res.ok) {
    let err: unknown;
    try {
      err = await res.json();
    } catch {
      err = { message: res.statusText };
    }
    const durationMs = Date.now() - startedAt;
    // High-signal client-side log for debugging
    // eslint-disable-next-line no-console
    console.error('[API ERROR]', {
      url,
      method,
      status: res.status,
      durationMs,
      requestBody: body ?? null,
      response: err,
    });
    const serverMessage = (err as any)?.message || res.statusText;
    const serverErrors = (err as any)?.errors;
    const error = new Error(`HTTP ${res.status} ${serverMessage}`) as Error & {
      status?: number; server?: unknown; url?: string; method?: string; errors?: unknown;
    };
    error.status = res.status;
    error.server = err;
    error.url = url;
    error.method = method;
    if (serverErrors) (error as any).errors = serverErrors;
    throw error;
  }

  try {
    return (await res.json()) as TResponse;
  } catch {
    // No content
    return {} as TResponse;
  }
}

export const AuthAPI = {
  loginStaff: (email: string, password: string) =>
    apiFetch<{ token: string; success: boolean; message?: string; data?: any }>(`/login`, {
      method: 'POST',
      body: { email, password },
    }),
  loginStakeholder: (email: string, password: string) =>
    apiFetch<{ token: string; role: string; user: unknown }>(`/stakeholders/login`, {
      method: 'POST',
      body: { email, password },
    }),
  registerStakeholder: (payload: Record<string, unknown>) =>
    apiFetch<{ success: boolean; stakeholderId?: string }>(`/stakeholders/register`, {
      method: 'POST',
      body: payload,
    }),
};

export const RequestsAPI = {
  create: (token: string, payload: Record<string, unknown>) =>
    apiFetch(`/requests`, { method: 'POST', body: payload, token }),
  getPending: (token: string) => apiFetch(`/requests/pending`, { token }),
  getById: (token: string, id: string) => apiFetch(`/requests/${id}`, { token }),
  adminAction: (token: string, id: string, action: 'approve' | 'reject' | 'reschedule', notes?: string) =>
    apiFetch(`/requests/${id}/admin-action`, { method: 'POST', token, body: { action, notes } }),
  coordinatorConfirm: (token: string, id: string, confirm: boolean) =>
    apiFetch(`/requests/${id}/coordinator-confirm`, { method: 'POST', token, body: { confirm } }),
};

export const CalendarAPI = {
  month: (token: string, params: URLSearchParams) =>
    apiFetch(`/calendar/month?${params.toString()}`, { token }),
  week: (token: string, params: URLSearchParams) =>
    apiFetch(`/calendar/week?${params.toString()}`, { token }),
  day: (token: string, params: URLSearchParams) =>
    apiFetch(`/calendar/day?${params.toString()}`, { token }),
  events: (token: string, params: URLSearchParams) =>
    apiFetch(`/events?${params.toString()}`, { token }),
};

export const SettingsAPI = {
  getAll: (token: string) => apiFetch(`/settings`, { token }),
};

export const NotificationsAPI = {
  list: (token: string) => apiFetch(`/notifications`, { token }),
  unreadCount: (token: string) => apiFetch(`/notifications/unread-count`, { token }),
  markRead: (token: string, id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PUT', token }),
  markAllRead: (token: string) => apiFetch(`/notifications/mark-all-read`, { method: 'PUT', token }),
};

export const UsersAPI = {
  createCoordinator: (
    token: string,
    payload: {
      staffData: {
        First_Name: string;
        Middle_Name?: string | null;
        Last_Name: string;
        Email: string;
        Phone_Number: string;
        Password: string;
      };
      coordinatorData: {
        District_ID: string;
        Province_Name?: string | null;
      };
    }
  ) => apiFetch(`/coordinators`, { method: 'POST', token, body: payload }),
};

export const DistrictsAPI = {
  list: (token: string) => apiFetch(`/districts`, { token }),
};


