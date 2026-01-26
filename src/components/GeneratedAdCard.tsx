import { useState, useRef, useEffect } from 'react';
import type { GeneratedAdPackage } from '../services/openaiApi';
import { Image, Video, AlertTriangle, Clock, Lightbulb, Timer, Ruler, Download, Loader } from 'lucide-react';
import './GeneratedAdCard.css';

interface GeneratedAdCardProps {
  ad: GeneratedAdPackage;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getAudienceLabel(type: string): string {
  const labels: Record<string, string> = {
    prospecting: 'Prospecting (Cold)',
    retargeting: 'Retargeting (Warm)',
    retention: 'Retention (Existing)',
  };
  return labels[type] || type;
}

// Lazy loading image component using IntersectionObserver
function LazyImage({ src, alt, onLoad }: { src: string; alt: string; onLoad?: () => void }) {
  const imgRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="lazy-image-wrapper">
      {!isVisible ? (
        <div className="image-placeholder">
          <span className="placeholder-icon"><Image size={24} strokeWidth={1.5} /></span>
          <span className="placeholder-text">Loading...</span>
        </div>
      ) : (
        <>
          {!isLoaded && (
            <div className="image-placeholder">
              <span className="placeholder-icon"><Clock size={24} strokeWidth={1.5} /></span>
              <span className="placeholder-text">Loading image...</span>
            </div>
          )}
          <img
            src={src}
            alt={alt}
            style={{ display: isLoaded ? 'block' : 'none' }}
            onLoad={() => {
              setIsLoaded(true);
              onLoad?.();
            }}
            onError={() => setIsLoaded(true)}
          />
        </>
      )}
    </div>
  );
}

