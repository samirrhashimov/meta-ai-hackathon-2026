import { useEffect, useState } from "react";
import {
  LuArrowRight,
  LuChartColumn,
  LuFolderCheck,
  LuMessagesSquare,
  LuPlay,
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
            Flama is your notebook for everything you keep. Write a note or
            drop in a PDF, an image or any file. Each one lands in the right
            folder on its own. Chat with your library, then watch it become a
            living picture of your mind.
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
              text="Hit save. Forget folders. Done."
            />
            <Feature
              icon={<LuMessagesSquare size={19} />}
              title="Ask anything"
              text="Find it. Move it. Tag it. Just say it."
            />
            <Feature
              icon={<LuChartColumn size={19} />}
              title="See your mind"
              text="Streaks, goals and heatmaps grown from your words."
            />
            <Feature
              icon={<LuWaypoints size={19} />}
              title="Connected dots"
              text="Every note you write joins the bigger picture."
            />
          </div>
        </section>

        {/* Showcase with Undraw illustrations (frontend/public/1.svg, 2.svg, 3.svg). */}
        <section id="showcase" className="land-section">
          <h2 className="land-h2">A notebook that thinks ahead.</h2>
          <p className="land-section-sub">
            You write. Flama files, links and visualizes.
          </p>
          <Showcase
            flip={false}
            kicker="Automatic filing"
            title="Write first, organize never"
            text="Type a gym log, a recipe or a meeting note. Drop in a PDF or an image instead. The second you save, Flama reads it, finds the right folder or builds a new one, and tags it for you. Guessed wrong? One tap undoes it."
            visual={<FilingDemo />}
          />
          <Showcase
            flip
            kicker="Assistant"
            title="Talk to your library"
            text="Ask in your own words. Move my gym note into Sports, then sum up my week. The assistant knows your folders, tags any note with @, reads the files you drop in, and can undo anything it does."
            visual={<ChatDemo />}
          />
          <Showcase
            flip={false}
            kicker="Visualise"
            title="A dashboard of your mind"
            text="Streaks, heatmaps, goals and timelines, all built from what you truly wrote, under art the AI paints for you. Your notes change. Your dashboard follows. One click rebuilds it all."
            visual={<DashDemo />}
          />
        </section>

        {/* Promo video slot */}
        <section id="video" className="land-section">
          <h2 className="land-h2">See what Flama does</h2>
          {/* VIDEO SLOT: replace this div with the <video> or embed element.
              Recommended: 16:9, 1080p, muted autoplay loop. */}
          <div className="land-video-slot" role="img" aria-label="Promo video placeholder">
            <span className="land-video-play">
              <LuPlay size={26} />
            </span>
            <p>Drop the promo video here</p>
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

// Text + live demo, alternating sides. Each demo below actually runs:
// filing, chatting and dashboard numbers, all looping with pure CSS.
function Showcase({ flip, kicker, title, text, visual }) {
  const acc = currentAccent();
  return (
    <div className={`land-showcase${flip ? " land-flip" : ""}`}>
      <div className="land-showcase-text">
        <p className={`land-kicker ${acc.text}`}>{kicker}</p>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {visual}
    </div>
  );
}

// A note flies sideways into its folder, on loop.
function FilingDemo() {
  return (
    <div className="land-demo land-filefly" aria-hidden="true">
      <span className="land-demo-label">Inbox</span>
      <div className="land-filefly-row">
        <span className="land-filefly-stack">
          <i />
          <i />
          <i />
        </span>
        <span className="land-filefly-folder">
          Sports
          <span className="land-filefly-check" />
        </span>
      </div>
      <span className="land-filefly-note">gym log</span>
    </div>
  );
}

// A chat turn plays itself: ask, typing, done.
function ChatDemo() {
  return (
    <div className="land-demo land-chatdem" aria-hidden="true">
      <span className="land-chat-u">Move my gym note into Sports</span>
      <span className="land-chat-typing">
        <i />
        <i />
        <i />
      </span>
      <span className="land-chat-a">Done. Filed into Sports</span>
    </div>
  );
}

// A sparkline draws itself, stats below, on loop.
function DashDemo() {
  return (
    <div className="land-demo land-sparkdem" aria-hidden="true">
      <span className="land-demo-label">Visualise</span>
      <svg className="land-spark-svg" viewBox="0 0 200 84">
        <polygon
          points="5,70 35,58 65,62 95,38 125,44 155,22 185,28 185,84 5,84"
          className="land-spark-area"
        />
        <path
          d="M5,70 L35,58 L65,62 L95,38 L125,44 L155,22 L185,28"
          pathLength="100"
          className="land-spark-line"
        />
        <circle cx="185" cy="28" r="4.5" className="land-spark-dot" />
      </svg>
      <div className="land-spark-stats">
        <span>
          <b>12</b> day streak
        </span>
        <span>
          <b>48k</b> words
        </span>
      </div>
    </div>
  );
}
