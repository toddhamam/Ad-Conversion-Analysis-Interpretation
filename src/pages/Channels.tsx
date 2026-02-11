import { Link } from 'react-router-dom';
import { channels } from '../data/mockData';
import Badge from '../components/Badge';
import SEO from '../components/SEO';
import './Channels.css';

const Channels = () => {
  return (
    <div className="page">
      <SEO
        title="Channels"
        description="Explore conversion intelligence across all your advertising channels - Meta, Google, TikTok, and more."
        canonical="/channels"
        noindex={true}
      />
      <div className="page-header">
        <h1 className="page-title">Channels</h1>
        <p className="page-subtitle">Explore conversions by acquisition channel</p>
      </div>

      <div className="channel-grid">
        {channels.map((channel) => (
          <Link
            key={channel.id}
            to={channel.comingSoon ? '#' : `/channels/${channel.id}`}
            className={`channel-card ${channel.comingSoon ? 'disabled' : ''}`}
            onClick={(e) => channel.comingSoon && e.preventDefault()}
          >
            <div className="channel-card-header">
              <div>
                <h3 className="channel-name">
                  {channel.name}
                  {channel.comingSoon && (
                    <Badge variant="coming-soon">Coming Soon</Badge>
                  )}
                </h3>
                <p className="channel-description">{channel.description}</p>
              </div>
            </div>
            {!channel.comingSoon && <span className="channel-arrow">›</span>}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Channels;
