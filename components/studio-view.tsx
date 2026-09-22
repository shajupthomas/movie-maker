"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration, shortHash } from "@/lib/format";
import { parseScreenplay } from "@/lib/screenplay";
import { titleCaseName } from "@/lib/text";
import type { Project, StudioPayload, VideoPart } from "@/lib/types";

const REEL_LABEL: Record<VideoPart["status"], string> = {
  planned: "Not rendered",
  rendering: "Rendering",
  ready: "Ready for review",
  approved: "Approved",
  changes_requested: "Changes requested",
  failed: "Failed",
};

export default function StudioView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<StudioPayload | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState("");
  const [storyText, setStoryText] = useState("");
  const [storyNotes, setStoryNotes] = useState("");
  const [brief, setBrief] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scriptNotes, setScriptNotes] = useState("");
  const [editingStory, setEditingStory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adult, setAdult] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [reelNotes, setReelNotes] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch(`/api/projects/${projectId}`);
    const data = await response.json();
    if (response.status === 404) {
      setMissing(true);
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not open the production.");
    adopt(data as StudioPayload);
  }

  function adopt(data: StudioPayload) {
    setPayload(data);
    setStoryText(data.project.story?.text ?? "");
    setBrief(data.project.brief);
    setScriptText(data.project.script?.text ?? "");
    setAdult(data.project.adultCastAttested);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not open the production."));
    // The production id is the only load key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const current = payload?.steps.find((step) => step.phase === "current");
    if (!current) return;
    document.getElementById(current.id)?.scrollIntoView({ block: "start" });
  }, [payload?.project.id]);

  async function run(label: string, path: string, init?: RequestInit) {
    setBusy(label);
    setError("");
    try {
      const response = await fetch(path, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The studio could not do that.");
      adopt(data as StudioPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The studio could not do that.");
      try { await load(); } catch { /* keep the banner */ }
    } finally {
      setBusy("");
    }
  }

  if (missing) {
    return (
      <main id="main" className="hero">
        <h1>This production is not on the shelf.</h1>
        <a className="button" href="/">Back to the studio</a>
      </main>
    );
  }
  if (!payload) {
    return <main id="main" className="hero"><p className="note">{error || "Opening the production…"}</p></main>;
  }

  const { project, steps, characters, blockers, assembleReady } = payload;
  const locked = (id: string) => steps.find((step) => step.id === id)?.phase === "locked";

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">Proscenium</a>
        <span className="meta">{project.genre} · {project.tone} · aim {project.targetMinutes}:00</span>
      </header>
      <div className="studio">
        <nav className="rail" aria-label="Production gates">
          <ol>
            {steps.map((step, index) => (
              <li key={step.id}>
                <a href={`#${step.id}`} data-phase={step.phase}>
                  <span className="index">0{index + 1}</span>
                  <span>
                    {step.label}
                    <small>{step.hint}</small>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <main id="main" className="studio-main">
          <p className="eyebrow">{project.title}</p>
          <h1>{project.title}</h1>
          {error ? <p className="banner bad" role="alert">{error}</p> : null}
          {busy ? <p className="banner" role="status">{busy}</p> : null}

          <section className="section" id="brief">
            <div className="section-head">
              <div>
                <p className="pill">Brief</p>
                <h2>The seed</h2>
                <p>This is the whole story you brought in. The agent is not allowed to throw it away.</p>
              </div>
            </div>
            <fieldset className="plain" disabled={Boolean(busy) || Boolean(project.story?.approved)}>
              <label>
                <span>Brief</span>
                <textarea value={brief} onChange={(event) => setBrief(event.target.value)} />
              </label>
              <div className="actions">
                <button
                  className="ghost"
                  type="button"
                  onClick={() => run("Rewriting from the brief…", `/api/projects/${project.id}/story`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "rebrief", brief }),
                  })}
                >
                  Rewrite the story from this brief
                </button>
              </div>
            </fieldset>
            {project.story?.approved ? <p className="note">The brief is locked while the story is approved. Reopen the story to change it.</p> : null}
            <div className="actions">
              {confirmDelete ? (
                <button className="danger" type="button" onClick={async () => {
                  await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
                  router.push("/");
                }}>Confirm delete</button>
              ) : (
                <button className="danger" type="button" onClick={() => setConfirmDelete(true)}>Delete production</button>
              )}
            </div>
          </section>

          <StorySection
            project={project}
            storyText={storyText}
            setStoryText={setStoryText}
            notes={storyNotes}
            setNotes={setStoryNotes}
            editing={editingStory}
            setEditing={setEditingStory}
            busy={busy}
            run={run}
          />

          <ScriptSection
            project={project}
            locked={locked("script")}
            scriptText={scriptText}
            setScriptText={setScriptText}
            notes={scriptNotes}
            setNotes={setScriptNotes}
            busy={busy}
            run={run}
          />

          <CastSection
            project={project}
            characters={characters}
            blockers={blockers}
            locked={locked("cast")}
            adult={adult}
            setAdult={setAdult}
            busy={busy}
            run={run}
          />

          <ReelsSection
            project={project}
            locked={locked("reels")}
            busy={busy}
            notes={reelNotes}
            setNotes={setReelNotes}
            run={run}
          />

          <PictureSection
            project={project}
            characters={characters}
            locked={locked("picture")}
            assembleReady={assembleReady}
            confirmMerge={confirmMerge}
            setConfirmMerge={setConfirmMerge}
            busy={busy}
            run={run}
          />
        </main>
      </div>
    </>
  );
}

