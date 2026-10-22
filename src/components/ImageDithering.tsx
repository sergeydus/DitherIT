'use client';

import { useRef, useEffect } from 'react';
import type { DitheringMethod } from '@/utils/dithering';
import { useImageProcessor } from '@/hooks/useImageProcessor';

export default function ImageDithering() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(false);
  const { processor, state } = useImageProcessor();
  const originalImage = state.source;
  const { method: ditheringMethod, bitsPerChannel: bitDepth, soften: applyBlur } = state.settings;
  const isProcessing = state.status === 'opening' || state.status === 'processing';
  const setDitheringMethod = (method: DitheringMethod) => processor.setSettings({ method });
  const setBitDepth = (bitsPerChannel: number) => processor.setSettings({ bitsPerChannel }, true);
  const setApplyBlur = (soften: boolean) => processor.setSettings({ soften });

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
    canvas.width = frame.baseline.width;
    canvas.height = frame.baseline.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.drawImage(frame.resultView, 0, 0);
  }, [processor, state.frame]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    void processor.importFiles(files);
  };
  const handleDownload = async () => {
    try {
      const { blob, filename } = await processor.exportPng();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 60_000);
      downloads.current.set(url, timer);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
    } catch { if (mounted.current) processor.reportFailure('export-failed'); }
  };
  const status = state.status === 'opening' ? 'Opening image…' : state.status === 'processing' ? 'Updating preview…' :
    state.status === 'outdated' || state.status === 'error' ? 'Preview out of date' :
    state.frame ? `Ready · Source ${state.frame.baseline.source.width} × ${state.frame.baseline.source.height} px → Output ${state.frame.baseline.width} × ${state.frame.baseline.height} px` : 'Choose an image to begin.';

  return (
    <div className="space-y-6" role="region" aria-label="Image editor"
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); void processor.importFiles(Array.from(event.dataTransfer.files)); }}>
      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* File Upload */}
          <div>
            <label htmlFor="image-upload" className="block text-sm font-medium text-gray-300 mb-2">
              Upload Image
            </label>
            <input
              ref={fileInputRef}
              id="image-upload"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
              onChange={handleImageUpload}
              className="block w-full text-sm text-gray-300
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-600 file:text-white
                hover:file:bg-blue-700
                cursor-pointer"
            />
          </div>

          {/* Dithering Method */}
          <div>
            <label htmlFor="dithering-method" className="block text-sm font-medium text-gray-300 mb-2">
              Dithering Method
            </label>
            <select
              id="dithering-method"
              value={ditheringMethod}
              onChange={(e) => setDitheringMethod(e.target.value as DitheringMethod)}
              className="block w-full px-4 py-2 bg-gray-700 text-white rounded-lg
                border border-gray-600 focus:border-blue-500 focus:outline-none
                focus:ring-2 focus:ring-blue-500"
              disabled={!originalImage}
            >
              <option value="none">None (Original)</option>
              <option value="floyd-steinberg">Floyd-Steinberg</option>
              <option value="atkinson">Atkinson</option>
              <option value="ordered">Ordered (Bayer)</option>
              <option value="random">Random</option>
              <option value="threshold">Threshold</option>
            </select>
          </div>

          {/* Bit Depth */}
          <div>
            <label htmlFor="bit-depth" className="block text-sm font-medium text-gray-300 mb-2">
              Bits per channel: {bitDepth} ({(2 ** bitDepth).toLocaleString()} levels/channel)
            </label>
            <input
              id="bit-depth"
              type="range"
              min="1"
              max="8"
              value={bitDepth}
              onChange={(e) => setBitDepth(Number(e.target.value))}
              className="block w-full h-2 bg-gray-700 rounded-lg appearance-none
                cursor-pointer accent-blue-600"
              disabled={!originalImage || ditheringMethod === 'none'}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 bit</span>
              <span>8 bit</span>
            </div>
          </div>

          {/* Blur Filter */}
          <div>
            <h2 className="block text-sm font-medium text-gray-300 mb-2">
              Filters
            </h2>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="blur-filter"
                checked={applyBlur}
                onChange={(e) => setApplyBlur(e.target.checked)}
                disabled={!originalImage || ditheringMethod === 'none'}
                className="w-4 h-4 bg-gray-700 border border-gray-600 rounded
                  cursor-pointer accent-blue-600"
              />
              <label htmlFor="blur-filter" className="text-sm text-gray-300 cursor-pointer">
                Soften dither pattern (1 px)
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-2">Blur after dithering; adds intermediate colors and softens transparent edges.</p>
          </div>
          <div>
            <label htmlFor="output-size" className="block text-sm font-medium text-gray-300 mb-2">Output size</label>
            <select id="output-size" value={state.output.mode} disabled={!originalImage}
              onChange={event => processor.setOutput({ mode: event.target.value as 'standard' | 'original' })}
              className="block w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
              <option value="standard">Standard — up to 2048 px</option>
              <option value="original">Original dimensions</option>
            </select>
            <p className="text-xs text-gray-400 mt-2">Standard caps the longest edge. Larger outputs take longer to render.</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-400">PNG, JPEG, WebP, GIF, AVIF, BMP · up to 20 MiB · 16 megapixels · browser support varies.</p>
        <p className="text-sm text-gray-400">Images stay in your browser. Animated images become a still image (first/default frame). You can also drop one image here.</p>
        <p role="status" className="mt-4 text-sm text-gray-300">{status}</p>
        {originalImage && <p className="text-sm text-gray-400 break-all">{originalImage.name}</p>}
        {state.exporting && <p role="status" className="text-sm text-gray-300">Preparing PNG for {state.exportFilename}…</p>}
        {state.error && <p role="alert" className="mt-2 text-sm text-red-300">{state.error}</p>}
        {isProcessing && <button onClick={() => processor.cancel()} className="mt-3 px-4 py-2 rounded bg-gray-700 text-white">Cancel preview</button>}
        {originalImage && (state.status === 'outdated' || state.status === 'error') &&
          <button onClick={() => processor.retry()} className="mt-3 px-4 py-2 rounded bg-blue-600 text-white">Render preview</button>}

        {/* Download Button */}
        {originalImage && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleDownload}
              disabled={!state.canExport}
              className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg
                hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                transition-colors duration-200 shadow-lg"
            >
              {state.exporting ? 'Preparing PNG…' : isProcessing ? 'Processing...' : 'Download Image'}
            </button>
          </div>
        )}
      </div>

      {/* Canvas Display */}
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="flex items-center justify-center min-h-[400px] bg-gray-900 rounded-lg">
          {!originalImage ? (
            <div className="text-center text-gray-400">
              <svg
                className="mx-auto h-12 w-12 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-lg">Upload an image to get started</p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={state.frame ? `${state.frame.baseline.source.name}, ${state.frame.settings.method}, ${state.frame.baseline.width} by ${state.frame.baseline.height} pixels` : 'Image preview is processing'}
              aria-busy={isProcessing}
              className="max-w-full h-auto rounded shadow-lg"
            />
          )}
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
