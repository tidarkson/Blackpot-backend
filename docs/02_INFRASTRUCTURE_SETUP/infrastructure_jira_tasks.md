# Restaurant Management SaaS - Infrastructure Setup
## Jira Tasks with AI Implementation Prompts

---

## 🔴 PRIORITY 1: RATE LIMITING (Week 1)

### Task 1.1: Rate Limiting Middleware Setup
**Epic:** Infrastructure - Security  
**Story Points:** 3  
**Priority:** Critical  
**Assignee:** Backend Developer  
**Dependencies:** None  
**Timeline:** 4 hours  

#### Description
Implement rate limiting middleware to protect against brute force attacks, DDoS, and API abuse. This is security-critical and prevents potential million-dollar security breaches.

#### Acceptance Criteria
- [ ] Rate limiting middleware installed and configured
- [ ] Different rate limits for public vs authenticated endpoints
- [ ] Redis integration for distributed rate limiting
- [ ] Custom error messages for rate limit violations
- [ ] Rate limit headers included in responses
- [ ] Testing across all critical endpoints

#### AI Implementation Prompt
```
I'm building a restaurant management SaaS platform using Node.js, Express, and PostgreSQL with Prisma ORM. I need to implement rate limiting to protect against:
1. Brute force attacks on login endpoints
2. DDoS attacks on public endpoints
3. API abuse from resource-hogging customers

Tech Stack:
- Backend: Node.js with Express
- Database: PostgreSQL with Prisma
- Cache: Redis (will be set up)

Requirements:
1. Use express-rate-limit package with Redis store
2. Implement the following rate limits:
   - Public endpoints (login, signup): 10 requests/minute per IP, 30 requests/minute per account
   - Authenticated endpoints (orders, reports): 100 requests/minute per account
   - Admin endpoints: 30 requests/minute per account
3. Return proper HTTP 429 status codes with retry-after headers
4. Store rate limit data in Redis with appropriate TTL
5. Create middleware that can be applied globally or per-route
6. Include IP-based and user-based rate limiting
7. Add custom error messages explaining the rate limit

File Structure:
backend/
├── src/
│   ├── middleware/
│   │   └── rateLimiter.ts (create this)
│   ├── config/
│   │   └── redis.ts (create this)
│   └── server.ts (update this)

Please provide:
1. Complete implementation of rateLimiter.ts with multiple rate limit strategies
2. Redis configuration in redis.ts
3. How to apply the middleware in server.ts
4. Example usage for different endpoint types
5. Test cases to verify rate limiting works

Additional Context:
- The app is multi-tenant (restaurant-based)
- We need to prevent account takeover via brute force
- We need to protect against credential stuffing attacks
- System should handle 500+ concurrent users
```

#### Testing Checklist
- [ ] Login endpoint blocks after 5 failed attempts
- [ ] Rate limit resets after timeout period
- [ ] Authenticated users have higher limits
- [ ] Multiple IPs can't bypass limits
- [ ] Rate limit headers present in response

---

### Task 1.2: Rate Limiting - Endpoint Protection
**Epic:** Infrastructure - Security  
**Story Points:** 2  
**Priority:** Critical  
**Assignee:** Backend Developer  
**Dependencies:** Task 1.1  
**Timeline:** 2 hours  

#### Description
Apply rate limiting middleware to all critical endpoints with appropriate limits based on endpoint sensitivity.

#### Acceptance Criteria
- [ ] Login endpoint: 5 attempts per 15 minutes
- [ ] Signup endpoint: 3 attempts per hour
- [ ] Password reset: 3 attempts per hour
- [ ] Order creation: 100 per minute
- [ ] Report generation: 10 per hour
- [ ] All endpoints documented with their limits

#### AI Implementation Prompt
```
Building on the rate limiting middleware we created, I need to apply specific rate limits to different endpoints in my restaurant management SaaS platform.

Current Setup:
- Rate limiting middleware exists (from previous task)
- Express.js backend with modular routing
- Routes organized by feature (auth, orders, inventory, etc.)

Apply These Specific Limits:

1. Authentication Routes (/api/auth):
   - POST /api/auth/login: 5 attempts per 15 minutes per IP
   - POST /api/auth/signup: 3 attempts per hour per IP
   - POST /api/auth/forgot-password: 3 attempts per hour per IP
   - POST /api/auth/reset-password: 3 attempts per hour per token

2. Order Routes (/api/orders):
   - POST /api/orders: 100 per minute per account
   - GET /api/orders: 200 per minute per account
   - PUT /api/orders/:id: 50 per minute per account

3. Report Routes (/api/reports):
   - POST /api/reports/generate: 10 per hour per account
   - GET /api/reports/sales: 50 per minute per account
   - GET /api/reports/inventory: 50 per minute per account

4. Inventory Routes (/api/inventory):
   - POST /api/inventory/items: 100 per minute per account
   - GET /api/inventory/items: 200 per minute per account
   - PUT /api/inventory/items/:id: 100 per minute per account

5. Admin Routes (/api/admin):
   - All admin endpoints: 30 per minute per account

File Structure:
backend/src/routes/
├── auth.routes.ts (update)
├── orders.routes.ts (update)
├── reports.routes.ts (update)
├── inventory.routes.ts (update)
└── admin.routes.ts (update)

Please provide:
1. Updated route files with rate limiting applied
2. Comments explaining why each limit was chosen
3. Custom error messages for each endpoint type
4. How to override limits for premium accounts
5. Logging strategy for rate limit violations
```

#### Testing Checklist
- [ ] Each endpoint respects its specific limit
- [ ] Premium accounts have higher limits
- [ ] Rate limit violations are logged
- [ ] Custom error messages are returned
- [ ] Multiple endpoints don't share limits incorrectly

---

## 🔴 PRIORITY 2: ERROR TRACKING - SENTRY (Week 1)

