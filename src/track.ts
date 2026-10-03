const source = 'https://docs.google.com/document/d/12snSClJj4a6A9Ql5gx8O9n5KKGzKjAsDLRg9irZUSIg/edit';
const ideas = [
  ['Learning offline', 'A coding lesson for students with limited internet access.'],
  ['Making things clearer', 'Turn complicated school information into step-by-step instructions.'],
  ['Crossing language barriers', 'Help people who speak different languages communicate.'],
  ['Opening up creativity', 'An accessible interface that helps beginners use a creative tool.'],
  ['Finding a way in', 'Connect students with mentors or learning opportunities.'],
];
const rubric = [
  ['Purpose and impact', 30, 'A clear user, a meaningful barrier and a believable benefit.'],
  ['Accessibility and user understanding', 25, 'Design grounded in real needs and constraints, rather than assumptions.'],
  ['Technical execution', 25, 'A core feature that works, with thoughtful technical choices and tradeoffs.'],
  ['Demonstration and evidence', 20, 'Show what works, the feedback you used and what remains unfinished.'],
] as const;
export const trackMarkup = `
<section class="track-section" id="track" aria-labelledby="track-title">
  <div class="track-heading"><span class="section-label">The CWP track at Dublin Hacx</span><h2 id="track-title">Build for Access</h2><p>A small build can open a big door.</p></div>
  <p class="track-lead">An optional track within Dublin Hacx. Build a working product that helps people overcome a barrier to learning, creating, communicating or participating.</p>
  <div class="trail">
    <svg class="trail-line" viewBox="0 0 900 1030" preserveAspectRatio="none" aria-hidden="true"><path d="M190 10 C800 100 850 360 500 390 S50 520 260 690 S850 870 630 1020" fill="none" stroke="#b5c99e" stroke-width="5" stroke-dasharray="10 13"/></svg>
    <article class="trail-stop stop-one"><div class="trail-art"><span class="art-orbit" aria-hidden="true"></span><img src="/koala/koala-read.png" alt="Koda reading and learning" width="464" height="560" loading="lazy"/></div><div class="trail-copy"><span class="step-label">First, get curious</span><h3>Find the barrier.</h3><p>Start with a specific person or community. What gets in their way? It could be language, unreliable internet, a confusing process, limited resources or a tool that is hard to use.</p></div></article>
    <article class="trail-stop stop-two"><div class="trail-art"><span class="art-orbit" aria-hidden="true"></span><img src="/koala/koala-climb.png" alt="Koda climbing a tree" width="539" height="560" loading="lazy"/></div><div class="trail-copy"><span class="step-label">Then, make a way through</span><h3>Small build. Real help.</h3><p>Build the smallest useful solution you can demonstrate by the end of the event. Opt in and build alongside other Dublin Hacx teams, with optional CWP activities and mentor check-ins to help you test ideas.</p></div></article>
    <article class="trail-stop stop-three"><div class="trail-art"><span class="art-orbit" aria-hidden="true"></span><img src="/koala/koala-heart.png" alt="Koda holding a green heart" width="507" height="560" loading="lazy"/></div><div class="trail-copy"><span class="step-label">Finally, share the difference</span><h3>Show what changed.</h3><p>Demo your working product, explain who it helps and share the feedback that shaped it. Be clear about what works and what you still want to improve.</p></div></article>
  </div>
  <section class="ideas-section" aria-labelledby="ideas-title"><div class="section-intro"><span class="section-label">A few seeds to plant</span><h3 id="ideas-title">Where could you start?</h3><p>Any technology. Any project format. These are examples, not limits.</p></div><ul class="idea-list">${ideas.map(([title,text],i)=>`<li><span class="idea-flower" aria-hidden="true">${['✿','✧','❋','✦','✿'][i]}</span><div><h4>${title}</h4><p>${text}</p></div></li>`).join('')}</ul></section>
  <section class="submission-section" aria-labelledby="submission-title"><img src="/koala/koala-branch.png" alt="Koda resting on a branch" width="530" height="560" loading="lazy"/><div><span class="section-label">Bring your build to the finish line</span><h3 id="submission-title">Ready by 8:00 PM.</h3><p>To be considered for the track award, submit:</p><ul><li>A working project</li><li>A short description</li><li>A public repository</li><li>A live demo or a 2–3 minute video</li></ul><p class="small-note">8:00 PM is the deadline stated in the challenge brief.</p></div></section>
  <section class="judging-section" aria-labelledby="judging-title"><div class="section-intro"><span class="section-label">100 points in total</span><h3 id="judging-title">Purpose gets the spotlight.</h3><p>Here’s what the judges are looking for.</p></div><div class="rubric">${rubric.map(([title,points,text])=>`<article><span class="points">${points}<small> points</small></span><div><h4>${title}</h4><p>${text}</p></div></article>`).join('')}</div></section>
  <a class="source-link" href="${source}" target="_blank" rel="noopener noreferrer">Read the full CWP challenge brief <span aria-hidden="true">↗</span></a>
</section>`;
