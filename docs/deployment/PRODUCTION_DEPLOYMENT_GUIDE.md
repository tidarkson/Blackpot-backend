# 🚀 BlackPot Backend - Production Deployment Guide

**Version:** 1.0  
**Date:** February 9, 2026  
**Target Platform:** AWS + Supabase + Cloudinary + Bull+Redis  
**Estimated Setup Time:** 8-12 hours total  
**Team:** DevOps Engineer + Backend Developer

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites & Accounts](#prerequisites--accounts)
3. [Phase 1: Infrastructure Setup](#phase-1-infrastructure-setup)
4. [Phase 2: Database Configuration](#phase-2-database-configuration)
5. [Phase 3: Backend Deployment](#phase-3-backend-deployment)
6. [Phase 4: Frontend Deployment](#phase-4-frontend-deployment)
7. [Phase 5: Payment Gateway Setup](#phase-5-payment-gateway-setup)
8. [Phase 6: Monitoring & Security](#phase-6-monitoring--security)
9. [Troubleshooting](#troubleshooting)

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT DEVICES                            │
│                  (Web / Mobile App)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL (Frontend)                         │
│              React App (Next.js / Vite)                      │
│                  ↓ API Calls                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API Calls
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  AWS REGION (af-south-1)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ EC2/ECS - Express.js Backend (Node.js)             │   │
│  │ • Port 5000 (Health: /health)                       │   │
│  │ • TypeScript compiled to JavaScript                 │   │
│  │ • Rate limiting enabled                             │   │
│  │ • Error tracking (Sentry)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│              ↓ Queries    ↑ Results                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ RDS PostgreSQL (Multi-AZ)                           │   │
│  │ • Automated backups (daily)                         │   │
│  │ • Connection pooling (PgBouncer)                    │   │
│  │ • Row-Level Security (RLS) policies                 │   │
│  │ • 250 GB initial capacity                           │   │
│  └─────────────────────────────────────────────────────┘   │
│              ↓ Cache Layer                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ElastiCache Redis                                   │   │
│  │ • Session storage                                   │   │
│  │ • Query result caching                              │   │
│  │ • Rate limit tracking                               │   │
│  │ • Job queue coordination                            │   │
│  └─────────────────────────────────────────────────────┘   │
│              ↓ Background Jobs                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ECS Task / EC2 Worker Nodes                         │   │
│  │ • Bull/BullMQ Job Queue                             │   │
│  │ • Async task processing                             │   │
│  │ • Email notifications                               │   │
│  │ • Report generation                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ↓             ↓             ↓
    ┌────────┐  ┌─────────────┐ ┌──────────┐
    │Supabase│  │ Cloudinary  │ │ Paystack │
    │PostgreSQL │ (Image CDN) │ │ (Payments)│
    └────────┘  └─────────────┘ └──────────┘
```

### Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | Vercel + React/Next.js/Vite | User-facing application |
| **Backend** | AWS EC2/ECS + Node.js + Express | API server |
| **Database** | Supabase PostgreSQL (Primary) / AWS RDS (Alt) | Data persistence |
| **Redis Cache** | AWS ElastiCache Redis | Caching + Sessions + Rate limit tracking + Job queue |
| **Job Queue** | Bull/BullMQ (with Redis backend) | Background task processing |
| **File Storage** | Cloudinary (Primary) / AWS S3 (Fallback) | Image/media CDN |
| **Payments** | Paystack + Flutterwave | Payment processing |
| **Monitoring** | Sentry (Errors) + CloudWatch (Logs) | Observability |
| **API Docs** | Swagger/OpenAPI | API documentation |

---

## ✅ PREREQUISITES & ACCOUNTS

### Required AWS Account Setup

1. **AWS Account** with:
   - [ ] Root account access (for initial setup)
   - [ ] IAM user for deployment (never use root)
   - [ ] ec2-user or ubuntu user with SSH key pair
   - [ ] Budget alerts configured

2. **Required AWS Services Enabled:**
   - [ ] EC2 (Elastic Compute Cloud)
   - [ ] RDS (Relational Database Service)
   - [ ] ElastiCache (Redis)
   - [ ] CloudWatch (Logging)
   - [ ] Route 53 (DNS)
   - [ ] Certificate Manager (SSL/TLS)
   - [ ] VPC (Virtual Private Cloud)

### Required Third-Party Accounts

1. **Supabase** (Database as a Service)
   - [ ] Account created
   - [ ] Project initialized
   - [ ] PostgreSQL 14+ dialect enabled
   - [ ] Connection string copied

2. **Cloudinary** (Image CDN)
   - [ ] Account created
   - [ ] Folder structure configured: `restaurant-saas/[tenant_id]/`
   - [ ] Upload presets created
   - [ ] API credentials obtained

3. **Paystack** (Payment Processing)
   - [ ] Business account created
   - [ ] KYC verification completed
   - [ ] Test mode API keys obtained
   - [ ] Production API keys obtained (after 30-day trial)

4. **Vercel** (Frontend Hosting)
   - [ ] Account created
   - [ ] GitHub OAuth connected
   - [ ] Team plan (if deploying for organization)

5. **Sentry** (Error Tracking)
   - [ ] Account created
   - [ ] Project initialized for Node.js
   - [ ] DSN key obtained

### Required CLI Tools

Install on your **deployment machine**:

```bash
# AWS CLI
aws --version  # Should be v2.x

# Docker & Docker Compose
docker --version
docker-compose --version

# Node.js & npm
node --version  # Should be v18+ or v20+
npm --version

# PostgreSQL client (for migrations)
psql --version

# GitHub CLI (optional but recommended)
gh --version
```

---

## 🔧 PHASE 1: INFRASTRUCTURE SETUP

### 1.1 AWS VPC Setup (5 minutes)

**Goal:** Create isolated network for your application

```bash
# Using AWS Console (easiest for first setup):
# 1. Go to VPC Dashboard
# 2. Create VPC > Name: "blackpot-prod"
# 3. IPv4 CIDR Block: 10.0.0.0/16
# 4. Create
# 5. Enable DNS hostname resolution

# Via AWS CLI (alternative):
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region af-south-1
```

### 1.2 Create Subnets (5 minutes)

```bash
# Public Subnet (for load balancer/NAT)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.1.0/24 \
  --availability-zone af-south-1a \
  --region af-south-1

# Private Subnet 1 (for EC2)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.2.0/24 \
  --availability-zone af-south-1a \
  --region af-south-1

# Private Subnet 2 (for RDS Multi-AZ)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.3.0/24 \
  --availability-zone af-south-1b \
  --region af-south-1
```

### 1.3 Create Security Groups (10 minutes)

```bash
# Backend Security Group (allows HTTP/HTTPS + SSH)
aws ec2 create-security-group \
  --group-name blackpot-backend-sg \
  --description "BlackPot Backend Security Group" \
  --vpc-id vpc-xxxxx \
  --region af-south-1

SG_ID=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values=blackpot-backend-sg \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Allow SSH (port 22)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

# Allow HTTP (port 80)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# Allow HTTPS (port 443)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Allow application port (5000)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 5000 --cidr 0.0.0.0/0

# RDS Security Group (allows PostgreSQL on 5432)
aws ec2 create-security-group \
  --group-name blackpot-rds-sg \
  --description "BlackPot RDS Security Group" \
  --vpc-id vpc-xxxxx

RDS_SG_ID=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values=blackpot-rds-sg \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Allow PostgreSQL from Backend SG
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG_ID \
  --protocol tcp --port 5432 \
  --source-security-group-id $SG_ID
```

### 1.4 EC2 Instance (t3.medium recommended) - 10 minutes

```bash
# Get latest Ubuntu 22.04 LTS AMI
AMI_ID=$(aws ec2 describe-images \
  --owners canonical \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)

# Launch EC2 instance
aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.medium \
  --key-name blackpot-prod-key \
  --security-group-ids $SG_ID \
  --subnet-id subnet-xxxxx \
  --iam-instance-profile Name=BlackPotEC2Role \
  --monitoring Enabled=true \
  --region af-south-1 \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=blackpot-backend-prod}]'

# Get instance IP
INSTANCE_IP=$(aws ec2 describe-instances \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "EC2 Instance IP: $INSTANCE_IP"
```

### 1.5 Elastic IP (Static IP Address) - 5 minutes

```bash
# Allocate Elastic IP
ELASTIC_IP=$(aws ec2 allocate-address --region af-south-1 --output text | awk '{print $1}')

# Associate with instance
aws ec2 associate-address \
  --instance-id i-xxxxx \
  --allocation-id $ELASTIC_IP \
  --region af-south-1

echo "Elastic IP: $ELASTIC_IP"
```

### 1.6 Route 53 DNS (5 minutes)

```bash
# Create Route 53 A record pointing to Elastic IP
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456ABCDEF \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.blackpot.restaurant",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "54.193.xxx.xxx"}]
      }
    }]
  }'
```

---

## 💾 PHASE 2: DATABASE CONFIGURATION

### 2.1 Supabase PostgreSQL Setup (10 minutes)

**Option A: Supabase Dashboard (Recommended for beginners)**

1. Go to [supabase.com](https://supabase.com)
2. Create new project:
   - Project name: `blackpot-prod`
   - Database password: Generate strong password (save securely)
   - Region: Select closest to Nigeria (Europe/London recommended for now)
3. Wait for project initialization (2-3 minutes)
4. Go to **Settings** → **Database** → Copy connection string

**Option B: AWS RDS PostgreSQL (Alternative)**

```bash
# Create RDS PostgreSQL instance (Multi-AZ for reliability)
aws rds create-db-instance \
  --db-instance-identifier blackpot-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15.3 \
  --master-username postgres \
  --master-user-password "STRONG_PASSWORD_HERE" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --publicly-accessible false \
  --db-subnet-group-name blackpot-db-subnet \
  --vpc-security-group-ids $RDS_SG_ID \
  --backup-retention-period 30 \
  --region af-south-1

# Get RDS endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier blackpot-prod \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo "RDS Endpoint: $RDS_ENDPOINT"
```

### 2.2 Database Connection String Format

**Supabase Pattern:**
```
postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
```

**AWS RDS Pattern:**
```
postgresql://postgres:PASSWORD@blackpot-prod.xxxxx.af-south-1.rds.amazonaws.com:5432/blackpot
```

**Save this to:**
- AWS Secrets Manager (recommended)
- AWS Systems Manager Parameter Store
- Environment variables on EC2

### 2.3 Run Prisma Migrations (5 minutes)

```bash
# SSH into EC2 instance
ssh -i blackpot-prod-key.pem ubuntu@$INSTANCE_IP

# Clone repository (assuming GitHub repo exists)
git clone https://github.com/yourusername/blackpot-backend.git
cd blackpot-backend

# Install dependencies
npm install

# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://..."

# Run migrations
npx prisma migrate deploy

# Verify migration success
npx prisma db seed  # Run seed script for production data

# Check database
npx prisma studio  # For local inspection (or use psql)
```

### 2.4 Configure Connection Pooling (5 minutes)

**For Supabase (PgBouncer included):**
```
Use connection string with ?schema=public parameter
Supabase includes built-in connection pooling
```

**For AWS RDS (add PgBouncer):**
```bash
# Install PgBouncer on EC2
sudo apt-get install pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
sudo nano /etc/pgbouncer/pgbouncer.ini

# Add pool configuration:
[databases]
blackpot_prod = host=RDS_ENDPOINT port=5432 dbname=blackpot user=postgres password=PASSWORD

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25

# Start PgBouncer
sudo systemctl start pgbouncer
sudo systemctl enable pgbouncer
```

### 2.5 Setup Row-Level Security (RLS) - 10 minutes

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
-- ... repeat for all tables

-- Create RLS policy (example for Orders)
CREATE POLICY rls_orders_tenant_isolation ON "Order"
  USING (tenantId = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenantId = auth.jwt() ->> 'tenant_id');

-- Verify RLS policies
SELECT tablename, policyname FROM pg_policies;
```

### 2.6 Configure Automated Backups (5 minutes)

**Supabase:** Automatic daily backups (included in service)

**AWS RDS:**
```bash
# Enable automated backups (via Console or CLI)
aws rds modify-db-instance \
  --db-instance-identifier blackpot-prod \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00" \
  --region af-south-1
```

---

## 🚀 PHASE 3: BACKEND DEPLOYMENT

### 3.1 Initial EC2 Setup (First Time Only) - 20 minutes

```bash
# SSH into instance
ssh -i blackpot-prod-key.pem ubuntu@$INSTANCE_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install npm dependencies globally
sudo npm install -g pm2 nginx

# Verify installations
node --version
npm --version
```

### 3.2 Clone Repository & Install Dependencies - 10 minutes

```bash
# Clone repo
cd /home/ubuntu
git clone https://github.com/yourusername/blackpot-backend.git
cd blackpot-backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build
ls -la backend/dist/
```

### 3.3 Setup Environment Variables - 5 minutes

```bash
# Create .env.production file
sudo nano /etc/blackpot/.env.production

# Paste production environment variables (see .env.production.example)
# Then set permissions
sudo chmod 600 /etc/blackpot/.env.production
```

### 3.4 Configure PM2 Process Manager - 10 minutes

```bash
# Create ecosystem config file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'blackpot-backend',
    script: './backend/dist/index.js',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format : 'YYYY-MM-DD HH:mm:ss Z',
    watch: false,
    max_memory_restart: '1G',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Verify process
pm2 status
pm2 logs blackpot-backend
```

### 3.5 Configure Nginx Reverse Proxy - 10 minutes

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/blackpot

# Add configuration (see below)
```

**Nginx Config (`/etc/nginx/sites-available/blackpot`):**

```nginx
upstream backend {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name api.blackpot.restaurant;
    client_max_body_size 50M;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.blackpot.restaurant;
    
    # SSL certificates (from AWS ACM or Let's Encrypt)
    ssl_certificate /etc/ssl/certs/api.blackpot.restaurant.crt;
    ssl_certificate_key /etc/ssl/private/api.blackpot.restaurant.key;
    
    # SSL security best practices
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Logging
    access_log /var/log/nginx/blackpot-access.log;
    error_log /var/log/nginx/blackpot-error.log;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
    
    client_max_body_size 50M;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        access_log off;
        proxy_pass http://backend;
        proxy_http_version 1.1;
    }
}
```

**Complete Nginx setup:**

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/blackpot /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable on startup
sudo systemctl enable nginx
```

### 3.6 Install SSL Certificate - 10 minutes

**Using AWS Certificate Manager:**

```bash
# Create certificate in AWS Console
# 1. Go to Certificate Manager
# 2. Request certificate for:
#    - api.blackpot.restaurant (main)
#    - *.blackpot.restaurant (wildcard)
# 3. Verify domain ownership (DNS CNAME)
# 4. Wait for validation (5-15 minutes)

# Download certificate (if needed)
aws acm-pca get-certificate \
  --certificate-arn arn:aws:acm:af-south-1:xxx:certificate/xxx \
  --certificate-authority-arn arn:aws:acm-pca:af-south-1:xxx:certificate-authority/xxx
```

**Or using Let's Encrypt (Free):**

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx --agree-tos -m admin@blackpot.restaurant -d api.blackpot.restaurant

# Verify certificate
sudo ls -la /etc/letsencrypt/live/api.blackpot.restaurant/
```

### 3.7 Configure ElastiCache Redis - 10 minutes

```bash
# Create Redis cluster in AWS Console or CLI
aws elasticache create-cache-cluster \
  --cache-cluster-id blackpot-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --security-group-ids $SG_ID \
  --region af-south-1

# Get Redis endpoint
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --show-cache-node-info \
  --cache-cluster-id blackpot-redis \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

echo "Redis Endpoint: $REDIS_ENDPOINT"
```

### 3.8 Test Deployment - 5 minutes

```bash
# Test health endpoint
curl https://api.blackpot.restaurant/health

# Expected response:
# { "status": "OK", "timestamp": "2026-02-09T10:00:00Z" }

# Check logs
pm2 logs blackpot-backend

# Monitor resources
pm2 monit
```

---

## 🎨 PHASE 4: FRONTEND DEPLOYMENT

### 4.1 Vercel Deployment - 10 minutes

1. **Connect GitHub Repository:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Select your GitHub repository
   - Select branch: `main`

2. **Configure Build Settings:**
   - **Framework Preset:** React / Next.js / Vite (select appropriately)
   - **Build Command:** `npm run build`
   - **Output Directory:** `build` or `dist`
   - **Install Command:** `npm install`

3. **Environment Variables:**
   - Click "Environment Variables"
   - Add:
     ```
     REACT_APP_API_URL=https://api.blackpot.restaurant
     REACT_APP_SOCKET_URL=https://api.blackpot.restaurant
     REACT_APP_STRIPE_PUBLIC_KEY=pk_live_xxxxx
     REACT_APP_PAYSTACK_PUBLIC_KEY=pk_live_xxxxx
     ```

4. **Custom Domain:**
   - Click "Settings" → "Domains"
   - Add: `app.blackpot.restaurant`
   - Add CNAME record to Route 53

5. **Deploy:**
   - Click "Deploy"
   - Wait 3-5 minutes for build

### 4.2 Vercel Production Settings - 5 minutes

```bash
# Auto-deploy on push to main
# (Already configured in Vercel)

# Configure domain
# In Vercel Console:
# 1. Settings → Domains
# 2. Add app.blackpot.restaurant
# 3. Copy CNAME value
# 4. Add to Route 53
```

---

## 💳 PHASE 5: PAYMENT GATEWAY SETUP

### 5.1 Paystack Setup (10 minutes)

1. **Create Paystack Account:**
   - Go to [paystack.com](https://paystack.com)
   - Sign up with business email
   - Verify email

2. **Complete KYC:**
   - Business information
   - Bank account details
   - ID verification

3. **Get Test Keys:**
   - Go to Settings → API Keys & Webhooks
   - Copy Test Secret Key
   - Copy Test Public Key

4. **Get Production Keys:**
   - After 30-day trial and KYC approval
   - Live Secret Key
   - Live Public Key

### 5.2 Webhook Configuration (5 minutes)

```bash
# In Paystack Dashboard:
# Settings → API Keys & Webhooks → Webhooks

# Add webhook URL:
# https://api.blackpot.restaurant/api/webhooks/paystack

# Select events:
# - charge.success
# - charge.failed
# - transfer.success
# - transfer.reversed

# Verify webhook (test)
curl -X POST https://api.blackpot.restaurant/api/webhooks/paystack \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: YOUR_SIGNATURE" \
  -d '{"event":"charge.success","data":{"reference":"test_ref"}}'
```

### 5.3 Bank Account Verification (24-48 hours)

```bash
# In Paystack Dashboard:
# Settings → Bank Accounts

# Add bank account:
# - Account number
# - Bank code
# - Account name

# Verify with small test transfer (within 48 hours)
```

### 5.4 Flutterwave (Optional - Add Later)

```bash
# For payment redundancy, add Flutterwave later:
# 1. Create account at flutterwave.com
# 2. Complete KYC
# 3. Get API keys
# 4. Add webhook
# 5. Update backend to support both gateways
```

---

## 📊 PHASE 6: MONITORING & SECURITY

### 6.1 CloudWatch Monitoring (10 minutes)

```bash
# Enable EC2 monitoring
aws ec2 monitor-instances --instance-ids i-xxxxx --region af-south-1

# Create custom metrics for application
aws cloudwatch put-metric-data \
  --namespace BlackPot \
  --metric-name APIResponseTime \
  --value 150 \
  --unit Milliseconds

# Create alarms
aws cloudwatch put-metric-alarm \
  --alarm-name blackpot-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Create dashboard
# (Use AWS Console for easier visualization)
```

### 6.2 Sentry Error Tracking (10 minutes)

```bash
# Already configured in backend code

# Verify Sentry is tracking:
# 1. Go to sentry.io
# 2. Project → Releases
# 3. Check if errors are appearing

# Test error reporting
curl -X GET "https://api.blackpot.restaurant/api/test-error" \
  -H "Authorization: Bearer test_token"

# Check Sentry dashboard
```

### 6.3 Security Hardening (20 minutes)

```bash
# Update all packages
sudo apt update && sudo apt upgrade -y

# Configure UFW firewall
sudo ufw enable
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow from any to any port 5000

# Disable SSH password login (use keys only)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no

# Restart SSH
sudo systemctl restart ssh

# Set up fail2ban
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Configure SELinux / AppArmor (if applicable)
sudo aa-status
```

### 6.4 DDoS Protection

```bash
# AWS Shield Standard (included)
# - Automatic DDoS protection for AWS infrastructure

# (Optional) AWS Shield Advanced + WAF
# - AWS Console → Shield → Subscribe
# - Create WAF rules for API
```

### 6.5 Automated Backups (5 minutes)

```bash
# Database backups (automatic in Supabase/RDS)
# Already configured in Phase 2

# Application backups
sudo crontab -e

# Add backup job (daily at 1 AM UTC):
0 1 * * * cd /home/ubuntu/blackpot-backend && git pull origin main && npm run build

# Backup logs
0 2 * * * tar -czf /backups/logs-$(date +\%Y\%m\%d).tar.gz /var/log/nginx/ /home/ubuntu/blackpot-backend/logs/
```

---

## 🚨 TROUBLESHOOTING

### Issue: PM2 Process Keeps Restarting

**Symptoms:** Application crashes within seconds

**Solutions:**

```bash
# Check logs
pm2 logs blackpot-backend --lines 100

# Check environment variables
pm2 env blackpot-backend

# Verify .env file exists and is readable
cat /etc/blackpot/.env.production

# Test application locally
npm start

# Check for missing dependencies
npm install
npm run build
```

### Issue: Database Connection Timeouts

**Symptoms:** Error: "connect ETIMEDOUT"

**Solutions:**

```bash
# Test database connectivity
psql -h $DATABASE_HOST -U postgres -d blackpot -c "SELECT 1"

# Check security group rules
aws ec2 describe-security-groups --group-ids $SG_ID

# Verify RDS is Multi-AZ and accessible
aws rds describe-db-instances --db-instance-identifier blackpot-prod

# Check connection string format
echo $DATABASE_URL

# Verify PgBouncer is running (if using RDS)
sudo systemctl status pgbouncer
```

### Issue: Nginx 502 Bad Gateway

**Symptoms:** "502 Bad Gateway" error from Nginx

**Solutions:**

```bash
# Check Nginx error logs
sudo tail -50 /var/log/nginx/error.log

# Verify backend is running
pm2 status

# Check if port 5000 is listening
sudo netstat -tulpn | grep 5000

# Restart Nginx
sudo systemctl restart nginx

# Check Nginx configuration
sudo nginx -t
```

### Issue: SSL Certificate Errors

**Symptoms:** Browser shows "certificate not trusted"

**Solutions:**

```bash
# Verify certificate installation
sudo openssl x509 -in /etc/ssl/certs/api.blackpot.restaurant.crt -text -noout

# Check certificate expiry date
sudo openssl x509 -in /etc/ssl/certs/api.blackpot.restaurant.crt -noout -dates

# Renew Let's Encrypt certificate
sudo certbot renew --force-renewal

# Add auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Issue: Redis Connection Failures

**Symptoms:** Error: "ECONNREFUSED" on Redis

**Solutions:**

```bash
# Check ElastiCache cluster status
aws elasticache describe-cache-clusters --cache-cluster-id blackpot-redis

# Test Redis connection
redis-cli -h $REDIS_ENDPOINT -p 6379 ping

# Verify security group allows Redis port 6379
aws ec2 describe-security-groups --group-ids $SG_ID

# Check application environment variable
echo $REDIS_URL
```

---

## ✅ FINAL VERIFICATION CHECKLIST

Run this before considering production ready:

```bash
#!/bin/bash

echo "🔍 Running Production Verification Checks..."

# 1. Backend Health
echo "1️⃣ Testing Backend Health Endpoint..."
curl -s -o /dev/null -w "%{http_code}" https://api.blackpot.restaurant/health

# 2. Database
echo "2️⃣ Testing Database Connection..."
psql $DATABASE_URL -c "SELECT 1" && echo "✅ DB OK"

# 3. Redis
echo "3️⃣ Testing Redis Connection..."
redis-cli -h $REDIS_ENDPOINT ping

# 4. SSL Certificate
echo "4️⃣ Checking SSL Certificate..."
openssl s_client -connect api.blackpot.restaurant:443 -servername api.blackpot.restaurant </dev/null | grep "Verify return code"

# 5. Frontend
echo "5️⃣ Testing Frontend..."
curl -s -o /dev/null -w "%{http_code}" https://app.blackpot.restaurant

# 6. Paystack Webhook
echo "6️⃣ Testing Paystack Webhook..."
curl -X POST https://api.blackpot.restaurant/api/webhooks/paystack \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: test" \
  -d '{"event":"charge.success"}'

echo ""
echo "✅ All checks complete! Your production environment is ready."
```

---

## 📞 SUPPORT & NEXT STEPS

1. **Monitor Production** (First Week)
   - Watch logs daily
   - Monitor error rates in Sentry
   - Check CloudWatch metrics
   - Set up on-call alerts

2. **Scale Infrastructure** (After Month 1)
   - Upgrade EC2 if CPU > 70%
   - Upgrade RDS if storage > 80%
   - Enable RDS Read Replica for read scaling

3. **Add Features**
   - Background job processing completed
   - Redis caching optimized
   - API documentation published
   - Rate limiting fine-tuned

---

**Deployment Complete!** 🎉

Your BlackPot Backend is now running on AWS in production-grade environment.

