import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdAccount } from '../contexts/AdAccountContext';
import {
  fetchSwipeLibrary,
  updateSwipeItem,
  deleteSwipeItems,
  fetchSwipeImage,
  groupSwipeItems,
  type SwipeLibraryItem,
  type SwipeElementType,
  type SwipeListFilters,
  type SwipeConversionType,
  type SwipeAdGroup,
  type CampaignTypeFilter,
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
  const [activeConversionType, setActiveConversionType] = useState<SwipeConversionType | 'all'>('all');
  const [activeCampaignType, setActiveCampaignType] = useState<CampaignTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Selection (tracks group IDs)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Editing
  const [editingGroup, setEditingGroup] = useState<SwipeAdGroup | null>(null);
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
      const filters: SwipeListFilters = { sort: sortBy, limit: 500 };
      if (activeConversionType !== 'all') filters.conversion_type = activeConversionType;
      if (activeCampaignType !== 'all') filters.campaign_type = activeCampaignType;
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
  }, [adAccountId, activeConversionType, activeCampaignType, searchQuery, sortBy]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Group items and apply client-side element type filter
  const groups = useMemo(() => {
    const allGroups = groupSwipeItems(items);
    if (activeType === 'all') return allGroups;
    return allGroups.filter(g => {
      if (activeType === 'headline') return g.headline !== null;
      if (activeType === 'body_copy') return g.bodyCopy !== null;
      if (activeType === 'image') return g.image !== null;
      return true;
    });
  }, [items, activeType]);

  // Campaign type chip visibility — compute from ALL items (pre-campaign-filter)
  // We need unfiltered counts, so we track what types exist
  const campaignTypeCounts = useMemo(() => {
    const counts = { Prospecting: 0, Retargeting: 0, Retention: 0 };
    for (const item of items) {
      if (item.campaign_type === 'Prospecting') counts.Prospecting++;
      else if (item.campaign_type === 'Retargeting') counts.Retargeting++;
      else if (item.campaign_type === 'Retention') counts.Retention++;
    }
    return counts;
  }, [items]);

  const showCampaignChips = activeCampaignType !== 'all' ||
    campaignTypeCounts.Prospecting > 0 ||
    campaignTypeCounts.Retargeting > 0 ||
    campaignTypeCounts.Retention > 0;

  const handleTogglePin = async (group: SwipeAdGroup) => {
    const newPinned = !group.isPinned;
    try {
      await Promise.all(group.items.map(item =>
        updateSwipeItem(item.id, { is_pinned: newPinned })
      ));
      setItems(prev => prev.map(i =>
        i.group_id === group.groupId ? { ...i, is_pinned: newPinned } : i
      ));
    } catch (err: unknown) {
      console.error('Failed to update pin:', err);
    }
  };

  const handleDeleteGroup = async (group: SwipeAdGroup) => {
    const ids = group.items.map(i => i.id);
    if (!confirm(`Delete this ad (${ids.length} element${ids.length > 1 ? 's' : ''})?`)) return;
    try {
      await deleteSwipeItems(ids);
      setItems(prev => prev.filter(i => !ids.includes(i.id)));
      setTotal(prev => prev - ids.length);
      setSelectedGroupIds(prev => {
        const next = new Set(prev);
        next.delete(group.groupId);
        return next;
      });
    } catch (err: unknown) {
      console.error('Failed to delete:', err);
    }
  };

  const handleBulkDelete = async () => {
    const groupsToDelete = groups.filter(g => selectedGroupIds.has(g.groupId));
    const allIds = groupsToDelete.flatMap(g => g.items.map(i => i.id));
    if (!confirm(`Delete ${groupsToDelete.length} ad${groupsToDelete.length > 1 ? 's' : ''} (${allIds.length} elements)?`)) return;
    try {
      await deleteSwipeItems(allIds);
      setItems(prev => prev.filter(i => !allIds.includes(i.id)));
      setTotal(prev => prev - allIds.length);
      setSelectedGroupIds(new Set());
    } catch (err: unknown) {
      console.error('Failed to delete:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingGroup) return;
    try {
      const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
      const notes = editNotes || undefined;
      await Promise.all(editingGroup.items.map(item =>
        updateSwipeItem(item.id, { tags, notes })
      ));
      setItems(prev => prev.map(i =>
        i.group_id === editingGroup.groupId ? { ...i, tags, notes: notes || null } : i
      ));
      setEditingGroup(null);
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

  const toggleSelectGroup = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const openEdit = (group: SwipeAdGroup) => {
    setEditingGroup(group);
    setEditTags(group.tags.join(', '));
    setEditNotes(group.notes || '');
  };

  const typeTabs: { label: string; value: SwipeElementType | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Headlines', value: 'headline' },
    { label: 'Body Copy', value: 'body_copy' },
    { label: 'Images', value: 'image' },
  ];

  const campaignTypeChips: { label: string; value: CampaignTypeFilter; color: string }[] = [
    { label: 'All Types', value: 'all', color: '' },
    { label: 'Prospecting', value: 'Prospecting', color: '#3b82f6' },
    { label: 'Retargeting', value: 'Retargeting', color: '#f59e0b' },
    { label: 'Retention', value: 'Retention', color: '#10b981' },
  ];

  const formatCampaignBadgeClass = (type: string | null): string => {
    if (type === 'Prospecting') return 'swipe-campaign-badge-prospecting';
    if (type === 'Retargeting') return 'swipe-campaign-badge-retargeting';
    if (type === 'Retention') return 'swipe-campaign-badge-retention';
    return 'swipe-campaign-badge-other';
  };

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
            Your best-performing ads — saved for reuse in future campaigns.
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

        {/* Conversion type filter */}
        <div className="swipe-type-tabs swipe-conversion-tabs">
          {([
            { label: 'All Types', value: 'all' as const },
            { label: 'Purchases', value: 'purchase' as SwipeConversionType },
            { label: 'Leads', value: 'lead' as SwipeConversionType },
          ]).map(tab => (
            <button
              key={tab.value}
              className={`swipe-type-tab swipe-conv-tab ${activeConversionType === tab.value ? 'active' : ''}`}
              onClick={() => setActiveConversionType(tab.value)}
            >
              {tab.value === 'purchase' && <span className="swipe-conv-dot swipe-conv-dot-purchase" />}
              {tab.value === 'lead' && <span className="swipe-conv-dot swipe-conv-dot-lead" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Campaign type filter */}
        {showCampaignChips && (
          <div className="swipe-type-tabs swipe-campaign-tabs">
            {campaignTypeChips.map(chip => (
              <button
                key={chip.value}
                className={`swipe-type-tab swipe-campaign-chip ${activeCampaignType === chip.value ? 'active' : ''}`}
                onClick={() => setActiveCampaignType(chip.value)}
              >
                {chip.color && <span className="swipe-campaign-chip-dot" style={{ background: chip.color }} />}
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <div className="swipe-filter-controls">
          <input
            type="text"
            className="swipe-search-input"
            placeholder="Search ads or campaigns..."
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
      {selectedGroupIds.size > 0 && (
        <div className="swipe-bulk-bar">
          <span>{selectedGroupIds.size} ad{selectedGroupIds.size > 1 ? 's' : ''} selected</span>
          <button className="swipe-bulk-delete" onClick={handleBulkDelete}>
            Delete Selected
          </button>
          <button className="swipe-bulk-cancel" onClick={() => setSelectedGroupIds(new Set())}>
            Cancel
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Loading size="large" message="ConversionIQ™ loading library..." />
      ) : error ? (
        <div className="swipe-error">{error}</div>
      ) : groups.length === 0 ? (
        <div className="swipe-empty-state">
          <div className="swipe-empty-icon">🔖</div>
          <h3>Your Swipe Library is empty</h3>
          <p>Save winning ads from the Meta Ads page to build your creative arsenal.</p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            {groups.length} ad{groups.length !== 1 ? 's' : ''} ({total} element{total !== 1 ? 's' : ''})
          </p>
          <div className="swipe-grid">
            {groups.map(group => (
              <div
                key={group.groupId}
                className={`swipe-ad-card ${selectedGroupIds.has(group.groupId) ? 'selected' : ''} ${group.isPinned ? 'pinned' : ''}`}
              >
                {/* Card Header */}
                <div className="swipe-ad-card-header">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(group.groupId)}
                    onChange={() => toggleSelectGroup(group.groupId)}
                    className="swipe-card-check"
                  />
                  <span className="swipe-ad-card-campaign" title={group.campaignName || undefined}>
                    {group.campaignName || 'Untitled Campaign'}
                  </span>
                  {group.campaignType && group.campaignType !== 'Other' && (
                    <span className={`swipe-campaign-badge ${formatCampaignBadgeClass(group.campaignType)}`}>
                      {group.campaignType}
                    </span>
                  )}
                  {group.performance.conversion_type && group.performance.conversion_type !== 'none' && (
                    <span className={`swipe-conv-badge swipe-conv-badge-${group.performance.conversion_type}`}>
                      {group.performance.conversion_type === 'purchase' ? 'Purchase' : group.performance.conversion_type === 'lead' ? 'Lead' : 'Purch + Lead'}
                    </span>
                  )}
                  {group.isPinned && <span className="swipe-pin-indicator" title="Pinned">📌</span>}
                </div>

                {/* Card Body — Image left, text right */}
                <div className="swipe-ad-card-body">
                  {group.image && (
                    <div
                      className="swipe-ad-card-image"
                      onClick={() => handleViewImage(group.image!)}
                      style={{ cursor: 'pointer' }}
                    >
                      {group.image.image_thumbnail ? (
                        <img
                          src={`data:${group.image.image_mime_type || 'image/jpeg'};base64,${group.image.image_thumbnail}`}
                          alt="Ad creative"
                        />
                      ) : (
                        <div className="swipe-image-placeholder">🖼️</div>
                      )}
                      {loadingImageId === group.image.id && (
                        <div className="swipe-image-loading">Loading...</div>
                      )}
                    </div>
                  )}
                  <div className="swipe-ad-card-text">
                    {group.headline && (
                      <p className="swipe-ad-card-headline">{group.headline.text_content}</p>
                    )}
                    {group.bodyCopy && (
                      <p className="swipe-ad-card-body-copy">{group.bodyCopy.text_content}</p>
                    )}
                    {!group.headline && !group.bodyCopy && !group.image && (
                      <p className="swipe-ad-card-body-copy" style={{ color: 'var(--text-muted)' }}>No content</p>
                    )}
                  </div>
                </div>

                {/* Performance */}
                {(group.performance.cvr != null || group.performance.cpa != null || group.performance.roas != null) && (
                  <div className="swipe-perf">
                    {group.performance.cvr != null && (
                      <span className="swipe-perf-badge">{group.performance.cvr.toFixed(1)}% CVR</span>
                    )}
                    {group.performance.cpa != null && (
                      <span className="swipe-perf-badge">${group.performance.cpa.toFixed(2)} CPA</span>
                    )}
                    {group.performance.roas != null && (
                      <span className="swipe-perf-badge">{group.performance.roas.toFixed(1)}x ROAS</span>
                    )}
                  </div>
                )}

                {/* Tags */}
                {group.tags.length > 0 && (
                  <div className="swipe-tags">
                    {group.tags.map((tag, i) => (
                      <span key={i} className="swipe-tag">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="swipe-ad-card-actions">
                  <button onClick={() => handleTogglePin(group)} title={group.isPinned ? 'Unpin' : 'Pin'}>
                    {group.isPinned ? '📌' : '📍'}
                  </button>
                  <button onClick={() => openEdit(group)} title="Edit">✏️</button>
                  <button onClick={() => handleDeleteGroup(group)} title="Delete">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingGroup && (
        <div className="swipe-modal-overlay" onClick={() => setEditingGroup(null)}>
          <div className="swipe-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Ad</h3>
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
              <button className="swipe-modal-cancel" onClick={() => setEditingGroup(null)}>Cancel</button>
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
