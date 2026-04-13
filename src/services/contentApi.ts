import { getAuthToken } from '../lib/authToken';

const BASE = '/api/content';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  content: string;
  excerpt: string | null;
  category: 'faq' | 'comparison' | 'guide' | 'listicle' | 'case-study';
  tags: string[];
  author: string;
  featured_image: string | null;
  read_time_minutes: number;
  status: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  faq_pairs: Array<{ q: string; a: string }>;
  schema_type: 'Article' | 'FAQPage' | 'HowTo';
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string;
  author: string;
  featured_image: string | null;
  read_time_minutes: number;
  published_at: string;
  tags: string[];
  schema_type: string;
}

export interface PostsResponse {
  posts: BlogPostSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FAQItem {
  q: string;
  a: string;
  sourceSlug: string;
  sourceTitle: string;
  category: string;
}

export async function fetchPosts(options?: {
  category?: string;
  page?: number;
  limit?: number;
}): Promise<PostsResponse> {
  const params = new URLSearchParams();
  if (options?.category && options.category !== 'all') params.set('category', options.category);
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  const res = await fetch(`${BASE}/posts?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export async function fetchPost(slug: string): Promise<BlogPost> {
  const res = await fetch(`${BASE}/post?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error('Post not found');
  return res.json();
}

export async function fetchFaqs(): Promise<FAQItem[]> {
  const res = await fetch(`${BASE}/faqs`);
  if (!res.ok) throw new Error('Failed to fetch FAQs');
  const data = await res.json();
  return data.faqs;
}

export async function adminCreatePost(post: Partial<BlogPost>): Promise<BlogPost> {
  const token = await getAuthToken();
  const res = await fetch(`${BASE}/admin-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(post),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create post');
  }
  return res.json();
}
