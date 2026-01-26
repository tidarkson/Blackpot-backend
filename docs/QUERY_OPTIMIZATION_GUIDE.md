# Query Optimization Guide - BlackPot Restaurant POS

## Quick Reference: Optimization Tips

### 1. Always Include tenantId in WHERE Clause

❌ **Wrong**:
```sql
SELECT * FROM orders WHERE table_id = $1;
-- Could query another tenant's data (security issue)
-- No index benefit (missing tenantId filter)
```

✅ **Correct**:
```sql
SELECT * FROM orders 
WHERE tenant_id = $1 AND table_id = $2;
-- Uses idx_order_table
-- Secure (tenant isolated)
```

### 2. Use Partial Indexes for Soft Deletes

❌ **Inefficient**:
```sql
SELECT * FROM orders WHERE table_id = $1;
-- Scans both active and deleted orders
-- Slower as data accumulates
```

✅ **Efficient**:
```sql
SELECT * FROM orders 
WHERE table_id = $1 AND deleted_at IS NULL;
-- Uses partial index (only active orders)
-- Fast regardless of historical data
```

### 3. Filter by Status Early

❌ **Inefficient**:
```sql
SELECT * FROM orders WHERE table_id = $1;
-- Returns all orders, app filters by status
-- More rows transferred
```

✅ **Efficient**:
```sql
SELECT * FROM orders 
WHERE table_id = $1 
  AND status = 'OPEN'
  AND deleted_at IS NULL;
-- Uses composite index (table_id, status)
-- Returns only open orders
-- Minimal data transfer
```

### 4. For Partial Indexes, Check Query Matches Index Condition

❌ **Won't use partial index**:
```sql
-- Index: WHERE completed_at IS NULL
SELECT * FROM order_courses WHERE kitchen_station_id = $1;
-- Missing the IS NULL condition that the index expects
```

✅ **Will use partial index**:
```sql
-- Index: WHERE completed_at IS NULL
SELECT * FROM order_courses 
WHERE kitchen_station_id = $1 AND completed_at IS NULL;
-- Matches index condition exactly
```

### 5. Order by Indexed Columns

❌ **Slower**:
```sql
SELECT * FROM orders WHERE table_id = $1
ORDER BY status ASC;
-- Can't use index ordering
-- Needs sorting step
```

✅ **Faster**:
```sql
SELECT * FROM orders WHERE table_id = $1
ORDER BY created_at DESC;
-- If index is (table_id, created_at)
-- Gets results in correct order
-- No sorting needed
```

### 6. Use LIMIT for Large Result Sets

❌ **Slow for kitchen display**:
```sql
SELECT * FROM order_courses 
WHERE kitchen_station_id = $1 AND completed_at IS NULL;
-- Returns 1000+ old courses if not cleaned up
-- Slow even with index
```

✅ **Fast for kitchen display**:
```sql
SELECT * FROM order_courses 
WHERE kitchen_station_id = $1 AND completed_at IS NULL
ORDER BY created_at ASC
LIMIT 100;
-- Returns only 100 items
-- App gets results faster
-- Prevents memory issues
```

### 7. Avoid Functions in WHERE Clause (Unless Indexed)

❌ **Won't use index**:
```sql
SELECT * FROM reservations 
WHERE DATE(reserved_at) = '2024-01-23';
-- Function DATE() prevents index use
-- Unless you have special index
```

✅ **Uses index**:
```sql
SELECT * FROM reservations 
WHERE reserved_at >= '2024-01-23'::date 
  AND reserved_at < '2024-01-24'::date;
-- Uses range index on reserved_at
-- Faster than DATE() function
```

✅ **Also uses index (if created)**:
```sql
-- If you have: CREATE INDEX ON reservations(DATE(reserved_at))
SELECT * FROM reservations 
WHERE DATE(reserved_at) = '2024-01-23';
-- Now uses functional index
```

### 8. Composite Indexes: Column Order Matters

For index `(table_id, status)`:

✅ **Uses index**:
```sql
WHERE table_id = $1;  -- First column
WHERE table_id = $1 AND status = 'OPEN';  -- Both columns
```

⚠️ **May or may not use**:
```sql
WHERE status = 'OPEN';  -- Missing leading column
-- Doesn't use index (unless it matches)
-- Consider separate index on status
```

❌ **Doesn't use index**:
```sql
WHERE status = 'OPEN' AND table_id = $1;  -- Reverse order
-- Not optimal (different ordering)
-- Works but slower than optimal
```

### 9. Use IN () Carefully

❌ **Inefficient for many values**:
```sql
SELECT * FROM orders 
WHERE status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'READY', ...);
-- Many OR conditions
-- Index may not be optimal
```

✅ **Better for many values**:
```sql
SELECT * FROM orders 
WHERE status IN ('OPEN', 'IN_PROGRESS');
-- Fewer values
-- Index works well

-- Or better yet:
SELECT * FROM orders 
WHERE status != 'PAID' AND status != 'CANCELLED';
-- Exclude completed statuses
-- More efficient
```