### Task 2.1: Sentry Backend Integration
**Epic:** Infrastructure - Monitoring  
**Story Points:** 2  
**Priority:** Critical  
**Assignee:** Backend Developer  
**Dependencies:** None  
**Timeline:** 3 hours  

#### Description
Integrate Sentry for real-time error tracking and monitoring in the backend. This reduces bug detection time from days to seconds.

#### Acceptance Criteria
- [ ] Sentry SDK installed and configured
- [ ] All uncaught exceptions captured
- [ ] User context included in error reports
- [ ] Custom error tags for categorization
- [ ] Environment-specific configurations
- [ ] Performance monitoring enabled

#### AI Implementation Prompt
```
I'm building a restaurant management SaaS platform and need to integrate Sentry for error tracking in my Node.js/Express backend.

Tech Stack:
- Backend: Node.js with Express and TypeScript
- Database: PostgreSQL with Prisma ORM
- Deployment: Production, Staging, Development environments

Requirements:
1. Install and configure @sentry/node and @sentry/profiling-node
2. Capture all uncaught exceptions and unhandled promise rejections
3. Include user context in error reports:
   - User ID
   - Restaurant ID (tenant)
   - User role
   - Current action being performed
4. Add custom tags for categorization:
   - Environment (production/staging/dev)
   - Feature (orders, inventory, reports, etc.)
   - Severity level
5. Configure different DSNs for different environments
6. Set up performance monitoring with transaction tracking
7. Filter out sensitive data (passwords, tokens, credit cards)
8. Configure sample rates:
   - Errors: 100% in production
   - Performance: 20% in production
   - Debug: 100% in development

File Structure:
backend/
├── src/
│   ├── config/
│   │   └── sentry.ts (create this)
│   ├── middleware/
│   │   └── sentry.middleware.ts (create this)
│   ├── utils/
│   │   └── errorHandler.ts (create this)
│   └── server.ts (update this)
├── .env.example (update this)
└── package.json (update this)

Please provide:
1. Complete Sentry configuration in sentry.ts
2. Error handling middleware that captures context
3. Custom error handler that logs to Sentry
4. How to manually capture errors in try-catch blocks
5. How to track performance of critical operations (order processing, report generation)
6. Environment variable setup
7. Example of capturing custom events/breadcrumbs

Additional Requirements:
- Capture slow database queries (>1 second)
- Track failed payment attempts
- Monitor API response times
- Alert on critical errors via Slack webhook
```

#### Testing Checklist
- [ ] Sentry captures uncaught exceptions
- [ ] User context appears in error reports
- [ ] Sensitive data is filtered out
- [ ] Performance monitoring works
- [ ] Different environments use different DSNs

---

### Task 2.2: Sentry Frontend Integration
**Epic:** Infrastructure - Monitoring  
**Story Points:** 2  
**Priority:** High  
**Assignee:** Frontend Developer  
**Dependencies:** None  
**Timeline:** 3 hours  

#### Description
Integrate Sentry for error tracking in the React frontend to capture client-side errors and user experience issues.

#### Acceptance Criteria
- [ ] Sentry React SDK installed
- [ ] Error boundary components implemented
- [ ] User feedback collection enabled
- [ ] Performance monitoring enabled
- [ ] Source maps uploaded for production
- [ ] Session replay enabled

#### AI Implementation Prompt
```
I need to integrate Sentry error tracking in my React.js frontend for a restaurant management SaaS platform.

Tech Stack:
- Frontend: React.js 18+ with TypeScript
- State Management: React Context API
- Build Tool: Vite (or Create React App)
- Routing: React Router v6

Requirements:
1. Install and configure @sentry/react
2. Set up Error Boundary components to catch React errors
3. Capture all JavaScript errors and promise rejections
4. Track user interactions with breadcrumbs:
   - Navigation (route changes)
   - Button clicks
   - Form submissions
   - API calls
5. Include user context:
   - User ID
   - Restaurant ID
   - User role
   - Current page/route
6. Enable Performance Monitoring:
   - Track component render times
   - Monitor API call durations
   - Measure page load times
7. Enable Session Replay for visual debugging
8. Set up source maps for production debugging
9. User Feedback widget for error reports
10. Filter out:
    - Browser extension errors
    - Ad blocker errors
    - Known third-party errors

File Structure:
frontend/
├── src/
│   ├── config/
│   │   └── sentry.ts (create this)
│   ├── components/
│   │   └── ErrorBoundary.tsx (create this)
│   ├── utils/
│   │   └── errorTracking.ts (create this)
│   ├── App.tsx (update this)
│   └── main.tsx (update this)
├── .env.example (update this)
└── vite.config.ts (update for source maps)

Please provide:
1. Complete Sentry configuration for React
2. ErrorBoundary component with fallback UI
3. Integration with React Router
4. How to manually capture errors
5. How to add custom breadcrumbs
6. Performance monitoring setup
7. Source map configuration for production builds
8. Session replay setup
9. User feedback dialog integration

Critical User Flows to Monitor:
- Login/Authentication
- Order creation and submission
- Payment processing
- Report generation
- Inventory updates
```

#### Testing Checklist
- [ ] React errors caught by Error Boundary
- [ ] Navigation tracked in breadcrumbs
- [ ] API errors captured with full context
- [ ] Performance metrics visible in Sentry
- [ ] Source maps working in production
- [ ] Session replay captures user interactions

---

## 🔴 PRIORITY 3: REDIS & JOB QUEUE (Week 2)

### Task 3.1: Redis Setup and Configuration
**Epic:** Infrastructure - Caching & Performance  
**Story Points:** 3  
**Priority:** High  
**Assignee:** Backend Developer  
**Dependencies:** None  
**Timeline:** 4 hours  

#### Description
Set up Redis as a caching layer and session store to improve performance and reduce database load by 70%.

