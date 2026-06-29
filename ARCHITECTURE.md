# Fablecraft — AWS Architecture

## Full System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USERS (Children ages 4-8 + Parents)                  │
└──────────────────────────────────────────┬──────────────────────────────────────┘
                                           │ HTTPS
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          VERCEL (Frontend CDN + Edge)                             │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 + React 18 + TypeScript + Tailwind CSS                        │  │
│  │                                                                           │  │
│  │  • Drawing Canvas (magic brushes, stickers, stamps)                       │  │
│  │  • Interactive Story Quest UI (8-scene gameplay)                           │  │
│  │  • Gamification Engine (XP, levels, achievements, daily streaks)           │  │
│  │  • Parent Dashboard (PIN-protected, analytics)                            │  │
│  │  • Audio Manager (TTS playback with read-along highlighting)              │  │
│  │  • Collaborative Mode (WebSocket-based 2-player quests)                   │  │
│  │  • WCAG AA Accessibility                                                  │  │
│  │                                                                           │  │
│  │  Vercel Rewrites: /api/* → EC2 Backend (solves HTTPS→HTTP proxy)          │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────┬──────────────────────────────────────┘
                                           │ Proxied API Calls
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       AWS EC2 (FastAPI Backend Service)                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  API Endpoints:                                                            │  │
│  │  POST /api/characters/generate  — Drawing → AI Character                  │  │
│  │  POST /api/quests/generate      — Character → 8-scene interactive story   │  │
│  │  POST /api/tts/synthesize       — Text → Neural speech audio              │  │
│  │  POST /api/lessons/validate     — Custom lesson safety check              │  │
│  │  POST /api/users/create         — Create anonymous user (DynamoDB)        │  │
│  │  GET  /api/users/{id}/progress  — Retrieve gamification progress          │  │
│  │  GET  /api/users/{id}/characters— Character gallery from DynamoDB         │  │
│  │  GET  /api/users/{id}/quests    — Quest history from DynamoDB             │  │
│  │  POST /api/quests/{id}/complete — Record completion + award XP/coins      │  │
│  │  WS   /ws/collab/{room}         — Collaborative story WebSocket           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  AI Orchestration Layer:                                                   │  │
│  │  • VisionAnalyzer  — Nova Pro multimodal: drawing → character description │  │
│  │  • QuestEngine     — Nova Pro text: character + lesson → 8 scenes         │  │
│  │  • SceneIllustrator— Nova Canvas: narrative → scene artwork               │  │
│  │  • ContentModerator— Nova Lite: age-appropriateness filtering             │  │
│  │  • CharacterGenerator — Nova Canvas: description → character image        │  │
│  │  • TTSService      — Polly Neural (Ruth): text → MP3 narration            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│  IAM Role: fablecraft-ec2-role (scoped to DynamoDB, S3, Bedrock, Polly)         │
└───────┬───────────────────────┬───────────────────────┬─────────────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌────────────────┐   ┌──────────────────┐   ┌─────────────────────────────────────┐
│ AMAZON DYNAMODB│   │   AMAZON S3      │   │      AMAZON BEDROCK + POLLY         │
│                │   │                  │   │                                     │
│ Table:         │   │ Bucket:          │   │ ┌─────────────────────────────────┐ │
│ fablecraft-data│   │ fablecraft-assets│   │ │  Amazon Nova Pro v1:0           │ │
│                │   │                  │   │ │  • Vision analysis (multimodal) │ │
│ Billing:       │   │ Contents:        │   │ │  • Story generation (text)      │ │
│ PAY_PER_REQUEST│   │ • Character imgs │   │ └─────────────────────────────────┘ │
│ (serverless)   │   │ • Scene artwork  │   │ ┌─────────────────────────────────┐ │
│                │   │ • TTS audio MP3  │   │ │  Amazon Nova Canvas v1:0        │ │
│ Entities:      │   │ • Original draws │   │ │  • Character image generation   │ │
│ • Users        │   │                  │   │ │  • Scene illustration           │ │
│ • Characters   │   │ Access:          │   │ └─────────────────────────────────┘ │
│ • Quests       │   │ Presigned URLs   │   │ ┌─────────────────────────────────┐ │
│ • Progress     │   │ (1hr expiry)     │   │ │  Amazon Nova Lite v1:0          │ │
│ • Sessions     │   │                  │   │ │  • Content moderation           │ │
│                │   │                  │   │ │  • Age-appropriateness check    │ │
│ Scale:         │   │                  │   │ └─────────────────────────────────┘ │
│ 0 → millions   │   │                  │   │ ┌─────────────────────────────────┐ │
│ req/sec auto   │   │                  │   │ │  Amazon Polly Neural            │ │
│                │   │                  │   │ │  • Voice: Ruth                  │ │
│                │   │                  │   │ │  • Engine: Neural               │ │
│                │   │                  │   │ │  • Rate: 90% (child-friendly)   │ │
│                │   │                  │   │ └─────────────────────────────────┘ │
└────────────────┘   └──────────────────┘   └─────────────────────────────────────┘
```

## AWS Database: Amazon DynamoDB

### Single-Table Design

| PK | SK | Entity | Description |
|----|----|----|-----|
| `USER#<uuid>` | `PROFILE` | User | Anonymous user profile |
| `USER#<uuid>` | `PROGRESS` | Progress | XP, coins, levels, achievements, streaks |
| `USER#<uuid>` | `CHAR#<uuid>` | Character | Generated character (linked to drawing) |
| `USER#<uuid>` | `QUEST#<uuid>` | Quest | Quest with completion status and score |
| `USER#<uuid>` | `SESSION#<uuid>` | Session | Active gameplay state |

### Access Patterns

| Pattern | DynamoDB Query | Latency |
|---|---|---|
| Get user profile | GetItem: PK=`USER#id`, SK=`PROFILE` | < 5ms |
| Get progress | GetItem: PK=`USER#id`, SK=`PROGRESS` | < 5ms |
| List characters | Query: PK=`USER#id`, SK begins_with `CHAR#` | < 10ms |
| List quests | Query: PK=`USER#id`, SK begins_with `QUEST#` | < 10ms |
| Atomic XP update | UpdateItem with ADD expression | < 5ms |

### Why DynamoDB Over Aurora/DSQL

1. **Zero cold start** — No connection pooling, no idle timeout, no VPC setup
2. **Serverless billing** — $0 when unused, scales linearly with usage
3. **Schema flexibility** — Single-table design adapts as features evolve
4. **Global Tables** — Add any AWS region in one API call for international launch
5. **Built for gaming patterns** — Atomic counters, conditional writes, consistent reads

## AWS Cost Analysis (Per-Quest)

| Service | Operation | Cost |
|---------|-----------|------|
| Bedrock Nova Pro | Vision + Story (~4K tokens) | ~$0.03 |
| Bedrock Nova Canvas | 9 images (char + 8 scenes) | ~$0.04 |
| Bedrock Nova Lite | Moderation check | ~$0.001 |
| Polly Neural | 8 scenes × ~40 words | ~$0.004 |
| S3 | ~10 objects stored | ~$0.0001 |
| DynamoDB | ~15 write units | ~$0.00002 |
| **Total per quest** | | **~$0.08** |

At $4.99/mo Explorer tier with avg 20 quests/month = $1.60 cost → **68% gross margin**

## Security Architecture

- **IAM Role-based access** — EC2 instance role with least-privilege policies
- **No stored PII** — Anonymous UUID-based user identities
- **Content moderation at every input** — Drawings, custom lessons, and outputs filtered
- **Presigned URLs** — S3 assets expire after 1 hour
- **PIN lockout** — Parent dashboard locks after 5 failed attempts
- **CORS + Proxy** — Vercel rewrites eliminate direct cross-origin calls

## Future: Amazon Nova Reel Integration

```
Current:  Drawing → Character Image → Static Scene Images → TTS Audio
Future:   Drawing → Character Image → Animated Scene Clips → TTS Audio

Nova Reel: Scene illustration + narrative prompt → 6-second animated clip
Result: 8 clips × 6 sec = 48-second personalized animated storybook
```

This positions Fablecraft as the first platform to transform children's drawings into fully animated, narrated short films — all powered by AWS.
