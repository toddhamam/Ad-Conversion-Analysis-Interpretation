import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SEO from '../../components/SEO';
import { fetchPosts, type BlogPostSummary } from '../../services/contentApi';
import Loading from '../../components/Loading';
import './Blog.css';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'faq', label: 'FAQ' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'guide', label: 'Guide' },
  { value: 'listicle', label: 'Listicle' },
  { value: 'case-study', label: 'Case Study' },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ');
}

export default function BlogHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') || 'all';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPosts({ category: activeCategory, page: currentPage, limit: 12 });
        setPosts(data.posts);
        setTotalPages(data.totalPages);
      } catch {
        setError('Failed to load articles.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeCategory, currentPage]);

  const setCategory = (cat: string) => {
    const params = new URLSearchParams();
    if (cat !== 'all') params.set('category', cat);
    setSearchParams(params);
  };

  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(page));
    setSearchParams(params);
  };

  return (
    <div className="blog-layout">
      <SEO
        title="Blog | Convertra — Conversion Intelligence Insights"
        description="Expert insights on ad creative automation, conversion optimization, and AI-powered marketing for CMOs and media buyers."
        canonical="/blog"
      />

      {/* Left Sidebar */}
      <aside className="blog-sidebar">
        <Link to="/" className="blog-sidebar-logo">
          <img src="/convertra-logo.png" alt="Convertra" />
        </Link>

        <div className="blog-nav-section">
          <div className="blog-nav-section-title">Content</div>
          <Link to="/blog" className={`blog-nav-item ${activeCategory === 'all' ? 'active' : ''}`}>
            All Articles
          </Link>
          <Link to="/faq" className="blog-nav-item">
            FAQ
          </Link>
        </div>

        <div className="blog-nav-section">
          <div className="blog-nav-section-title">Categories</div>
          {CATEGORIES.filter(c => c.value !== 'all').map((cat) => (
            <button
              key={cat.value}
              className={`blog-nav-item blog-nav-button ${activeCategory === cat.value ? 'active' : ''}`}
              onClick={() => setCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="blog-nav-section">
          <div className="blog-nav-section-title">Product</div>
          <Link to="/login" className="blog-nav-item">Sign In</Link>
          <Link to="/signup" className="blog-nav-item">Get Started</Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="blog-main">
        <div className="blog-content">
          <div className="blog-hub-header">
            <div className="blog-breadcrumb">Blog</div>
            <h1>Insights</h1>
            <p>Expert insights on ad creative automation, conversion optimization, and AI-powered marketing.</p>
          </div>

          {/* Category Filter Pills */}
          <div className="blog-category-filter">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                className={`blog-category-pill ${activeCategory === cat.value ? 'active' : ''}`}
                onClick={() => setCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {loading ? (
            <Loading size="medium" message="ConversionIQ™ loading articles..." />
          ) : error ? (
            <div className="blog-empty">
              <h3>{error}</h3>
              <p>Please try again later.</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="blog-empty">
              <h3>No articles yet</h3>
              <p>Check back soon — we're publishing new content regularly.</p>
            </div>
          ) : (
            <>
              <div className="blog-card-grid">
                {posts.map((post) => (
                  <Link key={post.id} to={`/blog/${post.slug}`} className="blog-card">
                    {post.featured_image ? (
                      <img src={post.featured_image} alt={post.title} className="blog-card-image" loading="lazy" />
                    ) : (
                      <div className="blog-card-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                    )}
                    <div className="blog-card-body">
                      <div className="blog-card-category">{categoryLabel(post.category)}</div>
                      <div className="blog-card-title">{post.title}</div>
                      {post.excerpt && <div className="blog-card-excerpt">{post.excerpt}</div>}
                      <div className="blog-card-footer">
                        <span>{formatDate(post.published_at)}</span>
                        <span>{post.read_time_minutes} min read</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="blog-pagination">
                  <button onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
                    Previous
                  </button>
                  <span className="page-info">Page {currentPage} of {totalPages}</span>
                  <button onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {/* CTA Card */}
          <div className="blog-cta-card">
            <h3>Ready to automate your ad creative testing?</h3>
            <p>ConversionIQ™ generates winning creatives from your performance data.</p>
            <Link to="/signup" className="blog-cta-button">Get Started Free</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
