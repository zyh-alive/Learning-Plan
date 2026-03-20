-- 可选：在表已由 Sequelize 创建后执行，为 rating 增加数据库层 CHECK（MySQL 8.0.16+）
-- 若已存在约束请先 DROP。

-- ALTER TABLE order_reviews
--   ADD CONSTRAINT chk_order_reviews_rating CHECK (rating >= 1 AND rating <= 5);
