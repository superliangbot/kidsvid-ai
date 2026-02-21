# kidsvid-ai

AI-powered YouTube Kids content engine. Autonomous pipeline that analyzes top kids channels, learns what makes them successful, generates original educational content, and manages publishing.

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                        ORCHESTRATOR                            │
 │                   (BullMQ + Express API)                       │
 │                                                                │
 │  analyze ──► generate ──► review ──► publish ──► track         │
 └──────┬───────────┬──────────┬──────────┬──────────┬────────────┘
        │           │          │          │          │
        ▼           ▼          ▼          ▼          ▼
 ┌──────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐
 │ ANALYZER │ │GENERATOR │ │ REVIEW │ │PUBLISHER│ │ FEEDBACK │
 │          │ │          │ │ QUEUE  │ │         │ │          │
 │ YouTube  │ │ Claude   │ │        │ │ Upload  │ │ Track    │
 │ Data API │ │ API      │ │ Manual │ │ SEO     │ │ Score    │
 │ Scraper  │ │ DALL-E   │ │ or     │ │Schedule │ │ Report   │
 │ Patterns │ │ 11Labs   │ │ Auto   │ │Playlist │ │ Learn    │
 │ Categoriz│ │ Suno     │ │        │ │         │ │          │
 │ Engagmnt │ │ Runway   │ │        │ │         │ │          │
 └──────────┘ └──────────┘ └────────┘ └─────────┘ └──────────┘
        │           │          │          │          │
        └───────────┴──────────┴──────────┴──────────┘
                              │
                     ┌────────┴────────┐
                     │     SHARED      │
                     │  DB (Drizzle)   │
                     │  YouTube Client │
                     │  Config/Logger  │
                     │  Types          │
                     └─────────────────┘
                              │
                     ┌────────┴────────┐
                     │   PostgreSQL    │
                     │     Redis       │
                     └─────────────────┘
```

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Configure
cp .env.example .env
# Edit .env with your API keys (minimum: YOUTUBE_API_KEY + DATABASE_URL)

# 4. Run database migrations
npm run db:migrate

# 5. Run analysis
npm run analyze
```

## Packages

| Package | Status | Description |
|---------|--------|-------------|
| `@kidsvid/shared` | Production | DB schema, YouTube client, config, logger, types |
| `@kidsvid/analyzer` | Production | Channel scraper, categorizer, pattern detector, engagement analyzer |
| `@kidsvid/generator` | Scaffold | Script generator (Claude), thumbnails (DALL-E), voice/music/video providers |
| `@kidsvid/publisher` | Scaffold | YouTube uploader, SEO optimizer, scheduler, playlist manager |
| `@kidsvid/feedback` | Scaffold | Performance tracker, strategy scorer, weekly reports |
| `@kidsvid/orchestrator` | Scaffold | BullMQ pipeline, Express dashboard API |

## Commands

```bash
# Analysis (production-ready)
npm run analyze                    # Full analysis of top 30 kids channels
npm run analyze -- --channels UC...,UC...  # Specific channels
npm run analyze -- --videos 100    # More videos per channel
npm run analyze -- --skip-existing # Skip recently analyzed

# Generation (requires ANTHROPIC_API_KEY)
npm run generate                   # Generate a script
npm run generate -- --category early_math --topic "counting to 10"
npm run generate -- --age 2-4      # Toddler content

# Orchestrator
npm run orchestrate -- --dashboard # Start dashboard API on :3000
npm run orchestrate -- --analyze   # Queue analysis job

# Development
npm test                           # Run all tests (52 tests)
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report
npm run lint                       # ESLint
npm run format                     # Prettier
npm run typecheck                  # TypeScript check all packages
npm run docker:up                  # Start PostgreSQL + Redis
npm run docker:down                # Stop infrastructure
```

## Educational Content Framework

The generator produces educational kids content that is both genuinely valuable AND engaging. Not brain rot. Think Cocomelon meets Numberblocks meets Bluey.

### Educational Categories
- **Early Math** — counting, shapes, patterns, basic addition/subtraction
- **Phonics & Reading** — letter sounds, sight words, simple sentences
- **Science** — why is the sky blue, how plants grow, animal facts
- **Social-Emotional** — sharing, feelings, friendship, growth mindset
- **World Knowledge** — countries, cultures, foods, animals
- **Problem Solving** — puzzles, mazes, helping characters find answers
- **Music & Rhythm** — instruments, beat patterns, singing along

### Quality Gate
Every generated script must pass a quality scorer:
- `educationalValue` (0-10) — must be >7
- `engagementPotential` (0-10) — must be >7
- Both scores must pass or the script is rejected and regenerated

### Episode Structure
Every episode follows a proven template:
1. **Hook** (15s) — mystery/question to grab attention
2. **Problem** (30s) — present the learning challenge
3. **Exploration** (2-3min) — teach through interaction
4. **Resolution** (30s) — celebrate learning with rewards
5. **Next Preview** (15s) — cliffhanger for next episode

### Anti-Brain-Rot Rules
- No pure sensory overload without educational purpose
- Every visual element serves the learning objective
- Music reinforces the lesson
- Minimum 1 clear learning takeaway per video
- Age-appropriate complexity (2-4, 4-6, 6-8)

### Characters
| Character | Teaching Style | Age Range |
|-----------|---------------|-----------|
| Cosmo | Through curiosity and mistakes | 2-6 |
| Melody | Through songs and rhythm | 2-5 |
| Professor Paws | Through facts and humor | 4-8 |
| Brave Bea | Through challenges and growth mindset | 3-7 |
| Pixel & Dot | Through visual math and patterns | 3-6 |

## API Keys Required

| Key | Required For | Get It At |
|-----|-------------|-----------|
| `YOUTUBE_API_KEY` | Analysis (required) | Google Cloud Console |
| `DATABASE_URL` | All packages (required) | Docker Compose provides this |
| `ANTHROPIC_API_KEY` | Script generation | console.anthropic.com |
| `OPENAI_API_KEY` | Thumbnail generation | platform.openai.com |
| `ELEVENLABS_API_KEY` | Voice generation | elevenlabs.io |
| `SUNO_API_KEY` | Music generation | suno.com |
| `RUNWAY_API_KEY` | Video generation | runwayml.com |
| `YOUTUBE_CLIENT_ID/SECRET` | Publishing | Google Cloud Console (OAuth) |

## Database

PostgreSQL via Drizzle ORM. Schema in `packages/shared/src/db/schema.ts`.

Tables: `channels`, `videos`, `analysis_patterns`, `analysis_runs`, `characters`, `generated_videos`, `performance_snapshots`, `strategy_scores`, `pipeline_jobs`

```bash
npm run db:generate   # Generate migrations from schema changes
npm run db:migrate    # Apply migrations
npm run db:studio     # Open Drizzle Studio GUI
```

## Safety

- **Dry-run by default** — `DRY_RUN=true` in .env, nothing publishes without explicit flag
- **Manual approval gate** — every video goes through review queue
- **API quota management** — YouTube quota tracked, capped at 9000/10000 units per run
- **Made for Kids** flag — all content marked as made for kids per YouTube/COPPA requirements

## Tech Stack

- **Runtime**: Node.js + TypeScript (ESM)
- **Monorepo**: npm workspaces
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Queue**: Redis + BullMQ
- **Testing**: Vitest (52 tests)
- **AI**: Anthropic Claude (scripts), DALL-E (thumbnails), ElevenLabs (voice), Suno (music), Runway (video)
- **API**: YouTube Data API v3
- **Infra**: Docker Compose
