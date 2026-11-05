/* Contact form.
   Messages are emailed to the address below by FormSubmit (formsubmit.co), a free service that
   needs no account. The first message it ever receives triggers one confirmation email to that
   address; click the button in it once and every message after that arrives normally.
   Locally (localhost) server.js still stores submissions, so you can test without sending email. */
const $ = (s, r = document) => r.querySelector(s);
const RECIPIENT = 'hello@abhinebhnani.com';
const ENDPOINT = `https://formsubmit.co/ajax/${RECIPIENT}`;

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const form = $('#contact-form');
const msg = $('.form__msg');

async function send(data) {
  if (isLocal) {
    const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'Something went wrong.');
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `Mason contact request: ${(data.company || data.name || data.email).trim().slice(0, 80)}`,
      _template: 'table',
      _captcha: 'false',
      name: (data.name || '').trim().slice(0, 200),
      email: data.email.trim().slice(0, 254),   // also becomes the reply-to address
      company: (data.company || '').trim().slice(0, 200),
      role: (data.role || '').trim().slice(0, 100),
      message: (data.message || '').trim().slice(0, 2000),
      _honey: '',
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || String(out.success) === 'false') throw new Error(`Could not send just now. Please email us at ${RECIPIENT}.`);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const btn = $('button[type="submit"]', form);
  msg.className = 'form__msg';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((data.email || '').trim())) {
    msg.textContent = 'Enter a valid email address.';
    msg.classList.add('is-err');
    return;
  }
  if (data.website) {                    // hidden field filled in: a bot. Pretend it worked.
    form.reset(); msg.textContent = 'Thanks. Our team will be in touch.'; msg.classList.add('is-ok');
    return;
  }
  btn.disabled = true;
  try {
    await send(data);
    form.reset();
    msg.textContent = 'Thanks. Our team will be in touch.';
    msg.classList.add('is-ok');
  } catch (err) {
    // network failure or the service being down: point people at the email address instead
    msg.textContent = err instanceof TypeError ? `Could not send just now. Please email us at ${RECIPIENT}.` : (err.message || 'Something went wrong. Try again.');
    msg.classList.add('is-err');
  } finally {
    btn.disabled = false;
  }
});
