"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CommittedRender } from '@/lib/render-contract';
import type { ImageProcessor } from '@/lib/image-processor';
import { clamp, detailRect, fitScale, nextZoom, ZOOMS, type PreviewView, type Zoom } from '@/lib/exploration';
import { settingsSummary } from '@/lib/editor-copy';
import { CommittedNumberInput } from './CommittedNumberInput';
import { HelpPopover } from './HelpPopover';
import { HELP } from '@/lib/help-copy';

type Crop = ReturnType<typeof detailRect>;
function paint(context: CanvasRenderingContext2D, frame: CommittedRender, view: PreviewView, split: number, crop: Crop, dx = 0, dy = 0) {
  context.imageSmoothingEnabled = false;
  const cut = clamp(Math.round(frame.baseline.width * split / 100) - crop.x, 0, crop.width);
  const draw = (bitmap: ImageBitmap, left: number, width: number) => {
    if (width <= 0) return;
    context.save(); context.beginPath(); context.rect(dx + left, dy, width, crop.height); context.clip();
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, dx, dy, crop.width, crop.height);
    context.restore();
  };
  if (view === 'original') draw(frame.baseline.bitmap, 0, crop.width);
  else if (view === 'result') draw(frame.resultView, 0, crop.width);
  else { draw(frame.baseline.bitmap, 0, cut); draw(frame.resultView, cut, crop.width - cut); }
}

