# Hailuo Sheet

A GDevelop-style "events sheet" for writing MiniMax H3 (Hailuo 3.0) prompts. Each row is a typed block
(Subject, Action, Camera, Light, Sound, Reference, Limits, Raw text, Comment) with an optional time window.
The rows compile live into one prompt, and a set of non-blocking checks flags known ways to waste a generation.

```
npm install
npm run dev      # http://localhost:5173
npm test         # compiler + lint rules
npm run build
```

## Modes

| Mode | Inputs | Notes |
| --- | --- | --- |
| Text → video | none | `adaptive` aspect ratio is rejected |
| Image → video | first frame | aspect ratio comes from the frame |
| First + last frame | both frames | |
| Reference → video | up to 9 images, 3 videos, 3 audio (12 total) | needs an image or video; audio alone is rejected; cannot combine with frames |

## Design rules

- **Warn, never block.** Checks are suggestions. You can always copy the prompt.
- **Nothing is rewritten silently.** Quick-fix buttons are opt-in. The only automatic change is normalising
  "Image 1" / "@image1" to your chosen cite style in the compiled output.
- **Rules are data.** `src/spec.ts` holds modes, limits, camera vocabulary and block definitions.
  `src/lint.ts` holds the checks. Add a block by adding an entry to `BLOCKS`; no UI code needed.
- **Raw text row = escape hatch** for anything the blocks cannot express.

## Where the sources disagree

Sources disagree, so these are settings or low-level tips rather than hard errors:

- Citation style: `Image 1` (EvoLink, Kapwing, Fuser) vs `@Image1` (Magnific docs). Toggle in the settings bar.
- Minimum duration: 4 s (Magnific) vs 5 s (others). 4 s gets a tip.
- Camera brackets: one guide says H3 wants plain film language and brackets are legacy; another says MiniMax
  docs still accept `[pan]`, `[zoom]`, `[static]`. Legacy-looking brackets get an info tip. Test both.
- Provider differences (resolution via endpoint vs body field, which fields are rejected in image mode) live in
  `src/payload.ts`.

## Not built yet

Video-to-video, middle image and 480p/4K/1080p (listed for H3 Max / some providers only), seed (not exposed),
Chinese-length limits, sort-to-recommended-order, nested groups.
