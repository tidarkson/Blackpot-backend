# 🛠️ MANUAL DEPLOYMENT GUIDE

**For When You Need Fine-Grained Control Over Deployment**

**Date:** February 9, 2026  
**Use Cases:**
- Emergency hotfixes that can't wait for CI/CD
- Testing in staging before production
- Deployments when GitHub Actions is unavailable
- Learning how deployment actually works
- Troubleshooting deployment issues

---

## 📋 PREREQUISITES

### Local Machine
```bash
# Verify you have:
- Node.js v20+
- npm v10+
- Git
- SSH client
- curl
- OpenSSL (for SSL verification)
```

### AWS Credentials
```bash
# Configure AWS CLI
aws configure

# Enter:
# AWS Access Key ID: [your key]
# AWS Secret Access Key: [your secret]
# Default region: af-south-1
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

### SSH Setup
```bash
# Generated key pair (done once)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/blackpot-prod-key

# Verify can connect to EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@EC2_PUBLIC_IP

# Should work without password
```

---

## 🚀 MANUAL BACKEND DEPLOYMENT

### Step 1: Prepare Local Repository

```bash
# Clone repository (if not already done)
git clone https://github.com/yourusername/blackpot-backend.git
cd blackpot-backend

# Pull latest code
git checkout main
git pull origin main

# Verify you're on main branch
git status
# Should show: On branch main, Your branch is up to date
```

### Step 2: Run Tests Locally

```bash
# Install dependencies
npm ci

# Run linter
npm run lint

# Run tests
npm test -- --coverage

# Build TypeScript
npm run build

# Verify build succeeded
ls -la backend/dist/
# Should contain index.js and other files
```

### Step 3: Build Docker Image

```bash
# Create Dockerfile if not exists
cat > Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY backend/dist ./backend/dist
COPY database ./database

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health')"

# Start application
CMD ["node", "backend/dist/index.js"]
EOF

# Build image
docker build -t blackpot-backend:latest .

# Test image locally
docker run -d \
  -p 5000:5000 \
  -e NODE_ENV=development \
  -e DATABASE_URL=postgresql://localhost/test \
  blackpot-backend:latest

# Check if running
curl http://localhost:5000/health

# Stop container
docker stop $(docker ps -q)
```

### Step 4: Push Image to ECR

```bash
# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Login to ECR
aws ecr get-login-password --region af-south-1 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.af-south-1.amazonaws.com

# Tag image
docker tag blackpot-backend:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.af-south-1.amazonaws.com/blackpot-backend:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.af-south-1.amazonaws.com/blackpot-backend:latest

# Verify push
aws ecr describe-images \
  --repository-name blackpot-backend \
  --region af-south-1
```

### Step 5: SSH Into EC2

```bash
# Get EC2 public IP
EC2_IP=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=blackpot-backend-prod" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text \
  --region af-south-1)

echo "Connecting to: $EC2_IP"

# SSH into instance
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP

# You're now inside the EC2 instance
# All subsequent commands run on the remote instance
```

### Step 6: Stop Current Application (On EC2)

```bash
# Once inside EC2 instance via SSH:

# Check if running
pm2 status

# Stop application
pm2 stop blackpot-backend

# Verify stopped
pm2 status
# Should show: stopped
```

### Step 7: Update Code (On EC2)

```bash
# Navigate to code directory
cd /home/ubuntu/blackpot-backend

# Pull latest code
git pull origin main

# Install dependencies (just in case)
npm install

# Build application
npm run build

# Verify build
ls -la backend/dist/
```

### Step 8: Run Database Migrations (On EC2)

```bash
# Important: Do this BEFORE restarting app
npx prisma migrate deploy

# If migration fails, check database connection
psql $DATABASE_URL -c "SELECT 1"

# If migration is stuck, check status
npx prisma migrate status

# Optional: Verify schema
npx prisma db execute --stdin < database/sql/verify-schema.sql
```

### Step 9: Restart Application (On EC2)

```bash
# Start application
pm2 start ecosystem.config.js

# Verify it started
pm2 status

# View logs
pm2 logs blackpot-backend --lines 50

# Monitor in real-time (Ctrl+C to exit)
pm2 monit
```

### Step 10: Verify Deployment (On EC2)

```bash
# Test health endpoint
curl http://localhost:5000/health

# Should return: {"status":"OK","timestamp":"..."}

# Test API endpoint
curl http://localhost:5000/api/status

# Check PM2 status
pm2 status

# View recent errors
pm2 logs blackpot-backend --err --lines 20
```

### Step 11: Verify From Local Machine

```bash
# Exit SSH session (type: exit)
exit

# Now back on your local machine

# Test API from your machine
curl https://api.blackpot.restaurant/health

