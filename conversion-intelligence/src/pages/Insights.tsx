import { insights } from '../data/mockData';
import './Insights.css';

const Insights = () => {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Insights</h1>
        <p className="page-subtitle">Key learnings and interpretations from your converting creatives</p>
      </div>

      <div className="insights-list">
        {insights.map((insight) => (
          <div key={insight.id} className="insight-card">
            <div className="insight-header">
              <div className="insight-icon">💡</div>
              <div>
                <div className="insight-label">BELIEF RESOLVED</div>
                <h3 className="insight-belief">{insight.beliefResolved}</h3>
              </div>
            </div>

            <p className="insight-analysis">{insight.analysis}</p>

            <div className="insight-conditions">
              <div className="condition-box condition-works">
                <div className="condition-title">WHEN IT WORKS</div>
                <p className="condition-text">{insight.whenWorks}</p>
              </div>

              <div className="condition-box condition-fails">
                <div className="condition-title">WHEN IT FAILS</div>
                <p className="condition-text">{insight.whenFails}</p>
              </div>
            </div>

            {insight.linkedCreatives.length > 0 && (
              <div className="insight-footer">
                <div className="linked-creatives-label">LINKED CREATIVES</div>
                <div className="linked-creatives">
                  {insight.linkedCreatives.map((creative, index) => (
                    <button key={index} className="linked-creative-button">
                      {creative} →
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Insights;
