import { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, ImageIcon, X, Save, Download } from 'lucide-react';
import type { ProductMetadata } from '../services/metaApi';
import type { ProductContext } from '../services/openaiApi';
import { scopedKey } from '../lib/scopedStorage';
import { useAdAccount } from '../contexts/AdAccountContext';
import ImportProductsModal, { getAvailableProductImports } from './ImportProductsModal';
import './ProductConfigurator.css';

const PRODUCTS_STORAGE_KEY = 'convertra_products';
const MAX_IMAGES_PER_PRODUCT = 5;
const MAX_IMAGE_DIMENSION = 1024;

interface ProductConfiguratorProps {
  /** Product metadata (from Supabase or migration) */
  products: ProductMetadata[];
  /** Called with updated metadata array when products change */
  onProductsChange: (products: ProductMetadata[]) => void;
  /** Explicit ad account ID for localStorage scoping.
   *  When provided, reads/writes `convertra_products_{adAccountId}` directly
   *  instead of relying on the global scoped account (which may differ
   *  when configuring a non-active account). */
  adAccountId?: string;
}

/**
 * Build the localStorage key for product storage.
 * If an explicit adAccountId is provided, scope to that account.
 * Otherwise, fall back to the global scoped key.
 */
function getProductsKey(adAccountId?: string): string {
  if (adAccountId) return `${PRODUCTS_STORAGE_KEY}_${adAccountId}`;
  return scopedKey(PRODUCTS_STORAGE_KEY);
}

