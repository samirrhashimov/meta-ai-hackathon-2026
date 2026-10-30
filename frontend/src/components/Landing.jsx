import {
  LuArrowRight,
  LuChartColumn,
  LuFolderCheck,
  LuMessagesSquare,
  LuPlay,
  LuSparkles,
  LuWaypoints,
} from "react-icons/lu";
import { currentAccent } from "../accent";
import logo from "../assets/flama_icon_dark.png";

// Public landing page: animated hero, feature grid, promo-video slot,
// three showcase blocks with illustration slots, and a closing CTA.
// Illustration/video files are dropped in later — every slot is labeled
// with the copy it belongs to.
export default function Landing() {
  const acc = currentAccent();
  return (
    <div className="land-root">
      <div className="land-orb land-orb-a" />
      <div className="land-orb land-orb-b" />

      <header className="land-nav land-rise">
        <a href="#/" className="land-brand">
          <img src={logo} alt="Flama" />
        </a>
        <nav className="land-links">
          <a href="#features">Features</a>
          <a href="#showcase">Showcase</a>
          <a href="#video">Video</a>
        </nav>
        <div className="land-nav-actions">
          <a href="#/login" className="land-btn land-btn-ghost">
            Log in
          </a>
          <a href="#/register" className={`land-btn land-btn-primary ${acc.solid}`}>
            Get started
            <LuArrowRight size={15} />
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="land-hero">
          <p className="land-badge land-rise" style={{ "--land-d": "40ms" }}>
            <LuSparkles size={13} />
            AI-native notes, Obsidian-style
          </p>
          <h1 className="land-title land-rise" style={{ "--land-d": "120ms" }}>
            Notes that <span className={acc.text}>file themselves</span>
          </h1>
          <p className="land-sub land-rise" style={{ "--land-d": "200ms" }}>
            Flama is a personal notebook where you just write. The AI files
            every note into the right folder, chats with your library, and
            turns it all into a living visual dashboard.
          </p>
          <div className="land-cta land-rise" style={{ "--land-d": "280ms" }}>
            <a href="#/register" className={`land-btn land-btn-primary land-btn-lg ${acc.solid}`}>
              Start writing free
              <LuArrowRight size={16} />
            </a>
            <a href="#video" className="land-btn land-btn-ghost land-btn-lg">
              <LuPlay size={15} />
              Watch the tour
            </a>
          </div>

          {/* Animated app preview (pure CSS, no screenshots needed). */}
          <div className="land-mock land-rise" style={{ "--land-d": "360ms" }} aria-hidden="true">
            <div className="land-mock-bar">
              <span className="land-dot" />
              <span className="land-dot" />
              <span className="land-dot" />
              <span className="land-mock-url">flama — my notes</span>
            </div>
            <div className="land-mock-body">
              <div className="land-mock-side">
                <span className="land-mock-row land-w60" />
                <span className="land-mock-row land-w80 land-indent" />
                <span className="land-mock-row land-w70 land-indent" />
                <span className="land-mock-row land-w50" />
                <span className="land-mock-row land-w75 land-indent" />
              </div>
              <div className="land-mock-main">
                <span className="land-mock-h" />
                <span className="land-type">
                  <span className="land-type-text">The AI filed this into Sports…</span>
                  <span className="land-caret" />
                </span>
                <div className="land-mock-bars">
                  <span style={{ "--w": "82%" }} />
                  <span style={{ "--w": "64%" }} />
                  <span style={{ "--w": "74%" }} />
                  <span style={{ "--w": "48%" }} />
                </div>
              </div>
              <div className="land-mock-chat">
                <span className="land-mock-bubble land-w90" />
                <span className="land-mock-bubble land-w70" />
                <span className="land-mock-bubble land-accent land-w80" />
                <span className="land-mock-bubble land-w60" />
              </div>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section id="features" className="land-section">
          <h2 className="land-h2">Everything a notebook should do</h2>
          <p className="land-section-sub">
            Folders, markdown, drawings, attachments — plus an assistant that
            actually touches your notes.
          </p>
          <div className="land-grid">
            <Feature
              icon={<LuFolderCheck size={19} />}
              title="Auto-filing folders"
              text="Save a note and it lands in the right folder. A matching one opens by itself — Sports, Recipes, Thesis, anything."
            />
            <Feature
              icon={<LuMessagesSquare size={19} />}
              title="Assistant that acts"
              text="Chat in plain words: find, move, tag, or reorganize. It reads attachments and undoes its own steps."
            />
            <Feature
              icon={<LuChartColumn size={19} />}
              title="Visualise dashboard"
              text="Your notes become charts, goals, timelines and a momentum score — rebuilt by AI, with generated cover art."
            />
            <Feature
              icon={<LuWaypoints size={19} />}
              title="Knowledge graph"
              text="Wikilinks, shared tags and AI-suggested connections, drawn as an explorable map of your thinking."
            />
          </div>
        </section>

        {/* Showcase with illustration slots */}
        <section id="showcase" className="land-section">
          <h2 className="land-h2">See it in action</h2>
          <p className="land-section-sub">
            Real screens, illustrated step by step. (Artwork slots waiting
            below — drop the finals in and they appear here.)
          </p>
          <Showcase
            flip={false}
            kicker="Auto-filing"
            title="Write first, organize never"
            text="Type a gym log, a recipe, a meeting note. The moment you save, Flama reads it, picks or creates the right folder, and adds tags — with an Undo toast in case it guessed wrong."
            slotLabel="Illustration 1 — a note flying into a folder (1200 × 800)"
          />
          <Showcase
            flip
            kicker="Assistant"
            title="Talk to your library"
            text="“Move my gym note into Sports and summarize my week.” The chat understands folders, mentions notes with @, takes dropped files, and every destructive step is reversible."
            slotLabel="Illustration 2 — chat bubbles acting on notes (1200 × 800)"
          />
          <Showcase
            flip={false}
            kicker="Visualise"
            title="A dashboard of your mind"
            text="Streaks, heatmaps, goals, timelines — generated from what you actually wrote, with AI cover art on top. Rebuild it any time your notes change."
            slotLabel="Illustration 3 — dashboard with charts (1200 × 800)"
          />
        </section>

        {/* Promo video slot */}
        <section id="video" className="land-section">
          <h2 className="land-h2">Watch the tour</h2>
          <p className="land-section-sub">
            Ninety seconds from first note to visual dashboard.
          </p>
          {/* VIDEO SLOT: replace this div with the <video> or embed element.
              Recommended: 16:9, 1080p, muted autoplay loop. */}
          <div className="land-video-slot" role="img" aria-label="Promo video placeholder">
            <span className="land-video-play">
              <LuPlay size={26} />
            </span>
            <p>Promo video goes here</p>
            <small>16:9 · replace this block with the final cut</small>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="land-section land-cta-block">
          <h2 className="land-h2">Your second brain, minus the filing cabinet</h2>
          <p className="land-section-sub">
            Free for the hackathon. Bring your notes — Flama brings the order.
          </p>
          <a href="#/register" className={`land-btn land-btn-primary land-btn-lg ${acc.solid}`}>
            Create your account
            <LuArrowRight size={16} />
          </a>
        </section>
      </main>

      <footer className="land-footer">
        <span>Flama — AI-native notes</span>
        <span className="land-footer-dim">Hackathon build · your notes stay yours</span>
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }) {
  const acc = currentAccent();
  return (
    <div className="glass land-card">
      <span className={`land-card-icon ${acc.softBgStrong} ${acc.softText}`}>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

// Text + illustration placeholder, alternating sides.
// ILLUSTRATION SLOT: swap IllustrationSlot for the final <img>.
function Showcase({ flip, kicker, title, text, slotLabel }) {
  const acc = currentAccent();
  return (
    <div className={`land-showcase${flip ? " land-flip" : ""}`}>
      <div className="land-showcase-text">
        <p className={`land-kicker ${acc.text}`}>{kicker}</p>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <IllustrationSlot label={slotLabel} />
    </div>
  );
}

function IllustrationSlot({ label }) {
  return (
    <div className="land-illus-slot" role="img" aria-label={label}>
      <span className="land-illus-frame">
        <LuSparkles size={20} />
      </span>
      <p>{label}</p>
      <small>Drop the final artwork here</small>
    </div>
  );
}
