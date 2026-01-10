# Image Dithering Studio

A Next.js application that allows users to apply various dithering algorithms to images with adjustable bit depth control.

## Features

- **Load Images**: Upload images from your device
- **Multiple Dithering Methods**:
  - Floyd-Steinberg (error diffusion)
  - Atkinson (Apple's dithering algorithm)
  - Ordered/Bayer (threshold map pattern)
  - Random dithering
  - Simple threshold
- **Bit Depth Control**: Adjust color bit depth from 1-8 bits
- **Live Preview**: See effects in real-time on an HTML canvas
- **Download**: Save processed images as PNG files

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Use

1. **Upload an Image**: Click the "Upload Image" button and select an image file
2. **Choose Dithering Method**: Select from the dropdown menu:
   - None (original image)
   - Floyd-Steinberg
   - Atkinson
   - Ordered (Bayer)
   - Random
   - Threshold
3. **Adjust Bit Depth**: Use the slider to reduce color bit depth (1-8 bits)
4. **Preview**: See the effect applied instantly on the canvas
5. **Download**: Click "Download Image" to save the processed image

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Canvas API**: HTML5 Canvas for image processing

## Project Structure

```
src/
├── app/
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/
│   └── ImageDithering.tsx   # Main dithering component
└── utils/
    └── dithering.ts         # Dithering algorithms
```

## Dithering Algorithms Explained

- **Floyd-Steinberg**: Distributes quantization error to neighboring pixels in a specific pattern
- **Atkinson**: Similar to Floyd-Steinberg but more conservative, creates lighter images
- **Ordered (Bayer)**: Uses a threshold map to create regular patterns, faster processing
- **Random**: Adds random noise before quantization for a grainy effect
- **Threshold**: Simple quantization without error diffusion

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
