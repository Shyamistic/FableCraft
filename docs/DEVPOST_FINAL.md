# Fablecraft

### Turn your child's drawings into AI-powered interactive story adventures that teach real life lessons.

---

> Kids spend 3+ hours daily on screens — but almost none of it is creative. **Fablecraft changes that.** A child draws anything. AI transforms it into a personalized, illustrated storybook that teaches kindness, courage, and honesty — narrated aloud, driven entirely by their imagination.

---

## 🎬 Demo

[![Watch Demo](https://img.youtube.com/vi/Ue89uc2zHyU/maxresdefault.jpg)](https://youtu.be/Ue89uc2zHyU)

**🔗 Live:** [http://54.88.159.186:3000](http://54.88.159.186:3000) &nbsp;&nbsp;|&nbsp;&nbsp; **📂 Code:** [GitHub](https://github.com/Shyamistic/Fable-Craft)

---

## The Problem Worth Solving

Every parent feels it: their child is glued to a screen, consuming endless content — but creating nothing.

**Fablecraft asks:** What if a 5-year-old's drawing session could become a personalized AI storybook that teaches them about sharing, honesty, or being brave?

We don't replace creativity with AI — we **amplify** it. The child draws. The AI responds. Together they make something neither could alone.

---

## How It Works

**1. Draw** → Child draws on canvas or uploads a photo
**2. Generate** → AI creates an animated character from the drawing
**3. Learn** → Pick a life lesson (sharing, kindness, courage...)
**4. Explore** → Choose a world: Fantasy, Space, Underwater, or Jungle
**5. Play** → 8-scene interactive quest with choices and rewards
**6. Listen** → AI narrates every scene aloud

![AI Character Generation](https://github.com/Shyamistic/Fable-Craft/blob/main/docs/pictures/Screenshot%20(5235).png?raw=true)
*A child's drawing transformed into an animated character by AI*

---

## Content Safety — Built for Kids

Fablecraft blocks inappropriate content automatically. If a child draws something unsuitable, the AI catches it and responds with a gentle, child-friendly message — no shaming, no scary warnings.

![Content Safety](https://github.com/Shyamistic/Fable-Craft/blob/main/docs/pictures/Screenshot%20(5230).png?raw=true)
*Content moderation in action — keeping the experience safe and friendly*

---

## Architecture

```
Frontend (Next.js 14)  ──►  Backend (FastAPI)  ──►  AI Services
     │                           │                      │
     │ Drawing Canvas            │ Vision Analyzer      │ Amazon Bedrock (Claude/Nova)
     │ Gamification              │ Quest Engine         │ Gemini (Image Gen)
     │ Audio Manager             │ Scene Illustrator    │ ClipDrop (Stability AI)
     │ Accessibility             │ Content Moderator    │ Amazon Polly (TTS)
     │                           │                      │
     └── Novus.ai (Analytics) ◄──┴── Amazon S3 ◄───────┘
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Next.js 14, TypeScript, Tailwind | Drawing canvas, story UI, gamification |
| Backend | FastAPI, Python | AI orchestration, content safety |
| AI Text | Amazon Bedrock (Claude, Nova) | Story generation, vision analysis |
| AI Images | Gemini 2.5 Flash, ClipDrop | Character & scene illustrations |
| Voice | Amazon Polly (Neural) | Text-to-speech narration |
| Storage | Amazon S3 | All generated assets |
| Analytics | Novus.ai | Auto-instrumented user insights |

---

## Features

**For Children (ages 4-8):**
- 🎨 Magic brushes (rainbow, sparkle, glow, neon) + sticker stamps
- 🤖 AI character generation from any drawing
- 📖 8-scene interactive quests with life lessons
- 🔊 AI narration — reads the story aloud
- ⭐ Stars, XP, levels, streaks, and 10 achievements
- 🗺️ Adventure map showing explored worlds
- 🎵 Genre-themed background music

**For Parents:**
- 🔒 PIN-protected dashboard
- 📊 Progress tracking (quests, lessons, time)
- 🛡️ Content safety (blocks violence/weapons automatically)
- 📚 Bookshelf of completed stories

---

## Novus.ai — Our Analytics Partner

Novus connected to our GitHub repo and **auto-instrumented the entire product** — zero manual tagging.

![Novus Dashboard](https://github.com/Shyamistic/Fable-Craft/blob/main/docs/pictures/Screenshot%20(5230).png?raw=true)

**Auto-detected:**
- **8 Product Areas** — Home, Character Creation, Quest Setup, Story Adventure, Gallery, Collaborative Play, Parent Dashboard, Progress & Rewards
- **2 User Personas** — Child (Primary) and Parent (Oversight)
- **5 Key Flows** — Drawing → generation → quest completion pipelines
- **5 Integrations** — Bedrock, Polly, S3, CloudFront, Novus

Novus tells us where children engage most, which lessons are popular, and where they drop off — before we even ask. It's analytics that reads your codebase, not just your clicks.

---

## What We Learned

1. **Kids don't need simpler AI — they need AI that respects their creativity.** The magic moment is seeing a scribble become a real character. Personal > powerful.

2. **Shipping beats polishing.** A stranger can click the link right now and create a story. That's the bar.

3. **Novus removed the "did anyone use it?" anxiety.** Auto-instrumented analytics from day one meant we shipped with confidence.

---

## What's Next

- Character customization with AI suggestions
- Story export as printable PDF
- Animated scenes via video AI
- Difficulty levels (ages 4-5, 5-6, 6-8)
- Seasonal themed content

---

## Built With

`next.js` `react` `typescript` `tailwind-css` `fastapi` `python` `amazon-bedrock` `amazon-polly` `amazon-s3` `gemini` `clipdrop` `novus-ai` `aws-ec2`
