"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GENRES, TONES, type Genre, type StudioPayload, type Tone } from "@/lib/types";

const EXAMPLE = {
  title: "The Reel Dated Tomorrow",
  brief: "A night-shift archivist in Lisbon finds a film reel that shows her apartment filmed the next morning. She has until dawn to decide whether to watch the ending.",
  genre: "Mystery" as Genre,
  tone: "Tense" as Tone,
  targetMinutes: 6,
};

interface LibraryCard {
  id: string;
  title: string;
  genre: string;
  tone: string;
  targetMinutes: number;
  updatedAt: string;
  stage: string;
}

export default function HomeView() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [genre, setGenre] = useState<Genre>("Drama");
  const [tone, setTone] = useState<Tone>("Grounded");
  const [targetMinutes, setTargetMinutes] = useState(6);
  const [projects, setProjects] = useState<LibraryCard[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => response.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setError("The shelf could not be opened."));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, brief, genre, tone, targetMinutes }),
      });
      const data = (await response.json()) as StudioPayload & { error?: string };
      if (!response.ok || !data.project) throw new Error(data.error || "The story could not be opened.");
      router.push(`/project/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The story could not be opened.");
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">Proscenium</a>
        <span className="top-links">
          <a href="/models">Models</a>
          <span className="meta">Human gate at every cut</span>
        </span>
      </header>
      <main id="main" className="hero">
        <p className="eyebrow">Picture studio</p>
        <h1>A brief does not become a movie until you pass it through.</h1>
        <p className="lede">
          The agent writes the full story, then the screenplay. You approve or correct both.
          Cast a family member with a face photograph and a signed consent letter, or ask for a fictional adult face that holds from every angle.
          The picture is cut into the longest reels the scenes will bear, and nothing is merged until you have approved every one.
        </p>
        <form className="panel" onSubmit={onSubmit}>
          <div className="grid-2">
            <div>
              <label>
                <span>Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
              </label>
              <label>
                <span>Brief</span>
                <textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  required
                  minLength={10}
                  maxLength={4000}
                  placeholder="A few sentences. The agent owes you a complete story from them."
                />
              </label>
            </div>
            <div>
              <label>
                <span>Genre</span>
                <select value={genre} onChange={(event) => setGenre(event.target.value as Genre)}>
                  {GENRES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Tone</span>
                <select value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                  {TONES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Aim, in minutes ({targetMinutes})</span>
                <input
                  type="number"
                  min={3}
                  max={15}
                  value={targetMinutes}
                  onChange={(event) => setTargetMinutes(Number(event.target.value))}
                />
              </label>
              <div className="actions">
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Writing the story…" : "Open a production"}
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setTitle(EXAMPLE.title);
                    setBrief(EXAMPLE.brief);
                    setGenre(EXAMPLE.genre);
                    setTone(EXAMPLE.tone);
                    setTargetMinutes(EXAMPLE.targetMinutes);
                  }}
                >
                  Use an example
                </button>
              </div>
            </div>
          </div>
          {error ? <p className="banner bad">{error}</p> : null}
        </form>
      </main>
      <section className="library">
        <h2>On the shelf</h2>
        {projects.length === 0 ? <p className="note">No productions yet.</p> : (
          <div className="cards">
            {projects.map((project) => (
              <a className="card" key={project.id} href={`/project/${project.id}`}>
                <strong>{project.title}</strong>
                <span className="meta">{project.stage} · {project.genre} · {project.targetMinutes} min</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
