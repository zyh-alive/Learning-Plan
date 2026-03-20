// ========== 评价控制器：与订单流程解耦，仅负责 order_reviews + 将订单标为已完成 ==========
// 路由前缀：/api/reviews（见 routes/reviewRoute.js、server.js）
//
// 业务：客户对「待评价」订单提交评分与文字 → 写入 order_reviews，订单 status → completed

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Order = require('../models/Order');
const OrderReview = require('../models/OrderReview');
const ConsultantProfile = require('../models/ConsultantProfile');

/**
 * 订单+评价列表（两接口共用）
 * @param {{ consultantId: number, mode: 'public' | 'owner', filter: 'reviews_only' | 'all' }} p
 */
async function fetchConsultantOrderReviewFeed({ consultantId, mode, filter }) {
    const cid = Number(consultantId);
    if (!Number.isFinite(cid) || cid <= 0) {
        return { error: '顾问 ID 无效', status: 400 };
    }

    const profile = await ConsultantProfile.findOne({
        where: { consultantId: cid },
        attributes: ['consultantId']
    });
    if (!profile) {
        return { error: '顾问不存在', status: 404 };
    }

    const orders = await Order.findAll({
        where: {
            consultantId: cid,
            status: { [Op.in]: ['pending_review', 'completed'] }
        },
        attributes: ['orderId', 'serviceType', 'serviceContent', 'status', 'completedAt', 'userId'],
        include: [
            {
                model: OrderReview,
                as: 'reviews',
                required: filter === 'reviews_only',
                attributes: ['rating', 'content', 'createdAt']
            }
        ],
        order: [['updatedAt', 'DESC']]
    });

    const list = orders.map((o) => {
        const rev = Array.isArray(o.reviews) && o.reviews.length ? o.reviews[0] : null;
        const item = {
            orderId: o.orderId,
            serviceType: o.serviceType,
            serviceContent: o.serviceContent,
            orderStatus: o.status,
            rating: rev != null ? Number(rev.rating) : null,
            reviewContent: rev ? rev.content : null,
            reviewedAt: rev ? rev.createdAt : null
        };
        if (mode === 'owner') {
            item.userId = o.userId;
            item.customerLabel = `客户 #${o.userId}`;
        }
        return item;
    });

    return { list, filter, mode };
}

/** GET /api/consultants/:id/reviews — 客户端看某顾问已评价订单（无顾问长文案、无客户标识） */
exports.listPublicConsultantReviews = async (req, res) => {
    try {
        const consultantId = parseInt(req.params.id, 10);
        const result = await fetchConsultantOrderReviewFeed({
            consultantId,
            mode: 'public',
            filter: 'reviews_only'
        });
        if (result.error) {
            return res.status(result.status).json({ message: result.error });
        }
        res.json({
            message: '获取成功',
            data: { list: result.list, filter: result.filter, mode: result.mode }
        });
    } catch (err) {
        console.error('listPublicConsultantReviews:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/** GET /api/order/consultant/orders-review-feed?filter=reviews_only|all */
exports.listOwnerConsultantOrdersFeed = async (req, res) => {
    try {
        const role = req.user.role || '';
        const cid = req.user.consultantId;
        if (role !== 'consultant' || cid == null) {
            return res.status(403).json({ message: '仅顾问可查看' });
        }
        const raw = (req.query.filter || 'reviews_only').toLowerCase();
        const filter = raw === 'all' ? 'all' : 'reviews_only';
        const result = await fetchConsultantOrderReviewFeed({
            consultantId: Number(cid),
            mode: 'owner',
            filter
        });
        if (result.error) {
            return res.status(result.status).json({ message: result.error });
        }
        res.json({
            message: '获取成功',
            data: { list: result.list, filter: result.filter, mode: result.mode }
        });
    } catch (err) {
        console.error('listOwnerConsultantOrdersFeed:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/**
 * POST /api/reviews/:orderId
 * 待评价 → 写入 order_reviews + 订单改为 completed 并写 completed_at
 */
exports.submitReview = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可评价' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        const order = await Order.findByOrderId(orderId);
        if (!order || order.userId !== userId) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'pending_review') {
            return res.status(400).json({ message: '当前订单不在待评价状态' });
        }
        if (order.consultantId == null) {
            return res.status(400).json({ message: '订单无承接顾问，无法评价' });
        }
        const dup = await OrderReview.findByOrderId(orderId);
        if (dup) {
            return res.status(400).json({ message: '该订单已评价过' });
        }

        const { rating, content, tags } = req.body || {};
        const raw = Number(rating);
        if (Number.isNaN(raw)) {
            return res.status(400).json({ message: '评分格式无效' });
        }
        const deci = Math.round(raw * 10);
        if (deci < 10 || deci > 50) {
            return res.status(400).json({ message: '评分须在 1.0～5.0 之间（步长 0.1）' });
        }
        const r = deci / 10;
        let tagsJson = null;
        if (tags != null && Array.isArray(tags)) {
            tagsJson = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
            if (tagsJson.length === 0) tagsJson = null;
        }
        const contentStr =
            content != null && String(content).trim() ? String(content).trim().slice(0, 2000) : null;

        const consultantId = Number(order.consultantId);
        const transaction = await sequelize.transaction();
        try {
            await OrderReview.create(
                {
                    orderId,
                    fromUserId: userId,
                    fromRole: 'user',
                    toUserId: consultantId,
                    toRole: 'consultant',
                    rating: r,
                    content: contentStr,
                    tags: tagsJson
                },
                { transaction }
            );
            order.status = 'completed';
            order.completedAt = new Date();
            await order.save({ transaction });

            const cprof = await ConsultantProfile.findOne({
                where: { consultantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (cprof) {
                const prevCount = Math.max(0, parseInt(String(cprof.reviewCount || 0), 10) || 0);
                const prevRating = Number(cprof.rating) || 0;
                const newCount = prevCount + 1;
                const newAvg =
                    prevCount === 0 ? r : (prevRating * prevCount + r) / newCount;
                const rounded = Math.round(newAvg * 100) / 100;
                cprof.reviewCount = newCount;
                cprof.rating = Math.min(5, Math.max(0, rounded));
                await cprof.save({ transaction });
            } else {
                console.warn(`[评价] 订单#${orderId} 顾问#${consultantId} 无 consultant_profile，未同步评分/评价数`);
            }

            await transaction.commit();
        } catch (e) {
            await transaction.rollback();
            if (e.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({ message: '该订单已评价过' });
            }
            throw e;
        }

        res.json({
            message: '评价成功，订单已完成',
            data: { orderId: order.orderId, status: order.status, completedAt: order.completedAt }
        });
    } catch (err) {
        console.error('submitReview:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};
