/* Salpicon · cuerdas que vibran al pasar el puntero (y suenan con Karplus-Strong si se activa el sonido) */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------- idioma ---------- */
  const DOM = window.I18N.dom, JS = window.I18N.js;
  let LANG = 'fr';
  const t = (k) => (JS[LANG] && JS[LANG][k] !== undefined ? JS[LANG][k] : JS.fr[k]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  function applyLang(l) {
    LANG = l;
    document.documentElement.lang = l;
    $$('[data-i18n]').forEach((el) => {
      if (el.dataset.fr === undefined) el.dataset.fr = el.innerHTML;
      el.innerHTML = l === 'fr' ? el.dataset.fr : (DOM[l] && DOM[l][el.dataset.i18n]) || el.dataset.fr;
    });
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    store.set('sp-lang', l);
    renderReviews();
    paintSound();
  }
  $$('.lang button').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));

  /* ---------- sonido: Karplus-Strong ---------- */
  const NOTES = [82.41, 110, 146.83, 196, 246.94, 329.63]; // Mi La Re Sol Si Mi
  let ac = null, soundOn = false;
  const buffers = [];
  function ksBuffer(freq) {
    const sr = ac.sampleRate, N = Math.round(sr / freq), len = Math.round(sr * 2.4);
    const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    const decay = 0.4975 + Math.min(0.0018, freq / 200000);
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % N;
      d[i] = ring[idx];
      ring[idx] = (ring[idx] + ring[next]) * decay;
      idx = next;
    }
    return buf;
  }
  function ensureAudio() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    NOTES.forEach((f, i) => (buffers[i] = ksBuffer(f)));
  }
  function playNote(i, vel = 1) {
    if (!soundOn || !ac) return;
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buffers[i % buffers.length];
    g.gain.value = 0.28 * vel;
    src.connect(g).connect(ac.destination);
    src.start();
  }
  const soundBtn = $('#sound');
  function paintSound() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.innerHTML = `<i class="ph-light ${soundOn ? 'ph-speaker-high' : 'ph-speaker-slash'}"></i><span>${soundOn ? t('soundOn') : t('soundOff')}</span>`;
  }
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn) { ensureAudio(); ac && ac.resume(); playNote(3, 0.8); }
    paintSound();
  });

  /* ---------- cuerdas ---------- */
  const strings = $$('.pluckable').map((svg) => ({
    svg, path: svg.querySelector('path'),
    note: +(svg.dataset.note ?? svg.closest('[data-note]')?.dataset.note ?? 0),
    amp: 0, x: 0.5, t: 0, last: 0
  }));
  let raf = 0;
  function tick(now) {
    let active = false;
    for (const s of strings) {
      if (s.amp < 0.05) { if (s.amp) { s.amp = 0; s.path.setAttribute('d', 'M0 20 L1000 20'); } continue; }
      active = true;
      const el = (now - s.t) / 1000;
      const env = Math.exp(-el * 3.2);
      const y = 20 + s.amp * env * Math.cos(el * 2 * Math.PI * (9 + s.note * 1.6));
      const cx = s.x * 1000;
      s.path.setAttribute('d', `M0 20 Q${cx.toFixed(1)} ${(2 * y - 20).toFixed(2)} 1000 20`);
      if (env < 0.01) s.amp = 0;
    }
    raf = active ? requestAnimationFrame(tick) : 0;
  }
  function pluck(s, xr, strength = 1) {
    const now = performance.now();
    if (now - s.last < 90) return;
    s.last = now; s.t = now; s.x = Math.min(0.92, Math.max(0.08, xr));
    s.amp = REDUCE ? 0 : 13 * strength;
    playNote(s.note, strength);
    if (!raf && !REDUCE) raf = requestAnimationFrame(tick);
  }
  // detecta el cruce del puntero con cada cuerda
  let prevY = null;
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const y = e.clientY;
    if (prevY !== null && Math.abs(y - prevY) < 200) {
      for (const s of strings) {
        const r = s.svg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) continue;
        const sy = r.top + r.height / 2;
        if ((prevY - sy) * (y - sy) < 0) pluck(s, (e.clientX - r.left) / r.width, Math.min(1, 0.45 + Math.abs(y - prevY) / 40));
      }
    }
    prevY = y;
  }, { passive: true });
  $('.hero__string').addEventListener('pointerdown', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    pluck(strings[0], (e.clientX - r.left) / r.width, 1);
  });

  /* ---------- filas desplegables ---------- */
  $$('.row').forEach((row) => {
    const btn = $('.row__btn', row), panel = $('.row__panel', row);
    const s = strings.find((x) => x.svg === $('.row__string', row));
    btn.addEventListener('click', (e) => {
      const open = !row.classList.contains('is-open');
      const r = btn.getBoundingClientRect();
      if (e.detail !== 0 || e.pointerType) pluck(s, e.clientX ? (e.clientX - r.left) / r.width : 0.5, 1);
      row.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (!hasGsap || REDUCE) { panel.style.height = open ? 'auto' : '0px'; return; }
      if (open) {
        gsap.fromTo(panel, { height: 0 }, { height: 'auto', duration: 0.7, ease: 'expo.out', onComplete: () => ScrollTrigger.refresh() });
        gsap.from($$('.dish', panel), { y: 30, opacity: 0, filter: 'blur(6px)', duration: 0.7, ease: 'expo.out', stagger: 0.07, delay: 0.08 });
      } else {
        gsap.to(panel, { height: 0, duration: 0.45, ease: 'power3.inOut', onComplete: () => ScrollTrigger.refresh() });
      }
    });
  });

  /* ---------- opiniones ---------- */
  function renderReviews() {
    const q = (x) => (LANG === 'fr' ? `« ${x} »` : `«${x}»`);
    $('#revList').innerHTML = t('reviews').map(([txt, who]) => `<li><p>${q(txt)}</p><cite>${who}</cite></li>`).join('');
  }

  /* ---------- intro y héroe ---------- */
  const word = $('.hero__word');
  word.innerHTML = [...word.textContent].map((c) => `<span class="ch">${c}</span>`).join('');
  function heroIn() {
    if (!hasGsap || REDUCE) return;
    const tl = gsap.timeline();
    tl.from('.hero__word .ch', { yPercent: 110, rotate: 4, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.045 })
      .from('.hero__sub, .hero__cta, .hero__hours', { y: 20, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, '-=0.9')
      .from('.hero__fig', { clipPath: 'inset(100% 0 0 0 round 12px)', duration: 1.4, ease: 'expo.inOut' }, 0.1)
      .from('.hero__fig img', { scale: 1.25, duration: 1.8, ease: 'expo.out' }, 0.1)
      .add(() => pluck(strings[0], 0.62, 1), 0.9);
  }
  const intro = $('#intro');
  let seen = false;
  try { seen = sessionStorage.getItem('sp-intro') === '1'; sessionStorage.setItem('sp-intro', '1'); } catch (e) { }
  if (!hasGsap || REDUCE || seen) {
    intro.remove();
    heroIn();
  } else {
    document.body.classList.add('is-locked');
    const paths = $$('.istr');
    const osc = { a: 0 };
    const draw = () => paths.forEach((p, i) => {
      const y = osc.spread * (i - 2.5) * 22;
      const wob = osc.a * Math.cos(osc.ph + i * 0.6);
      p.setAttribute('d', `M0 ${100 + y} Q500 ${100 + y + wob * 2} 1000 ${100 + y}`);
    });
    osc.spread = 0; osc.ph = 0;
    const tl = gsap.timeline({ onUpdate: draw, onComplete: () => { document.body.classList.remove('is-locked'); intro.remove(); heroIn(); } });
    tl.fromTo('.intro__strings', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'expo.out' })
      .to(osc, { a: 26, duration: 0.08, ease: 'none' })
      .to(osc, { a: 0, ph: 60, duration: 1.4, ease: 'power2.out' })
      .to('.intro__name', { opacity: 1, y: -10, duration: 0.8, ease: 'expo.out' }, '<0.1')
      .to(osc, { spread: 1, duration: 0.8, ease: 'expo.inOut' }, '-=0.6')
      .to(intro, { opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.2');
    intro.addEventListener('click', () => tl.progress(1));
  }

  /* ---------- scroll ---------- */
  function scrollFx() {
    if (!hasGsap || REDUCE) return;
    const nav = $('#nav');
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => { const y = s.scroll(); nav.classList.toggle('is-solid', y > 60); nav.classList.toggle('is-hidden', s.direction === 1 && y > 600); } });
    // las seis cuerdas entran tensándose de izquierda a derecha y suenan en cascada
    ScrollTrigger.create({
      trigger: '#strings', start: 'top 72%', once: true,
      onEnter: () => {
        gsap.from('.row__string', { scaleX: 0, transformOrigin: 'left center', duration: 1.1, ease: 'expo.out', stagger: 0.08 });
        gsap.from('.row__lbl, .row__n', { opacity: 0, x: -12, duration: 0.8, ease: 'expo.out', stagger: 0.04 });
        strings.filter((s) => s.svg.classList.contains('row__string')).forEach((s, i) => setTimeout(() => pluck(s, 0.5, 0.7), 700 + i * 110));
      }
    });
    gsap.from('.room__big', { clipPath: 'inset(0 100% 0 0 round 12px)', duration: 1.4, ease: 'expo.inOut', scrollTrigger: { trigger: '.room', start: 'top 70%' } });
    gsap.from('.room__a, .room__b', { y: 80, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.15, scrollTrigger: { trigger: '.room__a', start: 'top 90%' } });
    gsap.to('.room__b img', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.room__b', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from('.room__txt > *', { y: 24, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.room__txt', start: 'top 85%' } });
    gsap.from('.live__title', { letterSpacing: '.25em', opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.live', start: 'top 70%' } });
    gsap.from('.live__txt, .live__who', { opacity: 0, y: 16, duration: 1, ease: 'expo.out', stagger: 0.12, delay: 0.3, scrollTrigger: { trigger: '.live', start: 'top 70%' } });
    ScrollTrigger.batch('.reviews__list li', { start: 'top 90%', once: true, onEnter: (els) => gsap.from(els, { y: 30, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }) });
    gsap.from('.visit__fig', { clipPath: 'inset(0 0 100% 0 round 12px)', duration: 1.3, ease: 'expo.inOut', scrollTrigger: { trigger: '.visit', start: 'top 75%' } });
  }

  const initial = [new URLSearchParams(location.search).get('lang'), store.get('sp-lang'), (navigator.language || '').slice(0, 2)].find((l) => l === 'fr' || l === 'es') || 'fr';
  applyLang(initial);
  scrollFx();
  addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
