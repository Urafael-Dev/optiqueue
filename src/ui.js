import {
  createIcons, ArrowRight, ArrowUp, ChartLine, ChevronRight, CircleCheck, Code, Copy, Cpu, Download, FileText, LayoutDashboard, Menu, Pause, Play, RotateCcw, Sigma, ArrowLeft, Check,
  SlidersHorizontal, Table, X,
} from 'lucide';

const ICONS = {
  ArrowLeft, ArrowRight, ArrowUp, ChartLine, Check, ChevronRight, CircleCheck, Code, Copy, Cpu, Download, FileText, LayoutDashboard, Menu, Pause, Play, RotateCcw, Sigma, SlidersHorizontal, Table, X,
};

/** Reemplaza los <i data-lucide> pendientes por SVG. Llamar tras cada render. */
export const refreshIcons = () => createIcons({ icons: ICONS, attrs: { 'aria-hidden': 'true' } });

/** Barra lateral: fija en escritorio, panel deslizable en móvil. */
export function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('navOverlay');
  const openBtn = document.getElementById('navOpen');
  const mq = window.matchMedia('(min-width: 1024px)');

  const setOpen = (open) => {
    sidebar.classList.toggle('-translate-x-full', !open);
    overlay.classList.toggle('hidden', !open);
    openBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('overflow-hidden', open && !mq.matches);
  };
  openBtn.addEventListener('click', () => setOpen(true));
  document.getElementById('navClose').addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
  sidebar.addEventListener('click', (e) => !mq.matches && e.target.closest('a') && setOpen(false));
  mq.addEventListener('change', () => setOpen(false));
}

/** Estado mínimo compartido: número de ventanillas del gemelo digital. */
export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function setupDialogs() {
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) return document.getElementById(opener.dataset.open)?.showModal();
    const closer = e.target.closest('[data-close]');
    if (closer) closer.closest('dialog')?.close();
  });
  document.querySelectorAll('dialog.modal').forEach((dlg) => {
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  });
}

/** Resalta en la barra superior la sección visible y la mantiene a la vista en móvil. */
export function setupScrollSpy() {
  const links = [...document.querySelectorAll('[data-spy]')];
  const sections = links.map((l) => document.getElementById(l.getAttribute('href').slice(1)));
  let current = null;
  let queued = false;

  // Sección activa = la última cuyo inicio ya pasó bajo la barra superior.
  const update = () => {
    queued = false;
    const line = 120;
    let idx = -1;
    sections.forEach((s, i) => s && s.getBoundingClientRect().top <= line && (idx = i));
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) idx = sections.length - 1;
    const link = links[idx] ?? null;
    if (link === current) return;
    current?.removeAttribute('aria-current');
    current = link;
    link?.setAttribute('aria-current', 'true');
  };
  const onScroll = () => {
    if (!queued) requestAnimationFrame(update);
    queued = true;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/** Copia texto al portapapeles y da feedback en el botón. */
export async function copyWithFeedback(btn, text) {
  const label = btn.querySelector('[data-label]');
  const original = label?.textContent;
  try {
    await navigator.clipboard.writeText(text);
    if (label) label.textContent = 'Copiado';
  } catch {
    if (label) label.textContent = 'No se pudo copiar';
  }
  setTimeout(() => label && (label.textContent = original), 1600);
}