### 10. Count Queries Need Indexes Too

❌ **Slow**:
```sql
SELECT COUNT(*) FROM orders 
WHERE table_id = $1 AND deleted_at IS NULL;
-- Counts every order, slow
```

✅ **Fast**:
```sql
-- Same query, but with index idx_order_table
-- Index counts matching rows quickly
SELECT COUNT(*) FROM orders 
WHERE table_id = $1 AND deleted_at IS NULL;
-- Uses idx_order_table (table_id, status)
-- Returns in <10ms
```

---

## Common Query Patterns & Optimization

### Pattern: Daily Sales Report

**What you want**: Total sales by day for past 30 days

**First attempt**:
```sql
SELECT 
  DATE(o.created_at) as day,
  COUNT(*) as orders,
  SUM(p.amount) as total
FROM orders o
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.tenant_id = $tenant_id
  AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(o.created_at);
-- Expected: 5-30 seconds (depends on data size)
```

**Optimized**:
```sql
-- Version 1: Add indexes
-- Indexes: idx_order_created_at (tenant_id, created_at DESC)

SELECT 
  DATE(o.created_at) as day,
  COUNT(*) as orders,
  SUM(p.amount) as total
FROM orders o
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.tenant_id = $tenant_id
  AND o.created_at >= NOW() - INTERVAL '30 days'
  AND o.deleted_at IS NULL
GROUP BY DATE(o.created_at);
-- Expected: 2-5 seconds (with indexes)
```

**Highly optimized**:
```sql
-- Version 2: Use pre-computed view
SELECT * FROM mv_daily_sales
WHERE tenant_id = $tenant_id
  AND sale_date >= NOW()::date - INTERVAL '30 days';
-- Expected: <500ms
-- Created by: SELECT refresh_daily_sales();
```

---

### Pattern: Kitchen Display (Most Critical)

**What you want**: All pending items at a kitchen station, oldest first

**Without optimization**:
```sql
SELECT * FROM order_courses 
WHERE kitchen_station_id = $station_id;
-- Problem: Returns 10,000+ completed courses
-- Expected: 1000-2000ms (slow!)
```

**With index but missing partial**:
```sql
CREATE INDEX idx_kitchen ON order_courses(kitchen_station_id);

SELECT * FROM order_courses 
WHERE kitchen_station_id = $station_id;
-- Problem: Index still scans completed courses
-- Expected: 200-500ms (better but not great)
```

**Optimized (CRITICAL)**:
```sql
CREATE INDEX idx_kitchen_pending 
  ON order_courses(kitchen_station_id, created_at) 
  WHERE completed_at IS NULL;

SELECT * FROM order_courses 
WHERE kitchen_station_id = $station_id 
  AND completed_at IS NULL
ORDER BY created_at ASC
LIMIT 100;
-- Expected: <200ms ✅
-- The WHERE completed_at IS NULL tells PostgreSQL
-- to use the partial index
```

**Highly optimized** (if KDS very busy):
```sql
-- Create materialized view
CREATE MATERIALIZED VIEW mv_kds_pending AS
SELECT * FROM order_courses 
WHERE completed_at IS NULL
ORDER BY created_at ASC;

-- Refresh every 10 seconds
SELECT cron.schedule('kds_refresh', '*/10 * * * * *', 
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kds_pending');

-- Query becomes instant
SELECT * FROM mv_kds_pending 
WHERE kitchen_station_id = $station_id 
LIMIT 100;
-- Expected: <50ms ✅✅
```

---

### Pattern: Server's Shift Summary (Tip Calculation)

**What you want**: All orders by a server today, with tips and payments

**Query**:
```sql
SELECT 
  o.id,
  o.created_at,
  SUM(p.amount) as payment,
  SUM(t.amount) as tips
FROM orders o
LEFT JOIN payments p ON o.id = p.order_id
LEFT JOIN tips t ON o.id = t.order_id
WHERE o.server_id = $server_id
  AND DATE(o.opened_at) = DATE(NOW())
  AND o.deleted_at IS NULL
GROUP BY o.id;
-- Expected: 200-500ms (without indexes)
--           50-100ms (with indexes)
```

**Optimize by adding index**:
```sql
CREATE INDEX idx_server_shift 
  ON orders(server_id, opened_at DESC) 
  WHERE deleted_at IS NULL;

-- Same query, now <100ms
```

---

### Pattern: Reservation Lookup by Guest

**What you want**: Check if guest has reservation

**Slow version**:
```sql
SELECT * FROM reservations 
WHERE guest_email = $email;
-- Expected: Depends on total reservations
```

**Fast version**:
```sql
CREATE INDEX idx_res_email 
  ON reservations(guest_email) 
  WHERE cancelled_at IS NULL;

SELECT * FROM reservations 
WHERE guest_email = $email 
  AND cancelled_at IS NULL;
-- Expected: <50ms
```

---

## EXPLAIN ANALYZE - Understanding Query Plans

