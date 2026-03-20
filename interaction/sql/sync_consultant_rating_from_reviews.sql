-- 可选：用 SQL 直接核对「评价表 → 顾问汇总」（脚本 scripts/sync-consultant-ratings-from-reviews.js 会写回 consultant_profile）
-- 被评价方为顾问时 to_role = 'consultant'，to_user_id 对应 consultant_profile.consultant_id

SELECT
    to_user_id AS consultant_id,
    COUNT(*) AS review_count,
    ROUND(AVG(rating), 2) AS avg_rating
FROM order_reviews
WHERE to_role = 'consultant'
GROUP BY to_user_id
ORDER BY consultant_id;
