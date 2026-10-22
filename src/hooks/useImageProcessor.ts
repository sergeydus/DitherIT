'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ImageProcessor } from '../lib/image-processor';
import { createBrowserWorker } from '../lib/browser-workers';

export function useImageProcessor() {
  const [processor] = useState(() => new ImageProcessor(createBrowserWorker));
  const state = useSyncExternalStore(processor.subscribe, processor.getSnapshot, processor.getSnapshot);
  useEffect(() => { processor.activate(); return () => processor.dispose(); }, [processor]);
  return { processor, state };
}
