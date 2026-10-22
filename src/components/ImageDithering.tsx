"use client";

import { useRef, useEffect, useState } from 'react';
import type { DitheringMethod } from '@/utils/dithering';
import { useImageProcessor } from '@/hooks/useImageProcessor';
import { outputDimensions, renderFilename, type OutputSize } from '@/lib/render-contract';
import { METHODS, colorSummary, settingsSummary } from '@/lib/editor-copy';
import { CommittedNumberInput } from './CommittedNumberInput';

const control = 'block w-full min-h-11 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300';
const button = 'min-h-11 px-4 py-2 rounded-lg text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:opacity-60 disabled:cursor-not-allowed';

function useSettledAnnouncement(message: string) {
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(message), 250);
    return () => clearTimeout(timer);
  }, [message]);
  return settled;
}

export default function ImageDithering() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(false);
  const { processor, state } = useImageProcessor();
  const [notice, setNotice] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [importCustomWidth, setImportCustomWidth] = useState<number | null>(null);
  const source = state.source;
  const { method, bitsPerChannel: bits, soften } = state.settings;
  const isProcessing = state.status === 'opening' || state.status === 'processing';
  const bypassed = method === 'none';
  const size = source ? outputDimensions(source.width, source.height, state.output) : null;
  const resized = source && size && (size.width !== source.width || size.height !== source.height);
  const filename = source && size ? renderFilename({ baseline: { source, ...size }, settings: state.settings }) : null;
  const stale = state.status === 'outdated' || state.status === 'error';
  const status = state.status === 'opening' ? 'Opening image…' : state.status === 'processing' ? 'Updating preview…' :
    stale ? 'Preview out of date' : source && size ? `Ready · ${source.name} · ${settingsSummary(state.settings)} · ${size.width} × ${size.height} px` : 'Choose an image to begin.';
  const exportStatus = state.exporting ? `Preparing PNG for ${state.exportFilename}…` : '';
  const clampNotice = importCustomWidth && source && state.output.mode === 'custom' && importCustomWidth > source.width ?
    `Custom width reduced to ${source.width} px to fit the new source.` : '';
  const announcement = useSettledAnnouncement([status, exportStatus, clampNotice, notice, state.errorAction === 'render' ? state.error : ''].filter(Boolean).join(' '));
  const importError = state.errorAction === 'import' && state.error;
  const renderError = state.errorAction === 'render' && state.error;
  const exportError = state.errorAction === 'export' && state.error;

  useEffect(() => {
    mounted.current = true;
    const pendingDownloads = downloads.current;
    return () => {
      mounted.current = false;
      for (const [url, timer] of pendingDownloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
      pendingDownloads.clear();
    };
  }, []);

  useEffect(() => {
    const frame = state.frame;
    const canvas = canvasRef.current;
    if (!frame || !canvas || frame !== processor.getSnapshot().frame) return;
    canvas.width = frame.baseline.width; canvas.height = frame.baseline.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.drawImage(frame.resultView, 0, 0);
  }, [processor, state.frame]);

  const importFiles = (files: File[]) => {
    setNotice('');
    setImportCustomWidth(state.output.mode === 'custom' ? state.output.width : null);
    void processor.importFiles(files);
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
    <div id="image-editor" tabIndex={-1} className="space-y-6" role="region" aria-label="Image editor"
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); importFiles(Array.from(event.dataTransfer.files)); }}>
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <p id="settings-help" className="text-sm text-gray-300 mb-4">{source ? 'Adjust the look and output size below.' : 'Choose an image to enable settings and output controls.'}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label htmlFor="image-upload" className="block text-sm font-medium text-gray-300 mb-2">Upload Image</label>
            <input id="image-upload" type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
              aria-describedby={`import-help${importError ? ' import-error' : ''}`} aria-invalid={importError ? true : undefined}
              onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; importFiles(files); }}
              className="block w-full text-sm text-gray-300 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-700 file:text-white hover:file:bg-blue-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" />
            {importError && <p id="import-error" role="alert" className="mt-2 text-sm text-red-300">{importError}</p>}
          </div>
          <div>
            <label htmlFor="dithering-method" className="block text-sm font-medium text-gray-300 mb-2">Dithering Method</label>
            <select id="dithering-method" value={method} disabled={!source} className={control} aria-describedby="method-help settings-help"
              onChange={event => { setNotice(''); processor.setSettings({ method: event.target.value as DitheringMethod }); }}>
              {Object.entries(METHODS).map(([value, item]) => <option key={value} value={value}>{item.name}</option>)}
            </select>
            <p id="method-help" className="mt-2 text-sm text-gray-300">{METHODS[method].description}</p>
          </div>
          <div>
            <label htmlFor="bit-depth" className="block text-sm font-medium text-gray-300 mb-2">Bits per channel: {bits}</label>
            <input id="bit-depth" type="range" min="1" max="8" step="1" value={bits} disabled={!source || bypassed}
              aria-valuetext={`${bits} bits per channel, ${2 ** bits} levels per channel`}
              aria-describedby="color-summary depth-help bypass-help"
              onChange={event => { setNotice(''); processor.setSettings({ bitsPerChannel: Number(event.target.value) }, true); }}
              className="block w-full min-h-11 accent-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" />
            <CommittedNumberInput key={`bits-${resetKey}`} id="bit-depth-number" label="Bits per channel (number)" value={bits} min={1} max={8}
              disabled={!source || bypassed} describedBy="color-summary depth-help bypass-help"
              onCommit={bitsPerChannel => { setNotice(''); processor.setSettings({ bitsPerChannel }); }} />
            <p id="color-summary" className="mt-2 text-sm text-gray-300">{colorSummary(bits)}</p>
            <p id="depth-help" className="mt-2 text-sm text-gray-300">Pre-soften RGB upper bound, excluding alpha; not PNG file bit depth or a guarantee of unique colors.
              {soften && !bypassed && ' Before softening; final image may contain more colors.'}</p>
          </div>
          <fieldset className="min-w-0" aria-describedby="soften-help bypass-help">
            <legend className="text-sm font-medium text-gray-300 mb-2">Filters</legend>
            <div className="flex items-center gap-3 min-h-11">
              <input id="blur-filter" type="checkbox" checked={soften} disabled={!source || bypassed} aria-describedby="soften-help bypass-help"
                onChange={event => { setNotice(''); processor.setSettings({ soften: event.target.checked }); }}
                className="w-5 h-5 accent-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" />
              <label htmlFor="blur-filter" className="py-3 text-sm text-gray-300 cursor-pointer">Soften dither pattern</label>
            </div>
            <p id="soften-help" className="text-sm text-gray-300">Apply a 1 px blur after dithering, at output resolution. Adds intermediate colors and softens transparent edges.</p>
          </fieldset>
          <div>
            <label htmlFor="output-size" className="block text-sm font-medium text-gray-300 mb-2">Output size</label>
            <select id="output-size" value={state.output.mode} disabled={!source} className={control} aria-describedby="output-help settings-help"
              onChange={event => {
                if (event.target.value === 'custom' && source && size) {
                  const width = Math.min(customWidth ?? size.width, source.width);
                  setCustomWidth(width); setOutput({ mode: 'custom', width });
                } else setOutput({ mode: event.target.value as 'standard' | 'original' });
              }}>
              <option value="standard">Standard — up to 2048 px</option>
              <option value="original">Original dimensions</option>
              <option value="custom">Custom width</option>
            </select>
            <p id="output-help" className="mt-2 text-sm text-gray-300">Standard caps the longest edge. Larger images take longer to render.</p>
            {source && state.output.mode === 'custom' && <div className="mt-3">
              <CommittedNumberInput key={`width-${source.id}-${resetKey}`} id="custom-width" label="Custom width (px)" value={state.output.width} min={1} max={source.width}
                describedBy="width-help" onCommit={width => { setCustomWidth(width); setOutput({ mode: 'custom', width }); }} />
              <p id="width-help" className="mt-2 text-sm text-gray-300">1–{source.width.toLocaleString('en-US')} px; height follows the source aspect ratio. No upscaling.</p>
            </div>}
          </div>
          <div>
            <button disabled={!source} className={`${button} bg-gray-700 hover:bg-gray-600`} aria-describedby="reset-help settings-help"
              onClick={() => { setResetKey(key => key + 1); setImportCustomWidth(null); processor.resetSettings(); setNotice('Settings reset.'); }}>Reset settings</button>
            <p id="reset-help" className="mt-2 text-sm text-gray-300">Floyd–Steinberg, 4 bits/channel, soften off, Standard output. Keeps your image.</p>
          </div>
        </div>
        <p id="bypass-help" className="mt-3 text-sm text-gray-300">{bypassed ? 'Color reduction and softening are bypassed. Their values are retained; output sizing still applies.' : 'Bits and soften apply to the selected dithering method.'}</p>
        <div id="import-help" className="mt-4 text-sm text-gray-300">
          <p>PNG, JPEG, WebP, GIF, AVIF, BMP · up to 20 MiB · 16 megapixels · browser support varies.</p>
          <p>Images stay in your browser. Animated images become a still image (first/default frame). You can also drop one image here.</p>
        </div>
        {source && size && <div className="mt-4 text-sm text-gray-300">
          <p className="break-all">{source.name}</p>
          <p id="source-dimensions">Source dimensions: {source.width} × {source.height} px</p>
          <p id="output-dimensions">Output dimensions: {size.width} × {size.height} px</p>
          {resized && <p>Resized for faster editing. This is the actual PNG output size.</p>}
          {clampNotice && <p>{clampNotice}</p>}
        </div>}
        <p id="preview-status" className="mt-4 text-sm text-gray-300">{status}</p>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
        {state.frame && <p id="rendered-summary" className="mt-2 text-sm text-gray-300">{stale || isProcessing ? 'Last rendered' : 'Rendered'}: {state.frame.baseline.source.name} · {settingsSummary(state.frame.settings)} · {state.frame.baseline.width} × {state.frame.baseline.height} px</p>}
        {renderError && <p id="render-error" className="mt-2 text-sm text-red-300">{renderError}</p>}
        {isProcessing && <button onClick={() => { setNotice(''); processor.cancel(); }} className={`${button} mt-3 bg-gray-700`}>Cancel preview</button>}
        {source && stale && <button onClick={() => { setNotice(''); processor.retry(); }} aria-describedby={renderError ? 'render-error' : 'preview-status'} className={`${button} mt-3 bg-blue-700`}>Render preview</button>}
        <div className="mt-6 space-y-2">
          <p id="export-summary" className="text-sm text-gray-300">{source && size ? `Source ${source.width} × ${source.height} px → PNG ${size.width} × ${size.height} px · alpha retained` : 'Choose an image to prepare a PNG export.'}
            {soften && !bypassed && ' Softening modifies transparent edges.'}</p>
          {filename && <p id="export-filename" className="text-sm text-gray-300 break-all">Filename: {filename}</p>}
          <p id="export-help" className="text-sm text-gray-300">{state.exporting ? exportStatus : state.canExport ? 'Ready to export the committed result.' : source ? 'Export is available when the selected settings finish rendering.' : 'Export is disabled until an image is ready.'}</p>
          {notice && <p className="text-sm text-gray-300">{notice}</p>}
          {exportError && <p id="export-error" role="alert" className="text-sm text-red-300">{exportError}</p>}
          <div className="flex justify-center">
            <button onClick={handleDownload} disabled={!source} aria-disabled={!state.canExport} aria-describedby={`export-summary export-help${filename ? ' export-filename' : ''}${exportError ? ' export-error' : ''}`}
              className={`${button} px-6 py-3 bg-green-700 hover:bg-green-800 disabled:bg-gray-600 aria-disabled:bg-gray-600 aria-disabled:cursor-not-allowed font-semibold shadow-lg`}>Export PNG</button>
          </div>
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="flex items-center justify-center min-h-[400px] bg-gray-900 rounded-lg">
          {!source ? <div className="text-center text-gray-300">
            <svg aria-hidden="true" className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg><p className="text-lg">Upload an image to get started</p>
          </div> : <canvas ref={canvasRef} role="img"
            aria-label={state.frame ? `${state.frame.baseline.source.name}, ${settingsSummary(state.frame.settings)}, ${state.frame.baseline.width} by ${state.frame.baseline.height} pixels${stale || isProcessing ? ', preview out of date' : ''}` : 'Image preview is processing'}
            aria-describedby={`${state.frame ? 'rendered-summary ' : ''}preview-status`} aria-busy={isProcessing} className="max-w-full h-auto rounded shadow-lg" />}
        </div>
      </div>
      {/* Info Section */}
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-white mb-4">About Dithering</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300 text-sm">
          <div>
            <h3 className="font-semibold text-blue-400 mb-2">Floyd-Steinberg</h3>
            <p>Error diffusion algorithm that distributes quantization error to neighboring pixels.</p>
          </div>
          <div>
            <h3 className="font-semibold text-blue-400 mb-2">Atkinson</h3>
            <p>Developed by Apple, distributes error more conservatively creating lighter images.</p>
          </div>
          <div>
            <h3 className="font-semibold text-blue-400 mb-2">Ordered (Bayer)</h3>
            <p>Uses a threshold map to create a regular pattern, fast and suitable for textures.</p>
          </div>
          <div>
            <h3 className="font-semibold text-blue-400 mb-2">Random</h3>
            <p>Adds random noise before quantization, creating a grainy effect.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
