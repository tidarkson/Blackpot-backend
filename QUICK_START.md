# BlackPot Backend - Quick Start Guide

**Get from zero to running API in one day**

---

## 🚀 QUICK START (4 Hours)

### Part 1: Database Setup (1.5 hours)

```bash
# 1. Install PostgreSQL if needed
# Download from postgresql.org

# 2. Create database and user
psql -U postgres
CREATE DATABASE blackpot_dev;
CREATE USER blackpot_user WITH PASSWORD 'secure_password';
ALTER ROLE blackpot_user WITH SUPERUSER;
\q

# 3. Clone repo and install
cd "BlackPot Backend"
npm install

# 4. Create .env file
cp .env.example .env
# Edit .env and set:
# DATABASE_URL=postgresql://blackpot_user:secure_password@localhost:5432/blackpot_dev

# 5. Run migrations
npx prisma migrate dev --name initial_schema

# 6. Seed sample data
npm run db:seed

# 7. Verify (opens UI in browser)
npm run db:studio
```

**Expected Result**: Browser opens showing 13 users, 50 orders, 100+ inventory items

---

### Part 2: API Server Setup (2.5 hours)

```bash
# 1. Install API dependencies
npm install express cors dotenv helmet jsonwebtoken bcryptjs
npm install --save-dev typescript @types/express @types/node ts-node

# 2. Create folder structure
mkdir -p src/{routes,controllers,services,middleware,types,utils,config}

# 3. Copy config files (from API_IMPLEMENTATION_GUIDE.md Phase 1)
# Create: src/config/environment.ts
# Create: src/index.ts
# Create: src/middleware/errorHandler.ts
# Create: src/middleware/requestLogger.ts

# 4. Copy auth files (from API_IMPLEMENTATION_GUIDE.md Phase 2)
# Create: src/types/auth.ts
# Create: src/services/AuthService.ts
# Create: src/middleware/auth.ts
# Create: src/controllers/AuthController.ts
# Create: src/routes/auth.ts

# 5. Update package.json scripts
# "dev": "ts-node src/index.ts"
# "build": "tsc"
# "start": "node dist/index.js"

# 6. Start server
npm run dev

# 7. Test login endpoint
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@blackpot.com","password":"password123"}'
```

**Expected Result**: Server starts, login returns JWT token

---

## 📚 DOCUMENTATION QUICK LINKS

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **ROADMAP.md** | Project overview and timeline | 15 min |
| **COMPREHENSIVE_ANALYSIS.md** | Project assessment & feedback | 20 min |
| **DATABASE_SETUP_GUIDE.md** | Database initialization | 10 min |
| **ENDPOINTS_SPECIFICATION.md** | All 60+ API endpoints | 30 min |
| **RBAC_MATRIX.md** | Permission rules per role | 20 min |
| **API_IMPLEMENTATION_GUIDE.md** | Step-by-step implementation | 45 min |

---

## 🎯 YOUR EXACT NEXT STEPS

### TODAY (4 hours)
1. ✅ Run Part 1: Database Setup (1.5 hours)
2. ✅ Run Part 2: API Server Setup (2.5 hours)
3. ✅ Test one login endpoint works

### TOMORROW (6 hours)
4. ✅ Add User endpoints (list, create, get, update)
5. ✅ Add Table endpoints (list, get, update status)
6. ✅ Test with Postman/Insomnia

### THIS WEEK (15 hours)
7. ✅ Add Order endpoints (create, get, close, add courses)
8. ✅ Add Menu endpoints (list, get items)
9. ✅ Add Reservation endpoints
10. ✅ Add Payment endpoints

### NEXT WEEK (20 hours)
11. ✅ Add Kitchen Display System
12. ✅ Add Inventory endpoints
13. ✅ Add Reports endpoints
14. ✅ Deploy to staging

---

## 📋 KEY FILES TO REFERENCE

### Database Files
- `database/prisma/schema.prisma` - Your data model (28 models)
- `database/seeds/seed.ts` - Sample data with 500+ records
- `.env.example` - Configuration template

### API Documentation
- `docs/api/ENDPOINTS_SPECIFICATION.md` - All endpoints defined
- `docs/api/RBAC_MATRIX.md` - Who can do what
- `docs/api/API_IMPLEMENTATION_GUIDE.md` - How to build it

### Project Files
- `ROADMAP.md` - Full project plan
- `COMPREHENSIVE_ANALYSIS.md` - Project assessment

---

## 🔑 KEY CONCEPTS

### Architecture Layers
```
Client (Postman/Frontend)
    ↓
Express Server (API)
    ↓
Middleware (Auth, Validation, Error)
    ↓
Controllers (Handle requests)
    ↓
Services (Business logic)
    ↓
Prisma ORM (Database queries)
    ↓
PostgreSQL (Data storage)
```

### Authentication Flow
```
1. POST /api/v1/auth/login
   → Username + Password
   ↓
2. AuthService hashes & verifies
   ↓
3. Generate JWT token (contains userId, role, tenantId)
   ↓
4. Return token to client
   ↓
5. Client uses in headers: "Authorization: Bearer <token>"
   ↓
6. Middleware verifies token on protected endpoints
```

