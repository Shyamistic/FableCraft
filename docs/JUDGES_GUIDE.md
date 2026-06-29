# Fablecraft — Judges' Technical Guide

## H0 Hackathon | Track 1: Monetizable B2C App
**AWS Database: Amazon DynamoDB | Frontend: Vercel | AI: Amazon Bedrock**

---

## Quick Links

| Resource | URL |
|----------|-----|
| **Live App** | https://fablecraft-pi.vercel.app |
| **Demo Video** | https://youtu.be/NEK5weMjHb4 |
| **GitHub** | https://github.com/Shyamistic/FableCraft |
| **DynamoDB Table** | `fablecraft-data` (us-east-1) |
| **Vercel Team** | shyamsharma31415-5947s-projects |

---

## Testing Instructions

### Quick Test (2 minutes)
1. Visit https://fablecraft-pi.vercel.app
2. Draw anything on the canvas (or click upload to use any image)
3. Name your character → Click "Generate"
4. Wait ~15 seconds for AI character generation (Amazon Nova Pro + Nova Canvas)
5. Select a life lesson → Choose a story world
6. Wait ~2 minutes for quest generation (8 scenes + illustrations)
7. Play through scenes, earn stars, click the 🔊 icon to hear narration

### What to Observe
- **Character Generation:** Nova Pro analyzes the drawing → Nova Canvas generates the character
- **Content Safety:** Try drawing something inappropriate — Nova Lite blocks it with a friendly message
- **Quest Flow:** Each scene has a narrative, question, and two options (one prosocial, one not)
- **Narration:** Amazon Polly Neural (Ruth voice) reads each scene aloud
- **Persistence:** All characters, quests, and progress save to DynamoDB automatically

### Technical Verification
- **API Health:** https://fablecraft-pi.vercel.app/api/health (proxied to EC2)
- **DynamoDB:** Every character/quest generation creates entries in `fablecraft-data`
- **S3:** All images and audio are stored in `fablecraft-assets` bucket with presigned URLs

---

## Architecture Overview

```
User (Child/Parent)
        │
        ▼
┌─────────────────────────────────────────────┐
│  VERCEL (CDN + Edge)                         │
│  Next.js 14 • React 18 • TypeScript         │
│  Tailwind CSS • Scaffolded with v0          │
│                                              │
│  Vercel Rewrites: /api/* → EC2 Backend      │
└──────────────────────┬──────────────────────┘
                       │ HTTPS (proxied)
                       ▼
┌─────────────────────────────────────────────┐
│  AWS EC2 (FastAPI • Python 3.11)             │
│                                              │
│  Services:                                   │
│  • VisionAnalyzer → Bedrock Nova Pro         │
│  • CharacterGenerator → Bedrock Nova Canvas  │
│  • QuestEngine → Bedrock Nova Pro            │
│  • SceneIllustrator → Bedrock Nova Canvas    │
│  • ContentModerator → Bedrock Nova Lite      │
│  • TTSService → Amazon Polly Neural          │
│  • DatabaseLayer → Amazon DynamoDB           │
│  • StorageService → Amazon S3                │
└─────┬──────────────┬──────────────┬─────────┘
      │              │              │
      ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────────────┐
│ DynamoDB │  │    S3    │  │ Bedrock + Polly  │
│          │  │          │  │                  │
│ Table:   │  │ Bucket:  │  │ Nova Pro v1:0    │
│ fablecraft│ │ fablecraft│ │ Nova Canvas v1:0 │
│ -data    │  │ -assets  │  │ Nova Lite v1:0   │
│          │  │          │  │ Polly (Ruth)     │
│ Billing: │  │          │  │                  │
│ PAY_PER  │  │ Presigned│  │                  │
│ _REQUEST │  │ URLs 1hr │  │                  │
└──────────┘  └──────────┘  └──────────────────┘
```

---

## DynamoDB Data Model

**Table:** `fablecraft-data`  
**Region:** us-east-1  
**Billing:** PAY_PER_REQUEST (On-Demand)  
**Key Schema:** PK (String, HASH) + SK (String, RANGE)

### Entity Access Patterns

