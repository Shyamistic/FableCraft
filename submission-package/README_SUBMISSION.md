# Fablecraft — H0 Hackathon Submission Package

## Contents of this ZIP

| File | Purpose |
|------|---------|
| `README_SUBMISSION.md` | This file — submission overview |
| `JUDGES_GUIDE.md` | Detailed testing instructions and technical deep-dive |
| `ARCHITECTURE.md` | Full AWS architecture with diagrams |
| `DEVPOST_H0_DESCRIPTION.md` | Complete Devpost description text |
| `YOUTUBE_DESCRIPTION.md` | YouTube video description |

## Quick Reference

| Item | Value |
|------|-------|
| **Live App** | https://fablecraft-pi.vercel.app |
| **Demo Video** | https://youtu.be/NEK5weMjHb4 |
| **GitHub** | https://github.com/Shyamistic/FableCraft |
| **Track** | Monetizable B2C App |
| **AWS Database** | Amazon DynamoDB (`fablecraft-data`, us-east-1) |
| **Vercel Team** | shyamsharma31415-5947s-projects |
| **Submitter** | Shyam Sharma (Individual) |
| **Country** | India |

## AWS Services Used

1. **Amazon DynamoDB** — Primary database (PAY_PER_REQUEST, single-table design)
2. **Amazon Bedrock** — Nova Pro (vision + stories), Nova Canvas (images), Nova Lite (moderation)
3. **Amazon Polly Neural** — Text-to-speech narration (Ruth voice)
4. **Amazon S3** — Asset storage (fablecraft-assets bucket)
5. **Amazon EC2** — Backend hosting (Docker + FastAPI)

## What Makes This Submission Special

- **Not a demo — a shippable product.** Real monetization model, real unit economics, real users can sign up today.
- **100% AWS AI backbone.** Every AI operation runs on Amazon Bedrock (Nova family). No third-party AI APIs required.
- **DynamoDB is production-grade.** Single-table design, atomic counters, PAY_PER_REQUEST — ready to scale from 0 to millions.
- **v0 + Vercel frontend.** Scaffolded in minutes, deployed in seconds, proxied to AWS backend.
- **Content safety built-in.** Every input filtered through Nova Lite — this is a children's app that takes safety seriously.

---

*Created for the H0: Hack the Zero Stack with Vercel v0 and AWS Databases hackathon. #H0Hackathon*
