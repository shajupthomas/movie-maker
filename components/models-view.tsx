"use client";

import { useEffect, useState } from "react";
import type { PublicSettings } from "@/lib/models/public";

export default function ModelsView() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [falKey, setFalKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: PublicSettings) => {
        setSettings(data);
        setLlmBaseUrl(data.llmBaseUrl || "");
        setLlmModel(data.llmModel || "");
      })
      .catch(() => setError("The model settings could not be opened."));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("Saving…");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmApiKey, llmBaseUrl, llmModel, falKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The settings could not be saved.");
      setSettings(data as PublicSettings);
      setLlmApiKey("");
      setFalKey("");
      setNotice("Saved. A blank key leaves the one already on file.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function check(target: "llm" | "fal") {
    setBusy(target === "llm" ? "Checking the language model…" : "Checking the picture model…");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The check failed.");
      if (data.ok) setNotice(data.detail);
      else setError(data.detail || "The model did not accept the key.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check failed.");
    } finally {
      setBusy("");
    }
  }

  async function clearKey(which: "llm" | "fal") {
    setBusy("Removing the key…");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(which === "llm" ? { clearLlm: true } : { clearFal: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The key could not be removed.");
      setSettings(data as PublicSettings);
      setNotice(which === "llm" ? "Removed the saved language-model key." : "Removed the saved picture-model key.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The key could not be removed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">Proscenium</a>
        <a href="/">Back to the shelf</a>
      </header>
      <main id="main" className="hero">
        <p className="eyebrow">Models</p>
        <h1>Connect the writers and the camera.</h1>
        <p className="lede">
          The language model writes the story and the screenplay. The picture model invents a fictional adult face,
          turns that same face through five angles, and shoots each scene as a 15-second clip, the longest that camera allows.
          Family photographs are sent to the picture model only after a signed consent letter is on file.
        </p>
        <form className="panel models-form" onSubmit={save}>
          <h2>Language model</h2>
          <p className="note">
            Any service that speaks the OpenAI chat-completions API. The default model is gpt-4.1.
            A key in the environment (STUDIO_LLM_API_KEY, STUDIO_LLM_BASE_URL, STUDIO_LLM_MODEL) overrides what is saved here.
          </p>
          {settings?.llmFromEnvironment ? <p className="banner">A language-model key from the environment is in use.</p> : null}
          <p className="meta">{settings?.llmConfigured ? `Key on file ${settings.keyHints.llm} · ${settings.llmModel}` : "No language-model key yet. The studio writer will draft until you connect one."}</p>
          <label>
            <span>API key</span>
            <input type="password" value={llmApiKey} onChange={(event) => setLlmApiKey(event.target.value)} autoComplete="off" placeholder="Leave blank to keep the saved key" />
          </label>
          <label>
            <span>Base URL</span>
            <input type="url" value={llmBaseUrl} onChange={(event) => setLlmBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            <span>Model</span>
            <input type="text" value={llmModel} onChange={(event) => setLlmModel(event.target.value)} placeholder="gpt-4.1" />
          </label>
          <h2>Picture model</h2>
          <p className="note">
            Faces are Flux Pro. Matching angles of that same face are Flux Kontext. Scene clips are Kling v3 Pro, with each face locked as an element.
            Set FAL_KEY or STUDIO_FAL_KEY in the environment to override the saved key.
          </p>
          {settings?.falFromEnvironment ? <p className="banner">A picture-model key from the environment is in use.</p> : null}
          <p className="meta">{settings?.falConfigured ? `Key on file ${settings.keyHints.fal}` : "No picture-model key yet. Reels stay cinematic animatics, and faces cannot be generated."}</p>
          <label>
            <span>Fal key</span>
            <input type="password" value={falKey} onChange={(event) => setFalKey(event.target.value)} autoComplete="off" placeholder="Leave blank to keep the saved key" />
          </label>
          {error ? <p className="banner bad" role="alert">{error}</p> : null}
          {notice ? <p className="banner" role="status">{notice}</p> : null}
          <div className="actions">
            <button className="primary" type="submit" disabled={Boolean(busy)}>{busy === "Saving…" ? "Saving…" : "Save connections"}</button>
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => check("llm")}>Check the language model</button>
            <button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => check("fal")}>Check the picture model</button>
            <button className="danger" type="button" disabled={Boolean(busy) || !settings?.keyHints.llm} onClick={() => clearKey("llm")}>Remove language key</button>
            <button className="danger" type="button" disabled={Boolean(busy) || !settings?.keyHints.fal} onClick={() => clearKey("fal")}>Remove picture key</button>
          </div>
        </form>
      </main>
    </>
  );
}
