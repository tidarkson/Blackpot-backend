# 📋 PRODUCTION DEPLOYMENT CHECKLIST

**Project:** BlackPot Backend  
**Version:** 1.0  
**Date:** February 9, 2026  
**Prepared for:** Initial Production Deployment

---

## PHASE 0: PRE-DEPLOYMENT PREPARATION (2-4 hours)

### Security & Compliance
- [ ] Security audit completed
- [ ] OWASP Top 10 vulnerabilities checked
- [ ] Secrets manager configured (AWS Secrets Manager / Parameter Store)
- [ ] No hardcoded credentials in codebase
- [ ] SSL/TLS certificates purchased and installed
- [ ] Firewall rules configured (UFW/Security Groups)
- [ ] API rate limiting configured and tested
- [ ] CORS policy configured for frontend domain only
- [ ] SQL injection protection verified (Parameterized queries)
- [ ] CSRF tokens enabled (if applicable)

### Database Preparation
- [ ] Database backup strategy confirmed
- [ ] Database user created (non-root)
- [ ] Row-Level Security (RLS) policies configured
- [ ] Connection pooling configured (PgBouncer for 100+ concurrent users)
- [ ] Automated backups scheduled (daily at 2 AM UTC)
- [ ] Backup retention set to 30 days minimum
- [ ] Database monitored for performance and storage
- [ ] Query slow-log configured

### Monitoring & Observability
- [ ] Sentry project created and DSN obtained
- [ ] CloudWatch dashboards created
- [ ] Log aggregation configured (CloudWatch Logs)
- [ ] Uptime monitoring configured (StatusPage)
- [ ] Alert thresholds set:
  - [ ] CPU > 75%
  - [ ] Memory > 85%
  - [ ] Disk > 90%
  - [ ] Error rate > 1%
  - [ ] Response time > 5s
- [ ] On-call rotation established
- [ ] Incident response playbook created

### Testing
- [ ] Unit tests pass (100% on critical paths)
  ```bash
  npm test -- --coverage
  ```
- [ ] Integration tests pass
  ```bash
  npm test -- --testPathPattern=integration
  ```
- [ ] End-to-end tests pass (at least on critical flows)
- [ ] Load testing completed (1000+ concurrent users)
- [ ] Security testing completed (OWASP scan)
- [ ] Database scaling tested
- [ ] Failover tested

### Documentation
- [ ] Deployment guide reviewed
- [ ] Rollback procedure documented and tested
- [ ] Team trained on deployment process
- [ ] Incident response procedures documented
- [ ] Architecture diagram updated
- [ ] API documentation complete (Swagger/OpenAPI)

---

## PHASE 1: INFRASTRUCTURE DEPLOYMENT (2-3 hours)

### AWS Account Setup
- [ ] AWS account created and configured
- [ ] IAM roles and policies created (principle of least privilege)
- [ ] Billing alerts configured
- [ ] Cost optimization review completed
- [ ] VPC created with proper subnets
- [ ] Internet gateway configured
- [ ] NAT gateway configured (for private subnets)

### EC2 Configuration
- [ ] EC2 instance launched (t3.medium or larger)
- [ ] Operating system updated
- [ ] Security groups configured (ports 22, 80, 443, 5000)
- [ ] Elastic IP allocated and associated
- [ ] SSH key pairs generated and stored securely
- [ ] EC2 monitoring enabled
- [ ] Backup policy configured

### Database Setup
- [ ] Production database provisioned
  - [ ] Supabase PostgreSQL OR
  - [ ] AWS RDS PostgreSQL Multi-AZ
- [ ] Connection pooling configured
- [ ] Automated backups enabled
- [ ] Multi-AZ enabled (for RDS)
- [ ] Read replicas created (for scaling reads)
- [ ] Database performance optimized (indexes, query plans)

### Redis Setup
- [ ] AWS ElastiCache Redis cluster created
- [ ] Redis encryption enabled
- [ ] Redis backup enabled
- [ ] Redis performance monitoring configured
- [ ] Connection from EC2 to Redis verified

### Storage Configuration
- [ ] Cloudinary account configured
- [ ] Upload presets created
- [ ] AWS S3 bucket created (backup storage)
- [ ] CloudFront distribution created (CDN)
- [ ] S3 lifecycle policies configured (archive old files)
- [ ] S3 versioning enabled

### DNS Configuration
- [ ] Domain registered
- [ ] Route 53 hosted zone created
- [ ] A records configured (API endpoint)
- [ ] CNAME records configured (frontend, CDN)
- [ ] DNS propagation verified (nslookup/dig)
- [ ] TTL values optimized

---

## PHASE 2: APPLICATION DEPLOYMENT (1-2 hours)