# Should return 200 OK

# Check logs remotely
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP pm2 logs blackpot-backend --lines 10

# Full verification
curl -v https://api.blackpot.restaurant/health
# Should see:
# < HTTP/1.1 200 OK
# {"status":"OK",...}
```

---

## 🔄 MANUAL DATABASE MIGRATION

### Option 1: Using Prisma CLI (Recommended)

```bash
# SSH into EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP

# Run migrations
npx prisma migrate deploy

# If migrations pending, see what's going to happen
npx prisma migrate status

# If something went wrong, check what failed
npx prisma db execute --stdin << 'SQL'
SELECT * FROM "_prisma_migrations" ORDER BY "startedAt" DESC LIMIT 5;
SQL
```

### Option 2: Manual SQL Execution

```bash
# Connect directly to database
psql $DATABASE_URL

# Check existing migrations
SELECT * FROM "_prisma_migrations";

# Run migration file manually
\i /path/to/migration.sql

# Verify schema
\d "Order"

# Exit psql
\q
```

### Option 3: Rollback Migration

```bash
# See which migrations are applied
npx prisma migrate status

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Then apply new migration
npx prisma migrate deploy
```

---

## 🧪 MANUAL TESTING AFTER DEPLOYMENT

### Test Suite 1: Connectivity

```bash
# Test SSH connectivity
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP 'echo "✅ SSH OK"'

# Test database from EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP \
  'psql $DATABASE_URL -c "SELECT version();"'

# Test Redis from EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP \
  'redis-cli -h $REDIS_HOST ping'

# Test HTTP access
curl https://api.blackpot.restaurant/health
```

### Test Suite 2: API Endpoints

```bash
# Test authentication
curl -X POST https://api.blackpot.restaurant/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test customer endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://api.blackpot.restaurant/api/customers

# Test order endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://api.blackpot.restaurant/api/orders

# Test inventory endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://api.blackpot.restaurant/api/inventory

# Test payment webhook
curl -X POST https://api.blackpot.restaurant/api/webhooks/paystack \
  -H "Content-Type: application/json" \
  -d '{
    "event": "charge.success",
    "data": {
      "reference": "test_ref",
      "amount": 50000,
      "customer": {"email": "test@example.com"}
    }
  }'
```

### Test Suite 3: Performance

```bash
# Load test with 100 requests
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://api.blackpot.restaurant/health
done | sort | uniq -c

# Should see mostly 200s, no 502/503

# Measure response time
curl -w "Time: %{time_total}s\n" https://api.blackpot.restaurant/health

# Should be < 1 second
```

### Test Suite 4: Data Integrity

```bash
# Connect to database
psql $DATABASE_URL << 'SQL'

-- Check table counts
SELECT 'Order' as table, COUNT(*) FROM "Order"
UNION ALL
SELECT 'Customer', COUNT(*) FROM "Customer"
UNION ALL
SELECT 'Menu', COUNT(*) FROM "Menu"
UNION ALL
SELECT 'User', COUNT(*) FROM "User";

-- Check for corrupt data
SELECT COUNT(*) as missing_ids FROM "Order" WHERE id IS NULL;
SELECT COUNT(*) as negative_amounts FROM "Order" WHERE total < 0;

-- Verify recent activity
SELECT DATE(createdAt), COUNT(*) 
FROM "Order" 
GROUP BY DATE(createdAt) 
ORDER BY DATE DESC LIMIT 7;

SQL
```

---

## 🔧 TROUBLESHOOTING MANUAL DEPLOYMENT

### Issue: Application Won't Start

```bash
# SSH into EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP

# Check PM2 logs for errors
pm2 logs blackpot-backend --lines 100 --err

# Common issues:
# 1. Environment variables missing
echo $DATABASE_URL  # Should have value
echo $REDIS_URL     # Should have value

# 2. Port already in use
lsof -i :5000

# 3. Database not accessible
psql $DATABASE_URL -c "SELECT 1"

# 4. Build failed
npm run build
# Check for TypeScript errors

# 5. Dependencies missing
npm install
npm run build
```

### Issue: Database Migrations Fail

```bash
# SSH into EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP

# Check migration status
npx prisma migrate status

# See detailed error
npx prisma migrate deploy --verbose

# Check database directly
psql $DATABASE_URL

# See last migration that ran
SELECT * FROM "_prisma_migrations" 
ORDER BY "startedAt" DESC LIMIT 3;

# If migration incomplete, mark as complete
npx prisma migrate resolve --rolled-back <MIGRATION_ID>
```

### Issue: Connection Timeouts

```bash
# From EC2, test database
psql $DATABASE_URL -c "SELECT 1"

