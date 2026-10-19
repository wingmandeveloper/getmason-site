const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

/* Nav colour follows the section under it */
const nav = $('.nav');
const themed = $$('[data-nav]');
function navTheme() {
  for (const s of themed) {
    const r = s.getBoundingClientRect();
    if (r.top <= 40 && r.bottom > 40) {
      nav.dataset.theme = s.dataset.nav;
      return;
    }
  }
}

/* Product orbit.
   Scrolling turns the machine through its views. The outgoing view swings away
   on a perspective yaw while the next one swings in over it, so it reads as a
   continuous camera move rather than a slideshow. Views are the <img.view>
   elements in order; add more angles by adding more images. */
const NAMES = ['Side profile', 'Rear three-quarter', 'Tipping', 'Hydraulics'];
const SWING = 38;        // degrees of yaw at the far end of a transition
const product = $('.product');
const views = $$('.view');
const floor = $('.orbit__floor');
const steps = $$('.step');
const dots = $$('.product__dots li');
const cur = $('#cur');
const viewName = $('#view-name');
let active = -1;

function setActive(i) {
  if (i === active) return;
  active = i;
  steps.forEach((el, k) => el.classList.toggle('is-active', k === i));
  dots.forEach((el, k) => el.classList.toggle('is-active', k === i));
  cur.textContent = String(i + 1).padStart(2, '0');
  viewName.textContent = NAMES[i];
}

function updateProduct() {
  const r = product.getBoundingClientRect();
  const total = product.offsetHeight - innerHeight;
  const p = clamp(-r.top / total);
  const n = views.length;
  const pos = p * (n - 1);
  const i = Math.min(Math.floor(pos), n - 2);
  const f = pos - i;
  if (product.classList.contains('has-3d')) {   // viewer.js drives the 3D camera instead
    setActive(clamp(Math.round(pos), 0, n - 1));
    return;
  }
  const e = smooth(clamp((f - 0.25) / 0.5)); // dwell on each view, then swing

  views.forEach((v, k) => {
    if (k !== i && k !== i + 1) {
      v.style.opacity = 0;
      return;
    }
    const rel = k === i ? e : e - 1;            // 0 -> 1 leaving, -1 -> 0 arriving
    const yaw = -rel * SWING;
    const shift = -rel * 5;                      // % of width
    const scale = 1 - Math.abs(rel) * 0.07;
    const blur = Math.sin(Math.PI * e) * 1.2;
    v.style.opacity = k === i ? 1 : e;
    v.style.zIndex = k === i ? 1 : 2;
    v.style.transform = `translate3d(${shift}%, 0, 0) rotateY(${yaw}deg) scale(${scale})`;
    v.style.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : 'none';
  });

  // ground shadow follows the swing and fades out for the close-up
  const detail = clamp(pos - (n - 2));
  floor.style.opacity = 1 - detail;
  floor.style.transform = `translateX(${Math.sin(pos * Math.PI) * 3}%) scaleX(${1 - Math.sin(Math.PI * e) * 0.14})`;

  setActive(clamp(Math.round(pos), 0, n - 1));
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    navTheme();
    updateProduct();
    ticking = false;
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
setActive(0);
onScroll();

/* Reveal on scroll */
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) {
      en.target.classList.add('in');
      io.unobserve(en.target);
    }
  });
}, { threshold: 0.15 });
$$('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 90}ms`;
  io.observe(el);
});

/* Contact form.
   Locally, server.js stores submissions. On the static host set FORM_ENDPOINT to
   a form service URL (Web3Forms, Formspree) and it will post there instead. */
const FORM_ENDPOINT = '';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const endpoint = isLocal ? '/api/contact' : FORM_ENDPOINT;
const form = $('#contact-form');
const msg = $('.form__msg');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const btn = $('button', form);
  msg.className = 'form__msg';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((data.email || '').trim())) {
    msg.textContent = 'Enter a valid email address.';
    msg.classList.add('is-err');
    return;
  }
  if (!endpoint) {
    msg.textContent = 'Our contact form is opening soon. Please check back shortly.';
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'Something went wrong.');
    form.reset();
    msg.textContent = 'Thanks. Our team will be in touch.';
    msg.classList.add('is-ok');
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong. Try again.';
    msg.classList.add('is-err');
  } finally {
    btn.disabled = false;
  }
});