### Code Deployment
- [ ] Code committed and pushed to main branch
- [ ] GitHub Actions workflows enabled
- [ ] Docker image built and tested
- [ ] Docker image pushed to ECR
- [ ] Environment variables set in AWS (not in code!)
- [ ] Application built for production
  ```bash
  npm run build
  ```
- [ ] Build artifacts validated

### Database Migrations
- [ ] Database migrations tested locally
- [ ] Migrations run on staging environment
- [ ] Database schema validated
  ```bash
  npx prisma migrate deploy
  ```
- [ ] Database seed data load completed (production data)
- [ ] Schema changes backward-compatible (tested)

### Service Startup
- [ ] PM2 ecosystem file configured
- [ ] Application started with PM2
  ```bash
  pm2 start ecosystem.config.js
  pm2 save
  pm2 startup
  ```
- [ ] Process monitor confirmed (pm2 status)
- [ ] Application logs reviewed (no errors)
- [ ] Health check endpoint responding
  ```bash
  curl https://api.blackpot.restaurant/health
  ```

### Web Server Configuration
- [ ] Nginx installed and configured
- [ ] SSL certificates installed
- [ ] Proxy configuration verified
- [ ] Gzip compression enabled
- [ ] Security headers configured (X-Frame-Options, etc.)
- [ ] Nginx restarted
  ```bash
  sudo systemctl restart nginx
  ```

---

## PHASE 3: THIRD-PARTY SERVICES (1-2 hours)

### Payment Processing
- [ ] Paystack account created
- [ ] KYC verification completed
- [ ] Test mode API keys obtained
- [ ] Production API keys obtained (after 30-day trial)
- [ ] Webhooks configured
  ```
  https://api.blackpot.restaurant/api/webhooks/paystack
  ```
- [ ] Webhook signature verification tested
- [ ] Test payment processed successfully
- [ ] Production payment tested with small amount
- [ ] Bank account verified (48-hour confirmation)

### Email Service
- [ ] Email provider configured (Gmail/SendGrid/others)
- [ ] SMTP credentials obtained
- [ ] Test email sent successfully
- [ ] Password reset email tested
- [ ] Welcome email template created
- [ ] Email templates validated in different clients

### File Storage
- [ ] Cloudinary account configured
- [ ] Upload preset created
- [ ] API credentials tested
- [ ] Image optimization enabled
- [ ] CDN URL verified
- [ ] Fallback S3 storage configured

### Error Tracking
- [ ] Sentry project created
- [ ] DSN key added to environment variables
- [ ] Error test notification sent
- [ ] Release tracking configured

---

## PHASE 4: VERIFICATION & TESTING (1-2 hours)

### Endpoint Testing
- [ ] Health check endpoint responds (200 OK)
  ```bash
  curl https://api.blackpot.restaurant/health
  ```
- [ ] API responds to test request
  ```bash
  curl https://api.blackpot.restaurant/api/status
  ```
- [ ] Authentication works
  ```bash
  curl -X POST https://api.blackpot.restaurant/api/auth/login
  ```
- [ ] Database queries work (test query)
- [ ] Redis caching works
- [ ] File upload works (test via Cloudinary)

### Security Verification
- [ ] HTTPS enforced (no HTTP)
- [ ] Security headers present
  ```bash
  curl -I https://api.blackpot.restaurant | grep X-Frame-Options
  ```
- [ ] Rate limiting working
  ```bash
  for i in {1..150}; do curl https://api.blackpot.restaurant/api; done
  ```
- [ ] SQL injection protection verified
- [ ] XSS protection verified
- [ ] CORS policy correct

### Performance Verification
- [ ] Response time < 500ms for normal requests
- [ ] Database query time < 100ms (most queries)
- [ ] Memory usage stable (no leaks)
- [ ] CPU usage < 50% under normal load
- [ ] No 502/503 errors in logs

### Data Integrity
- [ ] Database backup and restore tested
- [ ] Data encryption verified (at rest and in transit)
- [ ] Audit logs being captured
- [ ] Soft delete functionality works
- [ ] Multi-tenancy isolation verified

---

## PHASE 5: MONITORING & ALERTING (30 minutes)

### CloudWatch Monitoring
- [ ] Dashboard created with key metrics
- [ ] CPU utilization metric visible
- [ ] Memory usage metric visible
- [ ] Disk usage metric visible
- [ ] Network I/O metric visible
- [ ] Application-specific metrics configured

### Log Aggregation
- [ ] EC2 logs aggregated to CloudWatch
- [ ] Application logs visible
- [ ] Error logs filtering configured
- [ ] Warning logs filtering configured
- [ ] Log retention set to 30 days

