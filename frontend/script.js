document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn      = document.getElementById('submitBtn');
    const btnText  = document.getElementById('btnText');
    const spinner  = document.getElementById('spinner');
    const toast    = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');

    const name    = document.getElementById('fullName')?.value.trim();
    const email   = document.getElementById('emailAddr')?.value.trim();
    const message = document.getElementById('message')?.value.trim();

    // Hide all errors first
    ['nameError','emailError','msgError'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Validate
    if (!name || name.length < 2)        { document.getElementById('nameError').style.display  = 'block'; return; }
    if (!email || !email.includes('@'))  { document.getElementById('emailError').style.display = 'block'; return; }
    if (!message || message.length < 10) { document.getElementById('msgError').style.display   = 'block'; return; }

    // Show sending state
    btn.disabled = true;
    if (spinner) spinner.style.display = 'block';
    if (btnText) btnText.textContent = 'Sending...';

    try {
      const res = await fetch(`${window.location.origin}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, timestamp: new Date().toISOString() })
      });

      const data = await res.json();

      if (res.ok) {
        toastMsg.textContent = 'Message sent! We will reply within 24 hours.';
        toast.style.background = '#10B981';
        form.reset();
      } else {
        toastMsg.textContent = data.message || 'Failed to send. Try again.';
        toast.style.background = '#EF4444';
      }
    } catch (err) {
      toastMsg.textContent = 'Network error. Please try again.';
      toast.style.background = '#EF4444';
    } finally {
      btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Send Message';
      if (toast) {
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 4000);
      }
    }
  });
});