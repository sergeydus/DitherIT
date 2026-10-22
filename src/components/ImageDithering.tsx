"use client";

import { useRef, useEffect, useState } from 'react';
import type { DitheringMethod } from '@/utils/dithering';
import { useImageProcessor } from '@/hooks/useImageProcessor';
import { useClientReady } from '@/hooks/useClientReady';
import { outputDimensions, renderFilename, type OutputSize } from '@/lib/render-contract';
import { METHODS, colorSummary, settingsSummary } from '@/lib/editor-copy';
import { CommittedNumberInput } from './CommittedNumberInput';
import { ImagePreview } from './ImagePreview';
import { PRESETS, nextSeed, type Preset } from '@/lib/exploration';

const control = 'control';
const button = 'button';

function useSettledAnnouncement(message: string) {
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(message), 250);
    return () => clearTimeout(timer);
  }, [message]);
  return settled;
}

export default function ImageDithering() {
  const clientReady = useClientReady();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(false);
  const sampleRequest = useRef<AbortController | null>(null);
  const { processor, state } = useImageProcessor();
  const [notice, setNotice] = useState('');
  const [preset, setPreset] = useState<Preset>('balanced');
  const [sampleLoading, setSampleLoading] = useState(false);
  const [variation, setVariation] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [importCustomWidth, setImportCustomWidth] = useState<number | null>(null);
  const source = state.source;
  const { method, bitsPerChannel: bits, soften } = state.settings;
  const isProcessing = sampleLoading || state.status === 'opening' || state.status === 'processing';
  const bypassed = method === 'none';
  const size = source ? outputDimensions(source.width, source.height, state.output) : null;
  const resized = source && size && (size.width !== source.width || size.height !== source.height);
  const filename = source && size ? renderFilename({ baseline: { source, ...size }, settings: state.settings }) : null;
  const stale = state.status === 'outdated' || state.status === 'error';
  const status = sampleLoading ? 'Opening sample…' : state.status === 'opening' ? 'Opening image…' : state.status === 'processing' ? 'Updating preview…' :
    stale ? 'Preview out of date' : source && size ? 'Ready' : 'Choose an image to begin.';
  const exportStatus = state.exporting ? `Preparing PNG for ${state.exportFilename}…` : '';
  const clampNotice = importCustomWidth && source && state.output.mode === 'custom' && importCustomWidth > source.width ?
    `Custom width reduced to ${source.width} px to fit the new source.` : '';
  const variationNotice = variation !== null && method === 'random' && state.status === 'ready' && state.settings.seed === variation ?
    (bits === 8 ? `Variation seed ${variation} selected; 8-bit output bypasses noise.` : `New variation ready (seed ${variation}).`) : '';
  const announcement = useSettledAnnouncement([state.status === 'ready' ? `${status} · ${source?.name} · ${settingsSummary(state.settings)} · ${size?.width} × ${size?.height} px` : status, exportStatus, clampNotice, notice, variationNotice, state.errorAction === 'render' ? state.error : ''].filter(Boolean).join(' '));
  const importError = state.errorAction === 'import' && state.error;
  const renderError = state.errorAction === 'render' && state.error;
  const exportError = state.errorAction === 'export' && state.error;

  useEffect(() => {
    mounted.current = true;
    const pendingDownloads = downloads.current;
    return () => {
      mounted.current = false;
      sampleRequest.current?.abort();
      for (const [url, timer] of pendingDownloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
      pendingDownloads.clear();
    };
  }, []);

  const importFiles = (files: File[]) => {
    sampleRequest.current?.abort(); sampleRequest.current = null; setSampleLoading(false);
    setNotice(''); setVariation(null);
    setImportCustomWidth(state.output.mode === 'custom' ? state.output.width : null);
    void processor.importFiles(files);
  };
  const loadSample = async () => {
    sampleRequest.current?.abort();
    const request = new AbortController(); sampleRequest.current = request; setSampleLoading(true);
    try {
      const response = await fetch(`${process.env.NODE_ENV === 'production' ? '/DitherIT' : ''}/samples/ditherit-study.png`, { signal: request.signal });
      if (!response.ok) throw new Error('Sample unavailable');
      const blob = await response.blob();
      if (request.signal.aborted || !mounted.current) return;
      importFiles([new File([blob], 'ditherit-sample.png', { type: 'image/png' })]);
    } catch {
      if (!request.signal.aborted && mounted.current) processor.reportFailure('sample-failed', 'import');
    } finally {
      if (sampleRequest.current === request) { sampleRequest.current = null; if (mounted.current) setSampleLoading(false); }
    }
  };
  const manualSettings = (patch: Parameters<typeof processor.setSettings>[0], debounce = false) => {
    setNotice(''); setVariation(null); setPreset('custom'); processor.setSettings(patch, debounce);
  };
  const setOutput = (output: OutputSize) => { setNotice(''); setImportCustomWidth(null); processor.setOutput(output); };
  const handleDownload = async () => {
    if (!processor.getSnapshot().canExport) return;
    setNotice('');
    try {
      const { blob, filename: snapshotFilename } = await processor.exportPng();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 60_000);
      downloads.current.set(url, timer);
      const link = document.createElement('a');
      link.href = url; link.download = snapshotFilename;
      document.body.appendChild(link);
      try { link.click(); setNotice(`PNG download started for ${snapshotFilename}.`); } finally { link.remove(); }
    } catch {
      if (mounted.current && processor.getSnapshot().errorAction !== 'export') processor.reportFailure('export-failed');
    }
  };

  return (
    <div id="image-editor" tabIndex={-1} role="region" aria-label="Image editor"
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); importFiles(Array.from(event.dataTransfer.files)); }}>
      <div className="workspace">
        <section className="source-summary" aria-label="Image source">
          <div className="source-copy">
            <p className="eyebrow">YOUR IMAGE</p>
            {source ? <><p className="source-name" title={source.name}>{source.name}</p>
              <p id="source-dimensions" className="helper numeric">Source dimensions: {source.width} × {source.height} px</p></> :
              <p className="source-name">No image yet</p>}
          </div>
          <div className="source-action">
            <label htmlFor="image-upload" className="sr-only">Upload Image</label>
            <input ref={fileInputRef} hidden id="image-upload" type="file" disabled={!clientReady}
              accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
              aria-describedby={`import-help${importError ? ' import-error' : ''}`} aria-invalid={importError ? true : undefined}
              onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; importFiles(files); }} />
            <button className={`${button} button-quiet`} disabled={!clientReady} onClick={() => fileInputRef.current?.click()}
              aria-controls="image-upload" aria-describedby={`import-help${importError ? ' import-error' : ''}`}>{source ? 'Replace image' : 'Choose image'}</button>
          </div>
          {importError && <p id="import-error" role="alert" className="error source-error">{importError}</p>}
        </section>

        <section className="preview-panel panel" aria-labelledby="preview-heading">
          <div className="panel-heading"><h2 id="preview-heading">Preview</h2><span className="eyebrow">{source ? 'VIEW' : 'LOCAL · PRIVATE'}</span></div>
          {!source ? <div className="preview-surface" aria-busy={isProcessing}>
            <div className="empty-state">
              <svg aria-hidden="true" className="empty-mark" viewBox="0 0 64 64" fill="currentColor">
                <path d="M8 8h12v12H8zm18 0h12v12H26zm18 0h12v12H44zM8 26h12v12H8zm18 0h12v12H26zM8 44h12v12H8z"/>
                <path opacity=".5" d="M44 26h12v12H44zM26 44h12v12H26z"/><path opacity=".25" d="M44 44h12v12H44z"/>
              </svg>
              <h3>Make something out of fewer colors.</h3>
              <p>Choose a photo or illustration, then try a dithering style.</p>
              <div className="empty-actions">
                <button className="button button-primary" disabled={!clientReady} onClick={() => fileInputRef.current?.click()}>Choose image</button>
                <button className="button button-quiet" disabled={!clientReady || sampleLoading} onClick={() => void loadSample()} aria-describedby="sample-help">{sampleLoading ? 'Opening sample…' : 'Try a sample'}</button>
              </div>
              <p id="sample-help" className="helper">A local sample with gradients, fine edges and texture. You can also drop one image here.</p>
            </div>
          </div> : <ImagePreview key={source.id} frame={state.frame} stale={stale || isProcessing} getSnapshot={processor.getSnapshot} />}
          <div className="preview-feedback">
            <div className="status-row"><p id="preview-status">{status}{state.exporting && ` · ${exportStatus}`}</p>
              {isProcessing && <button onClick={() => { sampleRequest.current?.abort(); sampleRequest.current = null; setSampleLoading(false); setNotice(''); processor.cancel(); }} className={`${button} button-quiet`}>Cancel preview</button>}
              {source && stale && <button onClick={() => { setNotice(''); processor.retry(); }} aria-describedby={renderError ? 'render-error' : 'preview-status'} className={`${button} button-quiet`}>Render preview</button>}
            </div>
            <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
            {state.frame && (stale || isProcessing) && <p id="rendered-summary" className="helper">Rendered with: {state.frame.baseline.source.name} · {settingsSummary(state.frame.settings)} · {state.frame.baseline.width} × {state.frame.baseline.height} px</p>}
            {renderError && <p id="render-error" className="error">{renderError}</p>}
            {clampNotice && <p className="helper">{clampNotice}</p>}
            {notice && <p className="helper">{notice}</p>}
          </div>
          <div id="import-help" className="import-help helper">
            <p>PNG, JPEG, WebP, GIF, AVIF, BMP · browser support varies · up to 20 MiB · 16 megapixels.</p>
            <p>Images are processed in your browser. Animated images become a still image (first/default frame).</p>
          </div>
        </section>

        <aside className="inspector panel" aria-labelledby="settings-heading">
          <div className="panel-heading"><h2 id="settings-heading">Look</h2><span className="eyebrow">RGB</span></div>
          <p id="settings-help" className={source ? 'sr-only' : 'helper'}>{source ? 'Adjust the look and output size below.' : 'Choose an image to enable settings and output controls.'}</p>
          <div className="inspector-section">
            <label htmlFor="preset">Preset</label>
            <select id="preset" className="control" disabled={!source} value={preset} aria-describedby="preset-help" onChange={event => {
              const selected = event.target.value as keyof typeof PRESETS;
              const { method, bitsPerChannel, soften } = PRESETS[selected];
              setPreset(selected); setNotice(''); setVariation(null); setResetKey(key => key + 1);
              processor.setSettings({ method, bitsPerChannel, soften });
            }}><option value="custom" disabled>Custom</option>{Object.entries(PRESETS).map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}</select>
            <p id="preset-help" className="helper">Presets retain RGB color and keep your output dimensions.</p>
          </div>
          <div className="inspector-section">
            <label htmlFor="dithering-method">Dithering Method</label>
            <select id="dithering-method" value={method} disabled={!source} className={control} aria-describedby="method-help settings-help"
              onChange={event => manualSettings({ method: event.target.value as DitheringMethod })}>
              {Object.entries(METHODS).map(([value, item]) => <option key={value} value={value}>{item.name}</option>)}
            </select>
            <p id="method-help" className="helper">{METHODS[method].description}</p>
            {method === 'random' && <div className="variation-control">
              <p id="random-seed" className="helper numeric">Seed: {state.settings.seed}</p>
              <button className="button button-quiet" disabled={!source} aria-describedby="random-seed" onClick={() => {
                const seed = nextSeed(state.settings.seed); setPreset('custom'); setNotice(''); setVariation(seed); processor.setSettings({ seed });
              }}>New variation</button>
              {bits === 8 && <p className="helper">8-bit output bypasses noise; the seed affects lower bit depths.</p>}
            </div>}
          </div>
          <div className="inspector-section">
            <label htmlFor="bit-depth">Bits per channel: <span className="numeric">{bits}</span></label>
            <input id="bit-depth" type="range" min="1" max="8" step="1" value={bits} disabled={!source || bypassed}
              aria-valuetext={`${bits} bits per channel, ${2 ** bits} levels per channel`} aria-describedby="color-summary depth-help bypass-help"
              onChange={event => manualSettings({ bitsPerChannel: Number(event.target.value) }, true)} className="depth-slider" />
            <CommittedNumberInput key={`bits-${resetKey}`} id="bit-depth-number" label="Bits per channel (number)" value={bits} min={1} max={8}
              disabled={!source || bypassed} describedBy="color-summary depth-help bypass-help"
              onCommit={bitsPerChannel => { if (bitsPerChannel !== bits) manualSettings({ bitsPerChannel }); }} />
            <p id="color-summary" className="helper numeric">{colorSummary(bits)}</p>
            <p id="depth-help" className="helper">Pre-soften RGB upper bound, excluding alpha; not PNG file bit depth or a guarantee of unique colors.
              {soften && !bypassed && ' Before softening; final image may contain more colors.'}</p>
          </div>
          <fieldset className="inspector-section" aria-describedby="soften-help bypass-help">
            <legend>Filters</legend>
            <label htmlFor="blur-filter" className="check-row">
              <input id="blur-filter" type="checkbox" checked={soften} disabled={!source || bypassed} aria-describedby="soften-help bypass-help"
                onChange={event => manualSettings({ soften: event.target.checked })} />
              <span>Soften dither pattern</span>
            </label>
            <p id="soften-help" className="helper">Apply a 1 px blur after dithering, at output resolution. Adds intermediate colors and softens transparent edges.</p>
          </fieldset>
          <p id="bypass-help" className={bypassed ? 'helper' : 'sr-only'}>{bypassed ? 'Color reduction and softening are bypassed. Their values are retained; output sizing still applies.' : 'Bits and soften apply to the selected dithering method.'}</p>
          <button disabled={!source} className={`${button} button-quiet reset-button`} aria-describedby="reset-help settings-help"
            onClick={() => { setResetKey(key => key + 1); setImportCustomWidth(null); setPreset('balanced'); setVariation(null); processor.resetSettings(); setNotice('Settings reset.'); }}>Reset settings</button>
          <p id="reset-help" className="sr-only">Floyd–Steinberg, 4 bits/channel, soften off, Standard output. Keeps your image.</p>
          <section className="output-section" aria-labelledby="output-heading">
            <h2 id="output-heading">Output</h2>
            <label htmlFor="output-size">Output size</label>
            <select id="output-size" value={state.output.mode} disabled={!source} className={control} aria-describedby="output-help settings-help"
              onChange={event => {
                if (event.target.value === 'custom' && source && size) {
                  const width = Math.min(customWidth ?? size.width, source.width);
                  setCustomWidth(width); setOutput({ mode: 'custom', width });
                } else setOutput({ mode: event.target.value as 'standard' | 'original' });
              }}>
              <option value="standard">Standard — up to 2048 px</option>
              <option value="original">Original dimensions</option><option value="custom">Custom width</option>
            </select>
            <p id="output-help" className="helper">Standard caps the longest edge. Larger images take longer to render.</p>
            {source && state.output.mode === 'custom' && <div className="inspector-section">
              <CommittedNumberInput key={`width-${source.id}-${resetKey}`} id="custom-width" label="Custom width (px)" value={state.output.width} min={1} max={source.width}
                describedBy="width-help" onCommit={width => { setCustomWidth(width); setOutput({ mode: 'custom', width }); }} />
              <p id="width-help" className="helper">1–{source.width.toLocaleString('en-US')} px; height follows the source aspect ratio. No upscaling.</p>
            </div>}
            {resized && <p className="helper resize-note">Resized for faster editing. This is the actual PNG output size.</p>}
            <div className="export-summary-block">
              <p id="export-summary" className={size ? 'numeric' : 'helper'}>{size ? <><span id="output-dimensions">PNG {size.width} × {size.height} px</span> · alpha retained</> : 'PNG export available after you choose an image'}
                {soften && !bypassed && <span className="helper export-edge-note">Softening modifies transparent edges.</span>}</p>
              {filename && <p id="export-filename" className="helper numeric">Filename: {filename}</p>}
            </div>
            <p id="export-help" className="sr-only">{state.exporting ? exportStatus : state.canExport ? 'Ready to export the committed result.' : source ? 'Export is available when the selected settings finish rendering.' : 'Export is disabled until an image is ready.'}</p>
            {exportError && <p id="export-error" role="alert" className="error">{exportError}</p>}
            <button onClick={handleDownload} disabled={!source} aria-disabled={!state.canExport} aria-describedby={`export-summary export-help${filename ? ' export-filename' : ''}${exportError ? ' export-error' : ''}`}
              className={`${button} button-primary export-button`}>Export PNG</button>
          </section>
        </aside>
      </div>
      <details id="dithering-guide" className="guide panel">
        <summary>Guide to dithering <span className="helper">Methods, color and local processing</span></summary>
        <div className="guide-content">
          <p>Dithering places a pattern of nearby colors to suggest more tones. These methods work on RGB channels, so low bit depths still retain color.</p>
          <div className="method-guide">{Object.entries(METHODS).map(([value, item]) => <section key={value}><h3>{item.name}</h3><p>{item.description}</p></section>)}</div>
          <p>Soften blurs the finished dither pattern at output resolution and adds intermediate colors. Original bypasses reduction and softening; output sizing still applies.</p>
          <p>Images and PNG exports are processed locally. Theme is the only saved preference. Refreshing clears the image and settings.</p>
        </div>
      </details>
    </div>
  );
}
