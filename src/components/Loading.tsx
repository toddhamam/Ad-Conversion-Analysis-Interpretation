import './Loading.css';

interface LoadingProps {
  fullScreen?: boolean;
  size?: 'small' | 'medium' | 'large';
  message?: string;
}

const Loading = ({ fullScreen = false, size = 'medium', message }: LoadingProps) => {
  const sizeMap = {
    small: 32,
    medium: 56,
    large: 80,
  };

  const iconSize = sizeMap[size];

  return (
    <div className={`loading-container ${fullScreen ? 'loading-fullscreen' : ''}`}>
      <div className="loading-content">
        <div className="loading-icon-wrapper" style={{ width: iconSize, height: iconSize }}>
          <svg viewBox="0 0 64 64" className="loading-icon">
            <defs>
              <linearGradient id="loading-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d4e157"/>
                <stop offset="40%" stopColor="#c0ca33"/>
                <stop offset="100%" stopColor="#a855f7"/>
              </linearGradient>
            </defs>
            {/* Left leg of V */}
            <path
              className="loading-path loading-path-1"
              d="M8 28 L22 48 L30 48 L16 28 Z"
              fill="#d4e157"
            />
            {/* Right leg going up to arrow */}
            <path
              className="loading-path loading-path-2"
              d="M22 48 L30 48 L54 14 L46 14 Z"
              fill="url(#loading-gradient)"
            />
            {/* Arrow head */}
            <path
              className="loading-path loading-path-3"
              d="M42 4 L58 4 L58 20 L52 14 L46 14 L42 10 Z"
              fill="#a855f7"
            />
          </svg>
          <div className="loading-pulse"></div>
        </div>
        {message && <p className="loading-message">{message}</p>}
      </div>
    </div>
  );
};

export default Loading;
