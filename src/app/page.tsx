import ImageDithering from '@/components/ImageDithering';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <a href="#image-editor" className="sr-only focus:not-sr-only focus:block focus:p-3 focus:bg-gray-900 text-white">Skip to image editor</a>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center text-white mb-8">
          Image Dithering Studio
        </h1>
        <ImageDithering />
      </main>
    </div>
  );
}
