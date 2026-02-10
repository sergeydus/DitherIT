'use client';

import { useRef, useState, useEffect } from 'react';
import { applyDithering, DitheringMethod } from '@/utils/dithering';

export default function ImageDithering() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [ditheringMethod, setDitheringMethod] = useState<DitheringMethod>('floyd-steinberg');
  const [bitDepth, setBitDepth] = useState<number>(4);
  const [isProcessing, setIsProcessing] = useState(false);
  const [applyBlur, setApplyBlur] = useState(false);

  // Load and display image
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
        drawImageToCanvas(img);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Draw image to canvas
  const drawImageToCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas size to match image
    const maxWidth = 800;
    const maxHeight = 600;
    let width = img.width;
    let height = img.height;

    // Scale down if too large
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width *= ratio;
      height *= ratio;
    }

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(img, 0, 0, width, height);
  };

  // Apply dithering effect
  useEffect(() => {
    if (!originalImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Redraw original image
    drawImageToCanvas(originalImage);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Apply dithering in a setTimeout to prevent UI blocking
    setTimeout(() => {
      setIsProcessing(true);
      const ditheredData = applyDithering(imageData, ditheringMethod, bitDepth);
      ctx.putImageData(ditheredData, 0, 0);
      setIsProcessing(false);
    }, 10);
  }, [originalImage, ditheringMethod, bitDepth]);

  // Download processed image
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dithered-image-${ditheringMethod}-${bitDepth}bit.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Upload Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Dithering Method
            </label>
            <select
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bit Depth: {bitDepth} bit ({Math.pow(Math.pow(2, bitDepth), 3).toLocaleString()} colors)
            </label>
            <input
              type="range"
              min="1"
              max="8"
              value={bitDepth}
              onChange={(e) => setBitDepth(Number(e.target.value))}
              className="block w-full h-2 bg-gray-700 rounded-lg appearance-none
                cursor-pointer accent-blue-600"
              disabled={!originalImage}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 bit</span>
              <span>8 bit</span>
            </div>
          </div>

          {/* Blur Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Filters
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="blur-filter"
                checked={applyBlur}
                onChange={(e) => setApplyBlur(e.target.checked)}
                disabled={!originalImage}
                className="w-4 h-4 bg-gray-700 border border-gray-600 rounded
                  cursor-pointer accent-blue-600"
              />
              <label htmlFor="blur-filter" className="text-sm text-gray-300 cursor-pointer">
                Apply Blur (1px)
              </label>
            </div>
          </div>
        </div>

        {/* Download Button */}
        {originalImage && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleDownload}
              disabled={isProcessing}
              className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg
                hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                transition-colors duration-200 shadow-lg"
            >
              {isProcessing ? 'Processing...' : 'Download Image'}
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
              className="max-w-full h-auto rounded shadow-lg"
              style={{
                filter: applyBlur ? 'blur(1px)' : 'none',
              }}
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
