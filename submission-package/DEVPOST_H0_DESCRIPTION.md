# Fablecraft — H0 Hackathon Devpost Description

## Copy everything below this line into the Devpost "About" / description field:

---

## Turn your child's drawings into AI-powered interactive story adventures that teach real life lessons.

> Kids spend 3+ hours daily on screens — but almost none of it is creative. **Fablecraft changes that.** A child draws anything. AWS transforms it into a personalized, illustrated storybook that teaches kindness, courage, and honesty — narrated aloud, driven entirely by their imagination.

---

## 🔗 Live on Vercel

**[https://fablecraft-pi.vercel.app](https://fablecraft-pi.vercel.app)**

---

## The Problem Worth $7.6 Billion

Every parent feels it: their child is glued to a screen, consuming endless content — but creating nothing. The children's educational app market is worth $7.6B, yet most apps treat kids as passive consumers.

**We asked:** What if screen time could be creative time? What if a child's drawing could become a personalized, AI-generated storybook that teaches them about sharing, honesty, or being brave?

Fablecraft doesn't replace creativity with AI — it **amplifies** it. The child draws. AWS responds. Together they make something neither could alone.

---

## How It Works

![Drawing to Character](https://github.com/Shyamistic/FableCraft/blob/main/docs/gifs/gif1-ezgif.com-video-to-gif-converter.gif?raw=true)
*A child's scribble transformed into an AI character by Amazon Nova*

| Step | What Happens | AWS Service |
|------|-------------|-------------|
| 🖌️ **Draw** | Child draws on canvas or uploads a photo | — |
| ✨ **Analyze** | AI understands the drawing | **Amazon Bedrock (Nova Pro)** |
| 🎨 **Generate** | Character illustrated in storybook style | **Amazon Bedrock (Nova Canvas)** |
| 📖 **Learn** | Pick a life lesson (sharing, kindness...) | **Amazon Bedrock (Nova Lite)** — Safety |
| 🌍 **Explore** | Choose: Fantasy, Space, Underwater, Jungle | — |
| 🎮 **Play** | 8-scene interactive quest with choices | **Amazon Bedrock (Nova Pro)** |
| 🔊 **Listen** | Every scene narrated aloud | **Amazon Polly Neural** (Ruth) |
| 💾 **Save** | All progress persisted forever | **Amazon DynamoDB** |

---

## AWS Database: Amazon DynamoDB

**Table:** `fablecraft-data` | **Billing:** PAY_PER_REQUEST | **Design:** Single-table

We chose DynamoDB because Fablecraft is built to scale to millions of families globally:

- ⚡ **Single-digit ms latency** — Children disengage in seconds; speed is retention
- 🌐 **Global Tables ready** — One-click multi-region when we launch internationally
- 💰 **$0 when idle, pennies at scale** — PAY_PER_REQUEST = zero waste
- 🔄 **Atomic counters** — Perfect for XP, coins, streaks, achievements

### Single-Table Design

```
PK: USER#<uuid>    SK: PROFILE         → Anonymous user profile
PK: USER#<uuid>    SK: PROGRESS        → XP, coins, levels, achievements, streaks
PK: USER#<uuid>    SK: CHAR#<uuid>     → Character record (drawing → AI character)
PK: USER#<uuid>    SK: QUEST#<uuid>    → Quest history with completion tracking
PK: USER#<uuid>    SK: SESSION#<uuid>  → Active gameplay state
```

### What We Persist

Every interaction is saved. A child can return days later and see their character gallery, quest history, and achievement progress exactly where they left off.

| Data | DynamoDB Pattern | Purpose |
|------|-----------------|---------|
| User profiles | GetItem (< 5ms) | Anonymous session identity |
| Progress | UpdateItem atomic | XP, coins, levels, streaks |
| Characters | Query begins_with | Gallery of all created characters |
| Quests | Query begins_with | Story history with scores |
| Achievements | Conditional writes | Unlock badges on milestones |

---

## Full AWS Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     VERCEL (v0 Scaffolded • Next.js 14 • CDN)                    │
│  Drawing Canvas • Interactive Quest UI • Gamification • Parent Dashboard         │
│  Vercel Rewrites: /api/* → AWS EC2 (HTTPS proxy)                                │
└──────────────────────────────────────────┬──────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     AWS EC2 (FastAPI Backend • Python)                            │
│  Vision Analyzer • Quest Engine • Scene Illustrator • Content Moderator          │
│  Character Generator • TTS Service • Database Layer • Collab Manager             │
└───────┬───────────────────────┬───────────────────────┬─────────────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌────────────────┐   ┌──────────────────┐   ┌─────────────────────────────────────┐
│ Amazon DynamoDB│   │   Amazon S3      │   │      Amazon Bedrock + Polly         │
│ fablecraft-data│   │ fablecraft-assets│   │                                     │
│ PAY_PER_REQUEST│   │                  │   │  Nova Pro   — Vision + Stories      │
│                │   │ • Character imgs │   │  Nova Canvas— Image Generation      │
│ • Users        │   │ • Scene artwork  │   │  Nova Lite  — Content Moderation    │
│ • Characters   │   │ • TTS audio MP3  │   │  Polly Ruth — Neural Narration      │
│ • Quests       │   │ • Drawings       │   │                                     │
│ • Progress     │   │                  │   │                                     │
│ • Sessions     │   │ Presigned URLs   │   │                                     │
└────────────────┘   └──────────────────┘   └─────────────────────────────────────┘
```

---

## The AI Pipeline (All AWS)

![Quest Flow](https://github.com/Shyamistic/FableCraft/blob/main/docs/gifs/gif2-ezgif.com-video-to-gif-converter.gif?raw=true)
*Full quest flow — 8 interactive scenes generated by Amazon Bedrock*

```
Child's Drawing
     │
     ▼ Amazon Bedrock (Nova Pro) — Vision Analysis
     │ "A purple dragon with golden wings, whimsical style, happy mood"
     │
     ▼ Amazon Bedrock (Nova Canvas) — Character Image
     │ → Illustrated character in children's book art style
     │
     ▼ Amazon Bedrock (Nova Pro) — Story Generation  
     │ → 8 scenes with narratives, questions, and moral choices
     │
     ▼ Amazon Bedrock (Nova Canvas) — Scene Illustrations
     │ → 8 unique scene artworks matching the story
     │
     ▼ Amazon Polly Neural (Ruth, 90% speed)
     │ → Warm narration for each scene, stored in S3
     │
     ▼ Amazon DynamoDB — Persist Everything
       → Character saved, quest saved, progress updated, XP awarded
```

**Cost per quest:** ~$0.08 (Bedrock + S3 + Polly + DynamoDB combined)

---

## Built with Vercel v0

The frontend was **scaffolded with Vercel v0** to rapidly produce production-ready React components:
- Drawing canvas with magic brushes and sticker stamps
- Interactive story quest UI with scene navigation
- Gamification system (XP bars, achievement toasts, streak counters)
- Parent dashboard with PIN protection
- WCAG AA accessible, fully responsive

v0 let us go from concept to polished UI in minutes, then connect directly to a production AWS backend. The same code runs in development and production — no prototyping throwaway.

**Vercel Project:** https://fablecraft-pi.vercel.app  
**Vercel Team ID:** shyamsharma31415-5947s-projects

---

## Features That Make This Shippable

![Scene Gameplay](https://github.com/Shyamistic/FableCraft/blob/main/docs/gifs/gif3-ezgif.com-video-to-gif-converter.gif?raw=true)
*Interactive scene gameplay — choices, rewards, and narration*

### For Children (ages 4-8)
- 🎨 Drawing canvas with magic brushes (rainbow, sparkle, glow, neon) + sticker stamps
- 🤖 AI character generation — every scribble becomes a real storybook character
- 📖 8-scene interactive quests with life lessons and moral choices
- 🔊 Read-aloud narration — Amazon Polly reads so pre-readers can play
- ⭐ Stars & coins for correct answers
- 🏆 10 unlockable achievements ("First Masterpiece", "Perfect Score", "World Traveler")
- 🔥 Daily streaks encouraging regular creative play
- 🎵 Genre-themed background music per story world
- 🗺️ Adventure map showing explored worlds
- 📚 Bookshelf of completed stories
- 👥 Collaborative mode — two kids play one quest together

### For Parents
- 🔒 PIN-protected dashboard (lockout after 5 failed attempts)
- 📊 Progress tracking — quests completed, lessons learned, time spent
- 🛡️ Content safety — AI blocks inappropriate content with child-friendly messages
- 📱 Works on desktop and tablet

---

## Content Safety — Built for Kids

![Content Safety in Action](https://github.com/Shyamistic/FableCraft/blob/main/docs/gifs/gif4-ezgif.com-video-to-gif-converter.gif?raw=true)
*Content moderation powered by Amazon Nova Lite — keeping the experience safe and age-appropriate*

Every input is filtered through **Amazon Bedrock (Nova Lite)**:
- ✅ Drawings analyzed before processing — inappropriate content caught instantly
- ✅ Custom lessons validated for age-appropriateness
- ✅ AI story output filtered for child safety
- ✅ Gentle, shame-free messaging when content is blocked — no scary warnings

**No PII stored.** Anonymous UUIDs only. No accounts required. COPPA-friendly by design.

---

## Monetization (B2C — Ready to Ship)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 2 quests/day, basic brushes, 3 worlds |
| **Explorer** | $4.99/mo | Unlimited quests, all brushes, all worlds, character gallery |
| **Family** | $9.99/mo | Up to 4 kids, parent analytics, downloadable storybooks, animated stories |

### Unit Economics

- **Cost per quest:** ~$0.08 (Bedrock + Polly + S3 + DynamoDB)
- **Explorer at 20 quests/month:** $1.60 COGS → $3.39 profit → **68% gross margin**
- **Family at 4 kids × 15 quests/month:** $4.80 COGS → $5.19 profit → **52% gross margin**
- **Target market:** $7.6B children's educational app market

### Payment Pipeline (Next Sprint)

Our monetization infrastructure is designed for launch:

1. **Stripe Integration** — Subscription billing with family plan support. DynamoDB stores subscription status (`USER#<id> / SUBSCRIPTION`) with TTL for trial expiry.
2. **Usage Metering** — DynamoDB atomic counters track daily quest count. Free tier users hit the limit → upgrade prompt. Zero additional infrastructure needed.
3. **App Store Distribution** — PWA-ready frontend. Apple/Google IAP integration planned for mobile distribution.
4. **B2B Extension** — School/classroom licensing. Bulk DynamoDB provisioning per institution with shared content libraries.

**This isn't a demo — it's a business waiting for a payment form.**

---

## 🚀 What's Next

### Amazon Nova Reel — Animated Storybooks

Our architecture is already prepared for the next evolution:

```
Current Flow:
  Drawing → Character Image → 8 Static Scene Illustrations → Audio Narration

Next Evolution (Nova Reel):
  Drawing → Character Image → 8 Animated Scene Clips → Audio Narration
  
  Each scene: illustration + narrative prompt → 6-second animated clip
  8 scenes × 6 seconds = ~48 second personalized animated storybook
```

A child draws a dragon. Minutes later, they're watching a **fully animated short film** starring their dragon, teaching them about kindness — entirely generated by AWS. No animators. No studios. Just a child's imagination + Amazon Nova Reel.

This positions Fablecraft as the **first platform to transform children's drawings into complete animated short films**.

### Full Roadmap

| Timeline | Feature | AWS Service |
|----------|---------|-------------|
| **Next** | Animated story scenes | Amazon Nova Reel |
| **Q3** | Stripe payment integration | DynamoDB (subscription tracking) |
| **Q3** | Story export as PDF/video | S3 + Lambda |
| **Q4** | Difficulty levels (age-adaptive) | Bedrock fine-tuning |
| **Q4** | Multiplayer co-creation (real-time) | DynamoDB Streams + WebSocket |
| **2027** | School/classroom B2B licensing | DynamoDB multi-tenant |
| **2027** | Multi-language support | Amazon Translate + Polly |
| **2027** | Global launch (10+ regions) | DynamoDB Global Tables |

---

## What We Learned

1. **Kids don't need simpler AI — they need AI that respects their creativity.** The magic is when a child sees their scribble become a real character. Personal > powerful.

2. **DynamoDB's speed matters more than you think for kids' apps.** A 5-year-old won't wait 2 seconds for their progress to load. Single-digit ms latency keeps the magic instant.

3. **v0 + AWS is the zero-to-production stack.** Frontend scaffolded in minutes, connected to production databases on day one. No throwaway prototypes.

---

## Built With

`amazon-dynamodb` `amazon-bedrock` `amazon-nova-pro` `amazon-nova-canvas` `amazon-nova-lite` `amazon-polly` `amazon-s3` `amazon-ec2` `vercel` `v0` `next.js` `react` `typescript` `tailwind-css` `fastapi` `python`

---

**🔗 Vercel:** [https://fablecraft-pi.vercel.app](https://fablecraft-pi.vercel.app)  
**📂 GitHub:** [https://github.com/Shyamistic/FableCraft](https://github.com/Shyamistic/FableCraft)  
**🎬 Video:** [https://youtu.be/NEK5weMjHb4](https://youtu.be/NEK5weMjHb4)  
**👤 Team:** Shyam Sharma  

---

*Track 1: Monetizable B2C App | AWS Database: Amazon DynamoDB | #H0Hackathon*
