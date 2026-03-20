// 顾问列表和详情接口（用户端调用）
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const ConsultantProfile = require('../models/ConsultantProfile');

// ================================
// 获取顾问列表 - GET /consultants/list
// ================================
exports.getList = async (req, res) => {
    try {
        // 参数校验 + 默认值
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;
        const workStatus = req.query.workStatus;

        // 校验分页参数
        page = Math.max(1, page);  // 最小 1
        limit = Math.min(100, Math.max(1, limit));  // 1~100 之间

        // 校验 workStatus（0:离线 1:空闲 2:忙碌）
        const where = {};
        if (workStatus !== undefined) {
            const status = parseInt(workStatus);
            if ([0, 1, 2].includes(status)) {
                where.workStatus = status;
            }
            // 如果传了无效值，忽略该条件，返回全部
        }
        
        // 分页
        const offset = (page - 1) * limit;
        
        // 查询顾问资料表（只返回公开字段）
        const { count, rows } = await ConsultantProfile.findAndCountAll({
            where,
            attributes: [  // 🔑 只返回这些字段
                'consultantId',
                'name',
                'workStatus'
                // ❌ 不返回：coin, is_completed, rating, review_count, total_orders
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['consultantId', 'ASC']]
        });
        
        // 格式化返回
        const list = rows.map(item => ({
            id: item.consultantId,
            name: item.name,
            workStatus: item.workStatus
        }));
        
        res.json({
            message: '获取成功',
             data:{
                list,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    totalPages: Math.ceil(count / limit)
                }
            }
        });
    } catch (err) {
        console.error('获取顾问列表错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 获取顾问详情 - GET /consultants/:id
// ================================
exports.getDetail = async (req, res) => {
    try {
        const consultantId = parseInt(req.params.id, 10);
        if (isNaN(consultantId) || consultantId <= 0) {
            return res.status(400).json({ message: '顾问 ID 格式错误' });
        }

        // 直接用表列名查询，避免 Sequelize include / 属性映射导致签名等字段未带出
        const rows = await sequelize.query(
            `SELECT
                consultant_id AS consultantId,
                name,
                work_status AS workStatus,
                rating,
                review_count AS reviewCount,
                total_orders AS totalOrders,
                signature,
                work_duration AS workDuration,
                experience
            FROM consultant_profile
            WHERE consultant_id = :id
            LIMIT 1`,
            {
                replacements: { id: consultantId },
                type: QueryTypes.SELECT
            }
        );

        const row = rows[0];
        if (!row) {
            return res.status(404).json({ message: '顾问不存在' });
        }

        const strOrNull = (v) => {
            if (v == null) return null;
            const s = Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
            const t = s.trim();
            return t === '' ? null : t;
        };

        const num = (v, def = 0) => {
            if (v == null || v === '') return def;
            const n = Number(v);
            return Number.isFinite(n) ? n : def;
        };

        res.json({
            message: '获取成功',
            data: {
                id: num(row.consultantId, consultantId),
                name: row.name != null ? String(row.name) : null,
                workStatus: num(row.workStatus, 0),
                rating: num(row.rating, 0),
                reviewCount: num(row.reviewCount, 0),
                totalOrders: num(row.totalOrders, 0),
                signature: strOrNull(row.signature),
                workDuration: strOrNull(row.workDuration),
                experience: strOrNull(row.experience)
            }
        });
    } catch (err) {
        console.error('获取顾问详情错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};
