# Fablecraft

## Turn your child's drawings into AI-powered interactive story adventures that teach real life lessons.

---

> **Kids spend 3+ hours daily on screens — but almost none of it is creative.** Fablecraft changes that. A child draws anything. AI transforms it into a personalized, illustrated storybook that teaches kindness, courage, and honesty — narrated aloud, driven by their imagination.

---

## 🎬 Demo Video

[![Fablecraft Demo](https://img.youtube.com/vi/Ue89uc2zHyU/maxresdefault.jpg)](https://youtu.be/Ue89uc2zHyU)

**▶️ Watch the full demo:** [https://youtu.be/Ue89uc2zHyU](https://youtu.be/Ue89uc2zHyU)

---

## 🔗 Try It Live

**[http://54.88.159.186:3000](http://54.88.159.186:3000)**

*Best on desktop/tablet. Character generation ~15s, Quest generation ~2-3 min.*

---

## The Problem

Every parent knows the feeling: your child is glued to a screen, consuming endless content — but creating nothing. Passive screen time produces audiences, not authors.

**The question we asked:** What if a 5-year-old's 20-minute drawing session could become a personalized AI storybook that teaches them about sharing, honesty, or being brave?

## The Solution

Fablecraft doesn't replace creativity with AI — it **amplifies** it. The child draws. The AI responds. Together they create something neither could alone.

![Quest in action](https://github.com/Shyamistic/Fable-Craft/blob/main/docs/gifs/gif2-ezgif.com-video-to-gif-converter.gif?raw=true)

---

## How It Works

| Step | What Happens | AI Magic |
|------|-------------|----------|
| 🖌️ **Draw** | Child draws on canvas or uploads a photo | — |
| ✨ **Generate** | AI analyzes the drawing | Vision AI extracts traits, generates animated character |
| 📖 **Learn** | Pick a life lesson (sharing, kindness, courage...) | Content moderation validates safety |
| 🌍 **Explore** | Choose a world: Fantasy, Space, Underwater, Jungle | — |
| 🎮 **Play** | 8-scene interactive quest with choices | LLM generates story, illustrator creates scenes |
| 🔊 **Listen** | Every scene narrated aloud | Neural text-to-speech |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FABLECRAFT ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────────────────────┐  │
│  │   Frontend   │  REST   │        Backend (FastAPI)      │  │
│  │  Next.js 14  │ ──────► │                              │  │
│  │  React 18    │         │  ┌─────────┐  ┌──────────┐  │  │
│  │  TypeScript  │         │  │ Vision  │  │  Quest   │  │  │
│  │  Tailwind    │         │  │Analyzer │  │ Engine   │  │  │
│  └──────────────┘         │  └────┬────┘  └────┬─────┘  │  │
│         │                 │       │             │        │  │
│         │                 │  ┌────▼────┐  ┌────▼─────┐  │  │
│  ┌──────▼──────┐         │  │Character│  │  Scene   │  │  │
│  │ Gamification│         │  │Generator│  │Illustrator│ │  │
│  │ XP/Levels   │         │  └────┬────┘  └────┬─────┘  │  │
│  │ Achievements│         │       │             │        │  │
│  │ Streaks     │         │  ┌────▼─────────────▼─────┐  │  │
│  └─────────────┘         │  │     AI Services        │  │  │
│                           │  │  • Amazon Bedrock      │  │  │
│  ┌─────────────┐         │  │  • Gemini (Images)     │  │  │
│  │   Audio     │         │  │  • ClipDrop (Stability)│  │  │
│  │ Background  │         │  │  • Amazon Polly (TTS)  │  │  │
│  │ Music + TTS │         │  └────────────┬───────────┘  │  │
│  │ Duck/Unduck │         │               │              │  │
│  └─────────────┘         │  ┌────────────▼───────────┐  │  │
│                           │  │     Amazon S3          │  │  │
│                           │  │  (Asset Storage)       │  │  │
│                           │  └────────────────────────┘  │  │
│                           └──────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Novus.ai (Analytics)                      │   │
│  │  Auto-instrumented • 8 Product Areas • 2 Personas     │   │
│  │  5 Key Flows • Session Replay • Zero manual tagging   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features That Make This a Real Product

### For Children (ages 4-8)
- 🎨 **Drawing Canvas** with magic brushes (rainbow, sparkle, glow, neon) and stickers
- 🤖 **AI Character Generation** — every scribble becomes a real character
- 📖 **Interactive Quests** — 8 scenes with questions, choices, and life lessons
- 🔊 **Read-Aloud Narration** — AI reads the story so pre-readers can play
- ⭐ **Stars & Rewards** — earn coins for correct answers
- 🏆 **Achievements** — "First Masterpiece", "World Traveler", "Perfect Score"
- 🔥 **Daily Streaks** — encourages regular creative play
- 🎵 **Genre Music** — themed background tracks that change per world

### For Parents
- 🔒 **PIN-Protected Dashboard** — see progress without child accessing settings
- 📊 **Progress Tracking** — quests completed, lessons learned, time spent
- 🛡️ **Content Safety** — AI blocks violence, weapons, inappropriate content with kid-friendly messages
- 📚 **Bookshelf** — history of all completed stories

---

## Novus.ai Integration

Novus connected to our GitHub repository and **auto-instrumented the entire product without a single line of manual tagging**.

![Novus Dashboard](https://github.com/Shyamistic/Fable-Craft/blob/main/docs/novus-dashboard.png?raw=true)

**What Novus detected automatically:**
- **8 Product Areas**: Home, Character Creation, Quest Setup, Story Adventure, Character Gallery, Collaborative Play, Parent Dashboard, Progress & Rewards
- **2 User Personas**: Child (Primary User) with full permissions mapped, Parent (Oversight User) with dashboard access
- **5 Key Flows**: End-to-end user journeys from drawing to quest completion
- **5 Integrations**: Amazon Bedrock (2), Amazon Polly, S3 + CloudFront, Novus.ai

**Why this matters for product decisions:**
Novus tells us *where children drop off*, which lessons are most popular, how long quests take, and which features drive repeat usage — all without manual instrumentation. It's analytics that understands our codebase, not just our clicks.

---

## What We Learned Shipping This

1. **Kids don't need simpler AI — they need AI that respects their creativity.** The magic moment is when a child sees their scribble transformed into a real character. That's not about the AI being powerful — it's about the AI being *personal*.

2. **Shipping beats polishing.** We could have spent another month perfecting animations. Instead we shipped something a real child can use today. A stranger can click the link right now and create a story. That's the point.

3. **Novus removed the "did anyone use it?" anxiety.** Knowing we had auto-instrumented analytics from day one meant we could ship confidently — any real user interaction would be captured and understood without us scrambling to add tracking events.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python, Pydantic |
| AI (Text) | Amazon Bedrock (Claude, Nova Pro/Lite) |
| AI (Images) | Gemini 2.5 Flash, ClipDrop (Stability AI) |
| AI (Voice) | Amazon Polly (Neural/Generative) |
| Storage | Amazon S3 |
| Analytics | Novus.ai (auto-instrumented via Pendo) |
| Hosting | AWS EC2 |

---

## What's Next

- **Character customization** — AI suggestions: "Add a cape", "Make it more colorful"
- **Story export as PDF** — printable storybooks for bedtime reading
- **Animation via video AI** — illustrated scenes become short animated clips
- **Difficulty levels** — Easy (ages 4-5), Medium (5-6), Advanced (6-8)
- **Seasonal content** — Halloween quests, holiday stories

---

## Built With

`next.js` `react` `typescript` `tailwind-css` `fastapi` `python` `amazon-bedrock` `amazon-polly` `amazon-s3` `gemini` `clipdrop` `novus-ai` `aws`

---

**GitHub:** [https://github.com/Shyamistic/Fable-Craft](https://github.com/Shyamistic/Fable-Craft)
**Live:** [http://54.88.159.186:3000](http://54.88.159.186:3000)
**Video:** [https://youtu.be/Ue89uc2zHyU](https://youtu.be/Ue89uc2zHyU)
