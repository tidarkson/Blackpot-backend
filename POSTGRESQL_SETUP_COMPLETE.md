# PostgreSQL Setup Guide for BlackPot Backend

**Date**: January 26, 2026  
**Goal**: Set up PostgreSQL, configure VS Code, and run Prisma migrations  

---

## ✅ QUICK STATUS

✅ PostgreSQL is installed and running on your system (postgresql-x64-18 service)  
✅ You have Prisma configured  
❌ Database not yet created  
❌ Connection credentials not yet set up  

---

## 📋 STEP-BY-STEP SETUP

### STEP 1: Verify PostgreSQL Installation (Already Done ✅)

Your PostgreSQL service is running:
```
Status: Running
Name: postgresql-x64-18
```

Find PostgreSQL installation directory (typically):
- Windows: `C:\Program Files\PostgreSQL\18` or `C:\Program Files\PostgreSQL\15`

---

### STEP 2: Create Database and User via pgAdmin Web Interface (Recommended)

#### 2.1: Open pgAdmin

```
Go to: http://localhost:5050
(pgAdmin is the PostgreSQL web interface)
```

**If pgAdmin not accessible**, you can use the command line (STEP 3 instead).

#### 2.2: Login to pgAdmin
- Default email: `postgres@pgadmin.org`
- Default password: `admin`

**First time?** pgAdmin will ask you to set a password on first login.

#### 2.3: Create Database

1. Click on **Servers** in the left sidebar
2. Right-click **PostgreSQL 18** (or your version)
3. Click **Connect**
   - Host: `localhost`
   - Port: `5432`
   - Username: `postgres`
   - Password: (the one you set during PostgreSQL installation)

4. Once connected, right-click **Databases**
5. Select **Create > Database**
   - Name: `blackpot_dev`
   - Owner: `postgres`
   - Click **Save**

#### 2.4: Create User

1. Right-click **Login/Group Roles**
2. Select **Create > Login/Group Role**
   - Name: `blackpot_user`
   - Password: `blackpot_secure_password_123` (or your choice)
   - Keep other defaults
   - Click **Save**

3. Right-click the new user `blackpot_user`
4. Select **Properties**
5. Go to **Privileges** tab
6. Enable: **Can create new roles**, **Create Database**
7. Click **Save**

---

### STEP 3: Create Database via Command Line (Alternative)

If you prefer command line, find your PostgreSQL `bin` folder:

```powershell
# Find PostgreSQL installation
$pgPath = "C:\Program Files\PostgreSQL\18\bin"

# Check if it exists
Test-Path $pgPath
```

Then run these commands:

```powershell
# Set PostgreSQL bin path
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# Create database (you'll be prompted for postgres password)
createdb -U postgres -h localhost blackpot_dev

# Create user
psql -U postgres -h localhost -c "CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'blackpot_secure_password_123';"

# Grant privileges
psql -U postgres -h localhost -c "GRANT CREATE ON DATABASE blackpot_dev TO blackpot_user;"
psql -U postgres -h localhost -c "ALTER ROLE blackpot_user CREATEDB;"
```

---

### STEP 4: Update .env File in VS Code

1. Open VS Code
2. Open `.env` file (root of your project)
3. Replace the content:

**Before:**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/blackpot_dev"
```

**After** (with YOUR actual credentials):
```env
DATABASE_URL="postgresql://blackpot_user:blackpot_secure_password_123@localhost:5432/blackpot_dev"
```

**IMPORTANT**: 
- Replace `blackpot_secure_password_123` with the actual password you set
- Keep the exact format: `postgresql://username:password@host:port/database`
- **DO NOT** commit `.env` to git (it's in `.gitignore`)

4. Save the file

---

### STEP 5: Install PostgreSQL Explorer Extension in VS Code

#### 5.1: Open Extensions in VS Code

1. Press: `Ctrl+Shift+X` (or click Extensions icon on left sidebar)
2. Search: `PostgreSQL`
3. Install: **"PostgreSQL" by Chris Norris** (or "SQLTools" by Matheus Teixeira)

**Popular Options:**
- **PostgreSQL** (Chris Norris) - Lightweight, tree view
- **SQLTools** (Matheus Teixeira) - Full-featured IDE
- **PostgreSQL Explorer** (ckolkman) - Specialized for PostgreSQL

**Recommended**: PostgreSQL Explorer for this project

#### 5.2: Configure Extension

After installation:

1. Go to VS Code **Settings** (Ctrl+Comma)
2. Search: `postgres` or `postgresql`
3. Find **PostgreSQL: Connection Settings** (or similar)
4. Add connection profile:

```json
{
  "host": "localhost",
  "port": 5432,
  "user": "blackpot_user",
  "password": "blackpot_secure_password_123",
  "database": "blackpot_dev",
  "name": "BlackPot Dev"
}
```

Or use VS Code's GUI:
1. Click **PostgreSQL Explorer** icon (left sidebar)
2. Click **Add Connection**
3. Fill in form:
   - Host: `localhost`
   - Port: `5432`
   - User: `blackpot_user`
   - Password: `blackpot_secure_password_123`
   - Database: `blackpot_dev`
4. Click **Connect**

---

### STEP 6: Test PostgreSQL Connection in VS Code

#### 6.1: Using PostgreSQL Explorer

1. Open PostgreSQL Explorer (left sidebar)
2. Look for your connection "BlackPot Dev"
3. Click to expand
4. Should show: Tables, Views, Functions, etc.

**If connection fails:**
- Check host/port/user/password
- Verify PostgreSQL service is running
- Check .env file is saved

#### 6.2: Using SQL Terminal

1. In VS Code, open new terminal
2. Add PostgreSQL to PATH:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
```

3. Test connection:

```powershell
psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT version();"
```

Should return PostgreSQL version and "OK"

---

### STEP 7: Verify .env File is Correct

1. Open `.env` file in VS Code
2. Should look exactly like:

```env
DATABASE_URL="postgresql://blackpot_user:blackpot_secure_password_123@localhost:5432/blackpot_dev"
```

3. Save file

---

### STEP 8: Run Prisma Migration

Now you're ready! Run:

```bash
npx prisma migrate dev --name initial_schema
```

**What happens:**
1. Prisma reads your `.env` file
2. Connects to PostgreSQL using the credentials
3. Creates all 28 tables from schema.prisma
4. Creates migration file in `database/prisma/migrations/`
5. Generates Prisma Client

**Expected output:**
```
Environment variables loaded from .env
Prisma schema loaded from database\prisma\schema.prisma
Datasource "db": PostgreSQL database "blackpot_dev", schema "public" at "localhost:5432"

✔ Created migration folder for new migrations

✔ Renamed migration 20260126_initial_schema to 20260126000000_initial_schema

✔ Applied 1 migration(s) in 342ms

✔ Generated Prisma Client to .prisma/client in 125ms
```

**If it fails:**
- Check database exists: `psql -U blackpot_user -h localhost -l`
- Check credentials in .env
- Restart PostgreSQL service

---

### STEP 9: Verify Migration Success

```bash
# Open Prisma Studio (visual database viewer)
npm run db:studio
```

This opens `http://localhost:5555` with visual interface showing:
- All tables created
- Schema structure
- Sample data (after seeding)

Or use PostgreSQL Explorer:
1. Expand your connection in VS Code
2. Expand **Tables**
3. Should see: `tenant`, `user`, `order`, `table`, `menu_item`, etc.

---

## 🔧 FULL SETUP WALKTHROUGH (Copy-Paste Commands)

### If using Command Line (Windows PowerShell)

```powershell
# Step 1: Add PostgreSQL to PATH
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# Step 2: Create database
createdb -U postgres -h localhost blackpot_dev

# Step 3: Create user
psql -U postgres -h localhost -c "CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'blackpot_secure_password_123';"

# Step 4: Grant privileges
psql -U postgres -h localhost -c "GRANT CREATE ON DATABASE blackpot_dev TO blackpot_user;"

# Step 5: Verify connection
psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT 'Connected!' as status;"
```

### If using pgAdmin (GUI)

1. Go to http://localhost:5050
2. Login with default credentials
3. Right-click Databases → Create → Database
   - Name: `blackpot_dev`
4. Right-click Login/Group Roles → Create → Login/Group Role
   - Name: `blackpot_user`
   - Password: `blackpot_secure_password_123`
5. Grant privileges to user

---

## 🚀 FINAL STEPS (In VS Code)

```bash
# 1. Update .env file with real credentials
# File: .env
# Change: DATABASE_URL="postgresql://blackpot_user:blackpot_secure_password_123@localhost:5432/blackpot_dev"

# 2. Run migration
npx prisma migrate dev --name initial_schema

# 3. View database
npm run db:studio

# 4. Seed sample data
npm run db:seed

# 5. Success! ✅
```

---

## 🐛 TROUBLESHOOTING

### Problem: "Authentication failed"
```
Error: P1000: Authentication failed against database server
```

**Solutions:**
1. Check credentials in `.env` are correct
2. Verify user exists: 
   ```powershell
   psql -U postgres -h localhost -c "\du"
   ```
3. Check password is correct
4. Verify database exists:
   ```powershell
   psql -U postgres -h localhost -l
   ```

### Problem: "Connection refused"
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
1. PostgreSQL service not running
   ```powershell
   # Check service
   Get-Service postgresql-x64-18
   
   # Start if stopped
   Start-Service postgresql-x64-18
   ```
2. Wrong host/port in .env
3. Firewall blocking connection

### Problem: "Database does not exist"
```
Error: does not exist
```

**Solutions:**
1. Create database:
   ```powershell
   createdb -U postgres -h localhost blackpot_dev
   ```
2. Verify it exists:
   ```powershell
   psql -U postgres -h localhost -l
   ```

### Problem: "Role does not exist"
```
Error: role "blackpot_user" does not exist
```

**Solutions:**
1. Create user:
   ```powershell
   psql -U postgres -h localhost -c "CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'blackpot_secure_password_123';"
   ```
2. Grant privileges:
   ```powershell
   psql -U postgres -h localhost -c "GRANT CREATE ON DATABASE blackpot_dev TO blackpot_user;"
   ```

---

## 📱 USING PGADMIN WEB INTERFACE

### Access pgAdmin

```
URL: http://localhost:5050
Default User: postgres@pgadmin.org
Default Password: admin
```

### Create Database in pgAdmin

1. Click **Servers** (left sidebar)
2. Double-click **PostgreSQL 18** to connect
   - Enter postgres password
3. Right-click **Databases**
4. Click **Create > Database**
5. Fill form:
   - Name: `blackpot_dev`
   - Owner: `postgres`
6. Click **Save**

### Create User in pgAdmin

1. Right-click **Login/Group Roles**
2. Click **Create > Login/Group Role**
3. Fill **General** tab:
   - Name: `blackpot_user`
4. Click **Password** tab:
   - Password: `blackpot_secure_password_123`
   - Confirm: `blackpot_secure_password_123`
5. Click **Privileges** tab:
   - Toggle **Can create database?**: ON
   - Toggle **Can create roles?**: ON
6. Click **Save**

### Grant Database Permissions

1. Right-click **blackpot_dev** database
2. Click **Properties**
3. Click **Security** tab
4. Find `blackpot_user` in privileges
5. Enable **ALL** permissions
6. Click **Save**

---

## 🎯 POSTGRESQL EXPLORER EXTENSION FEATURES

### In VS Code Left Sidebar

Once connected:

```
PostgreSQL Explorer
├── BlackPot Dev (your connection)
│   ├── Tables
│   │   ├── tenant
│   │   ├── user
│   │   ├── order
│   │   └── ... (26 more tables)
│   ├── Views
│   ├── Functions
│   └── Extensions
```

### Run SQL Query

1. Click PostgreSQL Explorer icon
2. Right-click connection → **New Query**
3. Write SQL:
   ```sql
   SELECT * FROM tenant;
   SELECT COUNT(*) as total_users FROM "user";
   ```
4. Press **Ctrl+Enter** to execute
5. See results in VS Code

### View Table Data

1. Expand **Tables**
2. Right-click table name
3. Click **Select * From**
4. View data in editor

---

## ✅ SUCCESS CHECKLIST

- [ ] PostgreSQL service running
- [ ] Database `blackpot_dev` created
- [ ] User `blackpot_user` created with password
- [ ] User has CREATE and database permissions
- [ ] `.env` file updated with correct credentials
- [ ] PostgreSQL Explorer extension installed
- [ ] PostgreSQL Explorer connected to database
- [ ] Can run: `npx prisma migrate dev --name initial_schema`
- [ ] Migration completes successfully
- [ ] Can open: `npm run db:studio` and see tables
- [ ] All 28 tables visible in database

---

## 🚀 NEXT STEPS AFTER SUCCESSFUL MIGRATION

```bash
# 1. Seed database with sample data
npm run db:seed

# 2. View data in visual explorer
npm run db:studio

# 3. Query in PostgreSQL Explorer
# (Right-click connection → New Query)

# 4. Start API development
npm run dev
```

---

## 📚 QUICK REFERENCE

### PostgreSQL Connection Details
```
Host: localhost
Port: 5432
Database: blackpot_dev
User: blackpot_user
Password: blackpot_secure_password_123
```

### Important Files
```
.env                          → Connection credentials
database/prisma/schema.prisma → Database schema
database/seeds/seed.ts        → Sample data generator
```

### Important Commands
```bash
# Migration
npx prisma migrate dev --name initial_schema

# View database
npm run db:studio

# Seed data
npm run db:seed

# Reset (dev only)
npm run db:reset

# PostgreSQL CLI
psql -U blackpot_user -h localhost -d blackpot_dev
```

---

## 🎉 YOU'RE READY!

Once you complete these steps and run the migration successfully, you'll have:

✅ PostgreSQL database set up  
✅ 28 tables created  
✅ VS Code connected to database  
✅ Ready for sample data seeding  
✅ Ready to start API development  

Go ahead and run: `npx prisma migrate dev --name initial_schema`

If you hit any errors, check the **TROUBLESHOOTING** section above.

Good luck! 🚀