#### Acceptance Criteria
- [ ] Redis server installed and configured
- [ ] Redis client library integrated
- [ ] Connection pooling implemented
- [ ] Health check endpoints
- [ ] Environment-specific configurations
- [ ] Fallback strategy if Redis unavailable

#### AI Implementation Prompt
```
I'm building a restaurant management SaaS and need to set up Redis for caching and session management.

Tech Stack:
- Backend: Node.js with Express and TypeScript
- Database: PostgreSQL with Prisma
- Current Issue: Database overload with 100+ concurrent users
- Goal: Reduce database CPU from 85% to 15%

Requirements:
1. Install and configure ioredis (preferred) or redis client
2. Set up connection with:
   - Connection pooling
   - Automatic reconnection
   - Cluster support (future-ready)
3. Create Redis service wrapper with:
   - get(key)
   - set(key, value, ttl)
   - del(key)
   - exists(key)
   - setex(key, ttl, value)
   - hget, hset for hash operations
   - Error handling and logging
4. Implement caching strategies:
   - Cache-aside pattern
   - Write-through caching
   - TTL-based expiration
5. Environment configuration:
   - Development: Local Redis
   - Staging: Redis Cloud
   - Production: Redis Cloud with persistence
6. Create health check endpoint
7. Implement graceful degradation (if Redis down, hit DB directly)

File Structure:
backend/
├── src/
│   ├── config/
│   │   └── redis.config.ts (create this)
│   ├── services/
│   │   └── cache.service.ts (create this)
│   ├── middleware/
│   │   └── cache.middleware.ts (create this)
│   └── utils/
│       └── redisClient.ts (create this)
├── .env.example (update)
└── docker-compose.yml (update for local dev)

Please provide:
1. Complete Redis configuration with connection pooling
2. Cache service with common operations
3. Middleware for caching HTTP responses
4. Cache invalidation strategies
5. How to handle cache misses
6. Error handling when Redis is unavailable
7. Docker setup for local development
8. Environment variable configuration
9. Testing utilities for cache operations

Use Cases to Support:
1. Cache menu items (1 hour TTL)
2. Cache inventory levels (5 minute TTL)
3. Cache recent orders (1 minute TTL)
4. Session storage (24 hour TTL)
5. Rate limiting counters (1 minute TTL)
```

#### Testing Checklist
- [ ] Redis connection established successfully
- [ ] Cache hit/miss working correctly
- [ ] TTL expiration working
- [ ] Graceful degradation when Redis unavailable
- [ ] Connection pool not exhausting
- [ ] Health check endpoint returns correct status

---

### Task 3.2: Implement Caching for High-Traffic Endpoints
**Epic:** Infrastructure - Performance  
**Story Points:** 5  
**Priority:** High  
**Assignee:** Backend Developer  
**Dependencies:** Task 3.1  
**Timeline:** 6 hours  

#### Description
Implement intelligent caching for frequently accessed data to reduce database load and improve response times from 2.5s to 300ms.

#### Acceptance Criteria
- [ ] Menu items cached with 1 hour TTL
- [ ] Inventory levels cached with 5 minute TTL
- [ ] Dashboard stats cached with 1 minute TTL
- [ ] Recent orders cached appropriately
- [ ] Cache invalidation on updates
- [ ] Cache hit rate >80%

#### AI Implementation Prompt
```
I have Redis set up and now need to implement caching for high-traffic endpoints in my restaurant SaaS platform.

Current Performance Issues:
- Dashboard load time: 5-8 seconds
- Menu API: 2-3 seconds per request
- 500 database queries per page load
- Database CPU at 85%

Target Performance:
- Dashboard: <500ms
- Menu API: <200ms
- Reduce DB queries by 90%
- Database CPU <20%

Endpoints to Cache:

1. Menu Management:
   GET /api/menus - List all menus
   GET /api/menus/:id - Single menu with items
   GET /api/menus/:id/categories - Menu categories
   Cache Strategy: 1 hour TTL, invalidate on update

2. Inventory:
   GET /api/inventory/items - All inventory items
   GET /api/inventory/low-stock - Low stock alerts
   Cache Strategy: 5 minute TTL, invalidate on stock change

3. Dashboard:
   GET /api/dashboard/stats - Today's sales, orders, revenue
   GET /api/dashboard/recent-orders - Last 20 orders
   Cache Strategy: 1 minute TTL, invalidate on new order

4. Orders:
   GET /api/orders - Order list with pagination
   GET /api/orders/:id - Order details
   Cache Strategy: 30 second TTL, invalidate on status change

5. Reports:
   GET /api/reports/sales?date=YYYY-MM-DD - Daily sales report
   Cache Strategy: Until midnight, invalidate on new order

Requirements:
1. Create caching middleware that:
   - Generates cache keys based on URL, query params, user context
   - Checks cache before hitting database
   - Stores results with appropriate TTL
   - Handles cache misses gracefully
2. Implement cache invalidation:
   - When menu items are updated/created/deleted
   - When inventory changes
   - When orders are created/updated
   - When reports are regenerated
3. Multi-tenant isolation (Restaurant A can't see Restaurant B's cached data)
4. Add cache headers (Cache-Control, ETag)
5. Track cache hit/miss rates for monitoring

File Structure:
backend/src/
├── middleware/
│   └── cache.middleware.ts (update from previous task)
├── services/
│   ├── cache.service.ts (update)
│   └── cacheInvalidation.service.ts (create)
├── controllers/
│   ├── menu.controller.ts (update)
│   ├── inventory.controller.ts (update)
│   ├── dashboard.controller.ts (update)
│   └── orders.controller.ts (update)
└── utils/
    └── cacheKeyGenerator.ts (create)

Please provide:
1. Caching middleware with intelligent key generation
2. Cache invalidation service
3. Updated controllers with cache integration
4. Cache key generation strategy
5. Multi-tenant cache isolation
6. Cache warming strategies
7. Monitoring/logging for cache performance
8. How to bypass cache for real-time data

Multi-Tenant Considerations:
- Restaurant ID must be part of every cache key
- No data leakage between tenants
- Invalidation scoped to specific restaurant
```

