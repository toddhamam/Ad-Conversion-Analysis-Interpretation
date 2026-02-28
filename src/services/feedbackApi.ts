import type { UserFeedback, SubmitFeedbackRequest } from '../types/feedback';
import { supabase } from '../lib/supabase';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export async function submitFeedback(data: SubmitFeedbackRequest): Promise<{ feedback: UserFeedback }> {
  return fetchJson<{ feedback: UserFeedback }>(`${API_BASE}/feedback/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function listFeedback(): Promise<UserFeedback[]> {
  return fetchJson<UserFeedback[]>(`${API_BASE}/feedback/list`);
}

export async function updateFeedback(data: {
  id: string;
  status: string;
  plan_file_path?: string | null;
}): Promise<UserFeedback> {
  return fetchJson<UserFeedback>(`${API_BASE}/feedback/update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
