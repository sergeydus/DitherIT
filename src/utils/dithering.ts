// Dithering algorithms for image processing

export type DitheringMethod = 'none' | 'floyd-steinberg' | 'atkinson' | 'ordered' | 'random' | 'threshold';

// Reduce color bit depth
export function reduceBitDepth(value: number, bits: number): number {
  const levels = Math.pow(2, bits);
  return Math.round((value / 255) * (levels - 1)) * (255 / (levels - 1));
}

// Floyd-Steinberg dithering
export function floydSteinbergDither(imageData: ImageData, bitDepth: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const oldPixel = data[idx + c];
        const newPixel = reduceBitDepth(oldPixel, bitDepth);
        data[idx + c] = newPixel;
        const error = oldPixel - newPixel;

        // Distribute error to neighboring pixels
        if (x + 1 < width) {
          data[idx + c + 4] += error * 7 / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            data[idx + c + width * 4 - 4] += error * 3 / 16;
          }
          data[idx + c + width * 4] += error * 5 / 16;
          if (x + 1 < width) {
            data[idx + c + width * 4 + 4] += error * 1 / 16;
          }
        }
      }
    }
  }

  return new ImageData(data, width, height);
}

// Atkinson dithering
export function atkinsonDither(imageData: ImageData, bitDepth: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const oldPixel = data[idx + c];
        const newPixel = reduceBitDepth(oldPixel, bitDepth);
        data[idx + c] = newPixel;
        const error = (oldPixel - newPixel) / 8;

        // Atkinson dithering pattern
        if (x + 1 < width) data[idx + c + 4] += error;
        if (x + 2 < width) data[idx + c + 8] += error;
        if (y + 1 < height) {
          if (x > 0) data[idx + c + width * 4 - 4] += error;
          data[idx + c + width * 4] += error;
          if (x + 1 < width) data[idx + c + width * 4 + 4] += error;
        }
        if (y + 2 < height) {
          data[idx + c + width * 8] += error;
        }
      }
    }
  }

  return new ImageData(data, width, height);
}

// Ordered (Bayer matrix) dithering
export function orderedDither(imageData: ImageData, bitDepth: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  // 4x4 Bayer matrix
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const threshold = (bayerMatrix[y % 4][x % 4] / 16 - 0.5) * 255;

      for (let c = 0; c < 3; c++) {
        const oldPixel = data[idx + c] + threshold;
        data[idx + c] = reduceBitDepth(oldPixel, bitDepth);
      }
    }
  }

  return new ImageData(data, width, height);
}

// Random dithering
export function randomDither(imageData: ImageData, bitDepth: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const randomNoise = (Math.random() - 0.5) * 50;
        const oldPixel = data[idx + c] + randomNoise;
        data[idx + c] = reduceBitDepth(oldPixel, bitDepth);
      }
    }
  }

  return new ImageData(data, width, height);
}

// Simple threshold dithering
export function thresholdDither(imageData: ImageData, bitDepth: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        data[idx + c] = reduceBitDepth(data[idx + c], bitDepth);
      }
    }
  }

  return new ImageData(data, width, height);
}

// Apply selected dithering method
export function applyDithering(
  imageData: ImageData,
  method: DitheringMethod,
  bitDepth: number
): ImageData {
  switch (method) {
    case 'floyd-steinberg':
      return floydSteinbergDither(imageData, bitDepth);
    case 'atkinson':
      return atkinsonDither(imageData, bitDepth);
    case 'ordered':
      return orderedDither(imageData, bitDepth);
    case 'random':
      return randomDither(imageData, bitDepth);
    case 'threshold':
      return thresholdDither(imageData, bitDepth);
    case 'none':
    default:
      return thresholdDither(imageData, bitDepth);
  }
}
