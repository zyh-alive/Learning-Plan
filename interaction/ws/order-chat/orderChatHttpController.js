/**
 * 订单聊天 —— 与 WebSocket 同域的 HTTP 接口（会话列表、历史、发送、已读）
 * 纯订单流程仍在 controllers/orderController.js；本文件仅处理「聊天 + 推送房间」相关 REST。
 */
const { Op } = require('sequelize');
const Order = require('../../models/Order');
const ConsultantProfile = require('../../models/ConsultantProfile');
const UserProfile = require('../../models/UserProfile');
const OrderChatMessage = require('../../models/OrderChatMessage');
const { broadcastOrderChat } = require('./broadcast');

/** 校验当前登录用户是否为订单的客户或顾问 */
async function ensureOrderChatParticipant(req, orderId) {
    const role = req.user.role || '';
    const userId = req.user.userId;
    const consultantId = req.user.consultantId;
    if (!orderId || orderId <= 0) {
        return { error: { status: 400, message: '订单 ID 无效' } };
    }
    const order = await Order.findByOrderId(orderId);
    if (!order) {
        return { error: { status: 404, message: '订单不存在' } };
    }
    if (role === 'user' && Number(order.userId) !== Number(userId)) {
        return { error: { status: 403, message: '无权查看' } };
    }
    if (role === 'consultant' && Number(order.consultantId) !== Number(consultantId)) {
        return { error: { status: 403, message: '无权查看' } };
    }
    if (!['user', 'consultant'].includes(role)) {
        return { error: { status: 403, message: '无权查看' } };
    }
    return { order, role, userId, consultantId };
}