#### Testing Checklist
- [ ] Cache hit rate >80% after warmup
- [ ] Response time <500ms for cached endpoints
- [ ] Cache invalidation works on updates
- [ ] Multi-tenant isolation verified
- [ ] No data leakage between restaurants
- [ ] Cache keys properly namespaced

---

### Task 3.3: Session Management with Redis
**Epic:** Infrastructure - Authentication  
**Story Points:** 3  
**Priority:** High  
**Assignee:** Backend Developer  
**Dependencies:** Task 3.1  
**Timeline:** 4 hours  

#### Description
Migrate session storage from in-memory to Redis to support multi-server deployments and prevent session loss on server restarts.

#### Acceptance Criteria
- [ ] Sessions stored in Redis
- [ ] Sessions persist across server restarts
- [ ] Session expiration working (24 hours)
- [ ] Session refresh on activity
- [ ] Multi-server session sharing
- [ ] Logout clears session from Redis

#### AI Implementation Prompt
```
I need to implement Redis-based session management for my restaurant SaaS platform to replace in-memory sessions.

Current Issues:
- Server restart logs out all users
- Can't scale to multiple servers (sessions not shared)
- Users frustrated by frequent re-logins
- Lost shopping carts/in-progress orders

Tech Stack:
- Backend: Node.js with Express and TypeScript
- Auth: JWT tokens + session validation
- Redis: Already configured (from previous task)

Requirements:
1. Use express-session with connect-redis store
2. Session structure:
   {
     user_id: string,
     restaurant_id: string,
     role: string,
     email: string,
     login_time: timestamp,
     last_activity: timestamp,
     ip_address: string
   }
3. Session lifecycle:
   - Create on login
   - Extend TTL on each request (sliding window)
   - Expire after 24 hours of inactivity
   - Delete on logout
4. Security features:
   - Secure cookies (httpOnly, secure, sameSite)
   - Session fingerprinting (prevent session hijacking)
   - IP validation (optional, configurable)
   - Concurrent session limits (max 3 devices per user)
5. Session validation middleware
6. "Remember me" feature (30-day sessions)
7. Force logout for all sessions (password change)

File Structure:
backend/src/
├── config/
│   └── session.config.ts (create)
├── middleware/
│   └── session.middleware.ts (create)
├── services/
│   └── session.service.ts (create)
├── controllers/
│   └── auth.controller.ts (update)
└── server.ts (update)

Please provide:
1. Complete session configuration with Redis store
2. Session middleware for validation
3. Session service with CRUD operations
4. Updated auth controller (login/logout with sessions)
5. How to implement "remember me" functionality
6. How to invalidate all sessions for a user
7. How to limit concurrent sessions
8. Session cleanup for expired sessions
9. Migration strategy from JWT-only to session-based auth

Security Considerations:
- Prevent session fixation attacks
- Prevent session hijacking
- Rotate session IDs on privilege escalation
- Secure session cookies
```

#### Testing Checklist
- [ ] Sessions persist across server restarts
- [ ] Session expires after 24 hours
- [ ] Session extends on user activity
- [ ] Logout clears session
- [ ] Multiple devices supported
- [ ] Concurrent session limit enforced
- [ ] "Remember me" works for 30 days

---

### Task 3.4: Job Queue Setup (BullMQ)
**Epic:** Infrastructure - Async Processing  
**Story Points:** 5  
**Priority:** High  
**Assignee:** Backend Developer  
**Dependencies:** Task 3.1  
**Timeline:** 8 hours  

#### Description
Set up BullMQ job queue system for asynchronous processing of emails, reports, and long-running tasks.

#### Acceptance Criteria
- [ ] BullMQ installed and configured
- [ ] Job queue workers running
- [ ] Failed job retry mechanism
- [ ] Job progress tracking
- [ ] Dead letter queue for failed jobs
- [ ] Queue monitoring dashboard

