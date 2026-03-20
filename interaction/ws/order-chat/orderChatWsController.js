/**
 * 订单聊天 WebSocket 控制器：连接鉴权、入房、处理客户端消息（落库 + 广播）
 * 对应 HTTP 侧的订单聊天接口在 controllers/orderController.js
 */
const url = require('url');
const Order = require('../models/order');
const OrderChatMessage = require('../models/orderChatMessage');
const { verifyAccessToken } = require('../../utils/verifyAccessToken');
const { addToRoom, removeFromRoom, broadcastToOrderRoom } = require('./broadcast');

/** WebSocket 关闭码（3000–4999 为应用自定义；1011 为异常） */
const WS_CLOSE = {
    NO_TOKEN: 4001,
    INVALID_JWT: 4002,
    AUTH_FORBIDDEN: 4003,
    SERVER: 1011
};

/**
 * @param {import('ws')} ws
 * @param {import('http').IncomingMessage} request
 */
async function handleOrderChatConnection(ws, request) {
    const q = url.parse(request.url, true).query || {};
    const token = q.token;
    const orderId = parseInt(q.orderId, 10);
    if (!orderId || orderId <= 0) {
        ws.close(WS_CLOSE.NO_TOKEN, 'missing orderId');
        return;
    }

    const authResult = await verifyAccessToken(token);
    if (!authResult.ok) {
        const code =
            authResult.code === 'NO_TOKEN'
                ? WS_CLOSE.NO_TOKEN
                : authResult.code === 'INVALID_JWT'
                  ? WS_CLOSE.INVALID_JWT
                  : authResult.code === 'SERVER'
                    ? WS_CLOSE.SERVER
                    : WS_CLOSE.AUTH_FORBIDDEN;
        const reason = String(authResult.message || 'auth failed').slice(0, 120);
        ws.close(code, reason);
        return;
    }

    const decoded = authResult.user;
    const role = decoded.role || 'user';
    if (!['user', 'consultant'].includes(role)) {
        ws.close(4005, 'forbidden');
        return;
    }

    const order = await Order.findByOrderId(orderId);
    if (!order) {
        ws.close(4006, 'order not found');
        return;
    }
    if (order.status !== 'in_service') {
        ws.close(4007, 'order not in service');
        return;
    }
    if (role === 'user' && Number(order.userId) !== Number(decoded.userId)) {
        ws.close(4005, 'forbidden');
        return;
    }
    if (role === 'consultant' && Number(order.consultantId) !== Number(decoded.consultantId)) {
        ws.close(4005, 'forbidden');
        return;
    }

    ws._orderId = orderId;
    ws._role = role;
    addToRoom(orderId, ws);

    ws.send(
        JSON.stringify({
            type: 'system',
            text: '已连接订单 #' + orderId + ' 聊天室'
        })
    );

    ws.on('message', (raw) => {
        (async () => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch (e) {
                return;
            }
            if (!msg || msg.type !== 'chat' || typeof msg.text !== 'string') return;
            const trimmed = msg.text.trim().slice(0, 2000);
            if (!trimmed) return;
            const senderId = role === 'user' ? Number(decoded.userId) : Number(decoded.consultantId);
            try {
                const row = await OrderChatMessage.createForOrder(order, {
                    senderRole: role,
                    senderId,
                    content: trimmed,
                    contentType: 'text'
                });
                const dto = OrderChatMessage.toDTO(row);
                broadcastToOrderRoom(orderId, {
                    type: 'chat',
                    ...dto,
                    role,
                    text: dto.content,
                    at: dto.createdAt
                });
            } catch (e) {
                console.error('[ws/order-chat] 保存消息失败:', e.message);
                try {
                    ws.send(JSON.stringify({ type: 'error', message: e.message || '发送失败' }));
                } catch (sendErr) { /* ignore */ }
            }
        })().catch((e) => console.error('[ws/order-chat]', e));
    });

    ws.on('close', () => removeFromRoom(ws));
    ws.on('error', () => removeFromRoom(ws));
}

module.exports = {
    handleOrderChatConnection,
    WS_CLOSE
};
