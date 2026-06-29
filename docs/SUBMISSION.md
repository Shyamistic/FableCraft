# Hackathon Submission Materials

---

## YouTube Video Description

```
🎨 Fablecraft — Turn Your Drawings Into Magical Story Adventures

Kids spend hours consuming content. Fablecraft makes them the creators.

A child draws anything — a monster, a cat, a scribble. Fablecraft's AI transforms it into an animated character, then generates a fully illustrated, narrated 8-scene interactive quest that teaches real life lessons like kindness, honesty, and courage.

This isn't a toy. It's what happens when you take generative AI seriously for children's education.

🔗 Try it live: http://54.88.159.186:3000
📂 GitHub: https://github.com/Shyamistic/Fable-Craft

Built for World Product Day 2026 (Mind the Product × Novus.ai Hackathon)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW IT WORKS:
1. 🖌️ Draw — Child draws on a digital canvas (or uploads a photo)
2. ✨ Generate — AI creates an animated character from the drawing
3. 📖 Learn — Pick a life lesson (sharing, kindness, courage...)
4. 🌍 Explore — Choose a story world (Fantasy, Space, Underwater, Jungle)
5. 🎮 Play — 8-scene interactive quest with questions & rewards
6. 🔊 Listen — AI narration reads the story aloud

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FEATURES:
• AI character generation from children's drawings
• 8-scene interactive story quests with life lessons
• Text-to-speech narration (Amazon Polly Neural)
• Genre-themed backgrounds and music
• Gamification: XP, levels, streaks, achievements
• Magic brush effects (rainbow, sparkle, glow, neon)
• Sticker stamps for the drawing canvas
• Weekly challenges and adventure map
• Parent dashboard with PIN protection
• Collaborative multiplayer mode
• Content safety filtering (blocks inappropriate content)
• Novus.ai analytics for user behavior insights

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TECH STACK:
• Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS
• Backend: FastAPI, Python
• AI: Amazon Bedrock (Claude, Nova), Gemini, ClipDrop
• Voice: Amazon Polly (Neural/Generative)
• Storage: Amazon S3
• Analytics: Novus.ai (Pendo)
• Hosting: AWS EC2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TIMESTAMPS:
0:00 - Introduction & Problem
0:30 - Drawing a character
1:15 - AI character generation
2:00 - Choosing a lesson & genre
2:45 - Playing through the quest
4:00 - Gamification & rewards
4:45 - Music & narration
5:15 - Parent dashboard
5:45 - Novus.ai analytics
6:00 - Summary & vision

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#Fablecraft #AIforKids #EdTech #GenerativeAI #WorldProductDay #MindTheProduct #NovusAI #EveryoneShipsNow #Hackathon
```

---

## Devpost Submission

### Project Name
**Fablecraft**

### Tagline (one-liner)
Turn your child's drawings into AI-powered interactive story adventures that teach real life lessons.

### Inspiration (What problem are you solving?)

Children ages 4-8 spend an average of 3+ hours daily on screens — but almost all of it is passive consumption. They watch, they scroll, they tap — but they rarely *create*. Every parent feels this tension: screens are unavoidable, but most screen time produces nothing meaningful.

We asked: **What if screen time could be creative time?** What if a child's 20-minute drawing session could transform into a personalized, AI-generated storybook that teaches them about kindness, courage, or honesty — narrated aloud, illustrated beautifully, and driven by their own imagination?

That's Fablecraft. It doesn't replace creativity with AI — it amplifies it. The child draws. The AI responds. Together they create something neither could alone.

### What it does

Fablecraft transforms a child's hand-drawn artwork into a fully illustrated, narrated, interactive 8-scene story quest.

**The flow:**
1. **Draw** — The child draws anything on a digital canvas (or uploads a photo of their artwork)
2. **Generate** — AI analyzes the drawing and creates an animated character version
3. **Learn** — The child (or parent) picks a life lesson: sharing, kindness, honesty, courage, etc.
4. **Explore** — Choose a story world: Fantasy Kingdom, Outer Space, Underwater World, or Jungle Safari
5. **Play** — An 8-scene interactive quest unfolds with questions, choices, and consequences
6. **Listen** — Every scene is narrated aloud with AI-generated speech

