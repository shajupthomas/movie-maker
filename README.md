# Proscenium

Proscenium is a human-in-the-loop movie studio. A short brief becomes a finished picture only by passing through you.

1. The agent writes a complete three-act story from the brief. With a language model connected, that model rewrites the draft. Without one, the studio writer does it.
2. You edit it, send it back with a note, or approve it. Approval is what allows a screenplay.
3. The agent writes the screenplay from the approved story. You correct any line, or approve it. A connected language model rewrites this draft the same way, and the studio keeps its own draft if the model’s pages do not parse.
4. For every speaking part, choose one:
   - **Family member.** File their face photograph and a consent letter they have signed, and attest that every photographed person is 18 or older. The studio will not render a real likeness without those. After consent is on file you can ask for the other angles of that same face.
   - **Generated face.** Ask the picture model for a fictional adult. It makes a front portrait and four matching angles so the face holds from the side. Generated faces are credited as fictional. A child role is not generated as a photograph.
5. The approved script is cut into scene reels. With the picture model connected, each scene is a 15-second live-action clip, the longest that model allows, and the face is locked from the angle sheet. Without it, the reel is a cinematic animatic of the portraits and the approved lines. Scenes stay whole and are packed up to three minutes. You review and approve each reel.
6. When every reel is approved, you confirm the ledger and the studio merges the reels, a title card, and a cast list into one movie.

## Models

Open **Models** in the studio.

| Job | Connection | Default |
| --- | --- | --- |
| Story and screenplay | OpenAI-compatible `POST /v1/chat/completions` | `gpt-4.1` at `https://api.openai.com/v1` |
| Front portrait | Fal `fal-ai/flux-pro/v1.1` | Head-and-shoulders fictional adult |
| Same face, other angles | Fal `fal-ai/flux-pro/kontext` | Three-quarter and profile views |
| Scene clips | Fal `fal-ai/kling-video/v3/pro/image-to-video` | 15 seconds, audio on, identity locked with `@Element1` |

Keys can be saved in the studio or supplied by the environment. The environment wins.

```bash
STUDIO_LLM_API_KEY=
STUDIO_LLM_BASE_URL=https://api.openai.com/v1
STUDIO_LLM_MODEL=gpt-4.1
FAL_KEY=
```

`STUDIO_FAL_KEY` is accepted as another name for the picture-model key. Saved keys live in `data/studio-settings.json`, which is not committed. The Models page shows only the last four characters.

A family photograph is uploaded to the picture host only after the consent letter and the 18-or-older attestation are on file.

## Run

```bash
npm install
npm run setup
npm run dev
```

`ffmpeg` is required. Open the app, or choose **Use an example** on the shelf.

## Tests

```bash
npm test
```
