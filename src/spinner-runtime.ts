import { animate, inView } from 'motion';
import { choices, landingRotation } from './wheel';

type SpinState = { verified?: boolean; hasSpun?: boolean; choiceIndex?: number; alreadySpun?: boolean; emailSent?: boolean; error?: string };

export function initialiseSpinner(root: HTMLDivElement) {
  const abort = new AbortController();
  let stopObserving: (() => void) | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  const section = root.querySelector<HTMLElement>('#spinner')!;
  const wheel = root.querySelector<SVGElement>('.wheel')!;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.spin-button, .wheel-centre'));
  const result = root.querySelector<HTMLDivElement>('.result')!;
  const buttonLabel = root.querySelector<HTMLSpanElement>('.spin-button span')!;
  const koda = root.querySelector<HTMLImageElement>('.koda')!;
  const kodaMessage = root.querySelector<HTMLSpanElement>('.koda-message')!;
  const host = root.querySelector<HTMLDivElement>('.koda-host')!;
  const identityForm = root.querySelector<HTMLFormElement>('.identity-form')!;
  const codeForm = root.querySelector<HTMLFormElement>('.code-form')!;
  const nameInput = root.querySelector<HTMLInputElement>('#visitor-name')!;
  const emailInput = root.querySelector<HTMLInputElement>('#visitor-email')!;
  const codeInput = root.querySelector<HTMLInputElement>('#visitor-code')!;
  const gateStatus = root.querySelector<HTMLParagraphElement>('.gate-status')!;
  const countdown = root.querySelector<HTMLParagraphElement>('.code-countdown')!;
  const resendButton = root.querySelector<HTMLButtonElement>('.resend-button')!;
  const resendLabel = resendButton.querySelector<HTMLSpanElement>('span')!;
  let rotation = 0;
  let spinning = false;
  let codeExpiresAt = 0;
  let resendAt = 0;

  function setButtonsDisabled(disabled: boolean) {
    buttons.forEach(button => { button.disabled = disabled; });
  }

  function setStatus(message = '', isError = true) {
    gateStatus.textContent = message;
    gateStatus.classList.toggle('is-success', !isError);
  }

  function displayResult(index: number, returning: boolean) {
    const choice = choices[index];
    if (!choice) return;
    if (returning) {
      rotation = landingRotation(0, index) % 360;
      wheel.style.transform = `rotate(${rotation}deg)`;
    }
    result.replaceChildren();
    const letter = document.createElement('span');
    letter.className = 'result-letter';
    letter.textContent = choice.slice(-1);
    const heading = document.createElement('h2');
    heading.textContent = choice;
    const description = document.createElement('p');
    description.textContent = returning ? 'Your one spin for this email has already been used.' : 'That was your one spin. This choice is yours!';
    result.append(letter, heading, description);
    buttonLabel.textContent = 'Spin used';
    koda.src = '/koala/koala-heart.png';
    koda.alt = 'Koda celebrating with a green heart';
    kodaMessage.textContent = returning ? `${choice} is still yours!` : `${choice}! That’s your one spin.`;
    host.classList.remove('spinning');
    host.classList.add('celebrating');
    section.classList.add('is-spent');
    setButtonsDisabled(true);
  }

  function showSpinMessage(message: string) {
    result.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = message;
    const detail = document.createElement('p');
    detail.textContent = 'Your email’s one spin is safe. Try again to check its result.';
    result.append(heading, detail);
  }

  function unlock(state: SpinState) {
    section.classList.remove('is-locked');
    section.classList.add('is-verified');
    setStatus('Email verified. Your spin is ready.', false);
    if (state.hasSpun || state.alreadySpun) {
      if (typeof state.choiceIndex === 'number') displayResult(state.choiceIndex, true);
      else setStatus('This email has already used its spin.', true);
      return;
    }
    section.classList.remove('is-spent');
    buttonLabel.textContent = 'Spin the wheel';
    setButtonsDisabled(false);
    kodaMessage.textContent = 'You’re all set! Tap spin when you’re ready.';
  }

  async function postJson(url: string, body: object) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    const payload = await response.json() as SpinState & { ok?: boolean; retryAfterSeconds?: number; expiresInSeconds?: number; resendAfterSeconds?: number };
    return { response, payload };
  }

  const identity = () => ({ name: nameInput.value.trim(), email: emailInput.value.trim() });

  function updateCountdown() {
    const now = Date.now();
    const codeSeconds = Math.max(0, Math.ceil((codeExpiresAt - now) / 1000));
    const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
    if (codeSeconds > 0) {
      countdown.textContent = `Code expires in ${Math.floor(codeSeconds / 60)}:${String(codeSeconds % 60).padStart(2, '0')}.`;
    } else if (codeExpiresAt) {
      countdown.textContent = 'That code has expired. Request a new one to continue.';
    }
    resendButton.disabled = resendSeconds > 0;
    resendLabel.textContent = resendSeconds > 0 ? `in ${resendSeconds}s` : '';
  }

  function startCountdown(expiresInSeconds: number, resendAfterSeconds: number) {
    codeExpiresAt = Date.now() + expiresInSeconds * 1000;
    resendAt = Date.now() + resendAfterSeconds * 1000;
    updateCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  async function sendCode() {
    const data = identity();
    if (!data.name) { nameInput.reportValidity(); return; }
    if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; }
    const submit = identityForm.querySelector<HTMLButtonElement>('.gate-button')!;
    const resending = !codeForm.hidden;
    if (resending && resendButton.disabled) return;
    submit.disabled = true;
    if (resending) resendButton.disabled = true;
    setStatus('Sending your code…', false);
    try {
      const { response, payload } = await postJson('/api/auth/request-code', data);
      if (!response.ok) {
        if (payload.error === 'rate_limited') {
          const wait = payload.retryAfterSeconds ?? 60;
          resendAt = Date.now() + wait * 1000;
          updateCountdown();
          setStatus(`Please wait ${wait} seconds before requesting another code.`);
        }
        else if (payload.error === 'invalid_input') setStatus('Please check your name and email address.');
        else setStatus('We couldn’t send the code just now. Please try again in a moment.');
        return;
      }
      identityForm.hidden = true;
      codeForm.hidden = false;
      codeInput.value = '';
      startCountdown(payload.expiresInSeconds ?? 900, payload.resendAfterSeconds ?? 60);
      setStatus(`We sent a code to ${data.email}. It’s valid for 15 minutes.`, false);
      codeInput.focus();
    } catch {
      if (!abort.signal.aborted) setStatus('We couldn’t reach the server. Check your connection and try again.');
    } finally {
      submit.disabled = false;
      if (resending && resendAt <= Date.now()) resendButton.disabled = false;
    }
  }

  identityForm.addEventListener('submit', event => { event.preventDefault(); void sendCode(); }, { signal: abort.signal });
  resendButton.addEventListener('click', () => { void sendCode(); }, { signal: abort.signal });
  root.querySelector<HTMLButtonElement>('.change-email')!.addEventListener('click', () => {
    codeForm.hidden = true;
    identityForm.hidden = false;
    codeExpiresAt = 0;
    if (countdownTimer) clearInterval(countdownTimer);
    setStatus('');
    emailInput.focus();
  }, { signal: abort.signal });

  codeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!/^\d{6}$/.test(codeInput.value)) { codeInput.reportValidity(); setStatus('Enter the six-digit code from your email.'); return; }
    const submit = codeForm.querySelector<HTMLButtonElement>('.gate-button')!;
    submit.disabled = true;
    setStatus('Checking your code…', false);
    try {
      const { response, payload } = await postJson('/api/auth/verify-code', { email: emailInput.value.trim(), code: codeInput.value });
      if (!response.ok) {
        if (payload.error === 'code_expired') setStatus('That code expired. Request a new one to continue.');
        else if (payload.error === 'too_many_attempts') setStatus('Too many tries. Request a new code and try again.');
        else if (payload.error === 'invalid_code') setStatus('That code doesn’t match. Check it and try again.');
        else if (payload.error === 'rate_limited') setStatus('Too many attempts. Please wait before trying again.');
        else setStatus('We couldn’t verify that code. Please try again.');
        return;
      }
      if (countdownTimer) clearInterval(countdownTimer);
      codeForm.hidden = true;
      identityForm.hidden = true;
      setStatus('Checking whether your spin is still available…', false);
      const stateResponse = await fetch('/api/spin', { credentials: 'same-origin', signal: abort.signal, cache: 'no-store' });
      if (!stateResponse.ok) {
        section.classList.remove('is-locked');
        section.classList.add('is-verified');
        showSpinMessage('Your email is verified.');
        buttonLabel.textContent = 'Reveal my spin';
        setButtonsDisabled(false);
        setStatus('Spin status could not load. Try the button to recover your result.');
        return;
      }
      unlock(await stateResponse.json() as SpinState);
      const spinButton = root.querySelector<HTMLButtonElement>('.spin-button')!;
      if (!spinButton.disabled) spinButton.focus();
    } catch {
      if (!abort.signal.aborted) setStatus('We couldn’t verify your access. Please refresh and try again.');
    } finally {
      submit.disabled = false;
    }
  }, { signal: abort.signal });

  async function spin() {
    if (spinning || section.classList.contains('is-locked') || section.classList.contains('is-spent')) return;
    spinning = true;
    setButtonsDisabled(true);
    buttonLabel.textContent = 'Getting your spin…';
    setStatus('Getting your spin ready…', false);
    try {
      const response = await fetch('/api/spin', { method: 'POST', credentials: 'same-origin', signal: abort.signal });
      const state = await response.json() as SpinState;
      if (response.status === 409 && state.alreadySpun && typeof state.choiceIndex === 'number') {
        displayResult(state.choiceIndex, true);
        setStatus('This email has already used its spin.');
        return;
      }
      if (!response.ok || typeof state.choiceIndex !== 'number' || !choices[state.choiceIndex]) {
        if (response.status === 401) {
          section.classList.add('is-locked');
          section.classList.remove('is-verified');
          identityForm.hidden = false;
          codeForm.hidden = true;
          setStatus('Your verification expired. Enter your email and request a new code.');
        } else {
          showSpinMessage('Your spin could not start.');
          setStatus('Your spin could not be started. Please try again.');
        }
        return;
      }
      const index = state.choiceIndex;
      result.innerHTML = '<span class="result-letter waiting">↻</span><h2>Spinning…</h2><p>The wheel is choosing.</p>';
      buttonLabel.textContent = 'Spinning…';
      koda.src = '/koala/koala-branch.png';
      koda.alt = 'Koda perched on a branch, watching the wheel';
      kodaMessage.textContent = 'Let’s see where it lands.';
      host.classList.remove('celebrating');
      host.classList.add('spinning');
      animate(root.querySelector<HTMLElement>('.speech-bubble')!, { rotate: [-4, 3, -4] }, { duration: .45 });
      const next = landingRotation(rotation, index);
      const animation = wheel.animate([{ transform: `rotate(${rotation}deg)` }, { transform: `rotate(${next}deg)` }], {
        duration: 4400,
        easing: 'cubic-bezier(0.12, 0.75, 0.12, 1)',
        fill: 'forwards',
      });
      try { await animation.finished; } catch { return; }
      if (abort.signal.aborted) return;
      rotation = next % 360;
      displayResult(index, false);
      celebrate();
      setStatus(state.emailSent
        ? 'Your one spin is complete. We sent your choice by email.'
        : 'Your spin is complete, but we couldn’t send the email. Your result is saved here.', !state.emailSent);
    } catch {
      if (!abort.signal.aborted) {
        showSpinMessage('We couldn’t reach the spinner.');
        setButtonsDisabled(false);
        buttonLabel.textContent = 'Reveal my spin';
      }
    } finally {
      spinning = false;
    }
  }

  buttons.forEach(button => button.addEventListener('click', () => { void spin(); }, { signal: abort.signal }));

  function celebrate() {
    animate(root.querySelector<HTMLElement>('.result-letter')!, { scale: [.5, 1.18, 1], rotate: [-15, 7, -5] }, { duration: .55 });
    animate(root.querySelector<HTMLElement>('.speech-bubble')!, { y: [8, -5, 0], rotate: [-4, 2, -4] }, { duration: .5 });
    const stage = root.querySelector<HTMLDivElement>('.confetti-stage')!;
    stage.replaceChildren();
    for (let i = 0; i < 30; i++) {
      const piece = document.createElement('span');
      piece.className = `confetti confetti-${i % 5}`;
      piece.textContent = i % 3 === 0 ? '✦' : '●';
      stage.append(piece);
      const angle = i / 30 * Math.PI * 2;
      const animation = animate(piece, {
        x: [0, Math.cos(angle) * (130 + i % 6 * 35)],
        y: [0, Math.sin(angle) * 100 - 140, 230 + i % 5 * 28],
        rotate: [0, i % 2 === 0 ? 360 : -360],
        opacity: [0, 1, 1, 0],
        scale: [.5, 1, .7],
      }, { duration: 1.6 + i % 4 * .12, ease: 'easeOut' });
      void animation.then(() => piece.remove());
    }
  }

  try {
    animate(root.querySelector<HTMLElement>('.intro')!, { opacity: [0, 1], y: [14, 0] }, { duration: .6 });
    stopObserving = inView(root.querySelectorAll('.trail-stop'), element => {
      animate(element, { opacity: [.4, 1], y: [22, 0] }, { duration: .5 });
    });
  } catch { /* Motion may be unavailable in restricted browser contexts. */ }

  function makeKodaDance() {
    animate(koda, { rotate: [0, -8, 8, 0], y: [0, -15, 0] }, { duration: .6 });
  }
  koda.addEventListener('click', makeKodaDance, { signal: abort.signal });
  koda.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      makeKodaDance();
    }
  }, { signal: abort.signal });

  void (async () => {
    try {
      const response = await fetch('/api/spin', { credentials: 'same-origin', cache: 'no-store', signal: abort.signal });
      if (!response.ok) return;
      unlock(await response.json() as SpinState);
    } catch { /* Keep the email gate visible if the session service is unavailable. */ }
  })();

  return () => {
    abort.abort();
    stopObserving?.();
    if (countdownTimer) clearInterval(countdownTimer);
    for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
    root.querySelector('.confetti-stage')?.replaceChildren();
  };
}
