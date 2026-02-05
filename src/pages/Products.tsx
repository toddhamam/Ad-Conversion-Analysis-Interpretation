import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, ImageIcon, X, Save, ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ProductContext } from '../services/openaiApi';
import SEO from '../components/SEO';
import './Products.css';

const STORAGE_KEY = 'convertra_products';
const MAX_IMAGES_PER_PRODUCT = 5;
const MAX_IMAGE_DIMENSION = 1024; // Resize images to fit within this to stay under localStorage limits

function loadProducts(): ProductContext[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveProducts(products: ProductContext[]): { success: boolean; error?: string } {
  try {
    const json = JSON.stringify(products);
    const sizeKB = (json.length / 1024).toFixed(0);
    console.log(`[Products] Saving ${products.length} product(s) (${sizeKB}KB)`);
    localStorage.setItem(STORAGE_KEY, json);
    return { success: true };
  } catch (err) {
    console.error('[Products] Failed to save:', err);
    return {
      success: false,
      error: 'Storage limit exceeded. Try removing some product images or reducing image quality.',
    };
  }
}

function createEmptyProduct(): ProductContext {
  return {
    id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: '',
    author: '',
    description: '',
    landingPageUrl: '',
    productImages: [],
    createdAt: new Date().toISOString(),
  };
}

const Products = () => {
  const [products, setProducts] = useState<ProductContext[]>([]);
  const [editingProduct, setEditingProduct] = useState<ProductContext | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProducts(loadProducts());
  }, []);

  // Auto-dismiss success message
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  const handleSave = () => {
    if (!editingProduct || !editingProduct.name.trim() || !editingProduct.author.trim()) return;
    setSaveError(null);

    const updated = products.some(p => p.id === editingProduct.id)
      ? products.map(p => p.id === editingProduct.id ? editingProduct : p)
      : [...products, editingProduct];

    const result = saveProducts(updated);
    if (result.success) {
      setProducts(updated);
      setEditingProduct(null);
      setIsAdding(false);
      setSaveSuccess(true);
    } else {
      setSaveError(result.error || 'Failed to save product.');
    }
  };

  const handleDelete = (id: string) => {
    const updated = products.filter(p => p.id !== id);
    const result = saveProducts(updated);
    if (result.success) {
      setProducts(updated);
    }
  };

  const handleAddNew = () => {
    setEditingProduct(createEmptyProduct());
    setIsAdding(true);
  };

  const handleEdit = (product: ProductContext) => {
    setEditingProduct({ ...product, productImages: [...product.productImages] });
    setIsAdding(false);
  };

  const handleCancel = () => {
    setEditingProduct(null);
    setIsAdding(false);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingProduct || !event.target.files) return;

    const files = Array.from(event.target.files);
    const remaining = MAX_IMAGES_PER_PRODUCT - editingProduct.productImages.length;
    const toProcess = files.slice(0, remaining);

    const newImages: ProductContext['productImages'] = [];

    for (const file of toProcess) {
      const base64 = await fileToBase64(file);
      newImages.push({
        base64Data: base64,
        mimeType: 'image/jpeg', // Always JPEG after canvas resize
        fileName: file.name,
      });
    }

    setEditingProduct({
      ...editingProduct,
      productImages: [...editingProduct.productImages, ...newImages],
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    if (!editingProduct) return;
    const updated = editingProduct.productImages.filter((_, i) => i !== index);
    setEditingProduct({ ...editingProduct, productImages: updated });
  };

  const canSave = editingProduct && editingProduct.name.trim() && editingProduct.author.trim();

  return (
    <div className="page products-page">
      <SEO
        title="Products | Conversion Intelligence"
        description="Manage your product catalog for accurate ad generation."
        canonical="/products"
        noindex={true}
      />
      <Link to="/creatives" className="back-to-generator">
        <ArrowLeft size={16} strokeWidth={1.5} />
        Back to Ad Generator
      </Link>

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">Define your products for accurate ad copy and image generation</p>
        </div>
        {!editingProduct && (
          <button className="add-product-btn" onClick={handleAddNew}>
            <Plus size={18} strokeWidth={1.5} />
            Add Product
          </button>
        )}
      </div>

      {saveError && (
        <div className="product-save-error">
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span>{saveError}</span>
          <button className="dismiss-btn" onClick={() => setSaveError(null)}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="product-save-success">
          <CheckCircle size={16} strokeWidth={1.5} />
          <span>Product saved successfully</span>
        </div>
      )}

      {/* Product Form */}
      {editingProduct && (
        <section className="product-form-card">
          <div className="form-header">
            <h3 className="form-title">{isAdding ? 'Add Product' : 'Edit Product'}</h3>
            <button className="form-cancel-btn" onClick={handleCancel}>
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Product Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., The Resistance Protocol"
                value={editingProduct.name}
                onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Author / Brand *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Marcus Reid"
                value={editingProduct.author}
                onChange={e => setEditingProduct({ ...editingProduct, author: e.target.value })}
              />
            </div>

            <div className="form-field full-width">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                placeholder="1-2 sentences about what this product is and who it's for..."
                value={editingProduct.description}
                onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-field full-width">
              <label className="form-label">Landing Page URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://..."
                value={editingProduct.landingPageUrl}
                onChange={e => setEditingProduct({ ...editingProduct, landingPageUrl: e.target.value })}
              />
            </div>

            <div className="form-field full-width">
              <label className="form-label">
                Product Mockup Images ({editingProduct.productImages.length}/{MAX_IMAGES_PER_PRODUCT})
              </label>
              <p className="form-hint">Upload product images so the AI can reference them when generating ad visuals</p>

              {editingProduct.productImages.length > 0 && (
                <div className="mockup-preview-grid">
                  {editingProduct.productImages.map((img, index) => (
                    <div key={index} className="mockup-preview">
                      <img
                        src={`data:${img.mimeType};base64,${img.base64Data}`}
                        alt={img.fileName}
                      />
                      <button
                        className="mockup-remove-btn"
                        onClick={() => handleRemoveImage(index)}
                        title="Remove image"
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {editingProduct.productImages.length < MAX_IMAGES_PER_PRODUCT && (
                <div className="mockup-upload-area">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon size={18} strokeWidth={1.5} />
                    Upload Images
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="form-cancel-action" onClick={handleCancel}>Cancel</button>
            <button
              className="form-save-btn"
              onClick={handleSave}
              disabled={!canSave}
            >
              <Save size={16} strokeWidth={1.5} />
              {isAdding ? 'Add Product' : 'Save Changes'}
            </button>
          </div>
        </section>
      )}

      {/* Product List */}
      {products.length === 0 && !editingProduct ? (
        <div className="products-empty">
          <div className="empty-icon">📦</div>
          <h3>No products defined</h3>
          <p>Add your first product so the AI can reference the correct product name, author, and mockups when generating ads.</p>
          <button className="add-product-btn" onClick={handleAddNew}>
            <Plus size={18} strokeWidth={1.5} />
            Add Your First Product
          </button>
        </div>
      ) : (
        <div className="products-list">
          {products.map(product => (
            <div key={product.id} className="product-card">
              <div className="product-card-left">
                {product.productImages.length > 0 ? (
                  <div className="product-thumb">
                    <img
                      src={`data:${product.productImages[0].mimeType};base64,${product.productImages[0].base64Data}`}
                      alt={product.name}
                    />
                  </div>
                ) : (
                  <div className="product-icon">📦</div>
                )}
                <div className="product-content">
                  <h3 className="product-name">{product.name}</h3>
                  <p className="product-author">by {product.author}</p>
                  {product.description && (
                    <p className="product-description">{product.description}</p>
                  )}
                  {product.productImages.length > 0 && (
                    <span className="product-image-count">
                      <ImageIcon size={12} strokeWidth={1.5} />
                      {product.productImages.length} mockup{product.productImages.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="product-actions">
                <button
                  className="product-action-btn edit-btn"
                  onClick={() => handleEdit(product)}
                  title="Edit product"
                >
                  <Pencil size={16} strokeWidth={1.5} />
                </button>
                <button
                  className="product-action-btn delete-btn"
                  onClick={() => handleDelete(product.id)}
                  title="Delete product"
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Resize if either dimension exceeds the max
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Failed to create canvas context')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      // Use JPEG at 0.8 quality for smaller file size
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export default Products;
