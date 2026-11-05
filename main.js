/* Contact form.
   Locally, server.js stores submissions. On the static host set FORM_ENDPOINT to
   a form service URL (Web3Forms, Formspree) and it will post there instead. */
const $ = (s, r = document) => r.querySelector(s);
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