function StorySection({
  project, storyText, setStoryText, notes, setNotes, editing, setEditing, busy, run,
}: {
  project: Project;
  storyText: string;
  setStoryText: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
  busy: string;
  run: (label: string, path: string, init?: RequestInit) => Promise<void>;
}) {
  const story = project.story;
  const post = (action: string, extra: Record<string, string> = {}) => run(
    action === "approve" ? "Writing the script from the approved story…" : "The agent is rewriting…",
    `/api/projects/${project.id}/story`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text: storyText, notes, ...extra }),
    },
  );
  return (
    <section className="section" id="story">
      <div className="section-head">
        <div>
          <p className="pill">Story · draft {story?.version ?? 1}</p>
          <h2>Complete story</h2>
          <p>Read it as a movie, not a premise. Approve it only when the whole arc is the one you want shot.</p>
        </div>
      </div>
      {editing && !story?.approved ? (
        <textarea className="script-box" value={storyText} onChange={(event) => setStoryText(event.target.value)} />
      ) : (
        <Manuscript text={storyText} />
      )}
      <Trace entries={story?.trace} />
      <div className="actions">
        {story?.approved ? (
          <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => run("Reopening the story…", `/api/projects/${project.id}/story`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reopen" }),
          })}>Reopen the story</button>
        ) : (
          <>
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => setEditing(!editing)}>
              {editing ? "Preview the manuscript" : "Edit the draft"}
            </button>
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => post("save")}>Save edits</button>
            <button className="primary" type="button" disabled={Boolean(busy)} onClick={() => post("approve")}>Approve the story</button>
          </>
        )}
      </div>
      {!story?.approved ? (
        <label>
          <span>Note for the agent</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should change in the next draft?" />
          <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => post("revise")}>Ask for a new draft</button>
        </label>
      ) : <p className="note">Reopening clears the script, the reels, and any finished picture.</p>}
    </section>
  );
}

