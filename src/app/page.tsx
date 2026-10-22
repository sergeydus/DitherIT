import Image from 'next/image';
import ImageDithering from '@/components/ImageDithering';
import { ThemeSelect } from '@/components/ThemeSelect';

export default function Home() {
  return <div className="studio-shell">
    <a href="#image-editor" className="skip-link">Skip to image editor</a>
    <header className="studio-header">
      <div className="brand">
        <Image src={`${process.env.NODE_ENV === 'production' ? '/DitherIT' : ''}/ditherit-mark.svg`} alt="" width={40} height={40} priority />
        <div><h1>DitherIT</h1><p>Image dithering studio</p></div>
      </div>
      <nav aria-label="Studio preferences" className="header-actions">
        <ThemeSelect /><a href="#dithering-guide" className="button button-quiet">Help</a>
      </nav>
    </header>
    <main><ImageDithering /></main>
    <footer className="studio-footer">Made for fewer colors. Your images stay in your browser.</footer>
  </div>;
}
