# Docker Installation & Setup Guide for Windows

## 🔧 DOCKER INSTALLATION STEPS FOR WINDOWS

### Option 1: Docker Desktop (Recommended - Easiest)

#### Step 1: Download Docker Desktop
1. Go to: https://www.docker.com/products/docker-desktop
2. Click **Download for Windows**
3. Choose the appropriate version:
   - **Docker Desktop for Windows with WSL 2** (Recommended - better performance)
   - Or standard version if you don't have WSL 2

#### Step 2: Install Docker Desktop
1. Run the installer you just downloaded
2. Follow the installation wizard
3. When prompted, enable:
   - ✅ WSL 2 backend (if available)
   - ✅ Windows Hypervisor
   - ✅ Containers

#### Step 3: Start Docker Desktop
1. Open **Start Menu** and search for "Docker Desktop"
2. Click to open Docker Desktop
3. Wait for it to start (you'll see the Docker whale icon in system tray)
4. Status will show "Docker is running"

#### Step 4: Verify Installation
Open PowerShell and run:
```powershell
docker --version
docker-compose --version
```

You should see:
```
Docker version 25.x.x
Docker Compose version 2.x.x
```

---

### Option 2: WSL2 + Docker (Advanced)

If you have WSL 2 installed, Docker integrates seamlessly:

1. Install Docker Desktop for Windows
2. Go to **Docker Desktop Settings**
3. **Resources** → **WSL Integration**
4. Enable WSL 2 integration
5. Restart Docker

---

## ✅ SYSTEM REQUIREMENTS

### Minimum Requirements
- Windows 10 version 20H2 or newer
- Windows 11 recommended
- 4GB RAM minimum (8GB recommended)
- Virtualization enabled in BIOS

### Check Windows Version
```powershell
# Run in PowerShell
gp -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName, CurrentBuildNumber
```

### Enable Virtualization (if needed)
For most modern machines, virtualization is already enabled. If not:
1. Restart your computer
2. Enter BIOS (usually F2, F10, DEL, or ESC during startup)
3. Find "Virtualization" or "VT-x"
4. Enable it
5. Save and exit

---

## 🚀 VERIFY DOCKER IS WORKING

### Test 1: Check Docker Daemon
```powershell
docker ps
```

Should show: `CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS`

### Test 2: Run Hello World
```powershell
docker run hello-world
```

Should display: "Hello from Docker!"

### Test 3: Check Docker Compose
```powershell
docker-compose --version
```

Should show version 2.x or higher

---

## 🔧 CONFIGURE DOCKER FOR BLACKPOT

### Step 1: Navigate to Project Directory
```powershell
cd "C:\Users\<YourUsername>\Documents\Web Dev Projects\BlackPot Backend"
```

### Step 2: Verify docker-compose.yml exists
```powershell
ls docker-compose.yml
```

Should show the file exists.

### Step 3: Validate Docker Compose Configuration
```powershell
docker-compose config
```

Should display the full YAML configuration without errors.

---

## 🚢 START DOCKER SERVICES

### Start All Services (Postgres + Redis)
```powershell
docker-compose up -d
```

Output:
```
Creating network "blackpot_network" with driver "bridge"
Creating blackpot_postgres ... done
Creating blackpot_redis ... done
```

### Start with Optional Dev Tools (Redis Commander, pgAdmin)
```powershell
docker-compose --profile dev-tools up -d
```

This also starts:
- Redis Commander at http://localhost:8081
- pgAdmin at http://localhost:5050

### Check Running Containers
```powershell
docker-compose ps
```

Should show all services running (STATUS = "Up X minutes"):
```
NAME                 STATUS              PORTS
blackpot_postgres    Up 2 minutes        5432/tcp
blackpot_redis       Up 2 minutes        6379/tcp
redis-commander      Up 2 minutes        0.0.0.0:8081->8081/tcp
```

---

## 🔍 VERIFY SERVICES ARE RUNNING

### Test PostgreSQL Connection
```powershell
# Using docker exec
docker exec blackpot_postgres psql -U blackpot_user -d blackpot_dev -c "SELECT version();"
```

Should show PostgreSQL version.

### Test Redis Connection
```powershell
# Using docker exec
docker exec blackpot_redis redis-cli ping
```

Should return: `PONG`

### Or Using redis-cli Locally (if installed)
```powershell
redis-cli ping
```

Should return: `PONG`

---

## 📊 VIEW SERVICE LOGS

### View All Logs
```powershell
docker-compose logs -f
```

### View Specific Service Logs
```powershell
# PostgreSQL logs
docker-compose logs -f postgres

# Redis logs
docker-compose logs -f redis

# Redis Commander logs
docker-compose logs -f redis-commander
```

Press `Ctrl+C` to stop viewing logs.

---

## 💾 DATABASE SETUP

### 1. Run Prisma Migrations
```powershell
npx prisma migrate deploy
```

Or if you want to create new migrations:
```powershell
npx prisma migrate dev --name init
```

### 2. Seed Database (Optional)
```powershell
npm run db:seed
```

### 3. Open Prisma Studio (Visual DB Manager)
```powershell
npx prisma studio
```

This opens a web UI at http://localhost:5555

---

## 🌐 ACCESSING SERVICES

After Docker is running:

| Service | URL | Credentials |
|---------|-----|-------------|
| PostgreSQL | localhost:5432 | user: `blackpot_user`<br/>password: `un1vers1ty` |
| Redis | localhost:6379 | No auth (dev) |
| Redis Commander | http://localhost:8081 | None (dev tool) |
| pgAdmin | http://localhost:5050 | email: `admin@blackpot.com`<br/>password: `admin` |
| Prisma Studio | http://localhost:5555 | Automatic |

---

## 🛑 STOP SERVICES

### Stop All Services (Containers Still Exist)
```powershell
docker-compose stop
```

### Stop and Remove Containers
```powershell
docker-compose down
```

### Stop and Remove Everything (Including Database!)
```powershell
docker-compose down -v
```

⚠️ **Warning**: `-v` flag removes volumes (deletes database data)

---

## 🔄 RESTART SERVICES

### Restart All Services
```powershell
docker-compose restart
```

### Restart Specific Service
```powershell
docker-compose restart postgres
docker-compose restart redis
```

---

## 🧹 CLEANUP DOCKER

### Remove Unused Containers
```powershell
docker container prune
```

### Remove Unused Images
```powershell
docker image prune
```

### Remove Unused Volumes
```powershell
docker volume prune
```

### Full Cleanup (Save Disk Space)
```powershell
docker system prune -a
```

---

## 🐛 TROUBLESHOOTING

### Docker Daemon Not Running
**Error**: `Cannot connect to Docker daemon`

**Solution**:
1. Open Docker Desktop
2. Wait for it to fully start (status shows "Docker is running")
3. Retry command

### Port Already in Use
**Error**: `Bind for 0.0.0.0:5432 failed: port is already allocated`

**Solution**:
```powershell
# Find what's using the port
netstat -ano | findstr :5432

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change the port in docker-compose.yml
# Change "5432:5432" to "5433:5432"
```

### Can't Connect to Database
**Error**: `ECONNREFUSED 127.0.0.1:5432`

**Solution**:
1. Verify container is running: `docker-compose ps`
2. Check logs: `docker-compose logs postgres`
3. Wait 10 seconds for PostgreSQL to fully start
4. Try connecting again

### Redis Not Responding
**Error**: `ECONNREFUSED 127.0.0.1:6379`

**Solution**:
1. Check Redis is running: `docker-compose logs redis`
2. Verify network: `docker network inspect blackpot_network`
3. Restart Redis: `docker-compose restart redis`

---

## 📋 COMMON DOCKER COMMANDS

```powershell
# List all containers
docker ps -a

# List all images
docker images

# View container details
docker inspect <container_id>

# Access container shell
docker exec -it <container_id> /bin/bash

# View container resource usage
docker stats

# Build image from Dockerfile
docker build -t <image_name> .

# Push to registry
docker push <image_name>

# Pull from registry
docker pull <image_name>
```

---

## 🎯 QUICK START CHECKLIST

- [ ] Docker Desktop installed
- [ ] Docker running (see whale icon)
- [ ] `docker --version` shows version
- [ ] `docker-compose --version` shows version 2.x+
- [ ] Navigate to project directory
- [ ] `docker-compose config` shows no errors
- [ ] `docker-compose up -d` starts successfully
- [ ] `docker-compose ps` shows all containers running
- [ ] `docker exec blackpot_postgres psql -U blackpot_user -d blackpot_dev -c "SELECT 1;"` returns success
- [ ] `docker exec blackpot_redis redis-cli ping` returns PONG
- [ ] Prisma migrations run successfully
- [ ] Application starts: `npm run dev`

---

## 📚 RESOURCES

- [Docker Official Documentation](https://docs.docker.com/)
- [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [WSL 2 Setup](https://docs.microsoft.com/en-us/windows/wsl/install)

---

## ✅ NEXT STEPS AFTER DOCKER INSTALLATION

1. **Start services**: `docker-compose up -d`
2. **Run migrations**: `npx prisma migrate deploy`
3. **Start app**: `npm run dev`
4. **Visit health endpoint**: http://localhost:3000/health
5. **Check Redis**: http://localhost:8081 (Redis Commander)

Your BlackPot backend will now have:
- ✅ PostgreSQL running on port 5432
- ✅ Redis running on port 6379
- ✅ Full caching layer operational
- ✅ Database persistent storage

🚀 **Ready to go!**