#### AI Implementation Prompt
```
I need to set up BullMQ for background job processing in my restaurant SaaS platform to handle emails, reports, and long-running tasks.

Current Problems:
- Email sending blocks HTTP requests (2-5 second delays)
- Report generation times out at 30 seconds
- Users wait for tasks that should be background jobs
- No retry mechanism for failed operations

Tech Stack:
- Backend: Node.js with Express and TypeScript
- Redis: Already configured
- Goal: Move long-running tasks to background workers

Job Types Needed:
1. Email Jobs:
   - Order confirmations
   - Password reset emails
   - Low stock alerts
   - Daily/weekly reports via email
   
2. Report Jobs:
   - Financial reports (P&L, balance sheet)
   - Sales analytics
   - Inventory summaries
   - Staff performance reports
   
3. Data Processing Jobs:
   - Inventory reconciliation
   - Payment settlement batch processing
   - Data exports (CSV, PDF)
   - Database cleanup tasks
   
4. Scheduled Jobs:
   - Daily sales reconciliation (midnight)
   - Weekly report generation (Monday 8 AM)
   - Monthly closing tasks (1st of month)
   - Backup tasks (daily at 2 AM)

Requirements:
1. Install and configure BullMQ with Redis
2. Create queue definitions for different job types:
   - emailQueue
   - reportQueue
   - dataProcessingQueue
   - scheduledTasksQueue
3. Implement worker processes for each queue
4. Job retry strategy:
   - Retry 3 times with exponential backoff
   - Move to dead letter queue after max retries
   - Alert on critical job failures
5. Job priority levels (1-10, 1 = highest)
6. Job progress tracking (for reports)
7. Job completion callbacks/webhooks
8. Rate limiting for external API calls (email service)
9. Concurrency limits per worker
10. Queue monitoring and metrics

File Structure:
backend/
├── src/
│   ├── queues/
│   │   ├── config/
│   │   │   └── queue.config.ts (create)
│   │   ├── definitions/
│   │   │   ├── email.queue.ts (create)
│   │   │   ├── report.queue.ts (create)
│   │   │   ├── dataProcessing.queue.ts (create)
│   │   │   └── scheduled.queue.ts (create)
│   │   ├── workers/
│   │   │   ├── email.worker.ts (create)
│   │   │   ├── report.worker.ts (create)
│   │   │   ├── dataProcessing.worker.ts (create)
│   │   │   └── scheduled.worker.ts (create)
│   │   ├── jobs/
│   │   │   ├── emailJobs.ts (create)
│   │   │   ├── reportJobs.ts (create)
│   │   │   └── dataJobs.ts (create)
│   │   └── index.ts (create - queue registry)
│   ├── services/
│   │   └── queue.service.ts (create)
│   └── controllers/
│       └── jobs.controller.ts (create - job status API)
├── workers.ts (create - worker process entry)
└── package.json (update)

Please provide:
1. Complete BullMQ configuration
2. Queue definitions for each job type
3. Worker implementations with error handling
4. How to add jobs from controllers
5. Job retry and failure handling
6. How to implement scheduled/recurring jobs
7. Queue monitoring endpoint
8. How to run workers separately from main app
9. Docker setup for workers
10. Graceful shutdown handling

Example Job Payloads:
- Email: { to, subject, template, data, priority }
- Report: { type, dateRange, restaurantId, userId, format }
- Data: { operation, entityId, params }

Critical Requirements:
- Jobs must not block the main application
- Failed jobs should retry automatically
- Long-running jobs should show progress
- System should handle 1000+ jobs per minute
```

#### Testing Checklist
- [ ] Jobs execute asynchronously
- [ ] Failed jobs retry 3 times
- [ ] Dead letter queue captures permanently failed jobs
- [ ] Job progress tracked for reports
- [ ] Scheduled jobs run at correct times
- [ ] Workers can be scaled independently
- [ ] Queue monitoring shows job statistics

---

### Task 3.5: Email Queue Implementation
**Epic:** Infrastructure - Notifications  
**Story Points:** 5  
**Priority:** High  
**Assignee:** Backend Developer  
**Dependencies:** Task 3.4  
**Timeline:** 8 hours  

#### Description
Implement email queue using BullMQ to handle all transactional emails asynchronously with retry logic and delivery tracking.

#### Acceptance Criteria
- [ ] Email templates created
- [ ] Email queue processing emails
- [ ] Retry logic for failed emails
- [ ] Email delivery tracking
- [ ] Unsubscribe functionality
- [ ] Email service integration (SendGrid/Mailgun)

#### AI Implementation Prompt
```
I need to implement a robust email queue system using BullMQ for my restaurant SaaS platform.

Current Problem:
- Email sending blocks HTTP requests
- Users don't get confirmation emails when email service is down
- No retry mechanism
- No tracking of email delivery
- 30% of emails never reach users

Email Types Needed:
1. Transactional Emails:
   - Order confirmation (Priority: High)
   - Payment receipt (Priority: High)
   - Password reset (Priority: Critical)
   - Account verification (Priority: Critical)
   
2. Notification Emails:
   - Low stock alerts (Priority: Medium)
   - Daily sales summary (Priority: Low)
   - Staff shift reminders (Priority: Medium)
   
3. Marketing Emails:
   - Weekly newsletter (Priority: Low)
   - Feature announcements (Priority: Low)

Tech Stack:
- Email Service: SendGrid (or Mailgun, Resend)
- Template Engine: Handlebars or Nodemailer
- Queue: BullMQ (already set up)

Requirements:
1. Create email templates using Handlebars:
   - Order confirmation template
   - Password reset template
   - Low stock alert template
   - Daily report template
2. Email queue job processor:
   - Fetch email job from queue
   - Render template with data
   - Send via email service
   - Track delivery status
   - Retry on failure (3 times, exponential backoff)
3. Email tracking:
   - Store sent emails in database
   - Track delivery status (sent, delivered, failed, bounced)
   - Track open rates (optional)
   - Track click rates (optional)
4. Priority-based processing:
   - Critical emails processed first
   - Low priority emails batched
5. Rate limiting:
   - Respect email service rate limits
   - Max 100 emails per minute
6. Unsubscribe handling:
   - Unsubscribe links in marketing emails
   - Respect unsubscribe preferences
7. Bounce handling:
   - Track bounced emails
   - Mark email addresses as invalid
   - Retry soft bounces

File Structure:
backend/src/
├── email/
│   ├── templates/
│   │   ├── orderConfirmation.hbs (create)
│   │   ├── passwordReset.hbs (create)
│   │   ├── lowStockAlert.hbs (create)
│   │   └── dailyReport.hbs (create)
│   ├── layouts/
│   │   └── main.hbs (create - base layout)
│   ├── services/
│   │   ├── emailService.ts (create)
│   │   └── templateService.ts (create)
│   └── workers/
│       └── emailWorker.ts (update from previous task)
├── models/
│   └── EmailLog.ts (create - Prisma model)
└── controllers/
    └── email.controller.ts (create - testing endpoint)

Please provide:
1. Email templates with dynamic data
2. Email service integration (SendGrid)
3. Email worker with retry logic
4. Email logging to database
5. How to queue emails from different parts of the app
6. Batch email sending for bulk operations
7. Email preview/testing endpoint
8. Unsubscribe link implementation
9. Bounce handling
10. Error notifications for failed emails

Example Usage:
// From order controller
await emailQueue.add('orderConfirmation', {
  to: customer.email,
  orderId: order.id,
  orderDetails: {...},
  restaurantName: restaurant.name
}, { priority: 1 });

Critical Requirements:
- Emails must never block main application
- Failed emails retry automatically
- Track delivery success rate (target: 99.5%)
- Handle email service outages gracefully
```

