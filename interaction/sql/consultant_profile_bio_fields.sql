-- 可选：若未使用 sequelize.sync({ alter: true })，可手工执行（按顺序添加）
ALTER TABLE consultant_profile
    ADD COLUMN signature VARCHAR(200) NULL COMMENT '个性签名' AFTER review_count;
ALTER TABLE consultant_profile
    ADD COLUMN work_duration VARCHAR(100) NULL COMMENT '工作时长展示文案' AFTER signature;
ALTER TABLE consultant_profile
    ADD COLUMN experience TEXT NULL COMMENT '经历说明' AFTER work_duration;
