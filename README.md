<p align="center">
  <img src="frontend/public/logo-placeholder.svg" alt="Fablecraft Logo" width="80" />
</p>

<h1 align="center">Fablecraft</h1>

<p align="center">
  <strong>Turn your child's drawings into AI-powered interactive story adventures that teach real life lessons.</strong>
</p>

<p align="center">
  <a href="https://fablecraft-pi.vercel.app">🔗 Live Demo (Vercel)</a> •
  <a href="#">🎬 Demo Video</a> •
  <a href="#">📋 Devpost</a>
</p>

---

## H0 Hackathon — Track 1: Monetizable B2C App

> **AWS Database:** Amazon DynamoDB (PAY_PER_REQUEST, single-table design)  
> **Frontend:** Vercel (Next.js 14)  
> **Backend:** FastAPI on AWS EC2  
> **AI:** Amazon Bedrock (Nova Pro, Nova Canvas) + Amazon Polly Neural  

---

## The Problem

Kids spend 3+ hours daily on screens — but almost none of it is creative. They watch, scroll, and tap — but rarely **create**.

**Fablecraft asks:** What if a 5-year-old's drawing session could become a personalized AI storybook that teaches them about sharing, honesty, or being brave?

We don't replace creativity with AI — we **amplify** it. The child draws. The AI responds. Together they make something neither could alone.

---

## How It Works

| Step | What Happens | AWS Service |
|------|-------------|-------------|
| 🖌️ **Draw** | Child draws on canvas or uploads a photo | — |
| ✨ **Generate** | AI creates an animated character from the drawing | **Amazon Bedrock (Nova Pro)** — Vision Analysis |
| 🎨 **Illustrate** | Character image generated in children's book style | **Amazon Bedrock (Nova Canvas)** — Image Generation |
| 📖 **Learn** | Pick a life lesson (sharing, kindness, courage...) | **Amazon Bedrock (Nova Lite)** — Content Moderation |
| 🌍 **Explore** | Choose a world: Fantasy, Space, Underwater, Jungle | — |
| 🎮 **Play** | 8-scene interactive quest with choices & consequences | **Amazon Bedrock (Nova Pro)** — Story Generation |
| 🔊 **Listen** | AI narrates every scene aloud with expressive voice | **Amazon Polly Neural** — Text-to-Speech |
| 💾 **Save** | All progress, characters, and quests persisted | **Amazon DynamoDB** — Data Persistence |
| 📦 **Store** | Generated images and audio stored securely | **Amazon S3** — Asset Storage |

---

## AWS Services Used

### 🗄️ Amazon DynamoDB (Primary Database)

Our core data store using **single-table design** for maximum efficiency:

```
PK: USER#<uuid>    SK: PROFILE         → User profile (anonymous, privacy-first)
PK: USER#<uuid>    SK: PROGRESS        → XP, coins, levels, achievements, streaks
PK: USER#<uuid>    SK: CHAR#<uuid>     → Character records (drawing → AI character)
PK: USER#<uuid>    SK: QUEST#<uuid>    → Quest history with completion tracking
PK: USER#<uuid>    SK: SESSION#<uuid>  → Active gameplay state
```

**Why DynamoDB:**
- **Serverless** — Zero provisioning, scales from 0 to millions of requests/sec automatically
- **Single-digit ms latency** — Critical for children's apps where engagement = response speed
- **PAY_PER_REQUEST** — Pay nothing when idle, pennies at hackathon scale, dollars at millions of users
- **Global Tables** — One-click multi-region when scaling internationally

### 🧠 Amazon Bedrock

| Model | Purpose | Why |
|-------|---------|-----|
| **Amazon Nova Pro** | Vision analysis (drawing → description) | Best multimodal understanding for children's art |
| **Amazon Nova Pro** | Quest story generation (8 interactive scenes) | Creative, safe, structured output |
| **Amazon Nova Lite** | Content moderation (age-appropriateness) | Fast, cost-efficient safety checks |
| **Amazon Nova Canvas** | Character & scene illustration | Native AWS image generation, no external APIs needed |

### 🔊 Amazon Polly Neural

- **Voice:** Ruth (Neural engine) — warm, expressive narration perfect for children
- **Speaking Rate:** 90% (slightly slower for young listeners)
- **Output:** MP3 stored in S3 with presigned URLs

### 📦 Amazon S3

- Generated character images
- Scene illustrations (8 per quest)
- TTS audio files
- Original child drawings
- Presigned URLs (1-hour expiry for security)

### 🖥️ Amazon EC2

- Hosts the FastAPI backend
- IAM Role: `fablecraft-ec2-role` with scoped permissions
- Auto-restarts via Docker `--restart unless-stopped`

---

