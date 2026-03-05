import { useState, useRef, useEffect, memo } from 'react';
import type { GeneratedAdPackage } from '../services/openaiApi';
import { Image, Video, Type, AlertTriangle, Clock, Lightbulb, Timer, Ruler, Download, Loader, RefreshCw } from 'lucide-react';
import './GeneratedAdCard.css';

interface GeneratedAdCardProps {
  ad: GeneratedAdPackage;
  onRegenerateImage?: (adId: string, imageIndex: number) => Promise<void>;
  onRegenerateAllImages?: (adId: string) => Promise<void>;
  onRegenerateVideo?: (adId: string, videoIndex: number) => Promise<void>;
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

// Memoized to prevent all cards re-rendering when one ad changes in the parent array.
// Each card holds potentially large base64 images, so unnecessary re-renders are expensive.
const GeneratedAdCard = memo(function GeneratedAdCard({ ad, onRegenerateImage, onRegenerateAllImages, onRegenerateVideo }: GeneratedAdCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [downloadingImage, setDownloadingImage] = useState<number | null>(null);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState<number | null>(null);
  const [regeneratingAllImages, setRegeneratingAllImages] = useState(false);
  const [regeneratingVideo, setRegeneratingVideo] = useState<number | null>(null);
  const [videoLoadErrors, setVideoLoadErrors] = useState<Set<number>>(new Set());
  // CRITICAL: Default to false to prevent Chrome crashes from rendering many large base64 images
  // Users can expand to see images - this prevents memory exhaustion on page load
  const [showImages, setShowImages] = useState(false);

  // Track latest video blob URLs via ref so unmount cleanup revokes current URLs,
  // not stale ones captured at mount time (cards are keyed by ad.id, props update without remount)
  const videoBlobUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    videoBlobUrlsRef.current = (ad.videos || [])
      .map(v => v.videoUrl)
      .filter((url): url is string => !!url && url.startsWith('blob:'));
  }, [ad.videos]);

