import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  noindex?: boolean;
  jsonLd?: object | object[];
}

// Default values optimized for Convertra/ConversionIQ
const DEFAULTS = {
  siteName: 'Convertra',
  title: 'Convertra | Conversion Intelligence Platform for Enterprise Brands',
  description: 'Convertra\'s ConversionIQ™ technology extracts conversion insights from your ad data and automatically generates winning creatives. The #1 conversion intelligence platform for enterprise brands spending $1M+ on paid media.',
  keywords: 'conversion intelligence, AI ad generation, ad creative automation, ConversionIQ, enterprise ad optimization, automated ad testing, CMO ad platform, ROAS optimization, ad creative platform, conversion optimization',
  ogImage: '/og-image.png',
  ogImageAlt: 'Convertra - Conversion Intelligence Platform',
  siteUrl: 'https://convertra.ai', // Update with actual domain
  twitterHandle: '@convertra', // Update with actual handle
};

/**
 * SEO Component - Manages meta tags, Open Graph, Twitter Cards, and JSON-LD
 *
 * Usage:
 * <SEO
 *   title="Page Title"
 *   description="Page description for search engines and AI systems"
 *   canonical="/page-path"
 * />
 */
function SEO({
  title,
  description = DEFAULTS.description,
  keywords = DEFAULTS.keywords,
  canonical,
  ogType = 'website',
  ogImage = DEFAULTS.ogImage,
  ogImageAlt = DEFAULTS.ogImageAlt,
  twitterCard = 'summary_large_image',
  noindex = false,
  jsonLd,
}: SEOProps) {
  // Construct full title with brand
  const fullTitle = title
    ? `${title} | Convertra`
    : DEFAULTS.title;

  // Construct canonical URL
  const canonicalUrl = canonical
    ? `${DEFAULTS.siteUrl}${canonical}`
    : undefined;

  // Construct full image URL
  const fullImageUrl = ogImage.startsWith('http')
    ? ogImage
    : `${DEFAULTS.siteUrl}${ogImage}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={DEFAULTS.siteName} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:image:alt" content={ogImageAlt} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:site" content={DEFAULTS.twitterHandle} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />
      <meta name="twitter:image:alt" content={ogImageAlt} />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(jsonLd) ? jsonLd : jsonLd)}
        </script>
      )}
    </Helmet>
  );
}

export default SEO;

// ============================================
// Pre-built JSON-LD Schema Templates
// ============================================

/**
 * WebSite Schema - Helps with sitelinks in search results
 */
export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Convertra',
  alternateName: ['ConversionIQ', 'Conversion Intelligence'],
  url: 'https://convertra.ai',
  description: 'The #1 conversion intelligence platform for enterprise brands. Extract insights, generate winning ads, automatically.',
  publisher: {
    '@type': 'Organization',
    name: 'Convertra',
  },
};

/**
 * Organization Schema - Use on homepage/landing page
 */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Convertra',
  url: 'https://convertra.ai',
  logo: 'https://convertra.ai/convertra-logo.png',
  description: 'Convertra is the #1 conversion intelligence platform for enterprise brands. Our ConversionIQ™ technology extracts insights from ad data and automatically generates winning creatives.',
  foundingDate: '2024',
  sameAs: [
    // Add social profiles when available
    // 'https://twitter.com/convertra',
    // 'https://linkedin.com/company/convertra',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    email: 'hello@convertra.ai', // Update with actual email
  },
};

/**
 * SoftwareApplication Schema - For ConversionIQ™ product
 */
export const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ConversionIQ™',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'ConversionIQ™ is a proprietary conversion intelligence technology that extracts performance data from ad platforms, interprets conversion patterns using AI, and automatically generates high-converting ad creatives.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Enterprise pricing - Contact for custom quote',
    availability: 'https://schema.org/LimitedAvailability',
  },
  provider: {
    '@type': 'Organization',
    name: 'Convertra',
  },
  featureList: [
    'Multi-platform data extraction (Meta, Google, TikTok)',
    'AI-powered conversion pattern analysis',
    'Automated ad creative generation',
    'Continuous learning and optimization',
    'White-glove enterprise implementation',
  ],
};

/**
 * FAQPage Schema - GEO-optimized for AI citations
 * These questions are designed to be cited by AI systems
 */
export const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is conversion intelligence?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Conversion intelligence is a data-driven approach that goes beyond traditional analytics to understand WHY ads convert, not just what happened. It combines AI-powered pattern recognition with automated creative generation to continuously improve ad performance. Unlike standard dashboards that show metrics, conversion intelligence interprets the underlying signals that drive conversions and uses those insights to generate new high-performing creatives.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is ConversionIQ™?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ConversionIQ™ is Convertra\'s proprietary conversion intelligence technology. It operates on a four-step process: Extract (pull data from all ad platforms), Interpret (analyze patterns to understand why ads convert), Generate (automatically create new ads based on proven patterns), and Repeat (continuously learn and improve). ConversionIQ™ transforms weeks of manual creative testing into an automated, data-driven system.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does AI ad creative generation work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AI ad creative generation works by analyzing your historical ad performance data to identify the specific elements, messaging patterns, and visual components that drive conversions. The AI then uses these proven patterns to generate new ad creatives that are engineered to convert from day one. Unlike generic AI tools that use templates, ConversionIQ™ builds ads from YOUR data, YOUR customers, and YOUR conversion patterns.',
      },
    },
    {
      '@type': 'Question',
      name: 'What ROI can enterprise brands expect from conversion intelligence?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Enterprise brands using conversion intelligence platforms like Convertra typically see 40-60% reduction in cost per acquisition (CPA), 2-4x improvement in ROAS, and 70-80% reduction in creative waste from failed ad tests. The compounding effect of continuous learning means results accelerate over time rather than plateau. Most importantly, brands save hundreds of thousands in headcount by replacing the need for additional media buyers, analysts, and creative strategists.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is Convertra different from other AI ad tools?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Convertra is not a self-serve tool or generic AI platform. It\'s a fully managed conversion intelligence system with bespoke implementation for each client. Key differences: (1) Custom configuration based on YOUR conversion patterns, not industry benchmarks, (2) White-glove management by a dedicated team, (3) Continuous optimization without client overhead, (4) Enterprise-only focus ensuring premium service quality. Every implementation is unique because every business is unique.',
      },
    },
    {
      '@type': 'Question',
      name: 'Who is Convertra designed for?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Convertra is designed for established enterprise brands spending six to eight figures annually on paid media—typically $1M or more per year. Our clients are CMOs, VPs of Marketing, and media buyers at companies who understand that a 10% efficiency gain represents millions in recovered revenue. We work with brands who have tried agencies, AI tools, and in-house teams, and are ready for a solution that actually explains WHY their ads convert.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is ad creative fatigue and how does Convertra solve it?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ad creative fatigue occurs when your target audience sees the same ads repeatedly, causing declining engagement, rising CPAs, and wasted ad spend. Convertra solves this by continuously generating fresh, high-performing creatives based on your proven conversion patterns. Instead of manually creating and testing dozens of ad variants, ConversionIQ™ automatically produces new creatives that are engineered to convert—eliminating the creative fatigue cycle entirely.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does it take to implement Convertra?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Convertra implementation typically takes 2-4 weeks depending on the complexity of your ad account structure and the number of platforms being integrated. This includes data extraction setup, initial pattern analysis, custom model configuration, and the first round of AI-generated creatives. Unlike self-serve tools, our team handles the entire implementation—you don\'t need to learn new software or dedicate internal resources.',
      },
    },
    {
      '@type': 'Question',
      name: 'What ad platforms does Convertra integrate with?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Convertra integrates with all major advertising platforms including Meta (Facebook and Instagram), Google Ads, TikTok, LinkedIn, Pinterest, and programmatic DSPs. ConversionIQ™ unifies data from multiple platforms into a single intelligence layer, allowing you to identify cross-platform conversion patterns that would be impossible to see in siloed dashboards.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between ROAS and conversion intelligence?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ROAS (Return on Ad Spend) is a metric that tells you WHAT happened—how much revenue you generated per dollar spent. Conversion intelligence goes deeper to explain WHY it happened—which creative elements, messaging patterns, audience segments, and timing factors drove those conversions. While ROAS helps you measure performance, conversion intelligence helps you replicate and scale success by understanding the underlying patterns.',
      },
    },
  ],
};

/**
 * Agency FAQPage Schema - GEO-optimized for AI citations (agency audience)
 */
export const agencyFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does Convertra work for agencies?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Convertra connects to each of your client ad accounts and uses ConversionIQ™ to analyze each client\'s unique conversion patterns. It then autonomously generates high-converting ad creatives — copy, images, and targeting — tailored to each client\'s audience. Agencies can launch ads across every client account in under 3 minutes per account, dramatically increasing creative output without increasing headcount.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can ConversionIQ™ manage multiple client ad accounts?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. ConversionIQ™ is built for multi-client operations. Each client account gets its own conversion intelligence layer that learns from that specific client\'s ad performance data. Agencies can switch between accounts instantly, generate creatives per client, and manage their entire portfolio from one platform. There is no limit to the number of client accounts you can connect.',
      },
    },
    {
      '@type': 'Question',
      name: 'How fast can agencies launch ads with ConversionIQ™?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Agencies can go from zero to published high-converting ads in under 3 minutes per client account. ConversionIQ™ handles the full workflow: analyzing the client\'s conversion data, generating ad copy and images based on proven patterns, configuring targeting and budget, and publishing the campaign — all from a single platform. This replaces the traditional process of briefing designers, waiting days for creative delivery, and going through multiple revision cycles.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the ROI for agencies using Convertra?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Agencies using Convertra typically see 4x increase in accounts managed per operator, 47% reduction in client CPA, and significant reduction in creative production overhead. By increasing the number of accounts each team member can effectively manage, agencies improve their margin per client while delivering better results. The platform pays for itself by reducing the need for additional media buyers and designers as your client base grows.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Convertra help agencies retain clients?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Client churn in agencies is often driven by slow creative turnaround and declining ad performance. Convertra solves both problems: ConversionIQ™ launches fresh creatives in minutes instead of days, and automatically detects creative fatigue before performance drops. Agencies can show clients measurable improvements from day one and maintain consistent creative velocity that keeps ad performance strong over time.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do agencies need technical expertise to use Convertra?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Convertra includes white-glove implementation where our team configures the platform for your agency\'s workflow and client portfolio. The platform is designed so that any team member can generate and launch high-converting ads without needing design skills, copywriting expertise, or deep media buying experience. ConversionIQ™ handles the intelligence — your team handles the strategy.',
      },
    },
  ],
};

/**
 * WebPage Schema - Generic page schema
 */
export const createWebPageSchema = (name: string, description: string, url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name,
  description,
  url,
  isPartOf: {
    '@type': 'WebSite',
    name: 'Convertra',
    url: 'https://convertra.ai',
  },
  provider: {
    '@type': 'Organization',
    name: 'Convertra',
  },
});

/**
 * BreadcrumbList Schema
 */
export const createBreadcrumbSchema = (items: Array<{ name: string; url: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});