# If fails, check:
# 1. Is RDS instance running?
aws rds describe-db-instances --db-instance-identifier blackpot-prod

# 2. Are security groups correct?
aws ec2 describe-security-groups --group-ids $SG_ID

# 3. Is connection string correct?
echo $DATABASE_URL

# 4. Try with verbose output
psql -v ON_ERROR_STOP=1 $DATABASE_URL -c "SELECT 1" -d postgres
```

### Issue: High Memory Usage

```bash
# SSH into EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP

# Check Node.js memory
pm2 show blackpot-backend

# Check system memory
free -h

# If over 80%, check for:
# 1. Memory leaks
pm2 logs blackpot-backend | grep -i memory

# 2. Large objects being cached
# Look for large array buildups in code

# 3. restart with memory limit
NODE_OPTIONS='--max-old-space-size=1024' pm2 restart blackpot-backend
```

---

## 📊 MANUAL HEALTH CHECK SCRIPT

Save this as `health-check.sh`:

```bash
#!/bin/bash

echo "🔍 BlackPot Backend Health Check"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="https://api.blackpot.restaurant"

# 1. Network connectivity
echo -n "1. Network Connectivity: "
if curl -s -o /dev/null -w "%{http_code}" $API_URL > /dev/null 2>&1; then
  echo -e "${GREEN}✅ OK${NC}"
else
  echo -e "${RED}❌ FAILED${NC}"
fi

# 2. Health endpoint
echo -n "2. Health Endpoint: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/health)
if [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✅ OK ($STATUS)${NC}"
else
  echo -e "${RED}❌ FAILED ($STATUS)${NC}"
fi

# 3. Response time
echo -n "3. Response Time: "
RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null $API_URL/health)
if (( $(echo "$RESPONSE_TIME < 1.0" | bc -l) )); then
  echo -e "${GREEN}✅ OK (${RESPONSE_TIME}s)${NC}"
else
  echo -e "${YELLOW}⚠️ SLOW (${RESPONSE_TIME}s)${NC}"
fi

# 4. Database check
echo -n "4. Database Connection: "
if [ ! -z "$DATABASE_URL" ]; then
  if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
  else
    echo -e "${RED}❌ FAILED${NC}"
  fi
else
  echo -e "${YELLOW}⚠️ SKIP (no DATABASE_URL)${NC}"
fi

# 5. SSL Certificate
echo -n "5. SSL Certificate: "
CERT_DATE=$(echo | openssl s_client -servername $API_URL -connect api.blackpot.restaurant:443 2>/dev/null | \
  openssl x509 -noout -enddate | cut -d= -f2)
echo "Expires: $CERT_DATE"

echo ""
echo "=================================="
echo "Health check complete!"
```

Usage:
```bash
chmod +x health-check.sh
./health-check.sh
```

---

## 📋 MANUAL DEPLOYMENT CHECKLIST

Use this during manual deployment:

```markdown
# Pre-Deployment
- [ ] Code committed to main branch
- [ ] All tests passing locally
- [ ] No hardcoded secrets in commit
- [ ] .env.production file prepared
- [ ] AWS credentials configured
- [ ] SSH key accessible

# During Deployment
- [ ] Code pulled on EC2
- [ ] Npm dependencies installed
- [ ] Application compiled (npm run build)
- [ ] Database migrations run successfully
- [ ] Application started with PM2
- [ ] Health endpoint responds (200 OK)
- [ ] Logs show no errors

# Post-Deployment
- [ ] API endpoints accessible
- [ ] Database queries working
- [ ] Third-party integrations working
- [ ] Monitoring/alerting functioning
- [ ] Backup verification
- [ ] Team notifications sent

# Monitoring (First 24 Hours)
- [ ] Error rate < 0.1%
- [ ] Response time < 500ms average
- [ ] Database CPU < 60%
- [ ] No memory leaks
- [ ] Customer reports none missing
```

---

## 🔙 QUICK ROLLBACK

If deployment fails, rollback quickly:

```bash
# SSH into EC2
ssh -i ~/.ssh/blackpot-prod-key ubuntu@$EC2_IP

# Stop current version
pm2 stop blackpot-backend

# Go back to previous commit
cd /home/ubuntu/blackpot-backend
git revert HEAD --no-edit
git push origin main

# Or revert locally
git reset --hard HEAD~1

# Rebuild
npm ci
npm run build

# Rollback migrations if needed
npx prisma migrate resolve --rolled-back <MIGRATION_ID>

# Restart
pm2 start ecosystem.config.js

# Verify
curl https://api.blackpot.restaurant/health
```

---

**Good luck with your deployment!** 🚀

For detailed instructions, refer to **PRODUCTION_DEPLOYMENT_GUIDE.md**

