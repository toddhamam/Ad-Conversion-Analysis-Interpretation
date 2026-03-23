import { useState, useEffect, useMemo } from 'react';
import {
  fetchSwipeLibrary,
  fetchSwipeImage,
  groupSwipeItems,
  type SwipeLibraryItem,
  type SwipeElementType,
  type SwipeAdGroup,
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
  const [searchQuery, setSearchQuery] = useState('');

  // Selection: which element types are selected from which groups
  const [selectedElements, setSelectedElements] = useState<Map<string, Set<SwipeElementType>>>(new Map());

  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Image data cache for selected images
  const [imageDataCache, setImageDataCache] = useState<Map<string, { data: string; mime: string }>>(new Map());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSwipeLibrary(adAccountId, {
          search: searchQuery.trim() || undefined,
          sort: 'newest',
          limit: 500,
        });
        setItems(result.items);
      } catch (err: unknown) {
        console.error('Failed to load swipe library:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [adAccountId, searchQuery]);

  // Group items, filter to groups containing at least one of the requested elementTypes
  const groups = useMemo(() => {
    const allGroups = groupSwipeItems(items);
    return allGroups.filter(g =>
      elementTypes.some(t => {
        if (t === 'headline') return g.headline !== null;
        if (t === 'body_copy') return g.bodyCopy !== null;
        if (t === 'image') return g.image !== null;
        return false;
      })
    );
  }, [items, elementTypes]);

  const toggleExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleElementSelect = (groupId: string, elementType: SwipeElementType) => {
    if (!elementTypes.includes(elementType)) return;

    setSelectedElements(prev => {
      const next = new Map(prev);

      if (!multiSelect) {
        // Single select mode: clear everything, select just this one
        next.clear();
        next.set(groupId, new Set([elementType]));
        return next;
      }

      const current = next.get(groupId) || new Set<SwipeElementType>();
      const updated = new Set(current);
      if (updated.has(elementType)) {
        updated.delete(elementType);
        if (updated.size === 0) next.delete(groupId);
        else next.set(groupId, updated);
      } else {
        updated.add(elementType);
        next.set(groupId, updated);
      }
      return next;
    });
  };

  // Quick-select: clicking the group row toggles all selectable elements
  const toggleGroupSelect = (group: SwipeAdGroup) => {
    const groupId = group.groupId;
    const current = selectedElements.get(groupId);
    const selectableTypes = elementTypes.filter(t => {
      if (t === 'headline') return group.headline !== null;
      if (t === 'body_copy') return group.bodyCopy !== null;
      if (t === 'image') return group.image !== null;
      return false;
    });

    if (!multiSelect) {
      // Single select: toggle expand
      toggleExpand(groupId);
      return;
    }

    setSelectedElements(prev => {
      const next = new Map(prev);
      if (current && current.size === selectableTypes.length) {
        // All selected — deselect all
        next.delete(groupId);
      } else {
        // Select all selectable
        next.set(groupId, new Set(selectableTypes));
      }
      return next;
    });
  };

  const totalSelectedCount = useMemo(() => {
    let count = 0;
    for (const types of selectedElements.values()) count += types.size;
    return count;
  }, [selectedElements]);

  const handleConfirm = async () => {
    const selected: SwipeLibraryItem[] = [];
    for (const [groupId, types] of selectedElements) {
      const group = groups.find(g => g.groupId === groupId);
      if (!group) continue;
      for (const t of types) {
        let item: SwipeLibraryItem | null = null;
        if (t === 'headline') item = group.headline;
        else if (t === 'body_copy') item = group.bodyCopy;
        else if (t === 'image') item = group.image;
        if (item) selected.push(item);
      }
    }

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

  const getElementLabel = (type: SwipeElementType): string => {
    if (type === 'headline') return 'Headline';
    if (type === 'body_copy') return 'Body Copy';
    return 'Image';
  };

  return (
    <div className="swipe-modal-overlay" onClick={onClose}>
      <div className="swipe-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="swipe-picker-header">
          <h3>Swipe Library</h3>
          <button className="swipe-picker-close" onClick={onClose}>✕</button>
        </div>

        {/* Filters */}
        <div className="swipe-picker-filters">
          <input
            type="text"
            className="swipe-search-input"
            placeholder="Search ads or campaigns..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Content */}
        <div className="swipe-picker-content">
          {loading ? (
            <Loading size="small" message="ConversionIQ™ loading library..." />
          ) : error ? (
            <div className="swipe-error">{error}</div>
          ) : groups.length === 0 ? (
            <div className="swipe-picker-empty">
              No saved ads found. Save ads from Meta Ads first.
            </div>
          ) : (
            <div className="swipe-picker-list">
              {groups.map(group => {
                const isExpanded = expandedGroups.has(group.groupId);
                const groupSelected = selectedElements.get(group.groupId);

                return (
                  <div key={group.groupId} className={`swipe-picker-group ${isExpanded ? 'expanded' : ''}`}>
                    {/* Group summary row */}
                    <div
                      className="swipe-picker-group-header"
                      onClick={() => toggleGroupSelect(group)}
                    >
                      <button
                        className="swipe-picker-expand-btn"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(group.groupId); }}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>

                      {group.image?.image_thumbnail && (
                        <div className="swipe-picker-group-thumb">
                          <img
                            src={`data:${group.image.image_mime_type || 'image/jpeg'};base64,${group.image.image_thumbnail}`}
                            alt=""
                          />
                        </div>
                      )}

                      <div className="swipe-picker-group-info">
                        <span className="swipe-picker-group-title">
                          {group.headline?.text_content || group.campaignName || 'Saved Ad'}
                        </span>
                        <span className="swipe-picker-group-meta">
                          {group.items.length} element{group.items.length > 1 ? 's' : ''}
                          {group.performance.cvr != null && ` · ${group.performance.cvr.toFixed(1)}% CVR`}
                        </span>
                      </div>

                      {group.isPinned && <span title="Pinned" style={{ fontSize: '12px' }}>📌</span>}
                    </div>

                    {/* Expanded: element-level checkboxes */}
                    {isExpanded && (
                      <div className="swipe-picker-elements">
                        {group.headline && (
                          <label
                            className={`swipe-picker-element-row ${!elementTypes.includes('headline') ? 'disabled' : ''} ${groupSelected?.has('headline') ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={groupSelected?.has('headline') || false}
                              disabled={!elementTypes.includes('headline')}
                              onChange={() => toggleElementSelect(group.groupId, 'headline')}
                              className="swipe-card-check"
                            />
                            <span className="swipe-picker-element-type">{getElementLabel('headline')}</span>
                            <span className="swipe-picker-element-preview">{group.headline.text_content}</span>
                          </label>
                        )}
                        {group.bodyCopy && (
                          <label
                            className={`swipe-picker-element-row ${!elementTypes.includes('body_copy') ? 'disabled' : ''} ${groupSelected?.has('body_copy') ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={groupSelected?.has('body_copy') || false}
                              disabled={!elementTypes.includes('body_copy')}
                              onChange={() => toggleElementSelect(group.groupId, 'body_copy')}
                              className="swipe-card-check"
                            />
                            <span className="swipe-picker-element-type">{getElementLabel('body_copy')}</span>
                            <span className="swipe-picker-element-preview">{group.bodyCopy.text_content}</span>
                          </label>
                        )}
                        {group.image && (
                          <label
                            className={`swipe-picker-element-row ${!elementTypes.includes('image') ? 'disabled' : ''} ${groupSelected?.has('image') ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={groupSelected?.has('image') || false}
                              disabled={!elementTypes.includes('image')}
                              onChange={() => toggleElementSelect(group.groupId, 'image')}
                              className="swipe-card-check"
                            />
                            <span className="swipe-picker-element-type">{getElementLabel('image')}</span>
                            {group.image.image_thumbnail ? (
                              <img
                                src={`data:${group.image.image_mime_type || 'image/jpeg'};base64,${group.image.image_thumbnail}`}
                                alt=""
                                className="swipe-picker-element-thumb"
                              />
                            ) : (
                              <span className="swipe-picker-element-preview">🖼️ Image</span>
                            )}
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="swipe-picker-footer">
          <span className="swipe-picker-count">
            {totalSelectedCount} element{totalSelectedCount !== 1 ? 's' : ''} selected
          </span>
          <div className="swipe-picker-footer-actions">
            <button className="swipe-modal-cancel" onClick={onClose}>Cancel</button>
            <button
              className="swipe-modal-save"
              onClick={handleConfirm}
              disabled={totalSelectedCount === 0}
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