### Role-Based Access
```
Every endpoint has allowed roles:

GET /users
├─ OWNER: ✅ Full access
├─ MANAGER: ✅ Full access
├─ SERVER: ❌ Denied
└─ Other: ❌ Denied

See RBAC_MATRIX.md for all rules
```

---

## 🧪 TESTING GUIDE

### Test 1: Health Check
```bash
curl http://localhost:3000/
# Should return message
```

### Test 2: Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@blackpot.com",
    "password": "password123"
  }'
# Returns: { accessToken: "...", refreshToken: "...", user: {...} }
```

### Test 3: Protected Endpoint (with token)
```bash
# Save token from login response
TOKEN="eyJhbGciOiJIUzI1..."

# Use token in request
curl -X GET http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer $TOKEN"
# Returns: { status: "success", data: [...] }
```

### Test 4: Unauthorized Request (no token)
```bash
curl -X GET http://localhost:3000/api/v1/users
# Returns: 401 Unauthorized
```

---

## 🐛 TROUBLESHOOTING

### Problem: "Database connection failed"
```
Solution:
1. Check PostgreSQL is running
2. Verify DATABASE_URL in .env is correct
3. Verify database and user exist:
   psql -U blackpot_user -d blackpot_dev
```

### Problem: "Seed script fails"
```
Solution:
1. Drop and recreate database:
   npx prisma migrate reset
2. Run seed again:
   npm run db:seed
```

### Problem: "Login returns 401"
```
Solution:
1. Verify seed ran: npm run db:studio
2. Check user exists with correct password
3. Sample users have password "password123"
```

### Problem: "Port 3000 already in use"
```
Solution:
1. Kill process: kill -9 $(lsof -t -i:3000)
2. Or change PORT in .env: PORT=3001
```

---

## 📊 SAMPLE DATA INCLUDED

When you run the seed script, you get:

```
Tenant:           1  (Michelin Restaurant Group)
Location:         1  (Downtown Fine Dining)
Users:           13  (Owner, Managers, Servers, Chefs, etc.)
Tables:          15  (2-seat to 8-seat)
Menu:             1  (Fine Dining)
Menu Sections:    7  (Appetizers, Mains, Desserts, etc.)
Menu Items:      16  (Oysters, Ribeye, Desserts, etc.)
Reservations:    21  (Next 7 days × 3 per day)
Orders:          50  (Sample orders spanning 30 days)
Inventory Items:100+ (30 wines, 30 produce, 20 seafood, 20 meat)
Suppliers:        4  (Wine, Produce, Seafood, Meat)
Business Days:   31  (Last 30 days)
Shifts:          50+ (Staff shifts)
```

**Use this data for testing!**

---

## 🎮 POSTMAN / INSOMNIA SETUP

### Import Environment
```json
{
  "token": "{{JWT_TOKEN}}",
  "base_url": "http://localhost:3000/api/v1",
  "owner_email": "owner@blackpot.com",
  "server_email": "server1@blackpot.com"
}
```

### Create Requests

**1. Login (get token)**
```
POST {{base_url}}/auth/login
Body:
{
  "email": "{{owner_email}}",
  "password": "password123"
}
Tests:
var jsonData = pm.response.json();
pm.environment.set("token", jsonData.data.accessToken);
```

**2. List Users**
```
GET {{base_url}}/users
Headers:
Authorization: Bearer {{token}}
```

**3. Get Tables**
```
GET {{base_url}}/locations/location-1/tables
Headers:
Authorization: Bearer {{token}}
```

---

## 🚀 DEPLOYMENT QUICK STEPS

### To Production
```bash
# 1. Build
npm run build

# 2. Set environment variables
export DATABASE_URL="prod_db_url"
export JWT_SECRET="random_secret_here"
export NODE_ENV="production"

# 3. Run migrations
npx prisma migrate deploy

# 4. Start server
npm start
```

### Using Docker
```bash
# Build image
docker build -t blackpot-api .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  blackpot-api
```

---

## 📞 COMMON COMMANDS

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build TypeScript
npm run db:studio        # Open database UI
npm run db:migrate       # Create migration
npm run db:reset         # Reset database (⚠️ deletes data)
npm run db:seed          # Seed sample data

# Database
psql -U blackpot_user -d blackpot_dev  # Connect to DB
\d                                      # List tables
\q                                      # Quit

# Git
git add .
git commit -m "Add API endpoints"
git push origin main
```

---

## ✨ YOU'RE READY!

Your foundation is solid:
- ✅ Database designed and seeded
- ✅ 28 models with relationships
- ✅ 500+ sample records
- ✅ Detailed documentation
- ✅ RBAC rules defined
- ✅ API endpoints specified

**Next**: Start implementing endpoints. Begin with:
1. Authentication (already in guide)
2. User Management (2 hours)
3. Table Management (2 hours)
4. Order Management (4 hours)

**Expected**: Week 1 = Auth + Basic CRUD operations working

---

## 🎓 LEARNING RESOURCES

**Express.js**: https://expressjs.com/
**TypeScript**: https://www.typescriptlang.org/
**Prisma**: https://www.prisma.io/
**JWT**: https://jwt.io/
**REST Best Practices**: https://restfulapi.net/

---

Good luck! You've got this! 🚀

Questions? Check `COMPREHENSIVE_ANALYSIS.md` or `API_IMPLEMENTATION_GUIDE.md`
