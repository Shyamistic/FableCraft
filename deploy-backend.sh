#!/bin/bash
# Fablecraft Backend Deployment Script for EC2
# Run this after SSH-ing into the EC2 instance

set -e

echo "=== Installing Docker ==="
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

echo "=== Cloning Repository ==="
cd /home/ec2-user
git clone https://github.com/Shyamistic/Fable-Craft.git
cd Fable-Craft/agents_service

echo "=== Creating .env file ==="
cat > .env << 'EOF'
AWS_REGION=us-east-1
S3_BUCKET_NAME=fablecraft-assets
IMAGE_PROVIDER=gemini
GEMINI_API_KEY=REPLACE_WITH_YOUR_KEY
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
POLLY_VOICE_ID=Ruth
POLLY_ENGINE=neural
POLLY_SPEAKING_RATE=90%
PORT=8080
DEBUG=false
APP_NAME=fablecraft
EOF

echo ""
echo "⚠️  IMPORTANT: Edit .env and replace GEMINI_API_KEY with your actual key!"
echo "   Run: nano .env"
echo ""
echo "Then run these commands to build and start:"
echo ""
echo "   sudo docker build -t fablecraft-backend ."
echo "   sudo docker run -d -p 8080:8080 --env-file .env --restart unless-stopped --name backend fablecraft-backend"
echo ""
echo "Test with: curl http://localhost:8080/health"
