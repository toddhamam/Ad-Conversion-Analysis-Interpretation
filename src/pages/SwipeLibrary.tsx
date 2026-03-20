import { useState, useEffect, useCallback } from 'react';
import { useAdAccount } from '../contexts/AdAccountContext';
import {
  fetchSwipeLibrary,
  updateSwipeItem,
  deleteSwipeItems,
  fetchSwipeImage,
  type SwipeLibraryItem,
  type SwipeElementType,
  type SwipeListFilters,
} from '../services/swipeLibraryApi';
import SEO from '../components/SEO';
import Loading from '../components/Loading';
import './SwipeLibrary.css';

type SortOption = 'newest' | 'oldest' | 'cvr' | 'cpa';

const SwipeLibrary = () => {
  const { currentAccount } = useAdAccount();
  const [items, setItems] = useState<SwipeLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeType, setActiveType] = useState<SwipeElementType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Editing
  const [editingItem, setEditingItem] = useState<SwipeLibraryItem | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Image viewer
  const [viewingImage, setViewingImage] = useState<{ data: string; mime: string } | null>(null);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);

  const adAccountId = currentAccount?.ad_account_id;

  const loadItems = useCallback(async () => {
    if (!adAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const filters: SwipeListFilters = { sort: sortBy };
      if (activeType !== 'all') filters.element_type = activeType;
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      const result = await fetchSwipeLibrary(adAccountId, filters);
      setItems(result.items);
      setTotal(result.total);
    } catch (err: unknown) {
      console.error('Failed to load swipe library:', err);
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, [adAccountId, activeType, searchQuery, sortBy]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleTogglePin = async (item: SwipeLibraryItem) => {
    try {
      const updated = await updateSwipeItem(item.id, { is_pinned: !item.is_pinned });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updated } : i));
    } catch (err: unknown) {
      console.error('Failed to update pin:', err);
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} item${ids.length > 1 ? 's' : ''}?`)) return;
    try {
      await deleteSwipeItems(ids);
      setItems(prev => prev.filter(i => !ids.includes(i.id)));
      setTotal(prev => prev - ids.length);
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    } catch (err: unknown) {
      console.error('Failed to delete:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
      const updated = await updateSwipeItem(editingItem.id, { tags, notes: editNotes || undefined });
      setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...updated } : i));
      setEditingItem(null);
    } catch (err: unknown) {
      console.error('Failed to save edit:', err);
    }
  };

  const handleViewImage = async (item: SwipeLibraryItem) => {
    setLoadingImageId(item.id);
    try {
      const data = await fetchSwipeImage(item.id);
      setViewingImage({ data: data.image_data, mime: data.image_mime_type });
    } catch (err: unknown) {
      console.error('Failed to load image:', err);
    } finally {
      setLoadingImageId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEdit = (item: SwipeLibraryItem) => {
    setEditingItem(item);
    setEditTags(item.tags.join(', '));
    setEditNotes(item.notes || '');
  };

  // Sort: pinned first, then by selected sort
  const sortedItems = [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return 0;
  });

  const typeTabs: { label: string; value: SwipeElementType | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Headlines', value: 'headline' },
    { label: 'Body Copy', value: 'body_copy' },
    { label: 'Images', value: 'image' },
  ];

  if (!adAccountId) {
    return (
      <div className="swipe-library-page">
        <SEO title="Swipe Library | Conversion Intelligence" noindex />
        <div className="swipe-empty-state">
          <p>Select an ad account to view your Swipe Library.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="swipe-library-page">
      <SEO title="Swipe Library | Conversion Intelligence" noindex />

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Swipe Library</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Your best-performing ad elements — saved for reuse in future campaigns.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="swipe-filter-bar">
        <div className="swipe-type-tabs">
          {typeTabs.map(tab => (
            <button
              key={tab.value}
              className={`swipe-type-tab ${activeType === tab.value ? 'active' : ''}`}
              onClick={() => setActiveType(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="swipe-filter-controls">
          <input
            type="text"
            className="swipe-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="swipe-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="cvr">Best CVR</option>
            <option value="cpa">Lowest CPA</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="swipe-bulk-bar">
          <span>{selectedIds.size} selected</span>
          <button
            className="swipe-bulk-delete"
            onClick={() => handleDelete(Array.from(selectedIds))}
          >
            Delete Selected
          </button>
          <button
            className="swipe-bulk-cancel"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Loading size="large" message="ConversionIQ™ loading library..." />
      ) : error ? (
        <div className="swipe-error">{error}</div>
      ) : sortedItems.length === 0 ? (
        <div className="swipe-empty-state">
          <div className="swipe-empty-icon">🔖</div>
          <h3>Your Swipe Library is empty</h3>
          <p>Save winning ad elements from the Meta Ads page to build your creative arsenal.</p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            {total} item{total !== 1 ? 's' : ''}
          </p>
          <div className="swipe-grid">
            {sortedItems.map(item => (
              <div
                key={item.id}
                className={`swipe-card ${selectedIds.has(item.id) ? 'selected' : ''} ${item.is_pinned ? 'pinned' : ''}`}
              >
                <div className="swipe-card-header">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="swipe-card-check"
                  />
                  <span className="swipe-type-badge">{item.element_type === 'body_copy' ? 'Body' : item.element_type === 'headline' ? 'Headline' : 'Image'}</span>
                  {item.is_pinned && <span className="swipe-pin-indicator" title="Pinned">📌</span>}
                  <div className="swipe-card-actions">
                    <button onClick={() => handleTogglePin(item)} title={item.is_pinned ? 'Unpin' : 'Pin'}>
                      {item.is_pinned ? '📌' : '📍'}
                    </button>
                    <button onClick={() => openEdit(item)} title="Edit">✏️</button>
                    <button onClick={() => handleDelete([item.id])} title="Delete">🗑️</button>
                  </div>
                </div>

                <div className="swipe-card-body">
                  {item.element_type === 'image' ? (
                    <div
                      className="swipe-image-thumb"
                      onClick={() => handleViewImage(item)}
                      style={{ cursor: 'pointer' }}
                    >
                      {item.image_thumbnail ? (
                        <img
                          src={`data:${item.image_mime_type || 'image/jpeg'};base64,${item.image_thumbnail}`}
                          alt="Saved creative"
                        />
                      ) : (
                        <div className="swipe-image-placeholder">🖼️</div>
                      )}
                      {loadingImageId === item.id && (
                        <div className="swipe-image-loading">Loading...</div>
                      )}
                    </div>
                  ) : (
                    <p className="swipe-text-content">{item.text_content}</p>
                  )}
                </div>

                {/* Performance */}
                {(item.performance_snapshot.cvr || item.performance_snapshot.cpa) && (
                  <div className="swipe-perf">
                    {item.performance_snapshot.cvr != null && (
                      <span className="swipe-perf-badge">{item.performance_snapshot.cvr.toFixed(1)}% CVR</span>
                    )}
                    {item.performance_snapshot.cpa != null && (
                      <span className="swipe-perf-badge">${item.performance_snapshot.cpa.toFixed(2)} CPA</span>
                    )}
                  </div>
                )}

                {/* Tags */}
                {item.tags.length > 0 && (
                  <div className="swipe-tags">
                    {item.tags.map((tag, i) => (
                      <span key={i} className="swipe-tag">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Source */}
                {item.meta_campaign_name && (
                  <div className="swipe-source">
                    {item.meta_campaign_name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="swipe-modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="swipe-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Item</h3>
            <label>
              Tags (comma-separated)
              <input
                type="text"
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                placeholder="e.g. winner, q1-campaign"
              />
            </label>
            <label>
              Notes
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Add notes..."
                rows={3}
              />
            </label>
            <div className="swipe-modal-actions">
              <button className="swipe-modal-cancel" onClick={() => setEditingItem(null)}>Cancel</button>
              <button className="swipe-modal-save" onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer */}
      {viewingImage && (
        <div className="swipe-modal-overlay" onClick={() => setViewingImage(null)}>
          <div className="swipe-image-viewer" onClick={e => e.stopPropagation()}>
            <button className="swipe-image-close" onClick={() => setViewingImage(null)}>✕</button>
            <img
              src={`data:${viewingImage.mime};base64,${viewingImage.data}`}
              alt="Full size creative"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SwipeLibrary;
