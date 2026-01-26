# BlackPot Backend - Database Setup & Migration Guide

**Created**: January 23, 2026  
**Version**: 1.0  
**Status**: Production Ready for Phase 1

---

## 📋 OVERVIEW

This guide covers:
1. **Initial setup** - Getting the database ready
2. **Migrations** - Creating database schema
3. **Seeding** - Populating with test data
4. **Indexes** - Optimizing performance
5. **Audit triggers** - Automatic timestamp updates
6. **Manual steps** - What you need to do yourself

---

## 🚀 PHASE 1: INITIAL DATABASE SETUP

### Prerequisites

Ensure you have installed:
- ✅ Node.js 18+ (you have this)
- ✅ PostgreSQL 12+ (you need this)
- ✅ Prisma CLI (in package.json dependencies)
- ✅ TypeScript (in package.json dependencies)

### Step 1: Install Dependencies

```bash
cd "C:\Users\tidar\Documents\Web Dev Projects\BlackPot Backend"
npm install
```

**What this does:**
- Installs `@prisma/client` - Database client library
- Installs `prisma` - CLI tool for migrations
- Installs TypeScript and ts-node

**Expected output:**
```
added 200+ packages in 2m
```

### Step 2: Configure Database Connection

**MANUAL STEP** - You need to do this:

1. **Ensure PostgreSQL is installed and running**
   ```bash
   # Windows - Start PostgreSQL service
   # OR access PostgreSQL from Docker/WSL/native installation
   psql --version  # Should show PostgreSQL 12+
   ```

2. **Create database and user**
   ```sql
   -- Open PostgreSQL terminal or use pgAdmin
   
   -- Create role/user
   CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'your_secure_password';
   
   -- Create database
   CREATE DATABASE blackpot_dev OWNER blackpot_user;
   
   -- Grant privileges
   GRANT CREATE ON DATABASE blackpot_dev TO blackpot_user;
   GRANT ALL PRIVILEGES ON DATABASE blackpot_dev TO blackpot_user;
   ```

3. **Update `.env` file**
   ```
   # Replace the DATABASE_URL with your actual connection
   DATABASE_URL="postgresql://blackpot_user:your_secure_password@localhost:5432/blackpot_dev"
   ```

### Step 3: Initialize Prisma (First Time Only)

This creates the migrations folder:

```bash
npx prisma migrate dev --name initial_schema
```

**What this does:**
1. Validates the schema.prisma file
2. Creates `database/prisma/migrations/` folder
3. Generates initial migration file
4. Applies migration to database
5. Generates Prisma Client

**Expected output:**
```
✔ Enter a name for the new migration: › initial_schema
Prisma Migrate created the following migration:

migrations/
  └─ 20260123000000_initial_schema/
    └─ migration.sql

✔ Your database has been successfully created and synced with the Prisma schema

✔ Generated Prisma Client to .prisma/client in 250ms
```

**IMPORTANT**: Do NOT commit `.env` file to git. It's in `.gitignore` for security.

---

## 🌱 PHASE 2: SEED DATABASE WITH SAMPLE DATA

### What Gets Created

The seed script creates:
- ✅ 1 Tenant (Restaurant Group)
- ✅ 1 Location (Fine Dining Restaurant)
- ✅ 15 Tables (various sizes for POS floor plan)
- ✅ 13 Staff Members (Owner, Managers, Servers, Kitchen)
- ✅ 1 Menu with 7 sections and 16 menu items (fine dining)
- ✅ 4 Kitchen Stations (Grill, Pastry, Garde Manger, Sauce)
- ✅ 21 Reservations (7 days × 3 per day)
- ✅ 50 Sample Orders (last 30 days with realistic data)
- ✅ 100+ Inventory Items (wine cellar, produce, seafood, meat)
- ✅ 4 Suppliers
- ✅ Financial Settings (tax, service charge)

### Run Seed Script

```bash
npm run db:seed
```

**What this does:**
1. Connects to PostgreSQL database
2. Deletes existing test data (development only!)
3. Creates all sample data
4. Populates inventory with 100+ items
5. Creates historical orders for testing reports

**Expected output:**
```
🌱 Starting database seeding...
🧹 Cleaning database...
🏢 Creating tenant...
📍 Creating location...
🔪 Creating kitchen stations...
👥 Creating users...
🪑 Creating tables...
📋 Creating menu...
🍽️ Creating menu items...
📅 Creating reservations...
📊 Creating business days...
📝 Creating sample orders...
🚚 Creating suppliers...
🍇 Creating inventory items...
📦 Creating stock movements...
👔 Creating shifts...
✅ Seeding completed successfully!

📊 Summary:
  Tenant: Michelin Restaurant Group
  Location: Downtown Fine Dining
  Users: 13
  Tables: 15
  Menu Items: 16
  Inventory Items: 100+
  Suppliers: 4
  Business Days: 31
  Reservations: 21
  Orders: 50
```

