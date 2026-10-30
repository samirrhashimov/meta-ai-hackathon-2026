import { useEffect, useState } from "react";
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

// One typing demo after another: title, tab, tag and toast always match.
const MOCK_SCENARIOS = [
  { short: "gym log", title: "Gym log, legs day", folder: "Sports", tag: "sports" },
  { short: "thesis", title: "Thesis draft v2", folder: "Thesis", tag: "research" },
  { short: "recipe", title: "Carbonara recipe", folder: "Recipes", tag: "food" },
  { short: "japan trip", title: "Japan trip plan", folder: "Travel", tag: "travel" },
  { short: "meeting", title: "Q4 meeting notes", folder: "Work", tag: "work" },
  { short: "dune review", title: "Dune book review", folder: "Books", tag: "books" },
  { short: "ideas", title: "Startup ideas", folder: "Ideas", tag: "ideas" },
];

// Public landing page: animated hero, feature grid, promo-video slot,
// three showcase blocks with illustration slots, and a closing CTA.
// Illustration/video files are dropped in later. Every slot is labeled
// with the copy it belongs to.
export default function Landing() {
  // Typewriter for the mock editor: types the scenario title char by char
  // (so the caret always sits exactly at the text end), holds, then jumps
  // to a different random scenario.
  const [sci, setSci] = useState(0);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const full = MOCK_SCENARIOS[sci].title;
    if (typed.length < full.length) {
      if (reduced) {
        setTyped(full);
        return;
      }
      const t = setTimeout(() => setTyped(full.slice(0, typed.length + 1)), 70);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTyped("");
      setSci((i) => (i + 1 + Math.floor(Math.random() * (MOCK_SCENARIOS.length - 1))) % MOCK_SCENARIOS.length);
    }, reduced ? 6000 : 3600);
    return () => clearTimeout(t);
  }, [typed, sci]);
  const scenario = MOCK_SCENARIOS[sci];
  const done = typed.length === scenario.title.length && typed.length > 0;
  // The sidebar keeps the last filed result while the next note is typing,
  // so scenario switches never flash an empty panel.
  const [filedSci, setFiledSci] = useState(null);
  useEffect(() => {
    if (done) setFiledSci(sci);
  }, [done, sci]);
  const filed = filedSci === null ? null : MOCK_SCENARIOS[filedSci];
  // The inactive tab previews the next scenario, like a real tab strip.
  const nextScenario = MOCK_SCENARIOS[(sci + 1) % MOCK_SCENARIOS.length];
  // Static folders never duplicate the scenario target: the AI either files
  // into an existing folder or creates a fresh one right here.
  const otherFolders = [];
  for (let k = 1; k < MOCK_SCENARIOS.length && otherFolders.length < 2; k++) {
    const f = MOCK_SCENARIOS[(sci + k) % MOCK_SCENARIOS.length].folder;
    if (f !== scenario.folder && !otherFolders.includes(f)) otherFolders.push(f);
  }
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
          <h1 className="land-title land-rise" style={{ "--land-d": "120ms" }}>
            Notes and files that <span className={acc.text}>file themselves</span>
          </h1>
          <p className="land-sub land-rise" style={{ "--land-d": "200ms" }}>
            Flama is a personal notebook for everything you keep. Write
            notes, drop in PDFs, images and files. The AI files every note
            and file into the right folder, chats with your library, and
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

          {/* Animated mini-Flama: navbar tabs, Files tree and note editor. */}
          <div className="land-mock land-rise" style={{ "--land-d": "360ms" }} aria-hidden="true">
            <div className="land-mock-bar">
              <span className="land-dot" />
              <span className="land-dot" />
              <span className="land-dot" />
              <span className="land-mock-tabs">
                <span className="land-mock-tab land-on" key={sci}>
                  {scenario.short}
                </span>
                <span className="land-mock-tab">{nextScenario.short}</span>
              </span>
            </div>
            <div className="land-mock-body">
              <div className="land-mock-side">
                <span className="land-mock-pane">Files</span>
                {filed && (
                  <>
                    <span
                      key={filedSci}
                      className="land-mock-folder land-target land-created"
                    >
                      <span>{filed.folder}</span>
                    </span>
                    <span className="land-mock-note land-filed" key={`n-${filedSci}`}>
                      <span>{filed.short}</span>
                    </span>
                  </>
                )}

                {otherFolders.map((f, i) => (
                  <span className="land-mock-folder land-dim" key={f} title={f}>
                    <span className={i % 2 ? "land-w50" : "land-w70"} />
                  </span>
                ))}
              </div>
              <div className="land-mock-main">
                <span className="land-mock-pane">Note</span>
                <span className="land-type land-mock-title">
                  <span className="land-type-text">{typed}</span>
                  <span className="land-caret" />
                </span>
                <span className="land-mock-row land-w90" />
                <span className="land-mock-check">
                  <span className="land-mock-box" />
                  <span className="land-w70" />
                </span>
                <span className="land-mock-row land-w80" />
                <span className="land-mock-tag">#{scenario.tag}</span>
              </div>
            </div>
            {done && (
              <div className="land-mock-toast" key={`t-${sci}`}>
                <div className="land-mock-toast-pill">
                  <span className="land-mock-toast-dot" />
                  Filed into {scenario.folder}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Feature grid */}
        <section id="features" className="land-section">
          <h2 className="land-h2">It files. You think.</h2>
          <p className="land-section-sub">
            Four reasons Flama beats a plain folder of notes.
          </p>
          <div className="land-grid">
            <Feature
              icon={<LuFolderCheck size={19} />}
              title="Zero filing"
              text="Save and done. Notes and files land where they belong."
            />
            <Feature
              icon={<LuMessagesSquare size={19} />}
              title="Ask anything"
              text="Find, move, tag, undo. Just say it."
            />
            <Feature
              icon={<LuChartColumn size={19} />}
              title="See your mind"
              text="Streaks, goals and heatmaps from your own words."
            />
            <Feature
              icon={<LuWaypoints size={19} />}
              title="Connected dots"
              text="Wikilinks and AI links draw your big picture."
            />
          </div>
        </section>

        {/* Showcase with illustration slots */}
        <section id="showcase" className="land-section">
          <h2 className="land-h2">See it in action</h2>
          <p className="land-section-sub">
            Real screens, illustrated step by step. (Artwork slots waiting
            below. Drop the finals in and they appear here.)
          </p>
          <Showcase
            flip={false}
            kicker="Automatic filing"
            title="Write first, organize never"
            text="Type a gym log, a recipe, a meeting note, or drop in a PDF or an image. The moment you save, Flama reads it, picks or creates the right folder, and adds tags, with an Undo toast in case it guessed wrong."
            slotLabel="Illustration 1: a note flying into a folder (1200x800)"
          />
          <Showcase
            flip
            kicker="Assistant"
            title="Talk to your library"
            text="“Move my gym note into Sports and summarize my week.” The chat understands folders, mentions notes with @, takes dropped files, and every destructive step is reversible."
            slotLabel="Illustration 2: chat bubbles acting on notes (1200x800)"
          />
          <Showcase
            flip={false}
            kicker="Visualise"
            title="A dashboard of your mind"
            text="Streaks, heatmaps, goals, timelines, generated from what you actually wrote, with AI cover art on top. Rebuild it any time your notes change."
            slotLabel="Illustration 3: dashboard with charts (1200x800)"
          />
        </section>

        {/* Promo video slot */}
        <section id="video" className="land-section">
          <h2 className="land-h2">Watch the tour</h2>
          <p className="land-section-sub">
            Ninety seconds from first note or file to visual dashboard.
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
            Free for the hackathon. Bring your notes and files. Flama brings the order.
          </p>
          <a href="#/register" className={`land-btn land-btn-primary land-btn-lg ${acc.solid}`}>
            Create your account
            <LuArrowRight size={16} />
          </a>
        </section>
      </main>

      <footer className="land-footer">
        <span>Flama, your AI notebook</span>
        <span className="land-footer-dim">Hackathon build · your notes and files stay yours</span>
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