export function ImagePreview({ frame, stale, getSnapshot }: { frame: CommittedRender | null; stale: boolean; getSnapshot: ImageProcessor['getSnapshot'] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const detail = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const center = useRef({ x: .5, y: .5 });
  const [view, setView] = useState<PreviewView>('result');
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [detailOn, setDetailOn] = useState(false);
  const [area, setArea] = useState({ width: 1, height: 1 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const width = frame?.baseline.width ?? 1, height = frame?.baseline.height ?? 1;
  const [point, setPoint] = useState({ key: frame?.baseline.key, source: frame?.baseline.source.id, x: Math.floor(width / 2), y: Math.floor(height / 2) });
  if (point.key !== frame?.baseline.key) {
    setPoint({ key: frame?.baseline.key, source: frame?.baseline.source.id,
      x: point.source === frame?.baseline.source.id ? clamp(point.x, 0, width - 1) : Math.floor(width / 2),
      y: point.source === frame?.baseline.source.id ? clamp(point.y, 0, height - 1) : Math.floor(height / 2) });
  }
  const crop = useMemo(() => detailRect(width, height, point.x, point.y), [width, height, point.x, point.y]);
  const fit = fitScale(width, height, area.width, area.height);
  const scale = zoom === 'fit' ? fit : zoom;
  const displayWidth = width * scale, displayHeight = height * scale;
  const stageWidth = Math.max(area.width, displayWidth), stageHeight = Math.max(area.height, displayHeight);
  const left = Math.max(0, (area.width - displayWidth) / 2), top = Math.max(0, (area.height - displayHeight) / 2);
  const maxX = Math.max(0, displayWidth - area.width), maxY = Math.max(0, displayHeight - area.height);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setArea({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.scrollLeft = left + center.current.x * displayWidth - area.width / 2;
    element.scrollTop = top + center.current.y * displayHeight - area.height / 2;
  }, [left, top, displayWidth, displayHeight, area]);
  useEffect(() => {
    const element = canvas.current;
    if (!frame || frame !== getSnapshot().frame || !element) return;
    element.width = width; element.height = height;
    const context = element.getContext('2d');
    if (context) paint(context, frame, view, split, { x: 0, y: 0, width, height });
  }, [frame, getSnapshot, width, height, view, split]);
  useEffect(() => {
    const element = detail.current;
    if (!detailOn || !frame || frame !== getSnapshot().frame || !element) return;
    element.width = 160; element.height = 160;
    const context = element.getContext('2d');
    if (context) paint(context, frame, view, split, crop, Math.floor((160 - crop.width) / 2), Math.floor((160 - crop.height) / 2));
  }, [detailOn, frame, getSnapshot, view, split, crop]);

  const setPosition = (x: number, y: number) => setPoint(previous => ({ ...previous, x: clamp(x, 0, width - 1), y: clamp(y, 0, height - 1) }));
  const changeZoom = (next: Zoom) => { if (next === 'fit') center.current = { x: .5, y: .5 }; setZoom(next); };
  const pan = (x: number, y: number) => { viewport.current?.scrollBy(x * Math.max(40, area.width / 2), y * Math.max(40, area.height / 2)); };
  const description = frame ? `${frame.baseline.source.name}, ${view} view, ${settingsSummary(frame.settings)}, ${width} by ${height} pixels${stale ? ', preview out of date' : ''}` : 'Image preview is processing';
  return <>
    <div ref={viewport} className="image-viewport" role="region" aria-label="Image viewport" tabIndex={frame ? 0 : -1} aria-describedby={frame ? 'inspection-help preview-status' : 'preview-status'}
      style={{ overscrollBehavior: maxX > 1 || maxY > 1 ? 'contain' : 'auto' }}
      onScroll={event => {
        const element = event.currentTarget;
        center.current = { x: clamp((element.scrollLeft + area.width / 2 - left) / displayWidth, 0, 1), y: clamp((element.scrollTop + area.height / 2 - top) / displayHeight, 0, 1) };
        setScroll({ left: element.scrollLeft, top: element.scrollTop });
      }}>
      {frame ? <div className="image-stage" style={{ width: stageWidth, height: stageHeight }}>
        <div className="display-image" style={{ left, top, width: displayWidth, height: displayHeight }}>
          <canvas ref={canvas} role="img" aria-label={description} aria-describedby={`${frame && stale ? 'rendered-summary ' : ''}preview-status`}
            style={{ imageRendering: scale >= 1 ? 'pixelated' : 'auto' }} onClick={event => {
              if (!detailOn || !frame) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              setPosition(Math.floor((event.clientX - bounds.left) * width / bounds.width), Math.floor((event.clientY - bounds.top) * height / bounds.height));
            }} />
          {view === 'split' && <div aria-hidden="true" className="split-divider" style={{ left: Math.round(width * split / 100) * scale }} />}
          {detailOn && zoom === 'fit' && frame && <div aria-hidden="true" className="detail-outline" data-testid="detail-outline"
            style={{ left: crop.x * scale, top: crop.y * scale, width: crop.width * scale, height: crop.height * scale }} />}
        </div>
      </div> : <p className="helper">No preview rendered yet.</p>}
    </div>
    {frame && <div className="preview-controls">
      <fieldset className="view-group" disabled={!frame} aria-labelledby="comparison-label"><legend><span id="comparison-label">Comparison view</span> <HelpPopover topic="Comparing images">{HELP.compare}</HelpPopover></legend>
        <div className="view-options">{(['original', 'result', 'split'] as const).map(option => <label key={option}>
          <input type="radio" name="preview-view" value={option} checked={view === option} onChange={() => setView(option)} />
          {option[0].toUpperCase() + option.slice(1)}</label>)}</div>
      </fieldset>
      {view === 'split' && <div className="split-control"><label htmlFor="comparison-position">Comparison position: {split}%</label>
        <input className="depth-slider" id="comparison-position" type="range" min="0" max="100" value={split} disabled={!frame}
          aria-valuetext={`${split}% original, ${100 - split}% result`} onChange={event => setSplit(Number(event.target.value))} />
        <p className="helper">Original on the left; result on the right.</p>
      </div>}
      <div className="zoom-controls" role="group" aria-label="Zoom controls">
        <div><div className="control-label"><label htmlFor="zoom-level">Zoom level</label><HelpPopover topic="Preview zoom">{HELP.zoom}</HelpPopover></div><select id="zoom-level" className="control" value={zoom} disabled={!frame}
          onChange={event => changeZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value))}>
          <option value="fit">Fit</option>{ZOOMS.map(value => <option key={value} value={value}>{value * 100}%</option>)}
        </select></div>
        <div className="button-row">
          <button className="button button-quiet" disabled={!frame} aria-pressed={zoom === 'fit'} onClick={() => changeZoom('fit')}>Fit</button>
          <button className="button button-quiet" disabled={!frame} aria-pressed={zoom === 1} onClick={() => changeZoom(1)}>100%</button>
          <button className="button button-quiet" disabled={!frame || scale <= .25} onClick={() => changeZoom(nextZoom(scale, -1))}>Zoom out</button>
          <button className="button button-quiet" disabled={!frame || scale >= 4} onClick={() => changeZoom(nextZoom(scale, 1))}>Zoom in</button>
        </div>
        <p className="helper numeric" id="zoom-readout">{zoom === 'fit' ? 'Fit · ' : ''}{Math.round(scale * 100)}% · {scale >= 1 ? 'nearest-neighbor' : 'scaled preview'}</p>
      </div>
      <div className="button-row" role="group" aria-label="Pan controls">
        <button className="button button-quiet" disabled={!frame || scroll.left <= 0} onClick={() => pan(-1, 0)}>Pan left</button>
        <button className="button button-quiet" disabled={!frame || scroll.left >= maxX - 1} onClick={() => pan(1, 0)}>Pan right</button>
        <button className="button button-quiet" disabled={!frame || scroll.top <= 0} onClick={() => pan(0, -1)}>Pan up</button>
        <button className="button button-quiet" disabled={!frame || scroll.top >= maxY - 1} onClick={() => pan(0, 1)}>Pan down</button>
      </div>
      <p id="inspection-help" className="helper">Fit can hide or alias the dither pattern. Inspect at 1:1. The image viewport also supports normal keyboard scrolling.</p>
      <div className="control-label inline-help"><label className="check-row" htmlFor="detail-toggle"><input id="detail-toggle" type="checkbox" checked={detailOn} disabled={!frame} onChange={event => setDetailOn(event.target.checked)} />1:1 detail</label><HelpPopover topic="Detail inspection">{HELP.detail}</HelpPopover></div>
      {detailOn && <section className="detail-section" aria-labelledby="detail-heading">
        <h3 id="detail-heading">1:1 detail{stale ? ' · Preview out of date' : ''}</h3>
        <canvas ref={detail} className="detail-canvas" width="160" height="160" role="img" aria-label={`1:1 detail, ${view} view${stale ? ', preview out of date' : ''}`} />
        <p id="detail-help" className="helper">One output pixel per CSS pixel. Choose a focus pixel, or tap the preview; the crop stays inside the image. Small images are centered without upscaling.</p>
        <div className="detail-positions">
          <CommittedNumberInput id="detail-x" label="Detail horizontal position (px)" value={point.x} min={0} max={width - 1} describedBy="detail-help" onCommit={x => setPosition(x, point.y)} />
          <CommittedNumberInput id="detail-y" label="Detail vertical position (px)" value={point.y} min={0} max={height - 1} describedBy="detail-help" onCommit={y => setPosition(point.x, y)} />
        </div>
        <div className="button-row" role="group" aria-label="Detail position controls">
          <button className="button button-quiet" disabled={point.x <= 0} onClick={() => setPosition(point.x - 16, point.y)}>Move detail left</button>
          <button className="button button-quiet" disabled={point.x >= width - 1} onClick={() => setPosition(point.x + 16, point.y)}>Move detail right</button>
          <button className="button button-quiet" disabled={point.y <= 0} onClick={() => setPosition(point.x, point.y - 16)}>Move detail up</button>
          <button className="button button-quiet" disabled={point.y >= height - 1} onClick={() => setPosition(point.x, point.y + 16)}>Move detail down</button>
        </div>
      </section>}
    </div>}
  </>;
}