---

## 🔍 PHASE 3: VERIFY SETUP

### Check Database Populated

```bash
# Open Prisma Studio (visual database explorer)
npm run db:studio
```

This opens http://localhost:5555 with visual database explorer.

**Navigate to verify:**
- ✅ Tenant table has 1 record
- ✅ Location table has 1 record  
- ✅ User table has 13 records
- ✅ Table table has 15 records
- ✅ Menu table has 1 record with sections
- ✅ MenuItem table has 16 records
- ✅ Order table has 50 records
- ✅ InventoryItem table has 100+ records

### Test Database Connection

```bash
# From Node.js
npx ts-node << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst();
  console.log('✅ Connected to database');
  console.log('Tenant:', tenant.name);
}

main().finally(async () => {
  await prisma.$disconnect();
});
EOF
```

---

## 📊 PHASE 4: ADD INDEXES FOR PERFORMANCE

The database schema includes indexes defined in INDEXING_STRATEGY.md. To apply them:

### Option A: Automatic (Recommended)

```bash
npx prisma migrate dev --name add_performance_indexes
```

Then apply the SQL from `database/indexing_strategy.sql`:

```bash
psql -U blackpot_user -d blackpot_dev -f database/indexing_strategy.sql
```

### Option B: Manual Index Creation

```sql
-- Most critical indexes (Phase 1 - apply first)
CREATE INDEX idx_order_table ON orders(table_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_order_status ON orders(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_order_course_kitchen_station ON order_courses(kitchen_station_id) WHERE completed_at IS NULL;
CREATE INDEX idx_reservation_date ON reservations(tenant_id, DATE(reserved_at), status) WHERE cancelled_at IS NULL;
CREATE INDEX idx_menu_item_section ON menu_items(section_id, is_available) WHERE is_available = true;

-- Run after Phase 1 to verify performance
ANALYZE;
```

**Expected improvement:**
```
Before indexes:
  Order retrieval: ~500ms ❌
  Reservation lookup: ~200ms ❌

After Phase 1 indexes:
  Order retrieval: ~50ms ✅
  Reservation lookup: ~50ms ✅
```

---

## 🔐 PHASE 5: AUDIT TRIGGERS (Optional but Recommended)

PostgreSQL triggers automatically update `updated_at` timestamps:

```sql
-- Create function to auto-update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with timestamps
CREATE TRIGGER orders_timestamp BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER menu_items_timestamp BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER users_timestamp BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER locations_timestamp BEFORE UPDATE ON location
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Add more triggers as needed for other tables
```

Or use the complete script in `database/sql/audit_triggers.sql` (create this if needed).

---

## 🎯 PHASE 6: DATA INTEGRITY CHECKS

### Check Multi-Tenancy Isolation

```sql
-- Verify all data belongs to one tenant
SELECT tenant_id, COUNT(*) as count FROM orders GROUP BY tenant_id;
SELECT tenant_id, COUNT(*) as count FROM reservations GROUP BY tenant_id;
SELECT tenant_id, COUNT(*) as count FROM menu_items GROUP BY tenant_id;

-- Should show 1 row for each (all data in one tenant)
```

### Check for Orphaned Records

```sql
-- Check for orders without servers
SELECT o.id FROM orders o
LEFT JOIN "user" u ON o.server_id = u.id
WHERE u.id IS NULL;

-- Should be empty

-- Check for menu items without sections
SELECT mi.id FROM menu_items mi
LEFT JOIN menu_section ms ON mi.section_id = ms.id
WHERE ms.id IS NULL;

-- Should be empty
```

### Check Data Consistency

```sql
-- Verify all orders have at least one order_course
SELECT o.id FROM orders o
LEFT JOIN order_course oc ON o.id = oc.order_id
WHERE oc.id IS NULL;

-- Should show only recent orders without courses yet
```

---

## 📈 MONITORING & MAINTENANCE

### Weekly Tasks

```bash
# Update query planner statistics
npm run db:optimize  # (if you add this script)

# Or manually:
psql -U blackpot_user -d blackpot_dev -c "ANALYZE;"
```

### Monitor Slow Queries

```sql
-- Enable query logging (PostgreSQL config)
log_min_duration_statement = 1000  -- Log queries > 1 second

-- View slow queries
SELECT query, calls, mean_time
FROM pg_stat_statements
WHERE mean_time > 1000  -- Queries taking > 1 second
ORDER BY mean_time DESC;
```