/** Load full ProductContext[] (with images) from localStorage */
function loadLocalProducts(adAccountId?: string): ProductContext[] {
  try {
    const stored = localStorage.getItem(getProductsKey(adAccountId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/** Save full ProductContext[] (with images) to localStorage */
function saveLocalProducts(products: ProductContext[], adAccountId?: string): boolean {
  try {
    localStorage.setItem(getProductsKey(adAccountId), JSON.stringify(products));
    return true;
  } catch {
    return false;
  }
}

/** Extract metadata-only subset from a full ProductContext */
function toMetadata(p: ProductContext): ProductMetadata {
  return {
    id: p.id,
    name: p.name,
    author: p.author,
    description: p.description,
    landingPageUrl: p.landingPageUrl,
    createdAt: p.createdAt,
  };
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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl.split(',')[1]);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export default function ProductConfigurator({ products, onProductsChange, adAccountId }: ProductConfiguratorProps) {
  const { accounts, isMultiAccount } = useAdAccount();
  const [editingProduct, setEditingProduct] = useState<ProductContext | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canImport = isMultiAccount && accounts.length > 1;

  /** Merge metadata with localStorage images to get a full ProductContext for editing */
  const hydrateForEdit = (meta: ProductMetadata): ProductContext => {
    const localProducts = loadLocalProducts(adAccountId);
    const local = localProducts.find(p => p.id === meta.id);
    return {
      ...meta,
      productImages: local?.productImages || [],
    };
  };

  /** Persist changes to both localStorage (full) and parent (metadata-only) */
  const persistChanges = (updatedFull: ProductContext[]) => {
    // Write full array (with images) to localStorage
    const saved = saveLocalProducts(updatedFull, adAccountId);
    if (!saved) {
      setSaveError('Storage limit exceeded. Try removing some product images.');
      return false;
    }
    // Notify parent with metadata-only array (for Supabase save)
    onProductsChange(updatedFull.map(toMetadata));
    return true;
  };

  /** Get the current full product list by merging metadata with localStorage images */
  const getFullProducts = (): ProductContext[] => {
    const localProducts = loadLocalProducts(adAccountId);
    return products.map(meta => {
      const local = localProducts.find(p => p.id === meta.id);
      return {
        ...meta,
        productImages: local?.productImages || [],
      };
    });
  };

  const handleImportProducts = (importedProducts: ProductContext[]): boolean => {
    const currentFull = getFullProducts();
    const merged = [...currentFull, ...importedProducts];
    return persistChanges(merged);
  };

  const handleAddNew = () => {
    setSaveError(null);
    setEditingProduct(createEmptyProduct());
    setIsAdding(true);
  };

  const handleEdit = (meta: ProductMetadata) => {
    setSaveError(null);
    setEditingProduct(hydrateForEdit(meta));
    setIsAdding(false);
  };

  const handleCancel = () => {
    setEditingProduct(null);
    setIsAdding(false);
    setSaveError(null);
  };

  const handleSave = () => {
    if (!editingProduct || !editingProduct.name.trim() || !editingProduct.author.trim()) return;
    setSaveError(null);

    const currentFull = getFullProducts();
    const updatedFull = currentFull.some(p => p.id === editingProduct.id)
      ? currentFull.map(p => p.id === editingProduct.id ? editingProduct : p)
      : [...currentFull, editingProduct];

    if (persistChanges(updatedFull)) {
      setEditingProduct(null);
      setIsAdding(false);
    }
  };

  const handleDelete = (id: string) => {
    const currentFull = getFullProducts();
    const updatedFull = currentFull.filter(p => p.id !== id);
    persistChanges(updatedFull);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingProduct || !event.target.files) return;
    const files = Array.from(event.target.files);
    const remaining = MAX_IMAGES_PER_PRODUCT - editingProduct.productImages.length;
    const toProcess = files.slice(0, remaining);

    const newImages: ProductContext['productImages'] = [];
    for (const file of toProcess) {
      const base64 = await fileToBase64(file);
      newImages.push({ base64Data: base64, mimeType: 'image/jpeg', fileName: file.name });
    }

    setEditingProduct({
      ...editingProduct,
      productImages: [...editingProduct.productImages, ...newImages],
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    if (!editingProduct) return;
    setEditingProduct({
      ...editingProduct,
      productImages: editingProduct.productImages.filter((_, i) => i !== index),
    });
  };

  const canSave = editingProduct && editingProduct.name.trim() && editingProduct.author.trim();

  // Count images from localStorage for display
  const getImageCount = (productId: string): number => {
    const localProducts = loadLocalProducts(adAccountId);
    const local = localProducts.find(p => p.id === productId);
    return local?.productImages?.length || 0;
  };

  return (
    <div className="product-configurator">
      {saveError && (
        <div className="pc-error">
          <span>{saveError}</span>
          <button className="pc-error-dismiss" onClick={() => setSaveError(null)}>
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Editing / Adding form */}
      {editingProduct && (
        <div className="pc-form">
          <div className="pc-form-header">
            <span className="pc-form-title">{isAdding ? 'Add Product' : 'Edit Product'}</span>
            <button className="pc-form-close" onClick={handleCancel}>
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="pc-form-fields">
            <div className="pc-form-row">
              <div className="pc-form-field">
                <label className="pc-label">Name *</label>
                <input
                  type="text"
                  className="pc-input"
                  placeholder="e.g., Inner Wealth Strategy Call"
                  value={editingProduct.name}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                />
              </div>
              <div className="pc-form-field">
                <label className="pc-label">Author / Brand *</label>
                <input
                  type="text"
                  className="pc-input"
                  placeholder="e.g., Inner Wealth Initiate"
                  value={editingProduct.author}
                  onChange={e => setEditingProduct({ ...editingProduct, author: e.target.value })}
                />
              </div>
            </div>

            <div className="pc-form-field">
              <label className="pc-label">Description</label>
              <textarea
                className="pc-textarea"
                placeholder="What is this product/offer? Who is it for?..."
                value={editingProduct.description}
                onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="pc-form-field">
              <label className="pc-label">Landing Page URL</label>
              <input
                type="url"
                className="pc-input"
                placeholder="https://..."
                value={editingProduct.landingPageUrl}
                onChange={e => setEditingProduct({ ...editingProduct, landingPageUrl: e.target.value })}
              />
            </div>

            <div className="pc-form-field">
              <label className="pc-label">
                Reference Images ({editingProduct.productImages.length}/{MAX_IMAGES_PER_PRODUCT})
              </label>

              {editingProduct.productImages.length > 0 && (
                <div className="pc-image-grid">
                  {editingProduct.productImages.map((img, index) => (
                    <div key={index} className="pc-image-thumb">
                      <img src={`data:${img.mimeType};base64,${img.base64Data}`} alt={img.fileName} />
                      <button className="pc-image-remove" onClick={() => handleRemoveImage(index)}>
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {editingProduct.productImages.length < MAX_IMAGES_PER_PRODUCT && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  <button className="pc-upload-btn" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon size={14} strokeWidth={1.5} />
                    Upload
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="pc-form-actions">
            <button className="pc-btn-cancel" onClick={handleCancel}>Cancel</button>
            <button className="pc-btn-save" onClick={handleSave} disabled={!canSave}>
              <Save size={13} strokeWidth={1.5} />
              {isAdding ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Product list */}
      {!editingProduct && products.length === 0 && (
        <div className="pc-empty">
          <span>No products configured</span>
          <div className="pc-empty-actions">
            <button className="pc-add-btn" onClick={handleAddNew}>
              <Plus size={14} strokeWidth={2} />
              Add Product
            </button>
            {canImport && (
              <button className="pc-import-btn" onClick={() => setShowImportModal(true)}>
                <Download size={14} strokeWidth={2} />
                Import from Account
              </button>
            )}
          </div>
        </div>
      )}

      {!editingProduct && products.length > 0 && (
        <div className="pc-list">
          {products.map(product => {
            const imgCount = getImageCount(product.id);
            return (
              <div key={product.id} className="pc-item">
                <div className="pc-item-info">
                  <span className="pc-item-name">{product.name}</span>
                  <span className="pc-item-meta">
                    by {product.author}
                    {imgCount > 0 && (
                      <span className="pc-item-images">
                        <ImageIcon size={11} strokeWidth={1.5} />
                        {imgCount}
                      </span>
                    )}
                  </span>
                </div>
                <div className="pc-item-actions">
                  <button className="pc-icon-btn pc-edit" onClick={() => handleEdit(product)} title="Edit">
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button className="pc-icon-btn pc-delete" onClick={() => handleDelete(product.id)} title="Delete">
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="pc-inline-actions">
            <button className="pc-add-btn pc-add-inline" onClick={handleAddNew}>
              <Plus size={14} strokeWidth={2} />
              Add Product
            </button>
            {canImport && (
              <button className="pc-import-btn pc-add-inline" onClick={() => setShowImportModal(true)}>
                <Download size={14} strokeWidth={2} />
                Import
              </button>
            )}
          </div>
        </div>
      )}

      {/* Import Products Modal */}
      {showImportModal && (
        <ImportProductsModal
          availableImports={getAvailableProductImports(accounts, adAccountId || null)}
          existingProductIds={new Set(products.map(p => `${p.name}::${p.author}`))}
          onImport={handleImportProducts}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}
