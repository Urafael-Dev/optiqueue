import {
  createIcons, ArrowRight, ArrowUp, ChartLine, ChevronRight, CircleCheck, Code, Copy, Cpu, Download, FileText, LayoutDashboard, Menu, Pause, Play, RotateCcw, Sigma, ArrowLeft, Check,
  SlidersHorizontal, Table, X, Split, Clock, Moon, Sun, Printer, BookOpen, ExternalLink, FileDown, ChevronDown,
  DoorOpen, Wallet, Timer, PiggyBank, Sparkles, SendHorizontal, Trash2, Wrench, Bot, Square, TrendingUp, Maximize2, Minimize2, Plane, GitCompare, FlaskConical, Undo2,
  Calculator, User, Users, SquareStack, Layers, Factory, Activity, ListOrdered, Infinity as InfinityIcon, ChartColumn, Trophy, TriangleAlert, CircleHelp, MessageSquareText, ClipboardPaste, ScanSearch, ListChecks, ShieldCheck, ArrowUpRight,
} from 'lucide';

const ICONS = {
  ArrowLeft, ArrowRight, ArrowUp, ChartLine, Check, ChevronRight, CircleCheck, Code, Copy, Cpu, Download, FileText, LayoutDashboard, Menu, Pause, Play, RotateCcw, Sigma, SlidersHorizontal, Table, X, Split, Clock, Moon, Sun, Printer, BookOpen, ExternalLink, FileDown, ChevronDown, DoorOpen, Wallet, Timer, PiggyBank, Sparkles, SendHorizontal, Trash2, Wrench, Bot, Square, TrendingUp, Maximize2, Minimize2, Plane, GitCompare, FlaskConical, Undo2,
  Calculator, User, Users, SquareStack, Layers, Factory, Activity, ListOrdered, Infinity: InfinityIcon, ChartColumn, Trophy, TriangleAlert, CircleHelp, MessageSquareText, ClipboardPaste, ScanSearch, ListChecks, ShieldCheck, ArrowUpRight,
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
    if (open && !sidebar.classList.contains('-translate-x-full')) return;
    sidebar.classList.toggle('-translate-x-full', !open);
    if (open) playNavIntro();
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

/** Entrada escalonada de los enlaces de la barra lateral (al cargar y al abrir el menú). */
let introTimer = 0;
export function playNavIntro() {
  const nav = document.getElementById('sideNav');
  if (!nav) return;
  [...nav.querySelectorAll('.nav-group, .nav-link')].forEach((el, i) => el.style.setProperty('--i', i));
  // las piezas de cada icono se normalizan a largo 1 para poder animarlas «dibujándose»
  nav.querySelectorAll('svg :is(path, circle, rect, line, polyline)').forEach((el) => el.setAttribute('pathLength', '1'));
  nav.classList.remove('nav-anim');
  void nav.offsetWidth; // reinicia la animación
  nav.classList.add('nav-anim');
  // al terminar se quita la clase para que los efectos al pasar el cursor vuelvan a funcionar
  clearTimeout(introTimer);
  introTimer = setTimeout(() => nav.classList.remove('nav-anim'), 1400);
}

/** Resalta en la barra lateral la sección visible con un fondo que se desliza hasta ella. */
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
    moveIndicator();
  };
  const indicator = document.getElementById('navIndicator');
  const moveIndicator = () => {
    if (!indicator) return;
    if (!current) {
      indicator.style.opacity = '0';
      return;
    }
    indicator.style.opacity = '1';
    indicator.style.height = `${current.offsetHeight}px`;
    indicator.style.transform = `translateY(${current.offsetTop}px)`;
    indicator.style.setProperty('--c', getComputedStyle(current).getPropertyValue('--c'));
    // en móvil o pantallas bajas, mantiene visible el enlace activo
    const nav = indicator.parentElement;
    if (current.offsetTop < nav.scrollTop || current.offsetTop + current.offsetHeight > nav.scrollTop + nav.clientHeight) {
      nav.scrollTo({ top: current.offsetTop - nav.clientHeight / 2, behavior: 'smooth' });
    }
  };
  window.addEventListener('resize', moveIndicator);
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

/** Interruptor claro/oscuro. Guarda la elección y avisa con el evento `themechange`. */
export function setupTheme() {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    const dark = root.classList.contains('dark');
    btn.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
    btn.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    btn.setAttribute('aria-pressed', String(dark));
    meta?.setAttribute('content', dark ? '#0a1322' : '#0f1b2d');
    refreshIcons();
  };
  const switchTo = (dark, save) => {
    root.classList.toggle('dark', dark);
    if (save) {
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* sin almacenamiento */ }
    }
    sync();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }));
  };
  /**
   * Cambio de tema sin trabas: en lugar de animar el color de miles de elementos, el
   * navegador toma una imagen de la página y solo anima esa imagen (View Transitions),
   * revelando el tema nuevo en un círculo que crece desde el botón.
   */
  const apply = (dark, save) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) return switchTo(dark, save);
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(() => switchTo(dark, save));
    t.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => {});
  };
  btn.addEventListener('click', () => apply(!root.classList.contains('dark'), true));
  // Si el usuario no eligió, seguir al sistema
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch { /* sin almacenamiento */ }
    if (!saved) apply(e.matches, false);
  });
  sync();
}

/** Menús desplegables (<details data-menu>): se cierran al hacer clic fuera, al elegir una opción o con Escape. */
export function setupMenus() {
  const menus = [...document.querySelectorAll('details[data-menu]')];
  document.addEventListener('click', (e) => {
    menus.forEach((m) => {
      if (m.open && (!m.contains(e.target) || e.target.closest('[role="menuitem"]'))) m.open = false;
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    menus.forEach((m) => {
      if (m.open) {
        m.open = false;
        m.querySelector('summary').focus();
      }
    });
  });
}
