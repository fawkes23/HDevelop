# Hailuo Sheet

A shot-by-shot editor for writing MiniMax H3 prompts. Everything you enter compiles live into the prompt format
from the [`h3-prompt-writing`](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing) skill,
and a set of non-blocking checks flags where the prompt departs from that skill.

```
npm install
npm run dev      # http://localhost:5173
npm test         # compiler + lint rules, including verbatim matches against the skill's cases
npm run build
```

## Source of truth

Everything about the prompt format comes from the skill (`SKILL.md`, `references/base-en.txt`,
`references/ref-en.txt`). Input caps come from the MiniMax-H3 README, and the request body comes from its
`scripts/readme/*-h3-base.sh` examples. Nothing else is assumed. `src/skillCases.ts` holds the skill's example
outputs verbatim, and the tests check that the bundled examples compile to them character for character.

## Modes

| Mode | Inputs | Prompt |
| --- | --- | --- |
| T2VA | none | the three core fields |
| I2VA | first frame (`<Picture 1>`, 0.00 s) | first-frame instruction + core fields |
| FL2VA | first + last frame (`Picture 1`, `Picture 2`) | first-and-last-frame instruction + core fields |
| L2VA | last frame (`<Picture 1>`, end of final shot) | last-frame instruction + core fields |
| Ref2VA | ≤ 9 pictures, ≤ 3 videos, ≤ 3 audio, ≤ 12 total; audio cannot be the only input | six sections |

Base modes output:

```
<instruction line, except T2VA>

integrated_multimodal_description: [Shot 1] <style>, <composition> ... [Shot 2] At 00:03.500, the camera cuts to ...

overall_soundscape: ...

non_diegetic_music: ...
```

Ref2VA outputs `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`,
`overall_soundscape` and `non_diegetic_music`, in that order, with `<Subject N>`, `<Picture N>`, `<Video N>` and
`<Audio N>` labels.

## Using it

The editor works like a video editor: a **viewer** (top left), an **inspector** for whatever is selected (top right)
and a **timeline** (bottom).

- **Shots** are clips on the Shots track. Drag the line between two shots to move the cut (snaps to 0.5 s and can
  never cross a neighbour), drag the end of the ruler to change the length (4–15 s), or use Split at playhead.
- **Inside a shot**, items sit on their own tracks (Camera, Action, one lane per speaker, Sound, On-screen text) and
  read left to right in the order the prompt will. Drag a clip to reorder it or move it to another shot. Drag a
  dialogue line to another speaker's lane to change who says it. With a selected shot, empty tracks show an Add
  button.
- **Background** and **Music** run under the whole video.
- **Viewer**: type what the camera sees straight onto the frame. Play steps through the video in real time,
  with subtitles and a hint of the camera move.
- **New** (top bar): start a blank project, or paste an existing H3 prompt and it is rebuilt as a timeline
  (shots, cut times, camera moves, dialogue lanes, sound, and for reference prompts the labels and summary).
  Pasting with Ctrl/⌘+V outside a text field does the same; into a blank project it loads straight away.
  Prompts carry no image or file links, so add those afterwards. On start, a message says whether you are looking at
  your last saved project or the example.
- **Format** (top bar): starting point, length, frame shape and look. **Prompt** opens the compiled prompt,
  the checks and the H3-Base request. **Project** holds examples, import and export.
- **Keyboard**: Tab to a clip, arrows to move between clips, Alt+arrows to reorder, Enter to edit, Delete to remove
  (with undo). The cut and length handles are sliders (arrow keys). Space plays and pauses.

| Block | Compiles to |
| --- | --- |
| Shot (camera view) | `[Shot 1] …` (no timestamp) or `[Shot N] At MM:SS.mmm, the camera cuts to …` |
| Action | subjects, environment, actions, as a sentence |
| Camera move | `The camera pushes in with small amplitude at slow speed toward …` (the guide's motion types; medium and normal are omitted) |
| Dialogue | `Who (S1) says: <d>[English] words</d>`, voiceover with `says in an off-screen voiceover` + closed lips, `<scenetrans>` / `<cutoff>` |
| Sound | a diegetic sound synchronized to the shot |
| On-screen text | `A sign reading "原文" …`, quoted verbatim |
| Reference label | reference mode only: one `subject_definitions` line and one `retention_analysis` line with a fixed marker |
| Raw text | inserted into the current shot as written |
| Note to self | never output |

Less common fields sit under "More options" or "Advanced settings". Checks appear next to the field they are about,
and in the Checks tab with a link to the place to fix them.

`overall_soundscape` becomes `N/A` only when you tick "completely silent". Empty music becomes `N/A`.

## Design rules

- **Warn, never block.** Checks are suggestions. You can always copy the prompt.
- **Nothing is rewritten silently.** Quick fixes are opt-in.
- **Rules are data.** `src/spec.ts` holds modes, limits, camera vocabulary, markers, task types and block
  definitions (labels, hints, which fields are advanced). `src/lint.ts` holds the checks.
- **One design system.** Tokens (color, 4px spacing, three text sizes, radii) live at the top of `src/styles.css`;
  shared controls (Field, Segmented, Disclosure, Menu, CopyButton) live in `src/ui.tsx`. Icons are Lucide.

## Open points in the skill

- Where `<scenetrans>` and `<cutoff>` sit is not spelled out. The skill says `<d>` holds only the language tag and
  the spoken words, so the markers go just outside it, at the connecting point.
- The H3-Base examples only show `frame_index: 0`. The last-frame index is derived from 24 FPS × duration and
  flagged in the request notes.