Each quest teaches the chosen lesson through story — showing characters facing real moral choices and experiencing natural consequences. It's structured learning wrapped in pure play.

### How we built it

**Frontend:** Next.js 14 with TypeScript, Tailwind CSS, and Framer Motion animations. Fully responsive for desktop and tablet. Custom drawing canvas with magic brush effects, stickers, and undo support.

**Backend:** FastAPI (Python) orchestrating multiple AI services:
- **Amazon Bedrock** (Claude/Nova) — Character analysis, quest generation, content moderation
- **Gemini + ClipDrop** — Character and scene illustration generation
- **Amazon Polly** (Neural/Generative voices) — Text-to-speech narration
- **Amazon S3** — Asset storage

**Analytics:** Novus.ai (Pendo) is integrated and actively tracking user flows, product areas, and engagement patterns. Novus auto-detected 8 product areas, 2 user personas, 5 key flows, and 5 integrations from our codebase — giving us immediate insight into how children interact with each feature.

**Gamification:** XP system, level progression, daily streaks, 10 unlockable achievements, weekly challenges, adventure map, and a bookshelf of completed stories.

**Safety:** Content moderation blocks inappropriate drawings and custom lesson topics. Parent dashboard is PIN-protected. All data is anonymous (COPPA-compliant). No accounts required.

### How Novus.ai powers our product decisions

Novus connected to our GitHub repo and immediately understood our product:
- **8 Product Areas** auto-detected: Home, Character Creation, Quest Setup, Story Adventure, Character Gallery, Collaborative Play, Parent Dashboard, Progress & Rewards
- **2 User Personas** identified: Child (Primary User) with permissions mapped, Parent (Oversight User) with dashboard access
- **5 Key Flows** tracked: Character creation → quest completion pipeline
- **5 Integrations** recognized: Amazon Bedrock (2), Amazon Polly, S3 + CloudFront, Novus.ai itself

This gives us real data on where children drop off, which lessons are most popular, how long quests take, and which features drive repeat usage — all without manual instrumentation. Novus tells us what's working before we have to ask.

### Challenges we ran into

- **Quest generation speed** — AI-generated 8-scene stories with illustrations take 2-3 minutes. We optimized with parallel image generation and loading states that keep kids engaged.
- **Content safety for kids** — Every drawing and custom lesson passes through content moderation. Weapons, violence, and inappropriate content are blocked with child-friendly messages.
- **Audio ducking** — Background music must lower during narration so kids hear the story clearly. We built custom audio management with narration-start/end events.
- **S3 presigned URL expiry** — Generated character images expire after 1 hour. We mitigate with session-based usage patterns.

### What we learned

1. **Kids don't need simpler AI — they need AI that respects their creativity.** The magic moment is when a child sees their scribble transformed into a real character. That's not about the AI being powerful — it's about the AI being personal.
2. **Product analytics for kids' apps is different.** With Novus, we can see engagement without tracking identity. No PII, no cookies, no accounts — just anonymous behavioral patterns that tell us which features matter.
3. **Shipping > polishing.** We could have spent another month perfecting animations. Instead we shipped something a real child can use today. That's the point.

### What's next for Fablecraft

- **Character customization with AI suggestions** — "Make it more colorful", "Add a cape"
- **Story export as PDF/video** — Shareable storybooks parents can print
- **Multiplayer story co-creation** — Two kids building a story together in real-time
- **Animation via video AI** — Turn illustrated scenes into short animated clips
- **Difficulty levels** — Easy (ages 4-5), Medium (5-6), Advanced (6-8)
- **Seasonal content** — Halloween quests, holiday stories, themed challenges

### Built With

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- FastAPI
- Python
- Amazon Bedrock (Claude, Nova)
- Amazon Polly
- Amazon S3
- Gemini (Image Generation)
- ClipDrop (Stability AI)
- Novus.ai (Pendo)
- AWS EC2

### Try it out

🔗 **Live URL:** http://54.88.159.186:3000
📂 **GitHub:** https://github.com/Shyamistic/Fable-Craft

### Team

Shyam Sharma — Product, Engineering, Design