  useEffect(() => {
    return () => {
      videoBlobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleRegenerateImage = async (index: number) => {
    if (!onRegenerateImage || regeneratingImage !== null || regeneratingAllImages) return;

    setRegeneratingImage(index);
    try {
      await onRegenerateImage(ad.id, index);
    } catch (err) {
      console.error('Failed to regenerate image:', err);
    } finally {
      setRegeneratingImage(null);
    }
  };

  const handleRegenerateAllImages = async () => {
    if (!onRegenerateAllImages || regeneratingAllImages || regeneratingImage !== null) return;

    setRegeneratingAllImages(true);
    setShowImages(true);
    try {
      await onRegenerateAllImages(ad.id);
    } catch (err) {
      console.error('Failed to regenerate all images:', err);
    } finally {
      setRegeneratingAllImages(false);
    }
  };

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

  const handleDownloadVideo = async (videoUrl: string, videoIndex: number) => {
    setDownloadingVideo(true);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ad_${ad.id}_video_${videoIndex + 1}.mp4`;
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

  const handleRegenerateVideo = async (videoIndex: number) => {
    if (!onRegenerateVideo) return;
    // Capture old URL but don't revoke yet — preserve preview if regeneration fails
    const oldUrl = ad.videos?.[videoIndex]?.videoUrl;
    setRegeneratingVideo(videoIndex);
    try {
      await onRegenerateVideo(ad.id, videoIndex);
      // Revoke old blob URL only after successful replacement
      if (oldUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl);
      }
      // Clear any previous load error for this index
      setVideoLoadErrors(prev => {
        const next = new Set(prev);
        next.delete(videoIndex);
        return next;
      });
    } catch (err) {
      console.error('Failed to regenerate video:', err);
    } finally {
      setRegeneratingVideo(null);
    }
  };

  const handleVideoLoadError = (videoIndex: number) => {
    setVideoLoadErrors(prev => new Set(prev).add(videoIndex));
  };

  const imageCount = ad.images?.length || 0;

  return (
    <div className="generated-ad-card">
      {/* Header */}
      <div className="ad-card-header">
        <div className="ad-card-meta">
          <span className="ad-type-badge">
            {ad.adType === 'text' ? <><Type size={14} strokeWidth={1.5} /> Text Ad</> : ad.adType === 'image' ? <><Image size={14} strokeWidth={1.5} /> Image Ad</> : <><Video size={14} strokeWidth={1.5} /> Video Ad</>}
          </span>
          <span className="audience-badge">{getAudienceLabel(ad.audienceType)}</span>
        </div>
        <span className="ad-timestamp">{formatDate(ad.generatedAt)}</span>
      </div>

      {/* Image Error Message */}
      {(ad.adType === 'image' || ad.adType === 'text') && ad.imageError && (
        <div className="image-error-banner">
          <div className="error-content">
            <span className="error-icon"><AlertTriangle size={16} strokeWidth={1.5} /></span>
            <span className="error-message">{ad.imageError}</span>
          </div>
          {onRegenerateAllImages && imageCount === 0 && (
            <button
              className="action-btn regenerate-btn retry-all-btn"
              onClick={handleRegenerateAllImages}
              disabled={regeneratingAllImages}
            >
              {regeneratingAllImages ? (
                <Loader size={14} strokeWidth={1.5} className="spinning" />
              ) : (
                <RefreshCw size={14} strokeWidth={1.5} />
              )}
              {regeneratingAllImages ? 'Regenerating...' : 'Retry All Images'}
            </button>
          )}
        </div>
      )}

      {/* Video Error Message */}
      {ad.adType === 'video' && ad.videoError && (
        <div className="video-error-banner">
          <span className="error-icon"><AlertTriangle size={16} strokeWidth={1.5} /></span>
          <span className="error-message">{ad.videoError}</span>
        </div>
      )}

      {/* Generated Video(s) */}
      {ad.adType === 'video' && (() => {
        const allVideos = ad.videos || (ad.video ? [ad.video] : []);
        if (allVideos.length === 0) return null;
        return (
          <div className="ad-video-section">
            <h4 className="section-label">Generated Video{allVideos.length > 1 ? `s (${allVideos.length})` : ''}</h4>
            {allVideos.map((video, vidIdx) => {
              const hasExpiredBlob = video.videoUrl.startsWith('blob:') && videoLoadErrors.has(vidIdx);
              const hasNoUrl = !video.videoUrl;
              return (
                <div key={vidIdx} className="video-card">
                  {regeneratingVideo === vidIdx && (
                    <div className="regenerating-overlay">
                      <Loader size={32} strokeWidth={1.5} className="spinning" />
                      <span>Regenerating...</span>
                    </div>
                  )}
                  <div className="video-container">
                    {hasExpiredBlob || hasNoUrl ? (
                      <div className="video-expired">
                        <AlertTriangle size={24} strokeWidth={1.5} />
                        <p>Video preview expired</p>
                        <p className="video-expired-hint">Regenerate to view (blob URLs expire on page refresh)</p>
                        {onRegenerateVideo && (
                          <button
                            className="action-btn regenerate-btn"
                            onClick={() => handleRegenerateVideo(vidIdx)}
                            disabled={regeneratingVideo !== null}
                          >
                            <RefreshCw size={14} strokeWidth={1.5} /> Regenerate
                          </button>
                        )}
                      </div>
                    ) : (
                      <video
                        src={video.videoUrl}
                        controls
                        preload="metadata"
                        playsInline
                        onError={() => handleVideoLoadError(vidIdx)}
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>
                  <div className="video-info">
                    <div className="video-meta">
                      <span className="video-duration"><Timer size={14} strokeWidth={1.5} /> {video.duration}</span>
                      <span className="video-aspect"><Ruler size={14} strokeWidth={1.5} /> {video.aspectRatio}</span>
                      {video.resolution && <span className="video-badge">{video.resolution}</span>}
                    </div>
                    <div className="video-actions">
                      {!hasExpiredBlob && !hasNoUrl && (
                        <button
                          className="action-btn download-btn"
                          onClick={() => handleDownloadVideo(video.videoUrl, vidIdx)}
                          disabled={downloadingVideo}
                        >
                          {downloadingVideo ? <Loader size={14} strokeWidth={1.5} className="spinning" /> : <Download size={14} strokeWidth={1.5} />} Download
                        </button>
                      )}
                      {onRegenerateVideo && (
                        <button
                          className="action-btn regenerate-btn"
                          onClick={() => handleRegenerateVideo(vidIdx)}
                          disabled={regeneratingVideo !== null}
                        >
                          <RefreshCw size={14} strokeWidth={1.5} /> Regenerate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Image Ads - with lazy loading toggle */}
      {(ad.adType === 'image' || ad.adType === 'text') && imageCount > 0 && (
        <div className="ad-images-section">
          <div className="images-section-header">
            <h4 className="section-label">Generated Images ({imageCount})</h4>
            <div className="images-section-actions">
              {onRegenerateAllImages && (
                <button
                  className="action-btn regenerate-btn regenerate-all-btn"
                  onClick={handleRegenerateAllImages}
                  disabled={regeneratingAllImages || regeneratingImage !== null}
                  title="Regenerate all images with fresh creatives"
                >
                  {regeneratingAllImages ? (
                    <Loader size={14} strokeWidth={1.5} className="spinning" />
                  ) : (
                    <RefreshCw size={14} strokeWidth={1.5} />
                  )}
                  {regeneratingAllImages ? 'Regenerating...' : 'Regenerate All'}
                </button>
              )}
              <button
                className="toggle-images-btn"
                onClick={() => setShowImages(!showImages)}
              >
                {showImages ? '🔼 Hide Images' : '🔽 Show Images'}
              </button>
            </div>
          </div>

          {showImages && (
            <div className="images-grid-wrapper">
              {regeneratingAllImages && (
                <div className="regenerating-all-overlay">
                  <Loader size={36} strokeWidth={1.5} className="spinning" />
                  <span>Regenerating all images...</span>
                </div>
              )}
              <div className={`images-grid${regeneratingAllImages ? ' images-grid-dimmed' : ''}`}>
                {ad.images!.map((image, index) => (
                  <div key={index} className="image-card">
                    <div className="image-container">
                      {regeneratingImage === index && (
                        <div className="regenerating-overlay">
                          <Loader size={32} strokeWidth={1.5} className="spinning" />
                          <span>Regenerating...</span>
                        </div>
                      )}
                      <LazyImage
                        src={image.imageUrl}
                        alt={`Generated ad ${index + 1}`}
                      />
                    </div>
                    <div className="image-actions">
                      {onRegenerateImage && (
                        <button
                          className="action-btn regenerate-btn"
                          onClick={() => handleRegenerateImage(index)}
                          disabled={regeneratingImage !== null || regeneratingAllImages}
                          title="Generate a new image for this variation"
                        >
                          {regeneratingImage === index ? (
                            <Loader size={14} strokeWidth={1.5} className="spinning" />
                          ) : (
                            <RefreshCw size={14} strokeWidth={1.5} />
                          )}
                          {regeneratingImage === index ? 'Regenerating...' : 'Regenerate'}
                        </button>
                      )}
                      <button
                        className="action-btn download-btn"
                        onClick={() => handleDownloadImage(image.imageUrl, index)}
                        disabled={downloadingImage === index || regeneratingAllImages}
                      >
                        {downloadingImage === index ? '⏳' : '📥'} Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
});

export default GeneratedAdCard;
