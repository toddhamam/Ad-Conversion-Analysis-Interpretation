import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../../components/SEO';
import { fetchFaqs, type FAQItem } from '../../services/contentApi';
import Loading from '../../components/Loading';
import './Blog.css';

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchFaqs();
        setFaqs(data);
      } catch {
        setError('Failed to load FAQs.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter(
      (faq) => faq.q.toLowerCase().includes(q) || faq.a.toLowerCase().includes(q)
    );
  }, [faqs, searchQuery]);

  const faqSchema = faqs.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }
    : undefined;

  return (
    <div className="blog-layout">
      <SEO
        title="FAQ | Convertra — Common Questions About AI Ad Creative"
        description="Answers to frequently asked questions about AI ad creative generation, conversion intelligence, and automated ad testing."
        canonical="/faq"
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
          <Link to="/faq" className="blog-nav-item active">FAQ</Link>
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
          <div className="blog-breadcrumb">FAQ</div>

          <div className="blog-hub-header">
            <h1>Frequently Asked Questions</h1>
            <p>Everything you need to know about AI-powered ad creative generation and conversion intelligence.</p>
          </div>

          {/* Search */}
          <div className="faq-search">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <Loading size="medium" message="ConversionIQ™ loading FAQs..." />
          ) : error ? (
            <div className="blog-empty">
              <h3>{error}</h3>
            </div>
          ) : filtered.length === 0 ? (
            <div className="blog-empty">
              <h3>{searchQuery ? 'No matching questions' : 'No FAQs yet'}</h3>
              <p>{searchQuery ? 'Try a different search term.' : 'Check back soon.'}</p>
            </div>
          ) : (
            <div className="faq-accordion">
              {filtered.map((faq, i) => (
                <details key={i}>
                  <summary>{faq.q}</summary>
                  <div className="faq-answer">
                    {faq.a}
                    {faq.sourceSlug && (
                      <Link to={`/blog/${faq.sourceSlug}`} className="faq-source-link">
                        Read more in: {faq.sourceTitle}
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* CTA Card */}
          <div className="blog-cta-card">
            <h3>Still have questions?</h3>
            <p>See ConversionIQ™ in action — automate your ad creative testing.</p>
            <Link to="/signup" className="blog-cta-button">Get Started Free</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