/** GET /api/order/chat/conversations — 主页消息列表：有聊天记录的订单 + 服务中但尚未发消息的订单 */
exports.getChatConversations = async (req, res) => {
    try {
        const role = req.user.role || '';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        if (!['user', 'consultant'].includes(role)) {
            return res.status(403).json({ message: '无权查看' });
        }
        if (role === 'user' && userId == null) {
            return res.status(403).json({ message: '无权查看' });
        }
        if (role === 'consultant' && consultantId == null) {
            return res.status(403).json({ message: '无权查看' });
        }

        const raw = await OrderChatMessage.listConversationsForParticipant({
            role,
            userId,
            consultantId
        });

        const existingIds = new Set(raw.map((r) => r.orderId));

        const whereInService = { status: 'in_service' };
        if (role === 'user') {
            whereInService.userId = userId;
        } else {
            whereInService.consultantId = consultantId;
        }
        if (existingIds.size > 0) {
            whereInService.orderId = { [Op.notIn]: [...existingIds] };
        }

        const extraInService = await Order.findAll({
            where: whereInService,
            order: [['updatedAt', 'DESC']]
        });

        const cIds = new Set(raw.map((r) => r.consultantId).filter((id) => id != null));
        const uIds = new Set(raw.map((r) => r.userId).filter((id) => id != null));
        extraInService.forEach((o) => {
            if (o.consultantId != null) cIds.add(o.consultantId);
            if (o.userId != null) uIds.add(o.userId);
        });

        const cMap = {};
        if (cIds.size) {
            const cRows = await ConsultantProfile.findAll({
                where: { consultantId: { [Op.in]: [...cIds] } },
                attributes: ['consultantId', 'name']
            });
            cRows.forEach((p) => {
                cMap[p.consultantId] = p.name ? String(p.name).trim() : null;
            });
        }
        const uMap = {};
        if (uIds.size) {
            const uRows = await UserProfile.findAll({
                where: { userId: { [Op.in]: [...uIds] } },
                attributes: ['userId', 'name']
            });
            uRows.forEach((p) => {
                uMap[p.userId] = p.name ? String(p.name).trim() : null;
            });
        }

        const list = raw.map((row) => {
            let otherName;
            if (role === 'user') {
                otherName = cMap[row.consultantId] || `顾问 #${row.consultantId}`;
            } else {
                otherName = uMap[row.userId] || `客户 #${row.userId}`;
            }
            return {
                orderId: row.orderId,
                orderStatus: row.orderStatus,
                serviceType: row.serviceType,
                otherName,
                lastContent: row.lastContent,
                lastAt: row.lastAt,
                lastSenderRole: row.lastSenderRole,
                unreadCount: Number(row.unreadCount) || 0,
                isPlaceholder: false
            };
        });

        extraInService.forEach((o) => {
            let otherName;
            if (role === 'user') {
                otherName = cMap[o.consultantId] || `顾问 #${o.consultantId}`;
            } else {
                otherName = uMap[o.userId] || `客户 #${o.userId}`;
            }
            const lastAt = o.updatedAt || o.createdAt;
            list.push({
                orderId: o.orderId,
                orderStatus: o.status,
                serviceType: o.serviceType,
                otherName,
                lastContent: '服务进行中，点此开始对话',
                lastAt,
                lastSenderRole: null,
                unreadCount: 0,
                isPlaceholder: true
            });
        });

        /** 已接单 / 已邀开始但尚未 in_service：主页也要出现，避免顾问只能去接单中心找入口 */
        const coveredIds = new Set(list.map((x) => x.orderId));
        const wherePreChat = {
            status: { [Op.in]: ['accepted', 'start_invited'] },
            ...(role === 'user' ? { userId } : { consultantId })
        };
        if (coveredIds.size > 0) {
            wherePreChat.orderId = { [Op.notIn]: [...coveredIds] };
        }
        const preChatOrders = await Order.findAll({
            where: wherePreChat,
            order: [['updatedAt', 'DESC']]
        });
        preChatOrders.forEach((o) => {
            if (o.consultantId != null) cIds.add(o.consultantId);
            if (o.userId != null) uIds.add(o.userId);
        });
        if (cIds.size) {
            const cRows2 = await ConsultantProfile.findAll({
                where: { consultantId: { [Op.in]: [...cIds] } },
                attributes: ['consultantId', 'name']
            });
            cRows2.forEach((p) => {
                cMap[p.consultantId] = p.name ? String(p.name).trim() : null;
            });
        }
        if (uIds.size) {
            const uRows2 = await UserProfile.findAll({
                where: { userId: { [Op.in]: [...uIds] } },
                attributes: ['userId', 'name']
            });
            uRows2.forEach((p) => {
                uMap[p.userId] = p.name ? String(p.name).trim() : null;
            });
        }

        preChatOrders.forEach((o) => {
            let otherName;
            if (role === 'user') {
                otherName = cMap[o.consultantId] || `顾问 #${o.consultantId}`;
            } else {
                otherName = uMap[o.userId] || `客户 #${o.userId}`;
            }
            let lastContent;
            if (role === 'consultant') {
                lastContent =
                    o.status === 'accepted'
                        ? '已接单：点进订单可邀请客户开始，之后即可聊天'
                        : '已邀请客户确认开始，等待客户同意…';
            } else {
                lastContent =
                    o.status === 'accepted'
                        ? '顾问已接单，等待对方邀请开始服务'
                        : '顾问已邀请开始服务，请尽快在订单里确认';
            }
            const lastAt = o.updatedAt || o.createdAt;
            list.push({
                orderId: o.orderId,
                orderStatus: o.status,
                serviceType: o.serviceType,
                otherName,
                lastContent,
                lastAt,
                lastSenderRole: null,
                unreadCount: 0,
                isPlaceholder: true
            });
        });

        list.sort((a, b) => {
            const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
            const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
            return tb - ta;
        });

        res.json({ message: '获取成功', data: { list } });
    } catch (err) {
        console.error('会话列表错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/** GET /api/order/:orderId/chat/messages */
exports.getOrderChatMessages = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        const r = await ensureOrderChatParticipant(req, orderId);
        if (r.error) {
            return res.status(r.error.status).json({ message: r.error.message });
        }
        const limit = parseInt(req.query.limit, 10) || 200;
        const rows = await OrderChatMessage.listRecentByOrderId(orderId, { limit });
        const list = rows.map((row) => OrderChatMessage.toDTO(row));
        res.json({ message: '获取成功', data: { list } });
    } catch (err) {
        console.error('聊天列表错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/** POST /api/order/:orderId/chat/messages */
exports.postOrderChatMessage = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        const r = await ensureOrderChatParticipant(req, orderId);
        if (r.error) {
            return res.status(r.error.status).json({ message: r.error.message });
        }
        if (r.order.status !== 'in_service') {
            return res.status(400).json({ message: '仅服务进行中可发送消息' });
        }
        const { content, contentType } = req.body || {};
        const senderId = r.role === 'user' ? r.userId : r.consultantId;
        let row;
        try {
            row = await OrderChatMessage.createForOrder(r.order, {
                senderRole: r.role,
                senderId,
                content,
                contentType
            });
        } catch (e) {
            if (e.code === 'EMPTY_CONTENT') {
                return res.status(400).json({ message: e.message });
            }
            if (e.code === 'SENDER_MISMATCH' || e.code === 'BAD_ROLE') {
                return res.status(403).json({ message: e.message });
            }
            throw e;
        }
        const dto = OrderChatMessage.toDTO(row);
        broadcastOrderChat(orderId, {
            type: 'chat',
            ...dto,
            role: r.role,
            text: dto.content,
            at: dto.createdAt
        });
        res.status(201).json({ message: '发送成功', data: dto });
    } catch (err) {
        console.error('发送聊天消息错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/** POST /api/order/:orderId/chat/read */
exports.markOrderChatRead = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        const r = await ensureOrderChatParticipant(req, orderId);
        if (r.error) {
            return res.status(r.error.status).json({ message: r.error.message });
        }
        if (r.order.status !== 'in_service') {
            return res.status(400).json({ message: '仅服务进行中可操作' });
        }
        const readerId = r.role === 'user' ? r.userId : r.consultantId;
        const messageIds = await OrderChatMessage.markAsReadForReceiver({
            orderId,
            receiverRole: r.role,
            receiverId: readerId
        });
        if (messageIds.length) {
            broadcastOrderChat(orderId, {
                type: 'read_receipt',
                readerRole: r.role,
                messageIds
            });
        }
        res.json({ message: '已更新', data: { messageIds } });
    } catch (err) {
        console.error('标记已读错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};
