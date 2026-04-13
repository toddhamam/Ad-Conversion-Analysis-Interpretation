import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import SEO from '../../components/SEO';
import { fetchPost, type BlogPost as BlogPostType } from '../../services/contentApi';
import Loading from '../../components/Loading';
import './Blog.css';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ');
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[`*_~]/g, '');
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      items.push({ id, text, level });
    }
  }
  return items;
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPost(slug);
        setPost(data);
      } catch {
        setError('Article not found.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const toc = useMemo(() => post ? extractToc(post.content) : [], [post]);

  // IntersectionObserver for TOC highlighting
  useEffect(() => {
    if (!toc.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [toc]);

  if (loading) {
    return (
      <div className="blog-layout">
        <div className="blog-main">
          <div className="blog-content blog-content-loading">
            <Loading size="large" message="ConversionIQ™ loading article..." />
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="blog-layout">
        <div className="blog-main">
          <div className="blog-content">
            <div className="blog-empty">
              <h3>{error || 'Article not found'}</h3>
              <p><Link to="/blog">Back to all articles</Link></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const faqSchema = post.faq_pairs.length > 0
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: post.faq_pairs.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.a } })) }
    : undefined;

  return (
    <div className="blog-layout">
      <SEO
        title={`${post.title} | Convertra`}
        description={post.meta_description || post.excerpt || ''}
        canonical={`/blog/${post.slug}`}
        ogType="article"
        jsonLd={faqSchema}
      />

      {/* Left Sidebar */}
      <aside className="blog-sidebar">
        <Link to="/" className="blog-sidebar-logo">
          <img src="/convertra-logo.png" alt="Convertra" />
        </Link>
        <div className="blog-nav-section">
          <div className="blog-nav-section-title">Content</div>
          <Link to="/blog" className="blog-nav-item">All Articles</Link>
          <Link to="/faq" className="blog-nav-item">FAQ</Link>
        </div>
        <div className="blog-nav-section">
          <div className="blog-nav-section-title">Categories</div>
          <Link to="/blog?category=faq" className="blog-nav-item">FAQ</Link>
          <Link to="/blog?category=comparison" className="blog-nav-item">Comparison</Link>
          <Link to="/blog?category=guide" className="blog-nav-item">Guide</Link>
          <Link to="/blog?category=listicle" className="blog-nav-item">Listicle</Link>
          <Link to="/blog?category=case-study" className="blog-nav-item">Case Study</Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="blog-main">
        <div className="blog-content">
          {/* Breadcrumb */}
          <div className="blog-breadcrumb">
            <Link to="/blog">Blog</Link> / <Link to={`/blog?category=${post.category}`}>{categoryLabel(post.category)}</Link>
          </div>

          {/* Article Header */}
          <div className="blog-article-header">
            <h1>{post.title}</h1>
            <div className="blog-article-meta">
              <span className="category-badge">{categoryLabel(post.category)}</span>
              <span>{post.author}</span>
              <span>{formatDate(post.published_at)}</span>
              <span>{post.read_time_minutes} min read</span>
            </div>
          </div>

          {/* Article Body */}
          <div className="blog-article-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSlug]}
            >
              {post.content}
            </ReactMarkdown>
          </div>

          {/* FAQ Section (if post has faq_pairs) */}
          {post.faq_pairs.length > 0 && (
            <div className="blog-article-faq-section">
              <h2 className="blog-article-faq-heading">
                Frequently Asked Questions
              </h2>
              <div className="faq-accordion">
                {post.faq_pairs.map((pair, i) => (
                  <details key={i}>
                    <summary>{pair.q}</summary>
                    <div className="faq-answer">{pair.a}</div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          <div className="blog-article-feedback">
            <span>Was this helpful?</span>
            <button>Yes</button>
            <button>No</button>
          </div>

          {/* CTA */}
          <div className="blog-cta-card">
            <h3>See ConversionIQ™ in action</h3>
            <p>Automate your ad creative testing and scale what converts.</p>
            <Link to="/signup" className="blog-cta-button">Get Started Free</Link>
          </div>
        </div>
      </main>

      {/* Right TOC Sidebar */}
      {toc.length > 0 && (
        <aside className="blog-toc">
          <div className="blog-toc-title">On this page</div>
          <ul className="blog-toc-list">
            {toc.map((item) => (
              <li
                key={item.id}
                className={`blog-toc-item ${item.level === 3 ? 'indent' : ''} ${activeSection === item.id ? 'active' : ''}`}
              >
                <a href={`#${item.id}`} className="blog-toc-link">{item.text}</a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
