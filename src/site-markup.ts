import { choices, segmentAngle } from './wheel';
import { trackMarkup } from './track';

const colours = ['#b9dfa6', '#ffe18b', '#ffc5b9', '#b7dfe3', '#d7c8ed', '#b9dfa6', '#ffe18b', '#ffc5b9', '#b7dfe3', '#d7c8ed', '#ffe18b'];
const point = (angle: number, radius: number) => {
  const radians = angle * Math.PI / 180;
  return [(250 + radius * Math.sin(radians)).toFixed(6), (250 - radius * Math.cos(radians)).toFixed(6)];
};
const segments = choices.map((choice, index) => {
  const start = point(index * segmentAngle - segmentAngle / 2, 229);
  const end = point(index * segmentAngle + segmentAngle / 2, 229);
  const label = point(index * segmentAngle, 169);
  return `<g><path d="M250 250 L${start.join(' ')} A229 229 0 0 1 ${end.join(' ')} Z" fill="${colours[index]}" stroke="#243d30" stroke-width="3"/><text x="${label[0]}" y="${label[1]}" transform="rotate(${(index * segmentAngle).toFixed(6)}, ${label.join(' ')})" fill="#243d30" text-anchor="middle" dominant-baseline="middle">${choice}</text></g>`;
}).join('');

export const siteMarkup = `
  <header class="site-header">
    <a class="brand" href="https://codewithpurpose.org" aria-label="CodeWithPurpose home"><img src="/koala/koala-wave.png" alt="" width="45" height="48"/><span class="brand-name">CWP<span class="brand-event">Hackathon</span></span></a>
    <nav aria-label="Main navigation"><a href="#spinner">Spin</a><a href="#track">The track</a></nav>
  </header>
  <main><div class="confetti-stage" aria-hidden="true"></div><div class="floating-leaves" aria-hidden="true"><span>❧</span><span>❧</span><span>✧</span></div>
    <section class="intro" aria-labelledby="page-title">
      <span class="edition">CWP at Dublin Hacx</span>
      <h1 id="page-title">Spin the wheel.</h1>
      <p>Eleven choices, picked at random.</p>
    </section>
    <section id="spinner" class="spinner-section is-locked" aria-label="Hackathon choice spinner">
      <div class="wheel-side"><span class="doodle doodle-one" aria-hidden="true">✧</span><span class="doodle doodle-two" aria-hidden="true">✦</span>
        <div class="wheel-frame">
          <div class="pointer" aria-hidden="true"></div>
          <div class="wheel-disc"><svg class="wheel" viewBox="0 0 500 500" role="img" aria-label="Wheel with eleven equal sections, Choice A through Choice K"><circle cx="250" cy="250" r="246" fill="#fffbf5" stroke="#243d30" stroke-width="6"/>${segments}<circle cx="250" cy="250" r="230" fill="none" stroke="#243d30" stroke-width="4"/></svg></div>
          <button class="wheel-centre" aria-label="Spin the wheel" disabled><img class="centre-koda" src="/koala/koala-wave.png" alt=""/><span>Spin</span></button>
        </div>
        <p class="wheel-caption">Each choice has the same chance.</p>
      </div>
      <div class="control-side">
        <section class="access-gate" aria-labelledby="gate-title">
          <img src="/koala/koala-wave.png" alt="" width="62" height="66"/>
          <span class="gate-eyebrow">One spin, just for you</span>
          <h2 id="gate-title">Get your spin</h2>
          <p class="gate-intro">Add your name and email. We’ll send a code to make sure it’s you.</p>
          <form class="identity-form" novalidate>
            <label for="visitor-name">Your name</label><input id="visitor-name" name="name" type="text" autocomplete="name" maxlength="80" required/>
            <label for="visitor-email">Email address</label><input id="visitor-email" name="email" type="email" autocomplete="email" maxlength="254" required/>
            <button class="gate-button" type="submit">Email me a code</button>
          </form>
          <form class="code-form" hidden novalidate>
            <label for="visitor-code">Six-digit code</label><input id="visitor-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required/>
            <p class="code-countdown" aria-live="polite"></p>
            <button class="gate-button" type="submit">Verify and unlock</button>
            <button class="resend-button" type="button" disabled>Send a new code <span></span></button>
            <button class="change-email" type="button">Use a different email</button>
          </form>
          <p class="gate-status" role="status" aria-live="polite" aria-atomic="true"></p>
          <p class="privacy-note">Your name and email verify access; both expire after 24 hours. We briefly use your connection address to limit code requests. One spin per email.</p>
        </section>
        <div class="koda-host"><div class="speech-bubble"><span class="koda-message">Hi, I’m Koda!<br/>Tap spin when you’re ready.</span></div><img class="koda" role="button" tabindex="0" aria-label="Make Koda dance" src="/koala/koala-wave.png" alt="Koda, the CWP koala, waving" width="523" height="560"/><span class="koda-spark" aria-hidden="true">✧</span></div>
        <div class="result-panel">
          <span class="result-label">Your result</span>
          <div class="result" role="status" aria-live="polite" aria-atomic="true"><span class="result-letter">?</span><h2>Ready when you are.</h2><p>Press the button or the centre of the wheel.</p></div>
          <button type="button" class="spin-button" disabled><span>Spin the wheel</span></button>
          <p class="helper">All choices stay on the wheel for every spin.</p>
        </div>

      </div>
    </section>
    <a class="track-invitation" href="#track"><span>Build something that helps someone.<strong>About the Build for Access track</strong></span><span class="trail-arrow" aria-hidden="true">↓</span></a>
    ${trackMarkup}
  </main>
  <footer><img class="footer-koda" src="/koala/koala-sleep.png" alt="Koda having a well-earned nap" width="560" height="355"/><span>CodeWithPurpose</span><a href="https://codewithpurpose.org">Free coding education <span aria-hidden="true">↗</span></a></footer>
`;
