import { animate, inView } from 'motion';
import { choices, landingRotation } from './wheel';

type SpinState = { authenticated?: boolean; hasSpun?: boolean; choiceIndex?: number; alreadySpun?: boolean; emailSent?: boolean; error?: string };

export function initialiseSpinner(root: HTMLDivElement) {
  const abort = new AbortController();
  let stopObserving: (() => void) | undefined;
  const section = root.querySelector<HTMLElement>('#spinner')!;
  const wheel = root.querySelector<SVGElement>('.wheel')!;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.spin-button, .wheel-centre'));
  const result = root.querySelector<HTMLDivElement>('.result')!;
  const buttonLabel = root.querySelector<HTMLSpanElement>('.spin-button span')!;
  const koda = root.querySelector<HTMLImageElement>('.koda')!;
  const kodaMessage = root.querySelector<HTMLSpanElement>('.koda-message')!;
  const host = root.querySelector<HTMLDivElement>('.koda-host')!;
  const gateStatus = root.querySelector<HTMLParagraphElement>('.gate-status')!;
  const soundToggle = root.querySelector<HTMLButtonElement>('.sound-toggle')!;
  const soundLabel = soundToggle.querySelector<HTMLSpanElement>('.sound-label')!;
  let rotation = 0;
  let spinning = false;
  let soundEnabled = true;
  let audioContext: AudioContext | null = null;
  let tickNoise: AudioBuffer | null = null;
  let tickTimers: number[] = [];
  let soundStartedAt = 0;
  let soundDuration = 0;
  let soundRotation = 0;

  function getAudioContext() {
    if (audioContext) return audioContext;
    try {
      audioContext = new window.AudioContext();
      const bufferLength = Math.floor(audioContext.sampleRate * 0.018);
      tickNoise = audioContext.createBuffer(1, bufferLength, audioContext.sampleRate);
      const samples = tickNoise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      return audioContext;
    } catch {
      return null;
    }
  }

  function prepareAudio() {
    if (!soundEnabled) return;
    const context = getAudioContext();
    if (context?.state === 'suspended') void context.resume().catch(() => {});
  }

  function playSpinTick() {
    if (!soundEnabled || !audioContext || !tickNoise || audioContext.state !== 'running') return;
    const now = audioContext.currentTime;
    const click = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const clickGain = audioContext.createGain();
    click.buffer = tickNoise;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1450, now);
    filter.Q.setValueAtTime(0.7, now);
    clickGain.gain.setValueAtTime(0.13, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
    click.connect(filter);
    filter.connect(clickGain);
    clickGain.connect(audioContext.destination);
    click.start(now);

    const tone = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(760, now);
    tone.frequency.exponentialRampToValueAtTime(390, now + 0.035);
    toneGain.gain.setValueAtTime(0.035, now);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    tone.connect(toneGain);
    toneGain.connect(audioContext.destination);
    tone.start(now);
    tone.stop(now + 0.04);
  }

  function bezierValue(t: number, first: number, second: number) {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
  }

  function timeAtSpinProgress(progress: number) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 18; i++) {
      const middle = (low + high) / 2;
      if (bezierValue(middle, 0.75, 1) < progress) low = middle;
      else high = middle;
    }
    return bezierValue((low + high) / 2, 0.12, 0.12);
  }

  function clearSpinTicks() {
    tickTimers.forEach(window.clearTimeout);
    tickTimers = [];
  }

  function scheduleSpinTicks() {
    clearSpinTicks();
    if (!soundEnabled || !spinning || !soundStartedAt || !soundDuration || !soundRotation) return;
    const elapsed = performance.now() - soundStartedAt;
    const segment = 360 / choices.length;
    const currentOffset = ((rotation % segment) + segment) % segment;
    let degreesToBoundary = (segment / 2 - currentOffset + segment) % segment;
    if (degreesToBoundary < 0.001) degreesToBoundary = segment;
    while (degreesToBoundary < soundRotation) {
      const progress = degreesToBoundary / soundRotation;
      const delay = soundDuration * timeAtSpinProgress(progress) - elapsed;
      if (delay >= 0) tickTimers.push(window.setTimeout(playSpinTick, delay));
      degreesToBoundary += segment;
    }
  }

  function startSpinTicks(degrees: number, duration: number) {
    soundStartedAt = performance.now();
    soundDuration = duration;
    soundRotation = degrees;
    scheduleSpinTicks();
  }

  function stopSpinTicks() {
    clearSpinTicks();
    soundStartedAt = 0;
    soundDuration = 0;
    soundRotation = 0;
  }

  function updateSoundToggle() {
    soundToggle.classList.toggle('is-muted', !soundEnabled);
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.setAttribute('aria-label', soundEnabled ? 'Mute spin sound' : 'Turn spin sound on');
    soundLabel.textContent = soundEnabled ? 'Sound on' : 'Muted';
  }

  soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateSoundToggle();
    if (soundEnabled) {
      prepareAudio();
      if (spinning) scheduleSpinTicks();
    } else {
      clearSpinTicks();
    }
  }, { signal: abort.signal });

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
    letter.textContent = String(index + 1);
    const heading = document.createElement('h2');
    heading.textContent = choice;
    const description = document.createElement('p');
    description.textContent = returning
      ? 'Your saved CWP account spin is still here.'
      : 'That’s your raffle result for the next 24 hours.';
    result.append(letter, heading, description);
    buttonLabel.textContent = 'Spin used';
    koda.src = '/koala/koala-heart.png';
    koda.alt = 'Koda celebrating with a green heart';
    kodaMessage.textContent = returning ? `${choice} is still yours!` : `Your raffle result: ${choice}!`;
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
    detail.textContent = 'Your account’s spin is safe. Check your connection, then try again.';
    result.append(heading, detail);
  }

  function unlock(state: SpinState) {
    section.classList.remove('is-locked');
    section.classList.add('is-verified');
    setStatus('Your CWP account is verified. Your spin is ready.', false);
    if (state.hasSpun || state.alreadySpun) {
      if (typeof state.choiceIndex === 'number') displayResult(state.choiceIndex, true);
      else setStatus('This CWP account has already used its spin.', true);
      return;
    }
    section.classList.remove('is-spent');
    buttonLabel.textContent = 'Spin the wheel';
    setButtonsDisabled(false);
    kodaMessage.textContent = 'You’re all set! Tap spin when you’re ready.';
  }

  async function refreshAccess() {
    try {
      const response = await fetch('/api/spin', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (response.ok) {
        unlock(await response.json() as SpinState);
        return;
      }
      section.classList.add('is-locked');
      section.classList.remove('is-verified', 'is-spent');
      setButtonsDisabled(true);
      if (response.status === 403) setStatus('Verify your CWP account email to unlock the wheel.');
      else if (response.status === 401) setStatus('Sign in with your CWP account to unlock the wheel.', false);
      else setStatus('We couldn’t check your CWP account. Refresh the page and try again.');
    } catch {
      if (!abort.signal.aborted) setStatus('We couldn’t reach the account service. Refresh the page and try again.');
    }
  }

  window.addEventListener('cwp:account-changed', () => { void refreshAccess(); }, { signal: abort.signal });

  async function spin() {
    if (spinning || section.classList.contains('is-locked') || section.classList.contains('is-spent')) return;
    prepareAudio();
    spinning = true;
    setButtonsDisabled(true);
    buttonLabel.textContent = 'Getting your spin…';
    setStatus('Getting your spin ready…', false);
    try {
      const response = await fetch('/api/spin', { method: 'POST', credentials: 'same-origin', signal: abort.signal });
      const state = await response.json() as SpinState;
      if (response.status === 409 && state.alreadySpun && typeof state.choiceIndex === 'number') {
        displayResult(state.choiceIndex, true);
        setStatus('This CWP account has already used its spin.');
        return;
      }
      if (!response.ok || typeof state.choiceIndex !== 'number' || !choices[state.choiceIndex]) {
        if (response.status === 401) {
          await refreshAccess();
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
      startSpinTicks(next - rotation, 4400);
      try { await animation.finished; } catch { return; }
      if (abort.signal.aborted) return;
      stopSpinTicks();
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
      stopSpinTicks();
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
    await refreshAccess();
  })();

  return () => {
    abort.abort();
    stopSpinTicks();
    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
    stopObserving?.();
    for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
    root.querySelector('.confetti-stage')?.replaceChildren();
  };
}
