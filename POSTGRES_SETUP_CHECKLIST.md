# PostgreSQL + Prisma Setup - Complete Checklist

**Your Current Status**:
- ✅ PostgreSQL installed and running (service: postgresql-x64-18)
- ✅ npm dependencies installed
- ✅ Prisma configured in package.json
- ❌ Database not yet created
- ❌ Connection credentials not yet set

---

## 📋 COMPLETE SETUP CHECKLIST

### SECTION 1: Create PostgreSQL Database & User

**Choose ONE method below:**

#### METHOD A: pgAdmin Web Interface (RECOMMENDED - Easiest)

- [ ] Open browser → http://localhost:5050
- [ ] Login (default: postgres@pgadmin.org / admin)
- [ ] First time: Set master password (any password)
- [ ] Click **Add New Server**
  - [ ] Name: `PostgreSQL Local`
  - [ ] Host: `localhost`
  - [ ] Port: `5432`
  - [ ] Username: `postgres`
  - [ ] Password: (your postgres installation password)
  - [ ] Save password: ✓ checked
- [ ] Click **Databases** → Right-click → **Create > Database**
  - [ ] Name: `blackpot_dev`
  - [ ] Owner: `postgres`
  - [ ] Click **Save**
- [ ] Click **Login/Group Roles** → Right-click → **Create > Login/Group Role**
  - [ ] General tab → Name: `blackpot_user`
  - [ ] Password tab → Password: `blackpot_password_123` (choose your own)
  - [ ] Privileges tab → Toggle ON: "Can create database?", "Can create roles?"
  - [ ] Click **Save**

**✅ Done with METHOD A? Move to SECTION 2**

---

#### METHOD B: Command Line (Alternative)

If you prefer command line, run in PowerShell (as Administrator recommended):

```powershell
# Add PostgreSQL to PATH
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# Step 1: Create database
createdb -U postgres -h localhost blackpot_dev
# You'll be prompted: Enter password for user 'postgres': 
# (Enter your postgres installation password)

# Step 2: Create user role
psql -U postgres -h localhost -c "CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'blackpot_password_123';"

# Step 3: Grant privileges
psql -U postgres -h localhost -c "ALTER ROLE blackpot_user CREATEDB;"

# Step 4: Grant database ownership
psql -U postgres -h localhost -c "ALTER DATABASE blackpot_dev OWNER TO blackpot_user;"

# Step 5: Verify (should see no errors)
psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT 'Connected!' as status;"
```

**✅ Done with METHOD B? Move to SECTION 2**

---

### SECTION 2: Update .env File in VS Code

- [ ] Open VS Code
- [ ] Open `.env` file (in root folder)
- [ ] Find line: `DATABASE_URL="postgresql://blackpot_user:blackpot_password_123@localhost:5432/blackpot_dev"`
- [ ] Replace `blackpot_password_123` with the PASSWORD YOU SET for `blackpot_user`
  - If you used pgAdmin: The password you entered in the "Password" tab
  - If you used command line: The password after `PASSWORD '...'`
- [ ] Save the file (Ctrl+S)

**Example (with password "MySecurePass123"):**
```env
DATABASE_URL="postgresql://blackpot_user:MySecurePass123@localhost:5432/blackpot_dev"
```

- [ ] **VERIFY**: File saved and not showing as modified (white dot)

---

### SECTION 3: Install PostgreSQL Explorer Extension in VS Code

- [ ] Press `Ctrl+Shift+X` (Open Extensions)
- [ ] Search: `PostgreSQL`
- [ ] Find: **"PostgreSQL"** by Chris Norris (or similar)
- [ ] Click **Install**
- [ ] Wait for installation to complete
- [ ] You should see PostgreSQL icon in left sidebar (database-like icon)

---

### SECTION 4: Connect PostgreSQL Explorer to Database

- [ ] Click **PostgreSQL Explorer** icon (left sidebar)
- [ ] You should see: "No connections configured"
- [ ] Click **Add Connection**
- [ ] Fill in form:
  - [ ] Host: `localhost`
  - [ ] Port: `5432`
  - [ ] Database: `blackpot_dev`
  - [ ] User: `blackpot_user`
  - [ ] Password: (the password you set - should auto-fill from .env)
  - [ ] Connection name: `BlackPot Dev`
- [ ] Click **Connect**
- [ ] You should see the connection appear in the explorer
- [ ] Expand it to see Tables, Views, Functions

---

### SECTION 5: Run Prisma Migration

