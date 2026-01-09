import { concepts } from '../data/mockData';
import './Concepts.css';

const Concepts = () => {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Concepts & Belief Frames</h1>
        <p className="page-subtitle">Explore the psychological frameworks driving conversions</p>
      </div>

      <div className="concepts-list">
        {concepts.map((concept) => (
          <div key={concept.id} className="concept-card">
            <div className="concept-icon">💡</div>
            <div className="concept-content">
              <div className="concept-header">
                <h3 className="concept-name">{concept.name}</h3>
                <div className="concept-stats">
                  <span>{concept.creativeCount} creatives</span>
                  <span className="stat-separator">•</span>
                  <span><strong>{concept.conversions.toLocaleString()}</strong> conversions</span>
                  <span className="concept-arrow">›</span>
                </div>
              </div>
              <p className="concept-description">{concept.description}</p>
              <p className="concept-quote">{concept.quote}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Concepts;
