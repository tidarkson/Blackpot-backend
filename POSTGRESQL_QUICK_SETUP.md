# PostgreSQL Setup - Quick Start Script

## ⚠️ IMPORTANT: PostgreSQL Password

When PostgreSQL was installed, you set a password for the `postgres` superuser.

**Common defaults during installation:**
- `postgres` (the password)
- `admin`
- (blank/empty)
- Something you set during installation

**You need this password to proceed.**

---

## Option 1: Use pgAdmin Web Interface (EASIEST)

### Step 1: Open pgAdmin in Browser
```
URL: http://localhost:5050
```

### Step 2: Set Master Password
- First time accessing, pgAdmin asks for a master password
- Set any password you want (e.g., "pgadmin123")

### Step 3: Register Server
1. Click **Add New Server**
2. Fill form:
   - Name: `PostgreSQL 18` or similar
   - Host: `localhost`
   - Port: `5432`
   - Username: `postgres`
   - Password: (your postgres password from installation)
   - Save: Yes

### Step 4: Create Database
1. Click **Databases** in left sidebar
2. Right-click → **Create** → **Database**
3. Name: `blackpot_dev`
4. Owner: `postgres`
5. Click **Save**

### Step 5: Create User
1. Right-click **Login/Group Roles**
2. **Create** → **Login/Group Role**
3. Name: `blackpot_user`
4. Password: `blackpot_password_123`
5. Go to **Privileges** tab
6. Toggle: **Can create database?** = ON
7. Click **Save**

---

## Option 2: Use Command Line (MANUAL)

You'll be prompted for the postgres password. Here's the complete sequence:

### Windows PowerShell Steps:

```powershell
# Add PostgreSQL to PATH
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# Create database (will prompt for postgres password)
createdb -U postgres -h localhost blackpot_dev

# Create user
psql -U postgres -h localhost -c "CREATE ROLE blackpot_user WITH LOGIN PASSWORD 'blackpot_password_123';"

# Grant privileges
psql -U postgres -h localhost -c "GRANT CREATE ON DATABASE blackpot_dev TO blackpot_user;"

# Grant database ownership
psql -U postgres -h localhost -c "ALTER DATABASE blackpot_dev OWNER TO blackpot_user;"
```

When prompted for password, enter your postgres password.

### Verify it worked:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# List all databases
psql -U postgres -h localhost -l

# List all users
psql -U postgres -h localhost -c "\du"

# Try connecting as blackpot_user
psql -U blackpot_user -h localhost -d blackpot_dev -c "SELECT 'Connected!'"
```

---

## Option 3: What If You Forgot the Postgres Password?

If you forgot the `postgres` password, you have these options:

### A. Reset via Windows Services (if installed as service)

1. Stop PostgreSQL service:
   ```powershell
   Stop-Service postgresql-x64-18 -Force
   ```

2. Start without password authentication:
   ```
   Not recommended - complex process
   ```

### B. Use Password Reset Tools
- Windows "Run as Administrator" → Services → PostgreSQL → Properties
- Or reinstall PostgreSQL with new password

### C. Use Default Password
- During installation, if you chose default settings
- Default: `postgres` (the password is often the username)

---

## ✅ AFTER SETUP: Update .env File

Once database and user are created:

1. Open `.env` in VS Code:

```env
DATABASE_URL="postgresql://blackpot_user:blackpot_password_123@localhost:5432/blackpot_dev"
```

2. **IMPORTANT**: 
   - Replace `blackpot_password_123` with the password you set for `blackpot_user`
   - Keep the format exactly: `postgresql://username:password@host:port/database`

3. Save the file

---

## 🚀 Run Prisma Migration

After `.env` is set with correct credentials:

```powershell
cd "C:\Users\tidar\Documents\Web Dev Projects\BlackPot Backend"
npx prisma migrate dev --name initial_schema
```

---

## 🎯 Choose Your Path:

**I RECOMMEND: Option 1 (pgAdmin Web Interface)**
- Easiest
- Visual
- No command line needed
- Just go to http://localhost:5050

Then come back and:
1. Update `.env` file
2. Run `npx prisma migrate dev --name initial_schema`

---

## 💡 Need Help?

If you hit errors:

1. **"Password authentication failed"**
   - Check postgres password is correct
   - Check user exists: `psql -U postgres -h localhost -c "\du"`

2. **"Database already exists"**
   - Database `blackpot_dev` is already created
   - Skip the createdb step
   - Proceed to next step

3. **"Cannot connect to PostgreSQL"**
   - Check service is running: `Get-Service postgresql-x64-18`
   - Check port 5432 is listening: `netstat -an | findstr 5432`

---

**Next Step:** Choose pgAdmin (Option 1) or Command Line (Option 2) and complete the setup!
