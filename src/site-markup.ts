import { choices, segmentAngle } from './wheel';
import { trackMarkup } from './track';

const colours = ['#ffe18b', '#ffc5b9', '#b9dfa6'];
const point = (angle: number, radius: number) => {
  const radians = angle * Math.PI / 180;
  return [(250 + radius * Math.sin(radians)).toFixed(6), (250 - radius * Math.cos(radians)).toFixed(6)];
};
const segments = choices.map((choice, index) => {
  const start = point(index * segmentAngle - segmentAngle / 2, 229);
  const end = point(index * segmentAngle + segmentAngle / 2, 229);
  const label = point(index * segmentAngle, 157);
  const lines = index === 2 ? ['Arduino kit', 'Keyboard', 'Headphones'] : [choice];
  const lineHeight = index === 2 ? 19 : 24;
  const fontSize = index === 2 ? 15 : 20;
  const labelRotation = index === 0 ? 0 : index * segmentAngle + 180;
  const lineMarkup = lines.map((line, lineIndex) => `<tspan x="${label[0]}" dy="${lineIndex === 0 ? -((lines.length - 1) * lineHeight) / 2 : lineHeight}">${line}</tspan>`).join('');
  return `<g><path d="M250 250 L${start.join(' ')} A229 229 0 0 1 ${end.join(' ')} Z" fill="${colours[index]}" stroke="#243d30" stroke-width="3"/><text x="${label[0]}" y="${label[1]}" transform="rotate(${labelRotation.toFixed(6)}, ${label.join(' ')})" fill="#243d30" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${lineMarkup}</text></g>`;
}).join('');

export const siteMarkup = `
  <header class="site-header">
    <a class="brand" href="https://codewithpurpose.org" aria-label="CodeWithPurpose home"><img src="/koala/koala-wave.png" alt="" width="45" height="48"/><span class="brand-name">CWP<span class="brand-event">Hackathon</span></span></a>
    <nav aria-label="Main navigation"><a href="#spinner">Spin</a><a href="#track">The track</a><a href="https://codewithpurpose.org" target="_blank" rel="noopener noreferrer" aria-label="Learn at CodeWithPurpose (opens in a new tab)">Learn <span aria-hidden="true">↗</span></a><a class="nav-quiet" href="/agents/">For AI agents</a></nav>
  </header>
  <main><div class="confetti-stage" aria-hidden="true"></div><div class="floating-leaves" aria-hidden="true"><span>❧</span><span>❧</span><span>✧</span></div>
    <section class="intro" aria-labelledby="page-title">
      <span class="edition">CWP at Dublin Hacx</span>
      <h1 id="page-title">Spin the wheel.</h1>
      <p>Three raffle prizes, picked at random.</p>
    </section>
    <section id="spinner" class="spinner-section is-locked" aria-label="Hackathon raffle spinner">
      <div class="wheel-side"><span class="doodle doodle-one" aria-hidden="true">✧</span><span class="doodle doodle-two" aria-hidden="true">✦</span>
        <div class="wheel-frame">
          <div class="pointer" aria-hidden="true"></div>
          <div class="wheel-disc"><svg class="wheel" viewBox="0 0 500 500" role="img" aria-label="Raffle wheel with Sour Patch, Swedish Fish, and an Arduino kit, keyboard, and headphones"><circle cx="250" cy="250" r="246" fill="#fffbf5" stroke="#243d30" stroke-width="6"/>${segments}<circle cx="250" cy="250" r="230" fill="none" stroke="#243d30" stroke-width="4"/></svg></div>
          <button class="wheel-centre" aria-label="Spin the wheel" disabled><img class="centre-koda" src="/koala/koala-wave.png" alt=""/><span>Spin</span></button>
        </div>
        <div class="wheel-controls">
          <p class="wheel-caption">Three raffle prizes. One picked at random.</p>
          <button class="sound-toggle" type="button" aria-label="Mute spin sound" aria-pressed="true">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9v6h4l5 4V5l-5 4h-4Z"/><path class="sound-wave" d="M15 9.5c1.8 1.4 1.8 4.6 0 6M17.5 7c3.2 2.5 3.2 8.5 0 11"/><path class="sound-slash" d="m15 9 5 6m0-6-5 6"/></svg>
            <span class="sound-label">Sound on</span>
          </button>
        </div>
      </div>
      <div class="control-side">
        <section class="access-gate" aria-labelledby="gate-title">
          <img src="/koala/koala-wave.png" alt="" width="62" height="66"/>
          <span class="gate-eyebrow">One spin, just for you</span>
          <h2 id="gate-title">Enter the raffle</h2>
          <p class="gate-intro">Sign in or create a free CWP account for a chance to win.</p>
          <div class="account-gate-slot"></div>
          <p class="gate-status" role="status" aria-live="polite" aria-atomic="true"></p>
          <p class="privacy-note">A verified CWP account is required. One raffle spin per account every 24 hours. We’ll email your result to your verified address.</p>
        </section>
        <div class="koda-host"><div class="speech-bubble"><span class="koda-message">Hi, I’m Koda!<br/>Tap spin when you’re ready.</span></div><img class="koda" role="button" tabindex="0" aria-label="Make Koda dance" src="/koala/koala-wave.png" alt="Koda, the CWP koala, waving" width="523" height="560"/><span class="koda-spark" aria-hidden="true">✧</span></div>
        <div class="result-panel">
          <span class="result-label">Your raffle result</span>
          <div class="result" role="status" aria-live="polite" aria-atomic="true"><span class="result-letter">?</span><h2>Ready when you are.</h2><p>Press the button or the centre of the wheel.</p></div>
          <button type="button" class="spin-button" disabled><span>Spin the wheel</span></button>
          <p class="helper">Your result is saved to your CWP account for 24 hours.</p>
        </div>

      </div>
    </section>
    <a class="track-invitation" href="#track"><span>Build something that helps someone.<strong>About the Build for Access track</strong></span><span class="trail-arrow" aria-hidden="true">↓</span></a>
    ${trackMarkup}
  </main>
  <footer><img class="footer-koda" src="/koala/koala-sleep.png" alt="Koda having a well-earned nap" width="560" height="355"/><span>CodeWithPurpose</span><a href="https://codewithpurpose.org">Free coding education <span aria-hidden="true">↗</span></a></footer>
`;