| Entity | PK | SK | Operations |
|--------|----|----|-----------|
| User Profile | `USER#<uuid>` | `PROFILE` | GetItem, PutItem |
| Progress | `USER#<uuid>` | `PROGRESS` | GetItem, UpdateItem (atomic) |
| Character | `USER#<uuid>` | `CHAR#<uuid>` | PutItem, Query (begins_with) |
| Quest | `USER#<uuid>` | `QUEST#<uuid>` | PutItem, UpdateItem, Query |
| Session | `USER#<uuid>` | `SESSION#<uuid>` | PutItem |

### Why Single-Table Design
- One table handles all access patterns
- No JOINs needed — all user data under one partition key
- Efficient reads: get all characters for a user in one Query
- Atomic progress updates (XP, coins) via UpdateItem expressions

---

## AWS Services Summary

| Service | Model/Config | Purpose |
|---------|-------------|---------|
| **DynamoDB** | PAY_PER_REQUEST, us-east-1 | Primary database — all user data |
| **Bedrock** | amazon.nova-pro-v1:0 | Vision analysis + story generation |
| **Bedrock** | amazon.nova-canvas-v1:0 | Character + scene image generation |
| **Bedrock** | amazon.nova-lite-v1:0 | Content moderation (child safety) |
| **Polly** | Ruth, Neural engine, 90% speed | Text-to-speech narration |
| **S3** | fablecraft-assets bucket | Asset storage (presigned URLs) |
| **EC2** | t3.medium, us-east-1 | Backend hosting (Docker) |
| **IAM** | fablecraft-ec2-role | Scoped permissions |

---

## Monetization Model

| Tier | Monthly | Annual Rev/User | Features |
|------|---------|----------------|----------|
| Free | $0 | $0 | 2 quests/day, basic features |
| Explorer | $4.99 | $59.88 | Unlimited quests, all features |
| Family | $9.99 | $119.88 | 4 kids, analytics, animated stories |

**Unit Economics:**
- Cost per quest: ~$0.08
- Explorer (20 quests/mo): $1.60 COGS → $3.39 profit → 68% margin
- Target: $7.6B children's EdTech market
- CAC strategy: Organic (parent word-of-mouth), App Store, school partnerships

---

## Code Structure

```
FableCraft/
├── frontend/                  # Next.js 14 (deployed on Vercel)
│   ├── app/page.tsx          # Main app with all views
│   ├── components/           # 25+ React components
│   ├── hooks/                # Gamification, music, sound effects
│   ├── lib/                  # Persistence, types, constants
│   └── vercel.json           # Vercel deployment config
│
├── agents_service/           # FastAPI backend (deployed on EC2)
│   ├── main.py              # API routes + DynamoDB integration
│   ├── database.py          # DynamoDB single-table data layer
│   ├── vision_analyzer.py   # Bedrock Nova Pro vision
│   ├── quest_engine.py      # Bedrock Nova Pro story gen
│   ├── scene_illustrator.py # Bedrock Nova Canvas images
│   ├── character_generator.py # Bedrock Nova Canvas characters
│   ├── content_moderator.py # Bedrock Nova Lite safety
│   ├── tts_service.py       # Amazon Polly Neural
│   ├── storage_service.py   # Amazon S3 operations
│   ├── image_provider.py    # Multi-provider image fallback
│   └── setup_dynamodb.py    # Table provisioning script
│
├── ARCHITECTURE.md           # Detailed architecture docs
└── README.md                 # Full project documentation
```

---

## What Was Built During H0 Hackathon Period

The core AI pipeline (Bedrock + Polly + S3 + frontend) existed prior. During the H0 submission period, we added:

1. **Amazon DynamoDB integration** — Complete `database.py` with single-table design
2. **5 new API endpoints** — User creation, progress tracking, character gallery, quest history, quest completion
3. **Data persistence** — Characters, quests, and progress now survive across sessions
4. **Vercel deployment** — Migrated frontend from EC2 to Vercel with rewrites
5. **ClipDrop fallback** — Multi-key image generation for reliability
6. **IAM policy updates** — Scoped DynamoDB permissions for EC2 role
7. **Architecture documentation** — Full AWS service documentation

---

*Built by Shyam Sharma for H0: Hack the Zero Stack with Vercel v0 and AWS Databases*
*#H0Hackathon*
