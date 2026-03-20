-- 若未使用 sequelize.sync({ alter: true })，可手工执行（MySQL）
-- 1) 扩展订单状态枚举，增加 expired
ALTER TABLE orders
    MODIFY COLUMN status ENUM(
        'peinndg',
        'accepted',
        'start_invited',
        'in_service',
        'pending_review',
        'completed',
        'cancelled',
        'expired'
    ) NOT NULL DEFAULT 'pending'
    COMMENT '订单状态';

-- 2) 存活时间与截止时间
ALTER TABLE orders
    ADD COLUMN survival_seconds INT NOT NULL DEFAULT 86400 COMMENT '已支付待接单存活秒数，默认24h' AFTER paid_at;
ALTER TABLE orders
    ADD COLUMN expires_at DATETIME NULL COMMENT '接单截止时间（支付时写入）' AFTER survival_seconds;
ALTER TABLE orders
    ADD COLUMN expired_at DATETIME NULL COMMENT '标记为过期的时间' AFTER expires_at;
