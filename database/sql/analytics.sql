
SELECT tenant_id, DATE(created_at) as day, SUM(amount) as total_revenue
FROM payments
WHERE status = 'COMPLETED'
GROUP BY tenant_id, DATE(created_at);

SELECT server_id, SUM(amount) as total_tips
FROM tips
GROUP BY server_id;