function ScriptSection({
  project, locked, scriptText, setScriptText, notes, setNotes, busy, run,
}: {
  project: Project;
  locked: boolean;
  scriptText: string;
  setScriptText: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  busy: string;
  run: (label: string, path: string, init?: RequestInit) => Promise<void>;
}) {
  const preview = useMemo(() => scriptText.trim() ? parseScreenplay(scriptText) : [], [scriptText]);
  const total = preview.reduce((sum, scene) => sum + scene.durationSec, 0);
  const post = (action: string) => run(
    action === "approve" ? "Locking the script and planning reels…" : "Rewriting the script…",
    `/api/projects/${project.id}/script`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text: scriptText, notes }),
    },
  );
  return (
    <section className="section" id="script">
      <div className="section-head">
        <div>
          <p className="pill">Script {project.script ? `· draft ${project.script.version}` : ""}</p>
          <h2>Screenplay</h2>
          <p>
            Correct any line before you approve. Scene headings start with INT. or EXT.
            Character names sit alone in capitals, with the line underneath.
            Estimated running time from this draft: {formatDuration(total)}.
          </p>
        </div>
      </div>
      {locked ? <p className="banner">Approve the story before the script can be written.</p> : null}
      <fieldset className="plain" disabled={locked || Boolean(busy) || Boolean(project.script?.approved)}>
        <div className="split">
          <textarea className="script-box" value={scriptText} onChange={(event) => setScriptText(event.target.value)} />
          <div className="scene-list">
            {preview.map((scene) => (
              <article className="scene-row" key={scene.id}>
                <strong>{scene.heading}</strong>
                <div className="meta">{formatDuration(scene.durationSec)} · {scene.dialogue.length} lines</div>
                <p>{scene.dialogue.slice(0, 2).map((line) => `${titleCaseName(line.character)}: ${line.line}`).join(" ")}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="ghost" type="button" onClick={() => post("save")}>Save corrections</button>
          <button className="primary" type="button" onClick={() => post("approve")}>Approve the script</button>
        </div>
        <label>
          <span>Note for a rewrite</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional. The agent keeps your approved story and writes the note into the script." />
          <button className="ghost" type="button" onClick={() => post("revise")}>Rewrite the script</button>
        </label>
      </fieldset>
      {project.script?.approved ? (
        <div className="actions">
          <p className="note">The script is approved. Reopening it clears every reel and the finished picture.</p>
          <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => run("Reopening the script…", `/api/projects/${project.id}/script`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reopen" }),
          })}>Reopen the script</button>
        </div>
      ) : null}
      <Trace entries={project.script?.trace} />
    </section>
  );
}

