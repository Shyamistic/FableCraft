# Devpost Submission — H0 Hackathon

## Project Name
Fablecraft

## Tagline
Turn your child's drawings into AI-powered interactive story adventures that teach real life lessons.

## Track
Track 1: Monetizable B2C App (EdTech)

## AWS Database Used
**Amazon DynamoDB** — PAY_PER_REQUEST billing, single-table design storing users, characters, quests, progress, and sessions. Chosen for serverless scaling (0 to millions), single-digit ms latency critical for children's engagement, and Global Tables readiness for international expansion.

## Text Description (for submission field)

Fablecraft transforms children's drawings into personalized, narrated, interactive story adventures that teach moral lessons — all powered by AWS.

**AWS Database: Amazon DynamoDB (PAY_PER_REQUEST, single-table design)**

A child draws anything on our canvas. Amazon Nova Pro (via Bedrock) analyzes the drawing and describes the character. Amazon Nova Canvas generates an illustrated version. The child picks a life lesson and story world. Nova Pro generates an 8-scene interactive quest with choices and consequences. Nova Canvas illustrates every scene. Amazon Polly Neural narrates it aloud. Amazon DynamoDB persists every character, quest, and achievement with single-digit millisecond latency.

**Full AWS Stack:**
- Amazon DynamoDB — User persistence, progress tracking, character gallery, quest history
- Amazon Bedrock (Nova Pro) — Vision analysis + story generation
- Amazon Bedrock (Nova Canvas) — Image generation (characters + scenes)
- Amazon Bedrock (Nova Lite) — Content moderation (child safety)
- Amazon Polly Neural — Text-to-speech (Voice: Ruth, 90% speed)
- Amazon S3 — Asset storage (presigned URLs, 1hr expiry)
- Amazon EC2 — Backend hosting with IAM role-based access

**Monetization:** Free tier (2 quests/day) → Explorer $4.99/mo → Family $9.99/mo. Unit cost ~$0.08/quest = 60x margin.

**Next Feature:** Amazon Nova Reel for animated story videos.

## Links

- **Vercel Project:** https://fablecraft-pi.vercel.app
- **GitHub:** https://github.com/Shyamistic/FableCraft
- **Demo Video:** [YouTube Link]
- **Vercel Team ID:** shyamsharma31415-5947s-projects

## Built With

- Amazon DynamoDB
- Amazon Bedrock
- Amazon Nova Pro
- Amazon Nova Canvas  
- Amazon Nova Lite
- Amazon Polly
- Amazon S3
- Amazon EC2
- Vercel
- Next.js
- React
- TypeScript
- Tailwind CSS
- FastAPI
- Python