- [ ] Open terminal in VS Code (Ctrl+`)
- [ ] Run: `npx prisma migrate dev --name initial_schema`
- [ ] You should see:
  ```
  Environment variables loaded from .env
  Prisma schema loaded from database\prisma\schema.prisma
  Datasource "db": PostgreSQL database "blackpot_dev"
  ✔ Created migration folder
  ✔ Applied 1 migration(s)
  ✔ Generated Prisma Client
  ```

**If you get an error:**
- [ ] Check error message (see TROUBLESHOOTING below)
- [ ] Fix the issue
- [ ] Try again

---

### SECTION 6: Verify Success

- [ ] Go back to PostgreSQL Explorer
- [ ] Expand your connection "BlackPot Dev"
- [ ] Click **Tables**
- [ ] You should see 28 tables:
  - [ ] `tenant`
  - [ ] `user`
  - [ ] `location`
  - [ ] `order`
  - [ ] `table` (might show as `table_` due to SQL keyword)
  - [ ] `menu`
  - [ ] `menu_item`
  - [ ] `reservation`
  - [ ] ... and 20+ more

OR run in terminal:
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
psql -U blackpot_user -h localhost -d blackpot_dev -c "\dt"
```

Should list all 28 tables.

---

### SECTION 7: (Optional) Seed Sample Data

Once migration succeeds, you can populate with sample data:

- [ ] Run: `npm run db:seed`
- [ ] Wait for completion
- [ ] Should show: "✅ Seeding completed successfully!"

---

### SECTION 8: Verify Prisma Studio

- [ ] Run: `npm run db:studio`
- [ ] Browser opens to http://localhost:5555
- [ ] You can browse all tables
- [ ] If seeded, you should see 13 users, 50 orders, etc.

---

## 🐛 TROUBLESHOOTING

### Error 1: "Authentication failed"
```
Error: P1000: Authentication failed against database server
```

**Cause**: Wrong credentials in .env

**Fix**:
1. Check .env file has correct password
2. Verify user exists:
   ```powershell
   $env:Path += ";C:\Program Files\PostgreSQL\18\bin"
   psql -U postgres -h localhost -c "\du"
   # Should list: blackpot_user
   ```
3. Verify you can connect manually:
   ```powershell
   psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT 1;"
   ```

---

### Error 2: "Database does not exist"
```
Error: database "blackpot_dev" does not exist
```

**Cause**: Database wasn't created

**Fix**:
1. Create it:
   ```powershell
   $env:Path += ";C:\Program Files\PostgreSQL\18\bin"
   createdb -U postgres -h localhost blackpot_dev
   # Enter postgres password when prompted
   ```
2. Verify:
   ```powershell
   psql -U postgres -h localhost -l
   # Should list: blackpot_dev
   ```

---

### Error 3: "Role does not exist"
```
Error: role "blackpot_user" does not exist
```

**Cause**: User wasn't created

**Fix**:
1. Create user:
   ```powershell
   $env:Path += ";C:\Program Files\PostgreSQL\18\bin"
   psql -U postgres -h localhost -c "CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'blackpot_password_123';"
   ```
2. Grant privileges:
   ```powershell
   psql -U postgres -h localhost -c "ALTER ROLE blackpot_user CREATEDB;"
   ```

---

### Error 4: "Connection refused"
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause**: PostgreSQL service not running

**Fix**:
1. Check if running:
   ```powershell
   Get-Service postgresql-x64-18 | Select Status
   # Should show: Running
   ```
2. If stopped, start it:
   ```powershell
   Start-Service postgresql-x64-18
   ```
3. Verify port is open:
   ```powershell
   netstat -an | findstr 5432
   # Should show: LISTENING
   ```

---

### Error 5: "Password authentication failed"
```
psql: error: FATAL: password authentication failed for user "postgres"
```

**Cause**: Wrong postgres password

**Fix**:
1. You probably forgot your postgres installation password
2. Options:
   - Try common defaults: `postgres`, `admin`, (blank)
   - Use pgAdmin instead (if you remember pgAdmin master password)
   - Reset PostgreSQL password (complex process)
   - Reinstall PostgreSQL with known password

---

## ✅ SUCCESS INDICATORS

You'll know it's working when:

✅ `npx prisma migrate dev --name initial_schema` completes without errors  
✅ PostgreSQL Explorer shows 28 tables  
✅ `npm run db:studio` opens in browser and shows tables  
✅ You can run: `psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT COUNT(*) FROM tenant;"`  

---

## 📝 REMEMBER

- `.env` file contains credentials - NEVER commit to git
- Default postgres password was set during PostgreSQL installation
- If you lose it, you'll need to reset PostgreSQL
- Always use strong passwords for production!

---

## 🎯 NEXT STEPS AFTER SUCCESS

```bash
# 1. Seed database with sample data
npm run db:seed

# 2. View in visual explorer
npm run db:studio

# 3. Start API development
npm run dev
```

---

## 📚 REFERENCE COMMANDS

```powershell
# Add PostgreSQL to PATH
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# List all databases
psql -U postgres -h localhost -l

# List all users
psql -U postgres -h localhost -c "\du"

# Connect to database as blackpot_user
psql -U blackpot_user -h localhost -d blackpot_dev

# Run query
psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT COUNT(*) FROM tenant;"

# Drop database (⚠️ CAREFUL!)
dropdb -U postgres -h localhost blackpot_dev

# Drop user (⚠️ CAREFUL!)
psql -U postgres -h localhost -c "DROP ROLE blackpot_user;"
```

---

**Created**: January 26, 2026  
**Status**: Ready for your input  

Choose your setup method and follow the checklist! 🚀
