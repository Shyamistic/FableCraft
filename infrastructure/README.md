# Fablecraft AWS Infrastructure

This directory contains the deployment configuration for the Fablecraft application on AWS.

## Architecture

- **Frontend**: AWS Amplify (Next.js SSR hosting)
- **Backend**: ECS Fargate (containerized FastAPI)
- **Load Balancer**: Application Load Balancer with HTTPS termination
- **Routing**: ALB routes `/api/*` and `/ws/*` to ECS; Amplify serves the frontend

## Files

| File | Purpose |
|------|---------|
| `cloudformation.yml` | Full CloudFormation stack: ECS cluster, ALB, security groups, IAM roles, auto-scaling |
| `task-definition.json` | Standalone ECS task definition for CLI-based deployments |
| `../frontend/amplify.yml` | AWS Amplify build configuration for Next.js frontend |
| `../agents_service/Dockerfile` | Backend Docker image definition |

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **ACM Certificate** for HTTPS (in the same region as the ALB)
3. **ECR Repository** for the backend Docker image
4. **VPC** with public and private subnets
5. **S3 Bucket** (`fablecraft-assets`) for media storage
6. **Secrets Manager** entries for sensitive values (OpenRouter API key, parent PIN)

## Deployment Steps

### 1. Build and Push Backend Docker Image

```bash
cd agents_service

# Build the image
docker build -t fablecraft-backend .

# Tag for ECR
docker tag fablecraft-backend:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/fablecraft-backend:latest

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Push
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/fablecraft-backend:latest
```

### 2. Deploy Infrastructure (CloudFormation)

```bash
aws cloudformation deploy \
  --template-file infrastructure/cloudformation.yml \
  --stack-name fablecraft-production \
  --parameter-overrides \
    VpcId=vpc-xxxxxxxx \
    PublicSubnet1=subnet-xxxxxxxx \
    PublicSubnet2=subnet-yyyyyyyy \
    PrivateSubnet1=subnet-aaaaaaaa \
    PrivateSubnet2=subnet-bbbbbbbb \
    CertificateArn=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/xxxxx \
    ContainerImage=ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/fablecraft-backend:latest \
  --capabilities CAPABILITY_NAMED_IAM
```

### 3. Deploy Frontend (AWS Amplify)

1. Connect the repository to AWS Amplify Console
2. Set the app root to `frontend/`
3. Amplify will auto-detect `amplify.yml` and configure the build
4. Set environment variable: `NEXT_PUBLIC_API_URL` = ALB HTTPS URL from CloudFormation outputs

### 4. Verify Deployment

```bash
# Check ALB health (should return 200 within 30 seconds)
curl -s https://YOUR_ALB_DNS/health

# Verify API routing
curl -s https://YOUR_ALB_DNS/api/characters/generate -X POST -H "Content-Type: application/json"
```

## Environment Variables

### Backend (ECS Task)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `S3_BUCKET_NAME` | Asset storage bucket | `fablecraft-assets` |
| `CLOUDFRONT_DOMAIN` | CloudFront distribution domain | (optional) |
| `OPENROUTER_API_KEY` | OpenRouter fallback API key | (secret) |
| `PARENT_PIN` | Parent dashboard PIN | (secret) |
| `DEBUG` | Enable debug logging | `false` |
| `BEDROCK_VISION_MODEL` | Bedrock model for vision | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `BEDROCK_QUEST_MODEL` | Bedrock model for quests | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `BEDROCK_IMAGE_MODEL` | Bedrock model for images | `stability.stable-diffusion-xl-v1` |

### Frontend (Amplify)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (ALB HTTPS endpoint) |

## Security

- ALB only accepts HTTPS (port 443) from the internet; HTTP (port 80) redirects to HTTPS
- ECS tasks run in private subnets, only accepting traffic from the ALB security group
- Application runs as non-root user inside the container
- Secrets (API keys, PINs) stored in AWS Secrets Manager, injected at runtime
- TLS 1.3 policy on the ALB listener

## Auto-Scaling

- Scales between `DesiredCount` (default: 2) and 10 tasks
- Target: 70% average CPU utilization
- Scale-out cooldown: 60 seconds
- Scale-in cooldown: 300 seconds

## Public Access

The application is accessible without authentication at the Amplify-provided HTTPS URL.
The ALB provides a public HTTPS endpoint for the API. Both respond within 30 seconds.
