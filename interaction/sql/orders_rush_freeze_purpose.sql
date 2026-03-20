-- 未使用 sequelize.sync({ alter: true }) 时可手工执行（MySQL）
-- 1) 订单状态增加 pending_rush；加急字段
ALTER TABLE orders
    MODIFY COLUMN status ENUM(
        'pending','accepted','start_invited','in_service','pending_review',
        'completed','cancelled','expired','pending_rush'
    ) NOT NULL DEFAULT 'pending';

ALTER TABLE orders
    ADD COLUMN rush_description VARCHAR(500) NULL COMMENT '加急描述' AFTER cancel_reason;
ALTER TABLE orders
    ADD COLUMN rush_fee DECIMAL(10,2) NULL COMMENT '加急费用' AFTER rush_description;
ALTER TABLE orders
    ADD COLUMN rush_duration_seconds INT NULL DEFAULT 3600 COMMENT '加急窗口秒' AFTER rush_fee;
ALTER TABLE orders
    ADD COLUMN rush_paid_at DATETIME NULL COMMENT '加急款支付时间' AFTER rush_duration_seconds;
ALTER TABLE orders
    ADD COLUMN rush_expires_at DATETIME NULL COMMENT '加急接单截止' AFTER rush_paid_at;

-- 2) 冻结流水：区分本金 / 加急
ALTER TABLE freeze_records
    ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'main' COMMENT 'main订单款 rush加急款' AFTER reason;

-- 历史数据：原记录视为 main
UPDATE freeze_records SET purpose = 'main' WHERE purpose IS NULL OR purpose = '';