export default function GeneratedAdCard({ ad }: GeneratedAdCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [downloadingImage, setDownloadingImage] = useState<number | null>(null);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  // Show images by default so users see their generated content immediately
  const [showImages, setShowImages] = useState(true);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownloadImage = async (imageUrl: string, index: number) => {
    setDownloadingImage(index);
    try {
      // For base64 images, create blob directly
      if (imageUrl.startsWith('data:')) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ad_${ad.id}_image_${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ad_${ad.id}_image_${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download image:', err);
    } finally {
      setDownloadingImage(null);
    }
  };

  const handleDownloadVideo = async (videoUrl: string) => {
    setDownloadingVideo(true);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ad_${ad.id}_video.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download video:', err);
    } finally {
      setDownloadingVideo(false);
    }
  };

  const imageCount = ad.images?.length || 0;

  return (
    <div className="generated-ad-card">
      {/* Header */}
      <div className="ad-card-header">
        <div className="ad-card-meta">
          <span className="ad-type-badge">
            {ad.adType === 'image' ? <><Image size={14} strokeWidth={1.5} /> Image Ad</> : <><Video size={14} strokeWidth={1.5} /> Video Ad</>}
          </span>
          <span className="audience-badge">{getAudienceLabel(ad.audienceType)}</span>
        </div>
        <span className="ad-timestamp">{formatDate(ad.generatedAt)}</span>
      </div>

      {/* Image Error Message */}
      {ad.adType === 'image' && ad.imageError && (
        <div className="image-error-banner">
          <span className="error-icon"><AlertTriangle size={16} strokeWidth={1.5} /></span>
          <span className="error-message">{ad.imageError}</span>
        </div>
      )}

      {/* Video Error Message */}
      {ad.adType === 'video' && ad.videoError && (
        <div className="video-error-banner">
          <span className="error-icon"><AlertTriangle size={16} strokeWidth={1.5} /></span>
          <span className="error-message">{ad.videoError}</span>
        </div>
      )}

      {/* Generated Video */}
      {ad.adType === 'video' && ad.video && (
        <div className="ad-video-section">
          <h4 className="section-label">Generated Video</h4>
          <div className="video-card">
            <div className="video-container">
              <video
                src={ad.video.videoUrl}
                controls
                preload="metadata"
                playsInline
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="video-info">
              <div className="video-meta">
                <span className="video-duration"><Timer size={14} strokeWidth={1.5} /> {ad.video.duration}</span>
                <span className="video-aspect"><Ruler size={14} strokeWidth={1.5} /> {ad.video.aspectRatio}</span>
              </div>
              <div className="video-actions">
                <button
                  className="action-btn download-btn"
                  onClick={() => handleDownloadVideo(ad.video!.videoUrl)}
                  disabled={downloadingVideo}
                >
                  {downloadingVideo ? <Loader size={14} strokeWidth={1.5} className="spinning" /> : <Download size={14} strokeWidth={1.5} />} Download Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Ads - with lazy loading toggle */}
      {ad.adType === 'image' && imageCount > 0 && (
        <div className="ad-images-section">
          <div className="images-section-header">
            <h4 className="section-label">Generated Images ({imageCount})</h4>
            <button
              className="toggle-images-btn"
              onClick={() => setShowImages(!showImages)}
            >
              {showImages ? '🔼 Hide Images' : '🔽 Show Images'}
            </button>
          </div>

          {showImages && (
            <div className="images-grid">
              {ad.images!.map((image, index) => (
                <div key={index} className="image-card">
                  <div className="image-container">
                    <LazyImage
                      src={image.imageUrl}
                      alt={`Generated ad ${index + 1}`}
                    />
                  </div>
                  <div className="image-actions">
                    <button
                      className="action-btn download-btn"
                      onClick={() => handleDownloadImage(image.imageUrl, index)}
                      disabled={downloadingImage === index}
                    >
                      {downloadingImage === index ? '⏳' : '📥'} Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Video Storyboard */}
      {ad.adType === 'video' && ad.storyboard && (
        <div className="storyboard-section">
          <h4 className="section-label">Video Storyboard</h4>
          <div className="storyboard-grid">
            {ad.storyboard.scenes.map((scene, index) => (
              <div key={index} className="scene-card">
                <div className="scene-header">
                  <span className="scene-number">Scene {scene.sceneNumber}</span>
                  <span className="scene-duration">{scene.duration}</span>
                </div>
                <div className="scene-content">
                  <div className="scene-row">
                    <span className="scene-label">Visual:</span>
                    <p className="scene-text">{scene.visualDescription}</p>
                  </div>
                  <div className="scene-row">
                    <span className="scene-label">Text:</span>
                    <p className="scene-text text-overlay">{scene.textOverlay || '(none)'}</p>
                  </div>
                  <div className="scene-row">
                    <span className="scene-label">Audio:</span>
                    <p className="scene-text">{scene.voiceover || '(none)'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="storyboard-summary">
            <span className="summary-label">Concept Summary:</span>
            <p>{ad.storyboard.conceptSummary}</p>
          </div>
        </div>
      )}

      {/* Copy Section */}
      <div className="ad-copy-section">
        <div className="copy-column">
          <h4 className="section-label">Headlines</h4>
          <ul className="copy-list">
            {ad.copy.headlines.map((headline, index) => (
              <li key={index} className="copy-item">
                <span className="copy-text">{headline}</span>
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(headline, `headline-${index}`)}
                >
                  {copiedField === `headline-${index}` ? '✓' : '📋'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="copy-column">
          <h4 className="section-label">Body Copy</h4>
          <ul className="copy-list">
            {ad.copy.bodyTexts.map((body, index) => (
              <li key={index} className="copy-item body-copy">
                <span className="copy-text">{body}</span>
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(body, `body-${index}`)}
                >
                  {copiedField === `body-${index}` ? '✓' : '📋'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="copy-column">
          <h4 className="section-label">CTAs</h4>
          <div className="cta-tags">
            {ad.copy.callToActions.map((cta, index) => (
              <button
                key={index}
                className="cta-tag"
                onClick={() => handleCopy(cta, `cta-${index}`)}
              >
                {cta}
                {copiedField === `cta-${index}` && <span className="copied-indicator">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Why It Works */}
      <div className="why-it-works">
        <h4 className="section-label"><Lightbulb size={16} strokeWidth={1.5} /> Why This Should Work</h4>
        <p>{ad.whyItWorks}</p>
      </div>
    </div>
  );
}
