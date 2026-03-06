const DemoPoster: React.FC<{ width: number; height: number }> = () => {
  return (
    <div className="demo-poster">
      <div className="demo-poster-bg" />
      <div className="demo-poster-content">
        <p className="demo-poster-eyebrow">Live Product Demo</p>
        <h2 className="demo-poster-headline">
          See <span className="demo-poster-highlight">ConversionIQ™</span> In Action
        </h2>
        <p className="demo-poster-sub">
          From zero to published high-converting ads — in under 3 minutes
        </p>
        <div className="demo-poster-play">
          <div className="demo-poster-play-ring" />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <p className="demo-poster-play-label">Watch the Demo</p>
      </div>
    </div>
  );
};

export default DemoPoster;