#### Testing Checklist
- [ ] Emails sent asynchronously
- [ ] Email templates render correctly
- [ ] Failed emails retry 3 times
- [ ] Email logs stored in database
- [ ] Unsubscribe links work
- [ ] Bounce handling working
- [ ] Email service rate limits respected

---

### Task 3.6: Report Generation Queue
**Epic:** Infrastructure - Reports  
**Story Points:** 5  
**Priority:** Medium  
**Assignee:** Backend Developer  
**Dependencies:** Task 3.4  
**Timeline:** 8 hours  

#### Description
Implement report generation queue to handle long-running report generation tasks asynchronously with progress tracking.

#### Acceptance Criteria
- [ ] Report jobs queued and processed
- [ ] Progress tracking for report generation
- [ ] Multiple report formats (PDF, CSV, Excel)
- [ ] Report storage and retrieval
- [ ] Email notification on completion
- [ ] Report expiration after 30 days

#### AI Implementation Prompt
```
I need to implement a report generation queue system for my restaurant SaaS platform that handles long-running report generation tasks.

Current Problems:
- Report generation blocks HTTP requests (30-45 seconds)
- Browser timeouts on large reports
- Users can't see progress
- Server crashes on complex reports
- No way to download reports later

Report Types:
1. Financial Reports:
   - Profit & Loss Statement (5-10 seconds)
   - Balance Sheet (3-5 seconds)
   - Cash Flow Statement (5-8 seconds)
   - Tax Summary (10-15 seconds)
   
2. Sales Reports:
   - Daily Sales Summary (2-3 seconds)
   - Weekly Sales Trends (5-7 seconds)
   - Monthly Revenue Report (10-15 seconds)
   - Product Performance (8-12 seconds)
   
3. Inventory Reports:
   - Stock Levels (3-5 seconds)
   - Stock Movement History (10-20 seconds)
   - Supplier Performance (8-12 seconds)
   - Waste & Loss Report (5-8 seconds)
   
4. Staff Reports:
   - Payroll Summary (15-25 seconds)
   - Attendance Report (10-15 seconds)
   - Performance Metrics (8-12 seconds)
   - Labor Cost Analysis (10-18 seconds)

Tech Stack:
- Report Generation: PDFKit (PDF), ExcelJS (Excel), json2csv (CSV)
- Queue: BullMQ (already set up)
- Storage: AWS S3 or local filesystem
- Notifications: Email queue (already implemented)

Requirements:
1. Report queue job processor:
   - Accept report request with parameters
   - Show progress (0-100%)
   - Generate report in requested format
   - Store in S3/filesystem
   - Send completion email with download link
   - Clean up after 30 days
2. Support multiple formats:
   - PDF (formatted, print-ready)
   - Excel (.xlsx with multiple sheets)
   - CSV (raw data export)
3. Report templates:
   - Professional formatting
   - Company branding (logo, colors)
   - Charts and visualizations
   - Summary statistics
4. Progress tracking:
   - WebSocket or polling for real-time updates
   - Show current step (e.g., "Fetching data...", "Generating PDF...")
   - Percentage complete
5. Report storage:
   - Generate unique report ID
   - Store in S3 with signed URLs
   - Expire links after 7 days
   - Delete files after 30 days
6. Queue management:
   - Limit concurrent report jobs (max 5)
   - Higher priority for smaller reports
   - Estimated completion time
7. Error handling:
   - Retry on transient failures
   - Notify user if report fails
   - Store partial results for debugging

File Structure:
backend/src/
├── reports/
│   ├── generators/
│   │   ├── financialReports.ts (create)
│   │   ├── salesReports.ts (create)
│   │   ├── inventoryReports.ts (create)
│   │   └── staffReports.ts (create)
│   ├── templates/
│   │   ├── pdfTemplate.ts (create)
│   │   ├── excelTemplate.ts (create)
│   │   └── csvTemplate.ts (create)
│   ├── workers/
│   │   └── reportWorker.ts (update from previous task)
│   └── services/
│       ├── reportService.ts (create)
│       └── reportStorage.ts (create)
├── models/
│   └── Report.ts (create - Prisma model)
└── controllers/
    └── reports.controller.ts (update)

Prisma Model:
model Report {
  id            String   @id @default(uuid())
  restaurant_id String
  user_id       String
  type          String   // "sales", "financial", "inventory"
  format        String   // "pdf", "xlsx", "csv"
  parameters    Json     // date range, filters, etc.
  status        String   // "queued", "processing", "completed", "failed"
  progress      Int      @default(0)
  file_url      String?
  error_message String?
  created_at    DateTime @default(now())
  expires_at    DateTime
}

Please provide:
1. Report worker with progress tracking
2. PDF generation using PDFKit with charts
3. Excel generation with multiple sheets
4. CSV export functionality
5. S3 integration for file storage
6. How to track and update progress
7. WebSocket or polling for real-time updates
8. Scheduled cleanup job for expired reports
9. Report preview before generation
10. Caching for frequently requested reports

Example API Flow:
POST /api/reports/generate
{
  type: "sales",
  format: "pdf",
  dateRange: { start: "2024-01-01", end: "2024-01-31" }
}

Response:
{
  reportId: "uuid",
  status: "queued",
  estimatedTime: "45 seconds"
}

GET /api/reports/:id/status
{
  status: "processing",
  progress: 67,
  currentStep: "Generating charts..."
}

GET /api/reports/:id/download
{
  downloadUrl: "https://s3.../report.pdf",
  expiresAt: "2024-02-16T..."
}

Critical Requirements:
- Never block HTTP requests
- Show real-time progress
- Handle reports with 100k+ rows
- Professional PDF formatting
- Automatic cleanup of old reports
```