function CastSection({
  project, characters, blockers, locked, adult, setAdult, busy, run,
}: {
  project: Project;
  characters: string[];
  blockers: string[];
  locked: boolean;
  adult: boolean;
  setAdult: (value: boolean) => void;
  busy: string;
  run: (label: string, path: string, init?: RequestInit) => Promise<void>;
}) {
  return (
    <section className="section" id="cast">
      <div className="section-head">
        <div>
          <p className="pill">Cast and consent</p>
          <h2>Faces with signatures</h2>
          <p>
            Every speaking part needs the actor’s face photograph and a consent letter that actor has signed.
            Proscenium records the file and your attestation. It does not pretend to notarize ink.
            Photographs of anyone under 18 are not accepted.
          </p>
        </div>
        <a className="button" href={`/api/projects/${project.id}/consent-template`}>Download consent letters</a>
      </div>
      {locked ? <p className="banner">Approve the script before anyone is cast.</p> : null}
      <fieldset className="plain" disabled={locked || Boolean(busy)}>
        <label className="check">
          <input
            type="checkbox"
            checked={adult}
            onChange={(event) => {
              const value = event.target.checked;
              setAdult(value);
              void run("Saving the cast attestation…", `/api/projects/${project.id}/cast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adultCastAttested: value }),
              });
            }}
          />
          <span>I confirm every actor who will be photographed for this production is 18 or older.</span>
        </label>
        {blockers.length ? (
          <ul>{blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        ) : <p className="note">Consent is on file for every speaking part.</p>}
        <div className="cast-grid">
          {characters.map((name) => (
            <CastCard key={name} project={project} name={name} run={run} />
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function CastCard({
  project, name, run,
}: {
  project: Project;
  name: string;
  run: (label: string, path: string, init?: RequestInit) => Promise<void>;
}) {
  const member = project.cast.find((item) => item.characterName === name);
  const [actor, setActor] = useState(member?.actorLegalName ?? "");
  const [date, setDate] = useState(member?.consentDate ?? new Date().toISOString().slice(0, 10));
  const [attested, setAttested] = useState(member?.attested ?? false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState<File | null>(null);

  useEffect(() => {
    setActor(member?.actorLegalName ?? "");
    setDate(member?.consentDate ?? new Date().toISOString().slice(0, 10));
    setAttested(Boolean(member?.attested));
  }, [member?.uploadedAt, member?.actorLegalName, member?.consentDate, member?.attested]);

  return (
    <form
      className="cast-card"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData();
        body.set("characterName", name);
        body.set("actorLegalName", actor);
        body.set("consentDate", date);
        body.set("attested", attested ? "true" : "false");
        if (photo) body.set("photo", photo);
        if (consent) body.set("consent", consent);
        void run(`Filing consent for ${titleCaseName(name)}…`, `/api/projects/${project.id}/cast`, {
          method: "POST",
          body,
        });
      }}
    >
      <div>
        {member?.photoFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="portrait" alt="" src={fileUrl(project.id, member.photoFile)} />
        ) : <div className="portrait empty">No portrait</div>}
      </div>
      <div>
        <h3>{titleCaseName(name)}</h3>
        <label>
          <span>Actor legal name</span>
          <input type="text" value={actor} onChange={(event) => setActor(event.target.value)} required />
        </label>
        <label>
          <span>Date on the letter</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label>
          <span>Face photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
        </label>
        <label>
          <span>Signed consent letter</span>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(event) => setConsent(event.target.files?.[0] ?? null)} />
        </label>
        {member?.consentSha256 ? <p className="meta">Letter on file · {member.consentOriginalName} · {shortHash(member.consentSha256)}</p> : null}
        <label className="check">
          <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
          <span>This letter was signed by the actor named above, who is 18 or older, and it authorizes this movie to use their likeness.</span>
        </label>
        <div className="actions">
          <button className="primary" type="submit">Save casting</button>
          {member ? (
            <button
              className="danger"
              type="button"
              onClick={() => run("Removing cast…", `/api/projects/${project.id}/cast?member=${member.id}`, { method: "DELETE" })}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function ReelsSection({
  project, locked, busy, notes, setNotes, run,
}: {
  project: Project;
  locked: boolean;
  busy: string;
  notes: Record<string, string>;
  setNotes: (value: Record<string, string>) => void;
  run: (label: string, path: string, init?: RequestInit) => Promise<void>;
}) {
  const total = project.parts.reduce((sum, part) => sum + part.durationSec, 0);
  return (
    <section className="section" id="reels">
      <div className="section-head">
        <div>
          <p className="pill">Reels · {formatDuration(total)}</p>
          <h2>Scene reels</h2>
          <p>
            Scenes stay whole. They are packed into reels of up to three minutes, which is as long as a reviewable part gets.
            Each speaking line is carried by that actor’s consented portrait. A reel is not in the movie until you approve it.
          </p>
        </div>
      </div>
      {locked ? <p className="banner">Finish cast and consent before any reel can be rendered.</p> : null}
      <fieldset className="plain" disabled={locked || Boolean(busy)}>
        {project.parts.map((part) => (
          <article className="reel" key={part.id}>
            <div className="section-head">
              <h3>Reel {part.index}</h3>
              <span className="meta">{REEL_LABEL[part.status]} · scenes {part.sceneNumbers.join(", ")} · {formatDuration(part.durationSec)}</span>
            </div>
            {part.videoFile && (part.status === "ready" || part.status === "approved" || part.status === "changes_requested") ? (
              <video controls src={fileUrl(project.id, part.videoFile)} />
            ) : null}
            {part.error ? <p className="banner bad">{part.error}</p> : null}
            {part.notes ? <p className="note">Note on this reel: {part.notes}</p> : null}
            <div className="actions">
              <button
                className="primary"
                type="button"
                onClick={() => run(`Rendering reel ${part.index}…`, `/api/projects/${project.id}/reels`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "render", partId: part.id }),
                })}
              >
                {part.videoFile ? "Render again" : "Render reel"}
              </button>
              <button
                className="ghost"
                type="button"
                disabled={part.status !== "ready" && part.status !== "approved"}
                onClick={() => run(`Approving reel ${part.index}…`, `/api/projects/${project.id}/reels`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "approve", partId: part.id }),
                })}
              >
                Approve reel
              </button>
            </div>
            <label>
              <span>Changes for this reel</span>
              <textarea
                value={notes[part.id] ?? ""}
                onChange={(event) => setNotes({ ...notes, [part.id]: event.target.value })}
                placeholder="These words go on the reel. To change dialogue, reopen the script."
              />
              <button
                className="ghost"
                type="button"
                onClick={() => run(`Holding notes for reel ${part.index}…`, `/api/projects/${project.id}/reels`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "changes", partId: part.id, notes: notes[part.id] || "" }),
                })}
              >
                Request changes
              </button>
            </label>
          </article>
        ))}
      </fieldset>
    </section>
  );
}

function PictureSection({
  project, characters, locked, assembleReady, confirmMerge, setConfirmMerge, busy, run,
}: {
  project: Project;
  characters: string[];
  locked: boolean;
  assembleReady: boolean;
  confirmMerge: boolean;
  setConfirmMerge: (value: boolean) => void;
  busy: string;
  run: (label: string, path: string, init?: RequestInit) => Promise<void>;
}) {
  const ledger = characters.map((name) => project.cast.find((member) => member.characterName === name)).filter(Boolean);
  return (
    <section className="section" id="picture">
      <div className="section-head">
        <div>
          <p className="pill">Picture</p>
          <h2>Merge</h2>
          <p>The finished movie is the approved reels, in order, with a title and a cast list that names every consented actor.</p>
        </div>
      </div>
      {locked ? <p className="banner">Approve every reel before the picture can be merged.</p> : null}
      <table className="ledger">
        <thead>
          <tr><th>Character</th><th>Actor</th><th>Letter</th><th>Date</th></tr>
        </thead>
        <tbody>
          {ledger.map((member) => member ? (
            <tr key={member.id}>
              <td>{titleCaseName(member.characterName)}</td>
              <td>{member.actorLegalName}</td>
              <td className="meta">{shortHash(member.consentSha256)}</td>
              <td>{member.consentDate}</td>
            </tr>
          ) : null)}
        </tbody>
      </table>
      <fieldset className="plain" disabled={!assembleReady || Boolean(busy)}>
        <label className="check">
          <input type="checkbox" checked={confirmMerge} onChange={(event) => setConfirmMerge(event.target.checked)} />
          <span>I have reviewed every reel and this consent ledger, and I approve the merge.</span>
        </label>
        <button
          className="primary"
          type="button"
          disabled={!confirmMerge}
          onClick={() => run("Merging the picture…", `/api/projects/${project.id}/assemble`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmLedger: true }),
          })}
        >
          Merge the picture
        </button>
      </fieldset>
      {project.finalMovie ? (
        <div className="reel">
          <video controls src={fileUrl(project.id, project.finalMovie.file)} />
          <p className="meta">{formatDuration(project.finalMovie.durationSec)} · merged {project.finalMovie.createdAt}</p>
          <a className="button" href={`${fileUrl(project.id, project.finalMovie.file)}&download=1`}>Download the movie</a>
        </div>
      ) : null}
    </section>
  );
}

function Manuscript({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <article className="manuscript">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("### ")) return <h3 key={index}>{trimmed.slice(4)}</h3>;
        if (trimmed.startsWith("## ")) return <h2 key={index}>{trimmed.slice(3)}</h2>;
        if (trimmed.startsWith("# ")) return <h1 key={index}>{trimmed.slice(2)}</h1>;
        return <p key={index}>{trimmed}</p>;
      })}
    </article>
  );
}

function Trace({ entries }: { entries?: { step: string; detail: string }[] }) {
  if (!entries?.length) return null;
  return (
    <details className="trace">
      <summary>What the agent did</summary>
      <ul>
        {entries.map((entry) => <li key={entry.step}><strong>{entry.step}.</strong> {entry.detail}</li>)}
      </ul>
    </details>
  );
}

function fileUrl(projectId: string, file: string): string {
  return `/api/projects/${projectId}/file?path=${encodeURIComponent(file)}`;
}
