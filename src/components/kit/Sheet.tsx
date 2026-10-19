"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { scrollBehavior, useIsClient, usePhone } from "./useMedia";

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

// how the person last moved: a sheet closed by a tap gives focus back without a ring, a key gives it back with one
let keyboard = false;
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => void (e.key === "Tab" || e.key === "Escape" || e.key === "Enter" || e.key === " " ? (keyboard = true) : null), true);
  document.addEventListener("pointerdown", () => void (keyboard = false), true);
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode; // top right, beside the title (a ring, a state)
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  scrollKey?: string; // a new key starts the body at its top again (a new step inside the same sheet)
  returnFocus?: () => HTMLElement | null; // where focus goes on close, when the opener may be gone (a row that re-rendered)
  anchor?: () => HTMLElement | null; // from 768px: a popover hung 8px under this control, right aligned, instead of the inspector
};

// focus goes back to the opener; after a tap it goes back without a ring, so a closed sheet never leaves an outline
function giveBack(to: HTMLElement | null | undefined) {
  if (!to?.focus) return;
  if (!keyboard) {
    to.setAttribute("data-noring", "");
    to.addEventListener("blur", () => to.removeAttribute("data-noring"), { once: true });
  }
  to.focus({ preventScroll: true, focusVisible: keyboard } as FocusOptions);
}

// Right side on desktop, a bottom sheet on phones. Glass, focus trapped, Escape closes, focus returns on close.
// The panel itself never scrolls: the title and the footer stay put and only the body between them moves.
export function Sheet(props: Props) {
  const client = useIsClient();
  if (!client) return null;
  return createPortal(<AnimatePresence>{props.open && <Panel {...props} />}</AnimatePresence>, document.body);
}

function Panel({ onClose, title, subtitle, aside, footer, children, wide, scrollKey, returnFocus, anchor }: Props) {
  const phone = usePhone();
  const pop = !phone && !!anchor;
  const panel = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  const body = useRef<HTMLDivElement>(null);
  // the popover's place, measured from its control and kept on screen and under the nav. It moves up when its content
  // grows (a date field opening) and caps its height to the room left, so the body scrolls instead of running off screen
  const [at, setAt] = useState<{ top: number; right: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!pop) return;
    const el = panel.current;
    const place = () => {
      const r = anchorRef.current?.()?.getBoundingClientRect();
      if (!r || !el) return;
      // the height it wants: header and footer as drawn plus the body's whole content, even while capped
      const want = [...el.children].reduce((h, c) => h + (c === body.current ? c.scrollHeight : (c as HTMLElement).offsetHeight), 0);
      const vh = window.innerHeight;
      const h = Math.min(want, vh - 60 - 16);
      const top = Math.max(60, Math.min(r.bottom + 8, vh - h - 16));
      const next = { top, right: Math.max(16, window.innerWidth - r.right), maxH: vh - top - 16 };
      setAt((p) => (p && p.top === next.top && p.right === next.right && p.maxH === next.maxH ? p : next));
    };
    place();
    const ro = new ResizeObserver(place);
    if (el) {
      ro.observe(el);
      for (const c of el.children) ro.observe(c);
      for (const c of body.current?.children ?? []) ro.observe(c);
    }
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [pop]);
  const titleId = useId();
  const drag = useDragControls();
  const close = useRef(onClose);
  const back = useRef(returnFocus);
  useEffect(() => {
    close.current = onClose;
    back.current = returnFocus;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    // a tap opens the sheet without a focus ring on Close; a key opens it with one
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true, focusVisible: keyboard } as FocusOptions), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (!panel.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      giveBack(back.current?.() ?? (before?.isConnected ? before : null));
    };
  }, []);

  // an opened disclosure scrolls into view inside the body only, never the panel or the page
  useEffect(() => {
    const s = body.current;
    if (!s) return;
    const onToggle = (e: Event) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      requestAnimationFrame(() => {
        const sr = s.getBoundingClientRect();
        const dr = d.getBoundingClientRect();
        const over = dr.bottom - sr.bottom + 16;
        if (over <= 0) return;
        const by = Math.min(over, Math.max(0, dr.top - sr.top - 8));
        if (by > 0) s.scrollBy({ top: by, behavior: scrollBehavior() });
      });
    };
    s.addEventListener("toggle", onToggle, true);
    return () => s.removeEventListener("toggle", onToggle, true);
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  const motionProps = phone
    ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } }
    : pop
      ? { initial: { opacity: 0, scale: 0.96, y: -6 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: -6, transition: { duration: 0.14 } } }
      : { initial: { x: "calc(100% + 24px)" }, animate: { x: 0 }, exit: { x: "calc(100% + 24px)" } };

  return (
    <div className="fixed inset-0 z-[60]">
      <motion.div
        className={`absolute inset-0 ${pop ? "bg-transparent" : "bg-black/20"}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...motionProps}
        transition={SPRING}
        drag={phone ? "y" : false}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose();
        }}
        className={`glass absolute flex flex-col overflow-clip outline-none ${
          phone
            ? "inset-x-0 bottom-0 max-h-[calc(100dvh-56px)] rounded-t-sheet shadow-sheet"
            : pop
              ? // a popover under its control: as tall as its content, never over the nav
                "max-h-[calc(100dvh-76px)] w-[min(400px,calc(100vw-32px))] origin-top-right rounded-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.06),0_24px_80px_rgba(0,0,0,0.16)]"
              : // an inspector: the full height of the window, 16px in from the edges, its footer pinned
                `top-4 right-4 bottom-4 rounded-sheet shadow-sheet ${wide ? "w-[min(620px,calc(100vw-32px))]" : "w-[min(520px,calc(100vw-32px))]"}`
        }`}
        style={{ background: "rgba(245,245,247,0.94)", ...(pop ? { top: at?.top ?? -9999, right: at?.right ?? 16, maxHeight: at?.maxH } : null) }}
      >
        <div
          className={`shrink-0 border-b border-hairline px-5 ${pop ? "pt-4 pb-3" : "pb-4"} ${phone ? "touch-none pt-2" : pop ? "" : "pt-5"}`}
          onPointerDown={(e) => phone && drag.start(e)}
        >
          {phone && <div aria-hidden className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-black/15" />}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className={`${pop ? "type-headline" : "type-title"} [overflow-wrap:anywhere]`}>
                {title}
              </h2>
              {subtitle && <div className="type-callout mt-1 text-ink-2">{subtitle}</div>}
            </div>
            {aside}
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-fill hover:text-ink"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-fill">
                <X size={18} strokeWidth={2} aria-hidden />
              </span>
            </button>
          </div>
        </div>
        <div ref={body} className={`min-h-0 flex-auto overflow-y-auto overscroll-contain px-5 ${pop ? "pt-4" : "pt-5"} ${footer ? (pop ? "pb-4" : "pb-6") : "pb-[max(24px,env(safe-area-inset-bottom))]"}`}>
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-hairline px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </motion.div>
    </div>
  );
}
