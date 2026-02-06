import type {
  SeoSite,
  SeoKeyword,
  SeoArticle,
  AutopilotConfig,
  ScheduledRun,
  CreateSeoSiteRequest,
  UpdateSeoSiteRequest,
  RefreshKeywordsResponse,
  GenerateArticleRequest,
  GenerateArticleResponse,
  PublishArticleRequest,
  PublishArticleResponse,
} from '../types/seoiq';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

// ─── Sites ──────────────────────────────────────────────────────────────────

export async function fetchSites(organizationId: string): Promise<SeoSite[]> {
  return fetchJson<SeoSite[]>(
    `${API_BASE}/seo-iq/sites?organizationId=${organizationId}`
  );
}

export async function fetchSite(organizationId: string, siteId: string): Promise<SeoSite> {
  return fetchJson<SeoSite>(
    `${API_BASE}/seo-iq/sites?organizationId=${organizationId}&siteId=${siteId}`
  );
}

export async function createSite(organizationId: string, data: CreateSeoSiteRequest): Promise<SeoSite> {
  return fetchJson<SeoSite>(`${API_BASE}/seo-iq/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId, ...data }),
  });
}

export async function updateSite(organizationId: string, siteId: string, data: UpdateSeoSiteRequest): Promise<SeoSite> {
  return fetchJson<SeoSite>(`${API_BASE}/seo-iq/sites`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId, siteId, ...data }),
  });
}

export async function deleteSite(organizationId: string, siteId: string): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `${API_BASE}/seo-iq/sites?organizationId=${organizationId}&siteId=${siteId}`,
    { method: 'DELETE' }
  );
}

export function getGoogleConnectUrl(siteId: string, returnUrl?: string): string {
  const params = new URLSearchParams({ siteId });
  if (returnUrl) params.set('returnUrl', returnUrl);
  return `${API_BASE}/auth/google/connect?${params.toString()}`;
}

// ─── Keywords ───────────────────────────────────────────────────────────────

export async function fetchKeywords(siteId: string): Promise<SeoKeyword[]> {
  return fetchJson<SeoKeyword[]>(
    `${API_BASE}/seo-iq/keywords?siteId=${siteId}`
  );
}

export async function refreshKeywords(siteId: string, days?: number): Promise<RefreshKeywordsResponse> {
  return fetchJson<RefreshKeywordsResponse>(`${API_BASE}/seo-iq/refresh-keywords`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: siteId, days }),
  });
}

// ─── Articles ───────────────────────────────────────────────────────────────

export async function fetchArticles(siteId: string, status?: string): Promise<SeoArticle[]> {
  const params = new URLSearchParams({ siteId });
  if (status) params.set('status', status);
  return fetchJson<SeoArticle[]>(`${API_BASE}/seo-iq/articles?${params.toString()}`);
}

export async function fetchArticle(siteId: string, articleId: string): Promise<SeoArticle> {
  return fetchJson<SeoArticle>(
    `${API_BASE}/seo-iq/articles?siteId=${siteId}&articleId=${articleId}`
  );
}

export async function generateArticle(data: GenerateArticleRequest): Promise<GenerateArticleResponse> {
  return fetchJson<GenerateArticleResponse>(`${API_BASE}/seo-iq/generate-article`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateArticle(
  siteId: string,
  articleId: string,
  data: Partial<Pick<SeoArticle, 'title' | 'slug' | 'meta_description' | 'content' | 'category' | 'status'>>
): Promise<SeoArticle> {
  return fetchJson<SeoArticle>(`${API_BASE}/seo-iq/articles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, articleId, ...data }),
  });
}

export async function publishArticle(data: PublishArticleRequest): Promise<PublishArticleResponse> {
  return fetchJson<PublishArticleResponse>(`${API_BASE}/seo-iq/publish-article`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteArticle(siteId: string, articleId: string): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `${API_BASE}/seo-iq/articles?siteId=${siteId}&articleId=${articleId}`,
    { method: 'DELETE' }
  );
}

// ─── Autopilot ────────────────────────────────────────────────────────────

export async function fetchAutopilotStatus(siteId: string): Promise<AutopilotConfig> {
  return fetchJson<AutopilotConfig>(
    `${API_BASE}/seo-iq/autopilot-status?siteId=${siteId}`
  );
}

export async function updateAutopilotConfig(
  siteId: string,
  config: Partial<Pick<AutopilotConfig, 'autopilot_enabled' | 'autopilot_cadence' | 'autopilot_iq_level' | 'autopilot_articles_per_run'>> & { autopilot_pipeline_step?: string | null }
): Promise<AutopilotConfig> {
  return fetchJson<AutopilotConfig>(`${API_BASE}/seo-iq/autopilot-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, ...config }),
  });
}

export async function autopilotPickKeyword(siteId: string): Promise<SeoKeyword> {
  return fetchJson<SeoKeyword>(`${API_BASE}/seo-iq/autopilot-pick-keyword`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: siteId }),
  });
}

// ─── Content Calendar ─────────────────────────────────────────────────────

export async function fetchScheduledRuns(siteId: string, month: string): Promise<ScheduledRun[]> {
  return fetchJson<ScheduledRun[]>(
    `${API_BASE}/seo-iq/autopilot-schedule?siteId=${siteId}&month=${month}`
  );
}

export async function createScheduledRuns(siteId: string, dates: string[]): Promise<ScheduledRun[]> {
  return fetchJson<ScheduledRun[]>(`${API_BASE}/seo-iq/autopilot-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: siteId, dates }),
  });
}

export async function deleteScheduledRun(siteId: string, scheduledDate: string): Promise<void> {
  await fetchJson<{ success: boolean }>(`${API_BASE}/seo-iq/autopilot-schedule`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: siteId, scheduled_date: scheduledDate }),
  });
}