Use `EXPLAIN ANALYZE` to see how PostgreSQL executes your query:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders 
WHERE table_id = $1 AND deleted_at IS NULL;
```

**Output interpretation**:

```
Seq Scan on orders (cost=0.00..50000.00 rows=10000)
  Filter: (table_id = '123' AND deleted_at IS NULL)
  Rows: 15 (actual 15)
  Loops: 1
  Execution time: 450ms
```

❌ **This is BAD**:
- "Seq Scan" = Full table scan (reads entire table)
- 450ms is slow
- **Action**: Add index on table_id

```sql
CREATE INDEX idx_order_table ON orders(table_id);
```

**After index**:
```
Index Scan using idx_order_table on orders (cost=0.00..100.00 rows=15)
  Index Cond: (table_id = '123')
  Filter: (deleted_at IS NULL)
  Rows: 15 (actual 15)
  Loops: 1
  Execution time: 45ms
```

✅ **This is GOOD**:
- "Index Scan" = Uses index (fast)
- 45ms is 10x faster
- Still has "Filter: deleted_at IS NULL" - could add partial index

```sql
CREATE INDEX idx_order_table 
  ON orders(table_id) 
  WHERE deleted_at IS NULL;
```

**After partial index**:
```
Index Scan using idx_order_table on orders (cost=0.00..50.00 rows=15)
  Index Cond: (table_id = '123')
  Rows: 15 (actual 15)
  Loops: 1
  Execution time: 10ms
```

✅✅ **This is EXCELLENT**:
- Index handles soft-delete filtering
- 10ms response time
- No separate "Filter" step needed

---

## When Indexes DON'T Help

### 1. Very Small Tables

```sql
-- If menu_sections has <1000 rows
-- Index may not help much
-- Sequential scan could be faster
```

### 2. High Selectivity is Low

```sql
-- If 99% of orders have status='OPEN'
-- Index on status doesn't help
-- Query returns almost all rows anyway
```

### 3. Columns with Few Distinct Values

```sql
-- If status has only 5 possible values:
-- (OPEN, IN_PROGRESS, COMPLETED, PAID, CANCELLED)
-- Index may not be efficient for filtering
-- But still helps for sorting
```

### 4. Complex Where Clauses

```sql
SELECT * FROM orders 
WHERE table_id = $1
  AND status IN (1, 2, 3)
  AND created_at > NOW() - INTERVAL '1 hour'
  AND guest_count > 2;
-- Multiple conditions
-- Index helpful for first 2 conditions
-- But may not cover all filtering
```

---

## Index Maintenance

### Add Indexes Without Downtime

```sql
-- PostgreSQL allows concurrent index creation
CREATE INDEX CONCURRENTLY idx_new 
  ON orders(server_id);

-- Doesn't lock table
-- Slower creation but table remains usable
-- Great for production
```

### Remove Unused Indexes

```sql
-- Check if index is used
SELECT * FROM pg_stat_user_indexes 
WHERE idx_scan = 0;

-- Drop unused index
DROP INDEX idx_unused;
```

### Refresh Statistics

```sql
-- After bulk inserts/deletes
ANALYZE orders;

-- Helps query planner make better decisions
```

### Rebuild Corrupted Index

```sql
-- If index seems corrupted
REINDEX INDEX idx_order_table;
```

---

## Performance Monitoring

### See All Queries

```sql
-- Install extension first
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- See slowest queries
SELECT 
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### See Table Scans

```sql
-- Find tables being fully scanned
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
ORDER BY seq_scan DESC;
```

**Interpretation**:
- `seq_scan > idx_scan`: Table is scanned more than indexed
- **Action**: Add missing indexes

---

## Configuration for Performance

Add to `postgresql.conf`:

```ini
# Enable slow query logging
log_min_duration_statement = 100  # Log queries > 100ms

# Increase work memory for complex queries
work_mem = 64MB

# Connection pooling (if using pgBouncer)
max_connections = 200

# Shared buffer (25-40% of RAM)
shared_buffers = 8GB

# Effective cache size (50% of RAM)
effective_cache_size = 16GB

# Enable parallel queries
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
```

---

## Summary: 10 Rules for Fast Queries

1. **Always include tenantId** - Data isolation + index benefit
2. **Use soft-delete filtering** - `WHERE deleted_at IS NULL`
3. **Add status to indexes** - `(table_id, status)` not just `(table_id)`
4. **Use partial indexes** - `WHERE completed_at IS NULL`
5. **Order by indexed columns** - Avoids sorting step
6. **Use LIMIT for large sets** - Prevents memory overflow
7. **Avoid functions in WHERE** - Unless indexed
8. **Check index column order** - `(a, b)` not `(b, a)`
9. **Monitor slow queries** - Set `log_min_duration_statement`
10. **Use EXPLAIN ANALYZE** - Verify index usage

---

## Next Steps

1. Run `indexing_strategy.sql` to create indexes
2. Run `ANALYZE tables;` to update statistics
3. Monitor with pg_stat_statements
4. Adjust based on actual query patterns
5. Add materialized views for expensive queries
6. Review quarterly for new patterns

**Expected result**: 10-30x performance improvement on most queries.