### Alerting
- [ ] SNS topic created for alerts
- [ ] Email subscription to alerts
- [ ] Slack integration configured (if using Slack)
- [ ] Test alert triggered successfully
- [ ] On-call engineer confirmed receiving alerts

### Backup Verification
- [ ] Latest backup timestamp recorded
- [ ] Backup size reasonable
- [ ] Restore from backup tested (staging environment)
- [ ] Backup retention policy verified

---

## PHASE 6: TEAM HANDOFF (30 minutes)

### Documentation
- [ ] Deployment guide shared with team
- [ ] Troubleshooting guide created
- [ ] Rollback procedure documented
- [ ] Incident response playbook shared
- [ ] Architecture diagram updated
- [ ] Credentials securely shared (AWS Secrets Manager)

### Team Training
- [ ] Team trained on deployment procedures
- [ ] On-call rotation established
- [ ] Escalation procedures clear
- [ ] Knowledge transfer completed

### Communication
- [ ] Stakeholders notified of go-live
- [ ] Status page updated (if applicable)
- [ ] Customer communication prepared
- [ ] Support team briefed

---

## PHASE 7: PRODUCTION MONITORING (First 24 hours)

### Real-Time Monitoring
- [ ] Dashboard watched for first hour
- [ ] Logs monitored for errors
- [ ] Customer support alerted (no issues to report)
- [ ] Performance metrics reviewed
- [ ] Error tracking reviewed (no new issues)

### First Day Tasks
- [ ] Monitor error rate (target: < 0.1%)
- [ ] Monitor response times (target: < 500ms p99)
- [ ] Monitor database connections
- [ ] Monitor Redis connections
- [ ] Monitor disk space
- [ ] Review application logs for warnings

### First Week Tasks
- [ ] Daily monitoring for anomalies
- [ ] Weekly performance review
- [ ] Weekly security review
- [ ] Weekly backup verification
- [ ] Customer feedback collection

---

## ROLLBACK PROCEDURE (If Needed)

### Immediate Rollback (Within 1 hour)
```bash
# 1. Stop current version
pm2 stop blackpot-backend

# 2. Revert code to previous commit
git revert HEAD --no-edit
git push origin main

# 3. Rebuild and redeploy
npm run build
pm2 restart blackpot-backend

# 4. Verify health
curl https://api.blackpot.restaurant/health

# 5. Notify team
# Post to Slack #incidents channel
```

### Database Rollback (If migrations failed)
```bash
# 1. SSH into EC2
ssh -i key.pem ubuntu@INSTANCE_IP

# 2. Rollback last migration
npx prisma migrate resolve --rolled-back <migration_name>

# 3. Verify schema
npx prisma db seed

# 4. Test queries
# Test critical queries against database
```

### Full Rollback (If everything fails)
```bash
# 1. Restore from backup
# In AWS RDS console: Actions → Restore from backup

# 2. Point EC2 to previous database snapshot

# 3. Rebuild application from previous commit

# 4. Deploy previous version

# 5. Test all critical flows

# 6. Notify stakeholders
```

---

## SUCCESS CRITERIA

Your deployment is successful when:

✅ **Functionality**
- All critical APIs return 200 OK
- Authentication works for all user roles
- Database queries return correct data
- File uploads work (Cloudinary)
- Payments process successfully

✅ **Performance**
- Response time: < 500ms (p95)
- Error rate: < 0.1%
- CPU usage: < 60%
- Memory usage: < 70%
- Database connections: < 50% of max

✅ **Security**
- HTTPS enforced
- No hardcoded credentials in logs
- Rate limiting prevents abuse
- SQL injection tests pass
- XSS protection verified

✅ **Monitoring**
- CloudWatch dashboards active
- Alerts configured and tested
- Logs aggregating correctly
- Sentry tracking errors
- Backups running on schedule

✅ **Team**
- Team trained on procedures
- On-call rotation established
- Incident response playbook ready
- Documentation complete

---

## POST-DEPLOYMENT TASKS (Next Week)

- [ ] Optimize database performance (analyze query plans)
- [ ] Implement caching for high-traffic endpoints
- [ ] Set up Redis eviction policies
- [ ] Fine-tune rate limiting based on real usage
- [ ] Review and optimize AWS costs
- [ ] Set up log analysis/dashboards
- [ ] Implement additional monitoring
- [ ] Load test with production data volume
- [ ] Security penetration testing
- [ ] Disaster recovery drill

---

## SIGN-OFF

**Deployment Manager:** _____________________  
**Date:** _____________________

**Operations Lead:** _____________________  
**Date:** _____________________

**Product Manager:** _____________________  
**Date:** _____________________

---

**Status:** Pending Deployment  
**Next Steps:** Execute Phase 0 checklist and obtain sign-off from all stakeholders