#### Testing Checklist
- [ ] Reports generate asynchronously
- [ ] Progress updates working
- [ ] All formats (PDF, Excel, CSV) working
- [ ] Reports stored and retrievable
- [ ] Email notifications sent on completion
- [ ] Old reports cleaned up automatically
- [ ] Large datasets handled without crashes

---

## 🟡 PRIORITY 4: API DOCUMENTATION (SWAGGER) (Week 3)

### Task 4.1: Swagger Setup and Configuration
**Epic:** Infrastructure - Documentation  
**Story Points:** 3  
**Priority:** Medium  
**Assignee:** Backend Developer  
**Dependencies:** None  
**Timeline:** 4 hours  

#### Description
Set up Swagger/OpenAPI documentation for all API endpoints to improve developer experience and reduce integration time.

#### Acceptance Criteria
- [ ] Swagger UI accessible at /api-docs
- [ ] All endpoints documented
- [ ] Request/response schemas defined
- [ ] Authentication documented
- [ ] Example requests/responses included
- [ ] Try-it-out functionality working

#### AI Implementation Prompt
```
I need to set up comprehensive API documentation using Swagger/OpenAPI for my restaurant SaaS platform.

Current Problems:
- Frontend developers constantly asking about API endpoints
- Mobile team struggling with integration
- No centralized API documentation
- Postman collections outdated
- Partner integrations taking 2-3 weeks

Tech Stack:
- Backend: Node.js with Express and TypeScript
- Current Routes: ~50 endpoints across 8 modules

API Modules to Document:
1. Authentication (/api/auth):
   - POST /register, /login, /logout
   - POST /forgot-password, /reset-password
   - GET /verify-email

2. Menu Management (/api/menus):
   - CRUD operations for menus, categories, items
   - Menu publishing/unpublishing
   - Item variants and modifiers

3. Orders (/api/orders):
   - Create, read, update orders
   - Order status management
   - Payment processing

4. Inventory (/api/inventory):
   - Item management
   - Stock adjustments
   - Low stock alerts

5. Reports (/api/reports):
   - Sales reports
   - Financial reports
   - Inventory reports

6. Staff Management (/api/staff):
   - Staff CRUD
   - Scheduling
   - Attendance tracking

7. Dashboard (/api/dashboard):
   - Statistics
   - Recent activity

8. Settings (/api/settings):
   - Restaurant settings
   - User preferences

Requirements:
1. Use swagger-jsdoc and swagger-ui-express
2. OpenAPI 3.0 specification
3. Document all endpoints with:
   - Description and purpose
   - Request parameters (path, query, body)
   - Request body schemas
   - Response schemas (success and error)
   - Authentication requirements
   - Example requests and responses
4. Organize by tags (modules)
5. Include authentication schemes:
   - Bearer token (JWT)
   - API keys (for partners)
6. Interactive "Try it out" functionality
7. Schema reusability (define once, use many times)
8. Environment selection (dev, staging, production)
9. Versioning support (v1, v2)

File Structure:
backend/src/
├── docs/
│   ├── swagger.config.ts (create)
│   ├── schemas/
│   │   ├── auth.schema.ts (create)
│   │   ├── menu.schema.ts (create)
│   │   ├── order.schema.ts (create)
│   │   ├── inventory.schema.ts (create)
│   │   └── common.schema.ts (create)
│   └── examples/
│       ├── requests.ts (create)
│       └── responses.ts (create)
├── routes/
│   ├── auth.routes.ts (update with JSDoc)
│   ├── menu.routes.ts (update with JSDoc)
│   └── ... (update all route files)
└── server.ts (update)

Please provide:
1. Complete Swagger configuration
2. How to document routes using JSDoc comments
3. Reusable schema definitions
4. Example requests/responses
5. Authentication setup in Swagger UI
6. How to organize documentation by modules
7. Custom CSS for branding
8. Export OpenAPI spec as JSON/YAML
9. Integration testing with documented schemas

Example Documentation Pattern:
/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderResponse'
 */

Critical Requirements:
- All endpoints must be documented
- Documentation must stay in sync with code
- Examples must be accurate and working
- Try-it-out feature must work with authentication
```

#### Testing Checklist
- [ ] Swagger UI accessible at /api-docs
- [ ] All endpoints listed and organized
- [ ] Request/response schemas accurate
- [ ] Example requests work with "Try it out"
- [ ] Authentication working in Swagger UI
- [ ] Documentation matches actual API behavior

---

### Task 4.2: Schema Validation with OpenAPI
**Epic:** Infrastructure - Quality  
**Story Points:** 3  
**Priority:** Medium  
**Assignee:** Backend Developer  
**Dependencies:** Task 4.1  
**Timeline:** 4 hours  

#### Description
Implement automatic request/response validation using OpenAPI schemas to catch errors early and ensure API consistency.

#### Acceptance Criteria
- [ ] Request validation middleware implemented
- [ ] Response validation in development
- [ ] Validation errors return clear messages
- [ ] Schema violations logged
- [ ] Type safety with TypeScript
- [ ] Auto-generate types from schemas

