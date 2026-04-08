import { useState } from 'react';
import type { ProductContext } from '../services/openaiApi';
import type { AdAccountInfo } from '../services/metaApi';
import './ImportProductsModal.css';

interface AvailableProductImport {
  account: AdAccountInfo;
  products: ProductContext[];
}

interface ImportProductsModalProps {
  availableImports: AvailableProductImport[];
  existingProductIds: Set<string>;
  onImport: (products: ProductContext[]) => boolean;
  onClose: () => void;
}

const PRODUCTS_STORAGE_KEY = 'convertra_products';

/**
 * Scan other activated accounts for products.
 * Merges localStorage (full ProductContext with images) with Supabase metadata
 * (account.products) so that products added from other sessions/browsers are
 * always visible, while localStorage entries retain their images.
 */
export function getAvailableProductImports(
  accounts: AdAccountInfo[],
  currentAccountId: string | null,
): AvailableProductImport[] {
  const results: AvailableProductImport[] = [];

  for (const account of accounts) {
    if (account.ad_account_id === currentAccountId) continue;

    // Load localStorage products (full data with images)
    let localProducts: ProductContext[] = [];
    const key = `${PRODUCTS_STORAGE_KEY}_${account.ad_account_id}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as ProductContext[];
        if (Array.isArray(parsed)) localProducts = parsed;
      }
    } catch {
      // Corrupted localStorage — proceed with Supabase only
    }

    // Load Supabase metadata (authoritative, no images)
    const supabaseProducts = account.products || [];

    // Merge: use localStorage entries (have images) where they exist,
    // then add any Supabase-only products (added from other sessions/browsers)
    const localIds = new Set(localProducts.map(p => p.id));
    const merged: ProductContext[] = [...localProducts];
    for (const meta of supabaseProducts) {
      if (!localIds.has(meta.id)) {
        merged.push({ ...meta, productImages: [] });
      }
    }

    if (merged.length > 0) {
      results.push({ account, products: merged });
    }
  }

  return results;
}

export default function ImportProductsModal({
  availableImports,
  existingProductIds,
  onImport,
  onClose,
}: ImportProductsModalProps) {
  const [selectedProducts, setSelectedProducts] = useState<Map<string, ProductContext>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  function toggleProduct(product: ProductContext) {
    setSelectedProducts(prev => {
      const next = new Map(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, product);
      }
      return next;
    });
  }

  function selectAllFromAccount(products: ProductContext[]) {
    const importable = products.filter(p => !isAlreadyImported(p));
    setSelectedProducts(prev => {
      const next = new Map(prev);
      const allSelected = importable.every(p => next.has(p.id));
      if (allSelected) {
        importable.forEach(p => next.delete(p.id));
      } else {
        importable.forEach(p => next.set(p.id, p));
      }
      return next;
    });
  }

  function handleImport() {
    setError(null);
    const productsToImport = Array.from(selectedProducts.values()).map(p => ({
      ...p,
      // Regenerate ID to avoid collisions with existing products
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
    }));

    const success = onImport(productsToImport);
    if (success) {
      setImported(true);
      setTimeout(onClose, 600);
    } else {
      setError('Import failed — try clearing old generated ads to free up storage.');
    }
  }

  function isAlreadyImported(product: ProductContext): boolean {
    // Check by name+author match since IDs will differ across accounts
    return existingProductIds.has(`${product.name}::${product.author}`);
  }

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-products-modal" onClick={e => e.stopPropagation()}>
        <button className="import-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="import-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>

        <h2 className="import-modal-title">Import Products</h2>
        <p className="import-modal-desc">
          Select products from other ad accounts to import into this account.
        </p>

        {error && (
          <div className="import-modal-error">
            <span className="import-error-icon">!</span>
            {error}
          </div>
        )}

        {availableImports.length === 0 ? (
          <div className="import-modal-empty">
            <p>No products available to import.</p>
            <p className="import-empty-hint">
              Add products to another ad account first, then come back to import them here.
            </p>
          </div>
        ) : (
          <>
            <div className="import-products-list">
              {availableImports.map(({ account, products }) => (
                <div key={account.ad_account_id} className="import-account-group">
                  <div className="import-account-header">
                    <span className="import-account-label">
                      {account.ad_account_name || account.ad_account_id}
                    </span>
                    <button
                      className="import-select-all"
                      onClick={() => selectAllFromAccount(products)}
                    >
                      {products.every(p => selectedProducts.has(p.id)) ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {products.map(product => {
                    const alreadyExists = isAlreadyImported(product);
                    const isSelected = selectedProducts.has(product.id);
                    return (
                      <label
                        key={product.id}
                        className={`import-product-row ${isSelected ? 'selected' : ''} ${alreadyExists ? 'exists' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProduct(product)}
                          disabled={alreadyExists}
                        />
                        <div className="import-product-info">
                          {product.productImages.length > 0 ? (
                            <div className="import-product-thumb">
                              <img
                                src={`data:${product.productImages[0].mimeType};base64,${product.productImages[0].base64Data}`}
                                alt={product.name}
                              />
                            </div>
                          ) : (
                            <div className="import-product-icon">📦</div>
                          )}
                          <div className="import-product-details">
                            <span className="import-product-name">{product.name}</span>
                            <span className="import-product-author">by {product.author}</span>
                            {product.productImages.length > 0 && (
                              <span className="import-product-images">
                                {product.productImages.length} mockup{product.productImages.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {alreadyExists && (
                          <span className="import-product-exists-badge">Already exists</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            <button
              className={`import-products-btn ${imported ? 'imported' : ''}`}
              onClick={handleImport}
              disabled={selectedProducts.size === 0 || imported}
            >
              {imported
                ? 'Imported!'
                : `Import ${selectedProducts.size} product${selectedProducts.size !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