## 🚀 Future: Amazon Nova Reel (Animated Stories)

Our next feature will use **Amazon Nova Reel** to transform static story scenes into short animated video clips, creating a fully animated storybook experience. The architecture is already prepared:

```
Scene Illustration → Nova Reel → 6-second animated clip per scene
8 scenes × 6 seconds = ~48 second animated story video
```

This will make Fablecraft the first AI-powered app that turns a child's drawing into a complete animated short film with narration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VERCEL (Frontend Deployment)                          │
│  Next.js 14 + React 18 + TypeScript + Tailwind CSS                          │
│  Drawing Canvas • Story UI • Gamification • Parent Dashboard                 │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │ API (proxied via Vercel Rewrites)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AWS EC2 (FastAPI Backend)                                │
│  Vision Analyzer • Quest Engine • Scene Illustrator • Content Moderator      │
│  TTS Service • User Management • Progress Tracking                           │
└────────┬──────────────────────┬──────────────────────┬──────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────────────┐
│ Amazon DynamoDB  │  │   Amazon S3      │  │   Amazon Bedrock + Polly       │
│ fablecraft-data  │  │ fablecraft-assets│  │   Nova Pro (Vision + Story)    │
│                  │  │                  │  │   Nova Canvas (Images)         │
│ Users, Progress  │  │ Images, Audio    │  │   Nova Lite (Moderation)       │
│ Characters,      │  │ Drawings         │  │   Polly Neural (TTS)           │
│ Quests, Sessions │  │                  │  │                                │
└─────────────────┘  └──────────────────┘  └────────────────────────────────┘
```

---

## Content Safety — Built for Kids

Every input is filtered through **Amazon Bedrock (Nova Lite)** content moderation:
- Drawings analyzed for inappropriate content before processing
- Custom lessons validated for age-appropriateness
- AI story output filtered for child safety
- Gentle, shame-free feedback when content is blocked

---

## Monetization Strategy (B2C)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 2 quests/day, basic brushes, 3 worlds |
| **Explorer** | $4.99/mo | Unlimited quests, all brushes, all worlds, character gallery |
| **Family** | $9.99/mo | Up to 4 kids, parent analytics, downloadable storybooks, animated stories |

**Target Market:** $7.6B children's educational app market  
**Unit Economics:** ~$0.08/quest (Bedrock + S3 + Polly + DynamoDB) → 60x margin on Explorer tier

---

## Running Locally

### Prerequisites
- Python 3.11+, Node.js 18+
- AWS account with Bedrock model access (Nova Pro, Nova Canvas, Nova Lite)
- AWS CLI configured (`aws configure`)

### Backend
```bash
cd agents_service
pip install -r requirements.txt
python setup_dynamodb.py          # Creates DynamoDB table
uvicorn main:app --host 0.0.0.0 --port 8080
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Deploy Frontend to Vercel
```bash
cd frontend
npx vercel --prod
```

---

## Environment Variables

See `agents_service/.env.example` for all configuration options. Key AWS settings:

```env
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=fablecraft-data
S3_BUCKET_NAME=fablecraft-assets
BEDROCK_VISION_MODEL=amazon.nova-pro-v1:0
BEDROCK_QUEST_MODEL=amazon.nova-pro-v1:0
BEDROCK_MODERATION_MODEL=amazon.nova-lite-v1:0
BEDROCK_IMAGE_MODEL=amazon.nova-canvas-v1:0
POLLY_VOICE_ID=Ruth
POLLY_ENGINE=neural
```

---

## Submission Checklist

- [x] **AWS Database:** Amazon DynamoDB (`fablecraft-data`, PAY_PER_REQUEST)
- [x] **Frontend:** Deployed on Vercel (https://fablecraft-pi.vercel.app)
- [x] **Architecture Diagram:** Included above
- [x] **Demo Video:** [YouTube Link](#)
- [x] **AWS Database Screenshot:** DynamoDB console with live data
- [x] **Track:** Monetizable B2C App (EdTech for families)
- [x] **Working Application:** Full end-to-end flow operational

---

## Built With

- **Amazon DynamoDB** — User data persistence
- **Amazon Bedrock** (Nova Pro, Nova Canvas, Nova Lite) — AI backbone
- **Amazon Polly Neural** — Text-to-speech narration
- **Amazon S3** — Asset storage
- **Amazon EC2** — Backend hosting
- **Vercel** — Frontend deployment
- **Next.js 14** — React framework
- **FastAPI** — Python API framework
- **TypeScript** — Type-safe frontend

---

<p align="center">
  Built with ❤️ for the <strong>H0: Hack the Zero Stack with Vercel v0 and AWS Databases</strong> hackathon.
  <br/>
  #H0Hackathon
</p>