### Monitor Index Usage

```sql
-- Find unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY tablename;

-- These indexes might be candidates for removal
```

---

## 🔧 TROUBLESHOOTING

### Error: "Could not connect to database"

**Problem**: Database connection failed

**Solution**:
```bash
# 1. Check PostgreSQL is running
psql --version

# 2. Verify credentials in .env
cat .env | grep DATABASE_URL

# 3. Test connection
psql -U blackpot_user -d blackpot_dev -c "SELECT 1;"

# 4. Check database exists
psql -U postgres -l  # Lists all databases
```

### Error: "The migration failed"

**Problem**: Schema migration didn't apply

**Solution**:
```bash
# 1. Check migration status
npx prisma migrate status

# 2. Reset database (DEVELOPMENT ONLY!)
npm run db:reset

# 3. Re-run migration
npm run db:migrate
```

### Error: "Seed script timeout"

**Problem**: Seed script is taking too long

**Solution**:
```bash
# Run with longer timeout
NODE_OPTIONS="--max-old-space-size=4096" npm run db:seed

# Or increase PostgreSQL statement timeout
psql -U blackpot_user -d blackpot_dev -c "SET statement_timeout = '5min';"
```

---

## 📋 DEPLOYMENT CHECKLIST

### Development Setup
- [ ] PostgreSQL installed and running
- [ ] Database created and user configured
- [ ] `.env` file configured with DATABASE_URL
- [ ] `npm install` completed
- [ ] Initial migration created: `npx prisma migrate dev`
- [ ] Seed data populated: `npm run db:seed`
- [ ] Verified with: `npm run db:studio`

### Staging Setup
- [ ] Database created on staging server
- [ ] `.env` configured for staging (pooling enabled)
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] DO NOT seed (use production backup)
- [ ] Run indexes: `psql -f database/indexing_strategy.sql`
- [ ] Enable audit triggers
- [ ] Test with production-like data

### Production Setup
- [ ] Database created on production server with backups
- [ ] Connection pooling configured (PgBouncer recommended)
- [ ] `.env` configured for production
- [ ] Backups configured before any migrations
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Run indexes during maintenance window
- [ ] Enable audit triggers
- [ ] Enable Row Level Security (RLS) for multi-tenant isolation
- [ ] Monitor and log all queries

---

## 🚀 NEXT STEPS

After database is set up and seeded:

### 1. **API Development** (Weeks 2-3)
- [ ] Choose framework (Express/Fastify/NestJS)
- [ ] Define REST endpoints (50+ endpoints)
- [ ] Implement authentication/authorization
- [ ] Connect API to database

### 2. **Testing** (Week 3-4)
- [ ] Write unit tests for services
- [ ] Write integration tests for API
- [ ] Load test database (1000+ concurrent orders)
- [ ] Performance benchmark against targets

### 3. **Frontend Integration** (Week 4+)
- [ ] Connect UI to API endpoints
- [ ] Test full order flow
- [ ] User acceptance testing

---

## 📚 QUICK REFERENCE

### Common Commands

```bash
# Development
npm run dev          # Start development server
npm run db:migrate   # Create new migration
npm run db:seed      # Populate test data
npm run db:studio    # Visual database explorer
npm run db:reset     # Full reset (dev only)

# Production
npm run build        # Build for production
npm start            # Start production server
npm run db:migrate:prod  # Apply migrations
```

### Database URLs for Different Environments

```
Development:  postgresql://user:pass@localhost:5432/blackpot_dev
Staging:      postgresql://user:pass@staging.db:5432/blackpot_staging
Production:   postgresql://user:pass@prod.db:5432/blackpot
```

### File Locations

```
Database Schema:    database/prisma/schema.prisma
Migrations:         database/prisma/migrations/
Seed Script:        database/seeds/seed.ts
Indexes:            database/indexing_strategy.sql
Config:             .env, .env.example
Documentation:      docs/database/
```

---

## ✅ MIGRATION COMPLETE

Once all phases above are complete, you'll have:

✅ **Schema** - Fully defined and migrated  
✅ **Data** - Sample data for testing  
✅ **Indexes** - Performance optimized  
✅ **Triggers** - Automatic timestamp updates  
✅ **Monitoring** - Query logging enabled  
✅ **Documentation** - Complete setup guide  

Ready to move to API development!

---

**Questions?** Check the comprehensive analysis in `COMPREHENSIVE_ANALYSIS.md`

**Performance targets:** See `docs/database/INDEXING_STRATEGY.md`

**Architecture decisions:** See `docs/architecture/RESOLUTION_COMPLETE.md`
