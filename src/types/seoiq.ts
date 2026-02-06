// SEO IQ Types

export type GoogleConnectionStatus = 'not_connected' | 'active' | 'expired' | 'revoked' | 'error';
export type KeywordCompetition = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type OpportunityType = 'quick_win' | 'content_gap' | 'ctr_optimization' | 'cluster_gap' | 'long_tail';
export type KeywordStatus = 'active' | 'used' | 'dismissed';
export type ArticleStatus = 'draft' | 'approved' | 'publishing' | 'published' | 'failed';
export type IndexingStatus = 'not_submitted' | 'submitted' | 'indexed' | 'failed';

// Database row types

export interface SeoSite {
  id: string;
  organization_id: string;
  name: string;
  domain: string;

  // Google OAuth status (tokens not exposed to frontend)
  google_status: GoogleConnectionStatus;
  google_scopes: string[] | null;

  // Target Supabase (URLs not exposed to frontend, only status)
  target_table_name: string;
  has_target_credentials: boolean; // computed, not stored

  // GSC config
  gsc_property: string | null;

  // Content config
  slug_prefix: string;
  voice_guide: string | null;

  // Autopilot
  autopilot_enabled: boolean;
  autopilot_cadence: 'daily' | 'every_3_days' | 'weekly';
  autopilot_iq_level: 'low' | 'medium' | 'high';
  autopilot_articles_per_run: number;
  autopilot_next_run_at: string | null;
  autopilot_pipeline_step: string | null;
  autopilot_pipeline_keyword_id: string | null;
  autopilot_pipeline_article_id: string | null;
  autopilot_last_run_at: string | null;
  autopilot_last_error: string | null;

  created_at: string;
  updated_at: string;
}

export interface SeoKeyword {
  id: string;
  site_id: string;
  keyword: string;

  search_volume: number;
  competition: KeywordCompetition;
  competition_index: number;

  current_position: number | null;
  impressions: number;
  clicks: number;
  ctr: number;

  opportunity_type: OpportunityType | null;
  opportunity_score: number;
  reasoning: string | null;
  action: string | null;
  suggested_title: string | null;

  topic_cluster: string;
  status: KeywordStatus;
  existing_url: string | null;

  created_at: string;
  updated_at: string;
}

export interface SeoArticle {
  id: string;
  site_id: string;
  keyword_id: string | null;

  title: string;
  slug: string;
  meta_description: string | null;
  content: string;
  word_count: number;
  primary_keyword: string | null;
  secondary_keywords: string[] | null;
  category: string;
  read_time_minutes: number;

  thumbnail_url: string | null;
  thumbnail_prompt: string | null;

  status: ArticleStatus;
  published_url: string | null;
  published_at: string | null;
  publish_error: string | null;

  indexing_status: IndexingStatus;
  indexing_submitted_at: string | null;

  generation_model: string | null;
  generation_params: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
}

// API request/response types

export interface CreateSeoSiteRequest {
  name: string;
  domain: string;
  gsc_property?: string;
  slug_prefix?: string;
  voice_guide?: string;
  target_supabase_url?: string;
  target_supabase_key?: string;
  target_table_name?: string;
}

export interface UpdateSeoSiteRequest {
  name?: string;
  gsc_property?: string;
  slug_prefix?: string;
  voice_guide?: string;
  target_supabase_url?: string;
  target_supabase_key?: string;
  target_table_name?: string;
}

export interface RefreshKeywordsRequest {
  site_id: string;
  days?: number; // GSC lookback days, default 90
}

export interface RefreshKeywordsResponse {
  gsc_queries: number;
  keywords_upserted: number;
  opportunities_scored: number;
}

export interface GenerateArticleRequest {
  site_id: string;
  keyword_id?: string;
  keyword?: string; // Manual keyword if no keyword_id
  custom_instructions?: string;
  iq_level?: 'low' | 'medium' | 'high';
}

export interface GenerateArticleResponse {
  article: SeoArticle;
}

export interface PublishArticleRequest {
  article_id: string;
  generate_thumbnail?: boolean;
  submit_indexing?: boolean;
}

export interface PublishArticleResponse {
  published_url: string;
  thumbnail_generated: boolean;
  indexing_submitted: boolean;
}

// Keyword scoring types (used in backend)

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface KeywordVolume {
  keyword: string;
  avgMonthlySearches: number;
  competition: KeywordCompetition;
  competitionIndex: number;
  source: string;
}

export interface KeywordOpportunity {
  keyword: string;
  opportunityType: OpportunityType;
  score: number;
  reasoning: string;
  gscClicks?: number;
  gscImpressions?: number;
  gscCTR?: number;
  gscPosition?: number;
  searchVolume?: number;
  competition?: string;
  action: string;
  suggestedTitle?: string;
  cluster: string;
}

// UI workflow types

export type SeoIQTab = 'sites' | 'keywords' | 'generate' | 'articles' | 'autopilot';

export interface SeoIQPageState {
  activeTab: SeoIQTab;
  selectedSiteId: string | null;
  selectedKeywordId: string | null;
}

export interface AutopilotConfig {
  autopilot_enabled: boolean;
  autopilot_cadence: 'daily' | 'every_3_days' | 'weekly';
  autopilot_iq_level: 'low' | 'medium' | 'high';
  autopilot_articles_per_run: number;
  autopilot_next_run_at: string | null;
  autopilot_pipeline_step: string | null;
  autopilot_pipeline_keyword_id: string | null;
  autopilot_pipeline_article_id: string | null;
  autopilot_last_run_at: string | null;
  autopilot_last_error: string | null;
}