#### AI Implementation Prompt
```
I need to implement automatic request/response validation using OpenAPI schemas to ensure API consistency and catch errors early.

Current Problems:
- Invalid requests reaching controllers
- Inconsistent error messages
- No validation for response shapes
- TypeScript types out of sync with API schemas
- Runtime errors from malformed data

Tech Stack:
- Backend: Node.js with Express and TypeScript
- Swagger: Already set up with OpenAPI schemas
- Goal: Automatic validation using existing schemas

Requirements:
1. Install express-openapi-validator or similar
2. Request validation middleware:
   - Validate request body against schema
   - Validate query parameters
   - Validate path parameters
   - Validate headers
   - Return 400 with clear error messages
3. Response validation (development only):
   - Validate response matches schema
   - Log violations to Sentry
   - Don't break production, just warn
4. Generate TypeScript types from OpenAPI schemas:
   - Auto-generate request/response interfaces
   - Keep types in sync with schemas
   - Use in controllers for type safety
5. Custom error formatter:
   - User-friendly error messages
   - Specify which field failed validation
   - Include validation rules in error
6. Schema evolution:
   - Support API versioning
   - Backward compatibility checks
   - Deprecation warnings

File Structure:
backend/src/
├── middleware/
│   └── validator.middleware.ts (create)
├── types/
│   └── generated/
│       └── api.types.ts (auto-generated)
├── utils/
│   ├── errorFormatter.ts (create)
│   └── schemaValidator.ts (create)
└── server.ts (update)

Please provide:
1. OpenAPI validator middleware setup
2. Custom error formatting
3. How to generate TypeScript types from schemas
4. Response validation for development
5. How to handle validation errors gracefully
6. Schema version management
7. Testing validation rules
8. Documentation for common validation errors

Example Validation Errors:
{
  "error": "Validation Error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "email",
      "message": "must be a valid email address",
      "value": "invalid-email"
    },
    {
      "field": "price",
      "message": "must be greater than 0",
      "value": -5
    }
  ]
}

TypeScript Type Generation:
// Auto-generated from OpenAPI schema
interface CreateOrderRequest {
  items: OrderItem[];
  customer_id: string;
  payment_method: 'cash' | 'card' | 'mobile';
  notes?: string;
}

// Use in controller with full type safety
async createOrder(req: Request<{}, {}, CreateOrderRequest>, res: Response) {
  const { items, customer_id, payment_method } = req.body;
  // TypeScript knows exact shape of req.body
}

Critical Requirements:
- All requests validated before reaching controllers
- Clear, actionable error messages
- Type safety across entire codebase
- No performance impact in production
- Easy to add new endpoints with validation
```

#### Testing Checklist
- [ ] Invalid requests rejected with 400
- [ ] Error messages are clear and actionable
- [ ] TypeScript types match OpenAPI schemas
- [ ] Response validation catches schema violations
- [ ] No false positives in validation
- [ ] Performance impact minimal

---

## 📊 IMPLEMENTATION SUMMARY

### Week 1 Priorities (Must-Have)
1. ✅ Rate Limiting (Tasks 1.1, 1.2) - 6 hours
2. ✅ Sentry Error Tracking (Tasks 2.1, 2.2) - 6 hours
**Total: 12 hours / 1.5 days**

### Week 2 Priorities (High Priority)
3. ✅ Redis Setup (Task 3.1) - 4 hours
4. ✅ Caching Implementation (Task 3.2) - 6 hours
5. ✅ Session Management (Task 3.3) - 4 hours
6. ✅ Job Queue Setup (Task 3.4) - 8 hours
**Total: 22 hours / 2.75 days**

### Week 3 Priorities (Medium Priority)
7. ✅ Email Queue (Task 3.5) - 8 hours
8. ✅ Report Queue (Task 3.6) - 8 hours
9. ✅ Swagger Documentation (Task 4.1) - 4 hours
10. ✅ Schema Validation (Task 4.2) - 4 hours
**Total: 24 hours / 3 days**

### Overall Timeline
- **Total Tasks:** 10
- **Total Estimated Time:** 58 hours / ~7.25 days
- **Recommended Timeline:** 3 weeks (allowing for testing and fixes)

### Success Metrics

#### Performance Improvements
- Dashboard load time: 5-8s → 300-500ms (8-16x faster)
- API response time: 2.5s → 300ms (8x faster)
- Database CPU: 85% → 15% (70% reduction)
- Concurrent users: 50 → 500+ (10x increase)

#### Reliability Improvements
- Bug detection time: 1-7 days → 10 seconds
- Email success rate: 70% → 99.5%
- System uptime: 95% → 99.9%
- Security incidents: 5-10/year → 0-1/year

#### Business Impact
- Server costs: $500/mo → $100/mo (80% savings)
- Support costs: $115K/year → $10K/year
- Customer satisfaction: 60% → 95% (+35%)
- Revenue protection: $150K+ annually

---

## 📝 NOTES FOR JIRA BOARD

### Epic Structure
```
Epic 1: Infrastructure - Security
  ├── Task 1.1: Rate Limiting Middleware
  └── Task 1.2: Rate Limiting Endpoints

Epic 2: Infrastructure - Monitoring
  ├── Task 2.1: Sentry Backend Integration
  └── Task 2.2: Sentry Frontend Integration

Epic 3: Infrastructure - Performance
  ├── Task 3.1: Redis Setup
  ├── Task 3.2: Caching Implementation
  └── Task 3.3: Session Management

Epic 4: Infrastructure - Async Processing
  ├── Task 3.4: Job Queue Setup
  ├── Task 3.5: Email Queue
  └── Task 3.6: Report Queue

Epic 5: Infrastructure - Documentation
  ├── Task 4.1: Swagger Setup
  └── Task 4.2: Schema Validation
```

### Story Point Legend
- 1 point = 2 hours
- 2 points = 4 hours
- 3 points = 6 hours
- 5 points = 8-10 hours

### Task Labels
- `infrastructure`
- `security`
- `performance`
- `monitoring`
- `documentation`
- `critical`
- `high-priority`
- `medium-priority`

### Sprint Planning
- **Sprint 1 (Week 1):** Tasks 1.1, 1.2, 2.1, 2.2 (Security & Monitoring)
- **Sprint 2 (Week 2):** Tasks 3.1, 3.2, 3.3, 3.4 (Performance & Queue Setup)
- **Sprint 3 (Week 3):** Tasks 3.5, 3.6, 4.1, 4.2 (Async Processing & Docs)
