# Hailuo Sheet

A GDevelop-style "events sheet" for writing MiniMax H3 prompts. The sheet compiles live into the prompt format
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

## Blocks

| Block | Compiles to |
| --- | --- |
| Shot | `[Shot 1] …` (no timestamp) or `[Shot N] At MM:SS.mmm, the camera cuts to …` |
| Visual | subjects, environment, actions, as a sentence |
| Camera | `The camera pushes in with small amplitude at slow speed toward …` (the guide's motion types; medium amplitude and normal speed omitted) |
| Speech | `Who (S1) says: <d>[English] words</d>`, voiceover with `says in an off-screen voiceover` + closed lips, `<scenetrans>` / `<cutoff>` |
| Sound | a diegetic sound synchronized to the shot |
| On-screen text | `A sign reading "原文" …`, quoted verbatim |
| Reference label | Ref2VA only: one `subject_definitions` line and one `retention_analysis` line with a fixed marker |
| Raw text | inserted into the current shot as written |
| Comment | never output |

`overall_soundscape` and `non_diegetic_music` are fields under the sheet. Empty music becomes `N/A`. The
soundscape becomes `N/A` only when you tick "complete silence requested".

## Design rules

- **Warn, never block.** Checks are suggestions. You can always copy the prompt.
- **Nothing is rewritten silently.** Quick fixes are opt-in.
- **Rules are data.** `src/spec.ts` holds modes, limits, camera vocabulary, markers, task types and block
  definitions. `src/lint.ts` holds the checks.

## Open points in the skill

- Where `<scenetrans>` and `<cutoff>` sit is not spelled out. The skill says `<d>` holds only the language tag and
  the spoken words, so the markers go just outside it, at the connecting point.
- The H3-Base examples only show `frame_index: 0`. The last-frame index is derived from 24 FPS × duration and
  flagged in the request notes.
