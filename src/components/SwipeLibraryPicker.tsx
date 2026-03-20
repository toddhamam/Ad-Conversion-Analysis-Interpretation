import { useState, useEffect } from 'react';
import {
  fetchSwipeLibrary,
  fetchSwipeImage,
  type SwipeLibraryItem,
  type SwipeElementType,
} from '../services/swipeLibraryApi';
import Loading from './Loading';
import '../pages/SwipeLibrary.css';

interface SwipeLibraryPickerProps {
  adAccountId: string;
  elementTypes: SwipeElementType[];
  onSelect: (items: SwipeLibraryItem[]) => void;
  onClose: () => void;
  multiSelect?: boolean;
}

const SwipeLibraryPicker = ({
  adAccountId,
  elementTypes,
  onSelect,
  onClose,
  multiSelect = true,
}: SwipeLibraryPickerProps) => {
  const [items, setItems] = useState<SwipeLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<SwipeElementType | 'all'>(
    elementTypes.length === 1 ? elementTypes[0] : 'all'
  );

  // Image data cache for selected images
  const [imageDataCache, setImageDataCache] = useState<Map<string, { data: string; mime: string }>>(new Map());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load all types we need
        const result = await fetchSwipeLibrary(adAccountId, {
          element_type: activeType === 'all' ? undefined : activeType,
          search: searchQuery.trim() || undefined,
          sort: 'newest',
          limit: 100,
        });
        // Filter to only allowed types
        const filtered = result.items.filter(i => elementTypes.includes(i.element_type));
        setItems(filtered);
      } catch (err: unknown) {
        console.error('Failed to load swipe library:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [adAccountId, elementTypes, activeType, searchQuery]);

  const toggleSelect = (item: SwipeLibraryItem) => {
    if (!multiSelect) {
      setSelectedIds(new Set([item.id]));
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleConfirm = async () => {
    const selected = items.filter(i => selectedIds.has(i.id));

    // For image items, fetch full image data before confirming
    const imageItems = selected.filter(i => i.element_type === 'image');
    for (const img of imageItems) {
      if (!imageDataCache.has(img.id)) {
        try {
          const data = await fetchSwipeImage(img.id);
          setImageDataCache(prev => {
            const next = new Map(prev);
            next.set(img.id, { data: data.image_data, mime: data.image_mime_type });
            return next;
          });
          // Attach to the item for the consumer
          (img as SwipeLibraryItem & { _fullImageData?: string; _fullImageMime?: string })._fullImageData = data.image_data;
          (img as SwipeLibraryItem & { _fullImageData?: string; _fullImageMime?: string })._fullImageMime = data.image_mime_type;
        } catch (err: unknown) {
          console.error('Failed to fetch full image:', err);
        }
      } else {
        const cached = imageDataCache.get(img.id)!;
        (img as SwipeLibraryItem & { _fullImageData?: string; _fullImageMime?: string })._fullImageData = cached.data;
        (img as SwipeLibraryItem & { _fullImageData?: string; _fullImageMime?: string })._fullImageMime = cached.mime;
      }
    }

    onSelect(selected);
  };

  const showTypeTabs = elementTypes.length > 1;
  const typeTabs: { label: string; value: SwipeElementType | 'all' }[] = [
    { label: 'All', value: 'all' },
    ...elementTypes.map(t => ({
      label: t === 'headline' ? 'Headlines' : t === 'body_copy' ? 'Body Copy' : 'Images',
      value: t,
    })),
  ];

  // Pinned first
  const sortedItems = [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return 0;
  });

  return (
    <div className="swipe-modal-overlay" onClick={onClose}>
      <div className="swipe-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="swipe-picker-header">
          <h3>Swipe Library</h3>
          <button className="swipe-picker-close" onClick={onClose}>✕</button>
        </div>

        {/* Filters */}
        <div className="swipe-picker-filters">
          {showTypeTabs && (
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
          )}
          <input
            type="text"
            className="swipe-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', marginTop: showTypeTabs ? '8px' : 0 }}
          />
        </div>

        {/* Content */}
        <div className="swipe-picker-content">
          {loading ? (
            <Loading size="small" message="ConversionIQ™ loading library..." />
          ) : error ? (
            <div className="swipe-error">{error}</div>
          ) : sortedItems.length === 0 ? (
            <div className="swipe-picker-empty">
              No saved items found. Save elements from Meta Ads first.
            </div>
          ) : (
            <div className="swipe-picker-list">
              {sortedItems.map(item => (
                <div
                  key={item.id}
                  className={`swipe-picker-item ${selectedIds.has(item.id) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(item)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item)}
                    onClick={e => e.stopPropagation()}
                    className="swipe-card-check"
                  />
                  <div className="swipe-picker-item-content">
                    {item.element_type === 'image' ? (
                      <div className="swipe-picker-thumb">
                        {item.image_thumbnail ? (
                          <img
                            src={`data:${item.image_mime_type || 'image/jpeg'};base64,${item.image_thumbnail}`}
                            alt="Saved"
                          />
                        ) : (
                          <span>🖼️</span>
                        )}
                      </div>
                    ) : (
                      <p className="swipe-picker-text">{item.text_content}</p>
                    )}
                  </div>
                  <div className="swipe-picker-item-meta">
                    <span className="swipe-type-badge">
                      {item.element_type === 'body_copy' ? 'Body' : item.element_type === 'headline' ? 'Headline' : 'Image'}
                    </span>
                    {item.performance_snapshot.cvr != null && (
                      <span className="swipe-perf-badge">{item.performance_snapshot.cvr.toFixed(1)}% CVR</span>
                    )}
                    {item.is_pinned && <span title="Pinned">📌</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="swipe-picker-footer">
          <span className="swipe-picker-count">
            {selectedIds.size} selected
          </span>
          <div className="swipe-picker-footer-actions">
            <button className="swipe-modal-cancel" onClick={onClose}>Cancel</button>
            <button
              className="swipe-modal-save"
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
            >
              Use Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwipeLibraryPicker;
