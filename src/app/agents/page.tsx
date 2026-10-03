import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For AI agents · CWP Hackathon",
  description:
    "An agent-readable guide to the CodeWithPurpose Build for Access track at Dublin Hacx.",
};

export default function AgentsPage() {
  return (
    <>
      <header className="site-header agents-header">
        <a className="brand" href="/" aria-label="CWP Hackathon home">
          <img src="/koala/koala-wave.png" alt="" width="45" height="48" />
          <span className="brand-name">
            CWP<span className="brand-event">Hackathon</span>
          </span>
        </a>
        <nav aria-label="Page navigation">
          <a href="/">Hackathon home</a>
          <a href="/llms.txt">Plain-text guide</a>
        </nav>
      </header>
      <main className="agents-page">
        <section className="agents-hero" aria-labelledby="agents-title">
          <div className="agent-mark" aria-hidden="true">
            <span>⌘</span>
            <i />
            <i />
            <i />
          </div>
          <div className="agents-copy">
            <span className="section-label">A field guide for tools that build</span>
            <h1 id="agents-title">For AI agents</h1>
            <p className="agents-lead">
              Help a team build something useful by starting with the people it
              serves and the barrier they face.
            </p>
            <p>
              This page gathers context for the optional CodeWithPurpose Build
              for Access track at Dublin Hacx. It links to the full 500-line
              guide, the challenge brief, and CodeWithPurpose&apos;s free coding
              education resources.
            </p>
            <div className="agents-links">
              <a className="agents-primary" href="/llms.txt">
                Read the full agent guide <span aria-hidden="true">↗</span>
              </a>
              <a
                href="https://docs.google.com/document/d/12snSClJj4a6A9Ql5gx8O9n5KKGzKjAsDLRg9irZUSIg/edit"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the original challenge brief <span aria-hidden="true">↗</span>
              </a>
              <a
                href="https://codewithpurpose.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore CodeWithPurpose.org <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>

        <section className="agents-context" aria-label="Track overview">
          <article>
            <span className="section-label">The track</span>
            <h2>Build for Access</h2>
            <p>
              Make a working product that helps people overcome a barrier to
              learning, creating, communicating, or participating. Choose a
              specific user and build the smallest useful solution the team can
              demonstrate.
            </p>
          </article>
          <article>
            <span className="section-label">The submission</span>
            <h2>Show what works</h2>
            <p>
              The track page lists a working project, a short description, a
              public repository, and a live demo or a two-to-three-minute video.
              The stated deadline is 8:00 PM; check the challenge brief for
              current event details.
            </p>
          </article>
          <article>
            <span className="section-label">The guide</span>
            <h2>Useful project context</h2>
            <p>
              The linked Markdown guide covers the track purpose, project ideas,
              accessibility, responsible AI use, a suggested workflow, the
              submission checklist, and the published judging rubric. Treat the
              brief and a team&apos;s direct instructions as the source of truth.
            </p>
          </article>
        </section>
      </main>
      <footer className="agents-footer">
        <img
          className="footer-koda"
          src="/koala/koala-sleep.png"
          alt="Koda having a well-earned nap"
          width="560"
          height="355"
        />
        <a href="/">Back to the hackathon</a>
        <a href="https://codewithpurpose.org">Free coding education</a>
      </footer>
    </>
  );
}
