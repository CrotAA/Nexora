## Nexora

Nexora is a graph-based vocabulary learning app focused on spatial memory.

It uses a visual learning map to help users explore relationships between words instead of memorizing vocabulary only in a linear list.

## Current Status

Nexora currently supports:

- CET4 complete word catalog
- CET4 searchable library
- graph-based focus learning map
- CET4 full atlas view grouped by semantic topic
- custom vocabulary import
- user word lists
- word pronunciation playback
- memory status marking such as remembered / learning

## CET4 Support

Nexora now includes a **complete CET4 catalog** extracted into the local project data layer.

Current CET4 data support includes:

- 3849 CET4-tagged words
- Chinese meanings
- phonetic transcription
- topic classification
- searchable CET4 import into user lists
- partial real pronunciation audio coverage
- browser TTS fallback when no audio URL is available

Related files:

- [src/data/cet4_catalog.ts](/Users/edge/CodeProject/Nexora/src/data/cet4_catalog.ts)
- [src/data/cet4_library.ts](/Users/edge/CodeProject/Nexora/src/data/cet4_library.ts)
- [src/components/WordSpacePrototype.tsx](/Users/edge/CodeProject/Nexora/src/components/WordSpacePrototype.tsx)

## Main Features

### 1. Focus Learning Map

The app can center one selected word and show the most relevant nearby words around it.

This is the main mode for actual study because it is more readable than showing the entire graph at once.

### 2. CET4 Full Atlas

The app can display the full CET4 vocabulary graph area grouped by topic:

- education
- time / process
- society
- technology
- emotion

This view is intended for exploration and overview, not only for single-word memorization.

### 3. Search and Add

Users can:

- search the CET4 catalog
- add a word into the current study list
- select a word from the graph
- inspect meanings, phonetics, and example text

### 4. Pronunciation

Nexora currently supports two pronunciation paths:

- real audio URL when available
- browser TTS fallback when no audio is available

### 5. Custom Import

Users can import their own word list in this format:

```text
word | 中文1,中文2 | topic | example | memoryHint | phonetic
```

## Tech Stack

- Next.js 16
- TypeScript
- React
- React Flow
- Framer Motion
- Tailwind CSS

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Project Structure

```text
src/
├─ app/
├─ components/
├─ data/
├─ lib/
└─ types/
```

Important files:

- [src/app/page.tsx](/Users/edge/CodeProject/Nexora/src/app/page.tsx)
- [src/components/WordSpacePrototype.tsx](/Users/edge/CodeProject/Nexora/src/components/WordSpacePrototype.tsx)
- [src/data/cet4_core.ts](/Users/edge/CodeProject/Nexora/src/data/cet4_core.ts)
- [src/data/cet4_catalog.ts](/Users/edge/CodeProject/Nexora/src/data/cet4_catalog.ts)
- [src/types/word.ts](/Users/edge/CodeProject/Nexora/src/types/word.ts)

## Notes

- `npm run dev` uses `webpack` mode for better local stability.
- `npm run dev:turbo` is available if you want to test Turbopack separately.
- Real pronunciation audio is not yet available for every CET4 word.

## Next Steps

Planned improvements include:

- better semantic clustering
- richer relation generation
- fuller pronunciation coverage
- editable word relations
- stronger study workflows and review modes
