# Proscenium

Proscenium is a human-in-the-loop movie studio. A short brief becomes a finished picture only by passing through you.

1. The agent writes a complete three-act story from the brief.
2. You edit it, send it back with a note, or approve it. Approval is what allows a screenplay.
3. The agent writes the screenplay from the approved story. You correct any line, or approve it.
4. For every speaking part you file the actor’s face photograph and a consent letter that actor has signed, and you attest that each photographed actor is 18 or older. The studio will not render a likeness without those.
5. The approved script is cut into scene reels packed as long as they can be, up to three minutes, without splitting a scene. You review and approve each reel.
6. When every reel is approved, you confirm the consent ledger and the studio merges the reels, a title card, and a cast list into one movie.

The picture is a cinematic assembly of the approved screenplay: each line is held for the time it takes to speak, carried by that actor’s consented portrait. It is not a face-swap onto someone else’s performance.

## Run

```bash
npm install
npm run setup
npm run dev
```

`ffmpeg` is required. The writer runs in the studio, so no model API key is used.

Open the app, or choose **Use an example** on the shelf. Download the consent-letter template from the cast step, sign it, and upload it with each actor’s photograph before rendering.

## Tests

```bash
npm test
```
