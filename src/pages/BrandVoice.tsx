import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, Sparkles, Lock, Unlock, Trash2, X, CheckCircle, AlertTriangle, Plus, Quote } from 'lucide-react';
import SEO from '../components/SEO';
import { useAdAccount } from '../contexts/AdAccountContext';
import { getCachedAnalysis } from '../lib/channelAnalysisCache';
import {
  loadBrandVoiceProfile,
  saveBrandVoiceProfile,
  clearBrandVoiceProfile,
  createEmptyBrandVoiceProfile,
  createEmptyTestimonial,
  MAX_TESTIMONIALS,
} from '../lib/brandVoiceProfile';
import type { BrandVoiceProfile, SpellingLocale, EmojiPolicy, Testimonial } from '../services/openaiApi';
import './BrandVoice.css';

// A lightweight chip/tag input — add on Enter or comma, remove with the × button.
const TagInput = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  ariaLabel: string;
}) => {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parts = draft
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const merged = [...value];
    parts.forEach(p => {
      if (!merged.some(v => v.toLowerCase() === p.toLowerCase())) merged.push(p);
    });
    onChange(merged);
    setDraft('');
  };

  return (
    <div className="bv-taginput">
      {value.map((tag, i) => (
        <span className="bv-tag" key={`${tag}-${i}`}>
          {tag}
          <button
            type="button"
            className="bv-tag-remove"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            aria-label={`Remove ${tag}`}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        type="text"
        className="bv-tag-field"
        value={draft}
        placeholder={value.length ? '' : placeholder}
        aria-label={ariaLabel}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </div>
  );
};

// One testimonial in the repeater — quote + metadata + the approval gate that lets it reach the AI.
const TestimonialCard = ({
  testimonial,
  index,
  onChange,
  onRemove,
}: {
  testimonial: Testimonial;
  index: number;
  onChange: (partial: Partial<Testimonial>) => void;
  onRemove: () => void;
}) => (
  <div className="bv-testimonial-card">
    <div className="bv-testimonial-head">
      <span className="bv-testimonial-title">
        <Quote size={13} aria-hidden="true" /> Testimonial {index + 1}
      </span>
      <button
        type="button"
        className="bv-testimonial-remove"
        onClick={onRemove}
        aria-label={`Remove testimonial ${index + 1}`}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>

    <label className="bv-field">
      <span className="bv-label">Quote <span className="bv-req" aria-hidden="true">*</span></span>
      <textarea
        className="bv-textarea"
        rows={2}
        value={testimonial.quote}
        onChange={e => onChange({ quote: e.target.value })}
        placeholder="Paste the customer's exact words — these are quoted verbatim in your ads."
      />
    </label>

    <div className="bv-grid-2">
      <label className="bv-field">
        <span className="bv-label">Attribution</span>
        <input
          type="text"
          className="bv-input"
          value={testimonial.attribution || ''}
          onChange={e => onChange({ attribution: e.target.value })}
          placeholder="Sarah M., Austin TX"
        />
      </label>
      <label className="bv-field">
        <span className="bv-label">Result highlight</span>
        <input
          type="text"
          className="bv-input"
          value={testimonial.result || ''}
          onChange={e => onChange({ result: e.target.value })}
          placeholder="down 15 lbs in 6 weeks (optional)"
        />
      </label>
    </div>

    <div className="bv-grid-2">
      <label className="bv-field">
        <span className="bv-label">Best for</span>
        <select
          className="bv-input"
          value={testimonial.theme || ''}
          onChange={e => onChange({ theme: e.target.value })}
        >
          <option value="">General proof</option>
          <option value="result">Result / outcome</option>
          <option value="ease">Ease of use</option>
          <option value="skepticism">Overcame skepticism</option>
          <option value="price">Worth the price</option>
          <option value="quality">Quality</option>
          <option value="speed">Fast results</option>
        </select>
      </label>
      <div className="bv-field bv-approve-field">
        <span className="bv-label">Approved for use</span>
        <label className="bv-approve">
          <input
            type="checkbox"
            checked={!!testimonial.approved}
            onChange={e => onChange({ approved: e.target.checked })}
          />
          <span>I have permission &amp; it's accurate</span>
        </label>
      </div>
    </div>

    {testimonial.quote.trim() && !testimonial.approved && (
      <div className="bv-testimonial-warn">
        <AlertTriangle size={12} aria-hidden="true" /> Not approved yet — this won't be sent to CreativeIQ™.
      </div>
    )}
  </div>
);

const BrandVoice = () => {
  const { accountBusinessType: businessType, currentAccount } = useAdAccount();
  const accountId = currentAccount?.ad_account_id;

  const [profile, setProfile] = useState<BrandVoiceProfile>(() => loadBrandVoiceProfile() || createEmptyBrandVoiceProfile());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  // Reload when the account switches (scoped storage follows the active account).
  useEffect(() => {
    setProfile(loadBrandVoiceProfile() || createEmptyBrandVoiceProfile());
    setDirty(false);
    setSaveState({ type: 'idle' });
  }, [accountId]);

  // The auto-extracted voice from the latest channel analysis (for "Fill from analysis").
  const analysisVoice = useMemo(
    () => getCachedAnalysis('meta', businessType)?.brandVoice ?? null,
    [businessType, accountId],
  );

  const update = useCallback((partial: Partial<BrandVoiceProfile>) => {
    setProfile(prev => ({ ...prev, ...partial }));
    setDirty(true);
    setSaveState({ type: 'idle' });
  }, []);

  // ── Testimonials (the verbatim social-proof corpus) ──
  const addTestimonial = () => {
    if (profile.testimonials.length >= MAX_TESTIMONIALS) return;
    update({ testimonials: [...profile.testimonials, createEmptyTestimonial()] });
  };
  const updateTestimonial = (id: string, partial: Partial<Testimonial>) => {
    update({ testimonials: profile.testimonials.map(t => (t.id === id ? { ...t, ...partial } : t)) });
  };
  const removeTestimonial = (id: string) => {
    update({ testimonials: profile.testimonials.filter(t => t.id !== id) });
  };

  const handleFillFromAnalysis = () => {
    if (!analysisVoice) return;
    update({
      voiceSummary: profile.voiceSummary.trim() || analysisVoice.tonality || '',
      tonality: analysisVoice.tonality || profile.tonality,
      pointOfView: analysisVoice.pointOfView || profile.pointOfView,
      readingLevel: analysisVoice.vocabularyLevel || profile.readingLevel,
      rhythm: analysisVoice.rhythmAndCadence || profile.rhythm,
      signaturePhrases: analysisVoice.distinctiveTraits?.length
        ? analysisVoice.distinctiveTraits
        : profile.signaturePhrases,
    });
  };

  const handleSave = () => {
    const result = saveBrandVoiceProfile(profile);
    if (result.success) {
      setDirty(false);
      setSaveState({ type: 'success', message: 'Brand voice saved. New copy for this account will use it immediately.' });
    } else {
      setSaveState({ type: 'error', message: result.error || 'Could not save.' });
    }
  };

  const handleClear = () => {
    clearBrandVoiceProfile();
    setProfile(createEmptyBrandVoiceProfile());
    setDirty(false);
    setSaveState({ type: 'idle' });
  };

  return (
    <div className="bv-page">
      <SEO title="Brand Voice | Convertra" description="Define your brand voice and guidelines for AI copy generation." noindex />

      <header className="bv-header">
        <div>
          <h1 className="bv-title">Brand Voice <span className="bv-title-tm">&amp; Guidelines</span></h1>
          <p className="bv-subtitle">
            The authoritative voice for <strong>{currentAccount?.ad_account_name || 'this ad account'}</strong>. CreativeIQ™ applies
            this to every headline and body it writes — and it overrides the voice inferred from past ads.
          </p>
        </div>
        <div className="bv-header-actions">
          <label className="bv-enable">
            <input
              type="checkbox"
              checked={profile.enabled}
              onChange={e => update({ enabled: e.target.checked })}
            />
            <span>{profile.enabled ? 'Active' : 'Inactive'}</span>
          </label>
          <button type="button" className="bv-btn bv-btn-primary" onClick={handleSave} disabled={!dirty}>
            <Save size={16} aria-hidden="true" /> Save
          </button>
        </div>
      </header>

      {saveState.type !== 'idle' && (
        <div className={`bv-banner bv-banner-${saveState.type}`}>
          {saveState.type === 'success' ? <CheckCircle size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
          <span>{saveState.message}</span>
        </div>
      )}

      {!profile.enabled && (
        <div className="bv-banner bv-banner-muted">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>This profile is inactive — toggle <strong>Active</strong> for it to influence generated copy.</span>
        </div>
      )}

      {/* ── Voice & style ─────────────────────────────────────────────── */}
      <section className="bv-section">
        <div className="bv-section-head">
          <h2>Voice &amp; Style</h2>
          <button
            type="button"
            className="bv-btn bv-btn-ghost"
            onClick={handleFillFromAnalysis}
            disabled={!analysisVoice || profile.locked}
            title={
              profile.locked
                ? 'Unlock the profile to fill from analysis'
                : analysisVoice
                ? 'Prefill the voice fields from your latest ConversionIQ™ analysis'
                : 'Run a ConversionIQ™ channel analysis first'
            }
          >
            <Sparkles size={15} aria-hidden="true" /> Fill from analysis
          </button>
        </div>

        <label className="bv-field">
          <span className="bv-label">Voice summary</span>
          <span className="bv-hint">One to three sentences: who is writing, and how they sound.</span>
          <textarea
            className="bv-textarea"
            rows={2}
            value={profile.voiceSummary}
            onChange={e => update({ voiceSummary: e.target.value })}
            placeholder="e.g. A no-nonsense founder who's been in the trenches. Warm, direct, allergic to corporate fluff."
          />
        </label>

        <div className="bv-grid-2">
          <label className="bv-field">
            <span className="bv-label">Sound like</span>
            <textarea
              className="bv-textarea"
              rows={2}
              value={profile.tonality}
              onChange={e => update({ tonality: e.target.value })}
              placeholder="Confident, warm, a little irreverent"
            />
          </label>
          <label className="bv-field">
            <span className="bv-label">Never sound like</span>
            <textarea
              className="bv-textarea"
              rows={2}
              value={profile.toneAvoid}
              onChange={e => update({ toneAvoid: e.target.value })}
              placeholder="Hypey, salesy, clinical, corporate"
            />
          </label>
        </div>

        <div className="bv-grid-2">
          <label className="bv-field">
            <span className="bv-label">Point of view</span>
            <input
              type="text"
              className="bv-input"
              value={profile.pointOfView}
              onChange={e => update({ pointOfView: e.target.value })}
              placeholder="First person (founder) / Second person (you/your)"
            />
          </label>
          <label className="bv-field">
            <span className="bv-label">Reading level</span>
            <input
              type="text"
              className="bv-input"
              value={profile.readingLevel}
              onChange={e => update({ readingLevel: e.target.value })}
              placeholder="Grade 8 — conversational, no jargon"
            />
          </label>
        </div>

        <label className="bv-field">
          <span className="bv-label">Rhythm &amp; cadence</span>
          <input
            type="text"
            className="bv-input"
            value={profile.rhythm}
            onChange={e => update({ rhythm: e.target.value })}
            placeholder="Staccato opener, longer emotional middle, punchy one-line close"
          />
        </label>

        <label className="bv-field">
          <span className="bv-label">Signature phrases</span>
          <span className="bv-hint">Phrases to weave in naturally where they fit — not forced into every ad.</span>
          <TagInput
            value={profile.signaturePhrases}
            onChange={next => update({ signaturePhrases: next })}
            placeholder="Type a phrase and press Enter"
            ariaLabel="Signature phrases"
          />
        </label>
      </section>

      {/* ── Who & what ────────────────────────────────────────────────── */}
      <section className="bv-section">
        <div className="bv-section-head"><h2>Who &amp; What</h2></div>
        <label className="bv-field">
          <span className="bv-label">Who you're talking to (avatar)</span>
          <span className="bv-hint">The ideal customer: who they are, their pain, their desire, and their #1 objection.</span>
          <textarea
            className="bv-textarea"
            rows={3}
            value={profile.avatar}
            onChange={e => update({ avatar: e.target.value })}
            placeholder="e.g. Time-poor founders running lean teams. They fear wasting budget on creative that flops, and want a system they can trust to test fast."
          />
        </label>
        <label className="bv-field">
          <span className="bv-label">The big idea / unique mechanism</span>
          <span className="bv-hint">The core promise the brand leads with — what makes this different.</span>
          <textarea
            className="bv-textarea"
            rows={2}
            value={profile.bigIdea}
            onChange={e => update({ bigIdea: e.target.value })}
            placeholder="e.g. Map every resistance loop to a single trigger, then dismantle it in one pass."
          />
        </label>
      </section>

      {/* ── Customer testimonials (verbatim social proof) ─────────────── */}
      <section className="bv-section">
        <div className="bv-section-head">
          <h2>Customer Testimonials</h2>
          <span className="bv-section-note">{profile.testimonials.length}/{MAX_TESTIMONIALS} · quoted verbatim</span>
        </div>
        <p className="bv-hint bv-section-intro">
          Your strongest real reviews. CreativeIQ™ quotes these <strong>word-for-word</strong> when it writes
          social-proof, transformation, and retargeting ads — and stops inventing fake testimonials. Only
          testimonials you mark <strong>approved</strong> are ever sent to the AI.
        </p>

        {profile.testimonials.length === 0 && (
          <div className="bv-testimonials-empty">
            No testimonials yet. Add up to {MAX_TESTIMONIALS} verbatim customer quotes.
          </div>
        )}

        {profile.testimonials.map((t, i) => (
          <TestimonialCard
            key={t.id}
            testimonial={t}
            index={i}
            onChange={partial => updateTestimonial(t.id, partial)}
            onRemove={() => removeTestimonial(t.id)}
          />
        ))}

        <button
          type="button"
          className="bv-btn bv-btn-ghost bv-add-testimonial"
          onClick={addTestimonial}
          disabled={profile.testimonials.length >= MAX_TESTIMONIALS}
          title={profile.testimonials.length >= MAX_TESTIMONIALS ? `Maximum ${MAX_TESTIMONIALS} testimonials` : 'Add a testimonial'}
        >
          <Plus size={15} aria-hidden="true" /> Add testimonial
        </button>
      </section>

      {/* ── Guardrails ────────────────────────────────────────────────── */}
      <section className="bv-section">
        <div className="bv-section-head">
          <h2>Guardrails</h2>
          <span className="bv-section-note">v1: applied as strong instructions to the AI</span>
        </div>

        <div className="bv-grid-2">
          <label className="bv-field">
            <span className="bv-label">Spelling</span>
            <select
              className="bv-input"
              value={profile.spellingLocale}
              onChange={e => update({ spellingLocale: e.target.value as SpellingLocale })}
            >
              <option value="US">US English</option>
              <option value="UK">UK English</option>
              <option value="AU">Australian English</option>
              <option value="CA">Canadian English</option>
            </select>
          </label>
          <label className="bv-field">
            <span className="bv-label">Emoji</span>
            <select
              className="bv-input"
              value={profile.emojiPolicy}
              onChange={e => update({ emojiPolicy: e.target.value as EmojiPolicy })}
            >
              <option value="none">Never use emoji</option>
              <option value="sparing">Sparingly (at most one)</option>
              <option value="liberal">Liberal</option>
            </select>
          </label>
        </div>

        <label className="bv-field">
          <span className="bv-label">Banned words &amp; phrases</span>
          <span className="bv-hint">Never appear in copy — stacked on top of the built-in AI-cliché filter.</span>
          <TagInput
            value={profile.bannedWords}
            onChange={next => update({ bannedWords: next })}
            placeholder="Type a word and press Enter"
            ariaLabel="Banned words"
          />
        </label>

        <label className="bv-field">
          <span className="bv-label">Required disclaimers</span>
          <span className="bv-hint">One per line. Each must appear verbatim in body copy.</span>
          <textarea
            className="bv-textarea"
            rows={2}
            value={profile.requiredDisclaimers.join('\n')}
            onChange={e => update({ requiredDisclaimers: e.target.value.split('\n') })}
            placeholder="Results not typical. Individual results vary."
          />
        </label>
      </section>

      <footer className="bv-footer">
        <label className="bv-lock" title="When locked, “Fill from analysis” won't overwrite your voice fields.">
          <input
            type="checkbox"
            checked={profile.locked}
            onChange={e => update({ locked: e.target.checked })}
          />
          {profile.locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
          <span>Lock voice fields</span>
        </label>
        <div className="bv-footer-actions">
          <button type="button" className="bv-btn bv-btn-danger-ghost" onClick={handleClear}>
            <Trash2 size={15} aria-hidden="true" /> Clear
          </button>
          <button type="button" className="bv-btn bv-btn-primary" onClick={handleSave} disabled={!dirty}>
            <Save size={16} aria-hidden="true" /> Save
          </button>
        </div>
      </footer>
    </div>
  );
};

export default BrandVoice;
