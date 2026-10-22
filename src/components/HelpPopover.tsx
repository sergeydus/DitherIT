'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClientReady } from '@/hooks/useClientReady';

/** Click/tap help, also usable by keyboard; opening it never activates its control. */
export function HelpPopover({ topic, children }: { topic: string; children: string }) {
  const ready = useClientReady();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const element = panel.current, button = trigger.current;
    if (!open || !element || !button) return;
    const dismiss = (restore = false) => {
      setOpen(false);
      if (restore) button.focus({ preventScroll: true });
    };
    const position = () => {
      const view = window.visualViewport;
      const x = view?.offsetLeft ?? 0, y = view?.offsetTop ?? 0;
      const width = view?.width ?? document.documentElement.clientWidth;
      const height = view?.height ?? window.innerHeight;
      element.style.maxWidth = `${Math.max(0, width - 24)}px`;
      element.style.maxHeight = `${Math.max(44, height - 24)}px`;
      const anchor = button.getBoundingClientRect();
      if (anchor.bottom <= y || anchor.top >= y + height || anchor.right <= x || anchor.left >= x + width) {
        dismiss(); return false;
      }
      const left = Math.max(x + 12, Math.min(anchor.right - element.offsetWidth, x + width - element.offsetWidth - 12));
      const below = anchor.bottom + 8;
      const top = below + element.offsetHeight <= y + height - 12 ? below : anchor.top - element.offsetHeight - 8;
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(y + 12, Math.min(top, y + height - element.offsetHeight - 12))}px`;
      return true;
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !element.contains(event.target) && !button.contains(event.target)) dismiss();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); dismiss(true);
      } else if (event.key === 'Tab' && element.contains(document.activeElement)) {
        // The portal is at the end of body: resume at the invoker's natural tab order.
        if (event.shiftKey || document.activeElement instanceof HTMLButtonElement) {
          dismiss(true);
          if (event.shiftKey) event.preventDefault();
        }
      }
    };
    if (!position()) return;
    element.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(element); observer.observe(button);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keys);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="help-trigger" disabled={!ready} aria-label={`Help: ${topic}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">?</span>
    </button>
    {open && createPortal(<div ref={panel} id={id} className="help-popover" role="dialog" aria-modal="false" tabIndex={-1}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}>
      <div className="help-popover-heading"><h3 id={`${id}-title`}>{topic}</h3>
        <button type="button" className="button button-quiet" aria-label="Close help" onClick={() => {
          setOpen(false); trigger.current?.focus({ preventScroll: true });
        }}>Close</button>
      </div>
      <p id={`${id}-text`}>{children}</p>
    </div>, document.body)}
  </>;
}
