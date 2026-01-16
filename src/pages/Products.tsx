import { products } from '../data/mockData';
import Badge from '../components/Badge';
import './Products.css';

const Products = () => {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Products</h1>
        <p className="page-subtitle">View conversion performance by product</p>
      </div>

      <div className="products-list">
        {products.map((product) => (
          <div key={product.id} className="product-card">
            <div className="product-icon">📦</div>
            <div className="product-content">
              <h3 className="product-name">{product.name}</h3>
              {product.topHeadline && (
                <p className="product-headline">
                  Top headline: <span className="headline-text">{product.topHeadline}</span>
                </p>
              )}
            </div>
            <div className="product-stats">
              <Badge variant="tag">{product.type}</Badge>
              <div className="product-metrics">
                <div className="product-conversions">
                  <strong>{product.conversions.toLocaleString()}</strong>
                  <span className="metric-label">conversions</span>
                </div>
                <div className="product-revenue">
                  <strong>${product.revenue.toLocaleString()}</strong>
                  <span className="metric-label">revenue</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Products;
