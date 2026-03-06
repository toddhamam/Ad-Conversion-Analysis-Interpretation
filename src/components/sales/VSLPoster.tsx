const VSLPoster: React.FC<{ width: number; height: number }> = () => {
  return (
    <div className="vsl-poster">
      <div className="vsl-poster-bg" />
      <div className="vsl-poster-orb vsl-poster-orb-1" />
      <div className="vsl-poster-orb vsl-poster-orb-2" />
      <div className="vsl-poster-orb vsl-poster-orb-3" />
      <div className="vsl-poster-content">
        <p className="vsl-poster-eyebrow">Convertra Presents</p>
        <h2 className="vsl-poster-headline">
          Scale <span className="vsl-poster-highlight">Creative Testing</span>.
          <br />
          On <span className="vsl-poster-highlight-alt">Autopilot</span>.
        </h2>
        <p className="vsl-poster-sub">
          See how ConversionIQ™ launches, tests, and scales winning creatives autonomously
        </p>
        <div className="vsl-poster-play">
          <div className="vsl-poster-play-ring" />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <p className="vsl-poster-play-label">Watch the Full Demo</p>
      </div>
    </div>
  );
};

export default VSLPoster;
