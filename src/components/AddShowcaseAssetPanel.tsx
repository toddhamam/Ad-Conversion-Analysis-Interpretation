import { useRef } from 'react';
import { isAcceptedImageType, ACCEPTED_MIME_TYPES } from '../lib/imageNormalize';
import type {
  ShowcaseAssetKind, DeviceHint, SourceDraft, FinishedDraft,
} from '../services/showcaseLibraryApi';

const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');

const DEVICE_OPTIONS: Array<{ value: DeviceHint; label: string }> = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
];

interface Props {
  kind: ShowcaseAssetKind;
  onKindChange: (kind: ShowcaseAssetKind) => void;

  source: SourceDraft;
  onSourceChange: (patch: Partial<SourceDraft>) => void;
  onSubmitSource: () => void;

  finished: FinishedDraft;
  onFinishedChange: (patch: Partial<FinishedDraft>) => void;
  onSubmitFinished: () => void;

  /** Surfaced by the page so one banner reports every failure. */
  onRejectFile: (message: string) => void;
  uploading: boolean;
  isFull: boolean;
  limit: number;
}

/**
 * The "add something" half of the Showcase Library.
 *
 * TWO PANELS, NOT ONE FORM WITH A MODE. They ingest different things: a source screenshot needs a
 * client's name and may carry a "before"; a finished creative is whole, has no client to name and
 * pairs with nothing. A single form with half its fields greyed out would misrepresent that, and
 * the two drafts are separate types for the same reason.
 *
 * Lives outside ShowcaseLibrary.tsx because inlining it put 122 lines of conditional JSX in the
 * middle of the page — the same reason ShowcaseConfigPanel was extracted from AdGenerator.
 */
const AddShowcaseAssetPanel = ({
  kind, onKindChange,
  source, onSourceChange, onSubmitSource,
  finished, onFinishedChange, onSubmitFinished,
  onRejectFile, uploading, isFull, limit,
}: Props) => {
  const heroRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef<HTMLInputElement>(null);

  /** One validation path for all three inputs, so no lane can accept a file another rejects. */
  const pick = (accept: (file: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !isAcceptedImageType(file.type)) {
      onRejectFile(`${file.name} is not an image we can read. Use PNG, JPEG, WebP or GIF.`);
    } else if (file) {
      accept(file);
    }
    // Reset so re-picking the same file fires change again.
    e.target.value = '';
  };

  const canSubmitSource = !!source.hero && source.clientName.trim().length > 0 && !uploading && !isFull;
  const canSubmitFinished = !!finished.file && !uploading && !isFull;

  const fullNotice = isFull && (
    <span className="upload-hint">Library is full at {limit}. Delete something to add more.</span>
  );

  return (
    <section className="showcase-upload">
      <div className="add-kind-tabs" role="tablist">
        <button
          role="tab" aria-selected={kind === 'source'}
          className={`add-kind-tab ${kind === 'source' ? 'active' : ''}`}
          onClick={() => onKindChange('source')}
        >
          Client work
          <span>Raw screenshots we frame for you</span>
        </button>
        <button
          role="tab" aria-selected={kind === 'finished'}
          className={`add-kind-tab ${kind === 'finished' ? 'active' : ''}`}
          onClick={() => onKindChange('finished')}
        >
          Finished creative
          <span>Already designed — publishes untouched</span>
        </button>
      </div>

      {kind === 'finished' ? (
        <>
          <p className="config-hint finished-hint">
            For creatives that are already complete — your own before/after designs, offer
            graphics, anything a designer has finished. Nothing is added: no frame, no labels, no
            crop. You are responsible for any claims the artwork makes.
          </p>

          <div className="upload-grid">
            <div className="upload-slot">
              <span className="slot-label">The creative <em>(required)</em></span>
              <button type="button" className="slot-btn" onClick={() => finishedRef.current?.click()}>
                {finished.file ? finished.file.name : 'Choose image…'}
              </button>
              <input
                ref={finishedRef} type="file" accept={ACCEPT_ATTR} hidden
                onChange={pick(file => onFinishedChange({ file }))}
              />
            </div>

            <label className="upload-field">
              <span className="slot-label">Label <em>(optional)</em></span>
              <input
                type="text" value={finished.label} placeholder="Joyful Freedom — before/after"
                onChange={e => onFinishedChange({ label: e.target.value })}
              />
            </label>
          </div>

          <div className="upload-actions">
            <button className="btn-primary" disabled={!canSubmitFinished} onClick={onSubmitFinished}>
              {uploading ? 'Saving…' : 'Add to library'}
            </button>
            {fullNotice}
          </div>
        </>
      ) : (
        <>
          <h2>Add client work</h2>

          <div className="upload-grid">
            <div className="upload-slot">
              <span className="slot-label">The build <em>(required)</em></span>
              <button type="button" className="slot-btn" onClick={() => heroRef.current?.click()}>
                {source.hero ? source.hero.name : 'Choose screenshot…'}
              </button>
              <input
                ref={heroRef} type="file" accept={ACCEPT_ATTR} hidden
                onChange={pick(hero => onSourceChange({ hero }))}
              />
            </div>

            <div className="upload-slot">
              <span className="slot-label">The old site <em>(optional)</em></span>
              <button type="button" className="slot-btn" onClick={() => beforeRef.current?.click()}>
                {source.before ? source.before.name : 'Choose "before"…'}
              </button>
              <input
                ref={beforeRef} type="file" accept={ACCEPT_ATTR} hidden
                onChange={pick(before => onSourceChange({ before }))}
              />
            </div>

            <label className="upload-field">
              <span className="slot-label">Client <em>(required)</em></span>
              <input
                type="text" value={source.clientName} placeholder="Acme Dental"
                onChange={e => onSourceChange({ clientName: e.target.value })}
              />
            </label>

            <label className="upload-field">
              <span className="slot-label">Site URL</span>
              <input
                type="text" value={source.projectUrl} placeholder="acmedental.com"
                onChange={e => onSourceChange({ projectUrl: e.target.value })}
              />
            </label>

            <label className="upload-field">
              <span className="slot-label">Captured on</span>
              <select
                value={source.deviceHint}
                onChange={e => onSourceChange({ deviceHint: e.target.value as DeviceHint })}
              >
                {DEVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <label className="upload-consent">
              <input
                type="checkbox" checked={source.consent}
                onChange={e => onSourceChange({ consent: e.target.checked })}
              />
              <span>This client is happy for their site to appear in ads</span>
            </label>
          </div>

          <div className="upload-actions">
            <button className="btn-primary" disabled={!canSubmitSource} onClick={onSubmitSource}>
              {uploading ? 'Saving…' : 'Add to library'}
            </button>
            {fullNotice}
          </div>
        </>
      )}
    </section>
  );
};

export default AddShowcaseAssetPanel;
