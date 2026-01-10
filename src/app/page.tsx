import ImageDithering from '@/components/ImageDithering';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center text-white mb-8">
          Image Dithering Studio
        </h1>
        <ImageDithering />
      </main>
    </div>
  );
}
