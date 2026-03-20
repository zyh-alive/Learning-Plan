/**
 * 订单聊天记录：服务中双方消息落库（与 WebSocket 广播可配合使用）
 * 表名 order_chat_messages
 */
const { DataTypes, Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderChatMessage = sequelize.define(
    'OrderChatMessage',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '主键'
        },
        orderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '订单 ID，关联 orders.order_id',
            references: { model: 'orders', key: 'order_id' },
            onDelete: 'CASCADE'
        },
        senderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '发送者 ID（user 时为 user_auth.id，consultant 时为 consultant_auth.id）'
        },
        senderRole: {
            type: DataTypes.ENUM('user', 'consultant'),
            allowNull: false,
            comment: '发送者角色'
        },
        receiverId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '接收者 ID'
        },
        receiverRole: {
            type: DataTypes.ENUM('user', 'consultant'),
            allowNull: false,
            comment: '接收者角色'
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
            comment: '消息内容'
        },
        contentType: {
            type: DataTypes.ENUM('text', 'image', 'file'),
            allowNull: false,
            defaultValue: 'text',
            comment: '消息类型'
        },
        isRead: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否已读'
        },
        readAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '读取时间'
        }
    },
    {
        tableName: 'order_chat_messages',
        underscored: true,
        timestamps: true,
        updatedAt: false,
        indexes: [{ fields: ['order_id'] }],
        comment: '订单聊天消息'
    }
);

/**
 * 将 Sequelize 实例转为前端/接口用的普通对象（驼峰字段）
 * @param {import('sequelize').Model} row
 */
OrderChatMessage.toDTO = function (row) {
    if (!row) return null;
    const j = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        id: j.id,
        orderId: j.orderId,
        senderId: j.senderId,
        senderRole: j.senderRole,
        receiverId: j.receiverId,
        receiverRole: j.receiverRole,
        content: j.content,
        contentType: j.contentType,
        isRead: !!j.isRead,
        readAt: j.readAt || null,
        createdAt: j.createdAt || null
    };
};

/**
 * 在订单双方之间插入一条消息（校验发送者属于该订单）
 * @param {{ orderId: number, userId: number, consultantId: number }} order
 * @param {{ senderRole: 'user'|'consultant', senderId: number, content: string, contentType?: string }} payload
 */
OrderChatMessage.createForOrder = async function (order, { senderRole, senderId, content, contentType = 'text' }) {
    const text = String(content || '').trim().slice(0, 2000);
    if (!text) {
        const err = new Error('消息内容不能为空');
        err.code = 'EMPTY_CONTENT';
        throw err;
    }
    const uid = Number(order.userId);
    const cid = Number(order.consultantId);
    const sid = Number(senderId);
    if (senderRole === 'user') {
        if (sid !== uid) {
            const err = new Error('发送者与订单不匹配');
            err.code = 'SENDER_MISMATCH';
            throw err;
        }
        return await OrderChatMessage.create({
            orderId: order.orderId,
            senderId: sid,
            senderRole: 'user',
            receiverId: cid,
            receiverRole: 'consultant',
            content: text,
            contentType: ['text', 'image', 'file'].includes(contentType) ? contentType : 'text',
            isRead: false,
            readAt: null
        });
    }
    if (senderRole === 'consultant') {
        if (sid !== cid) {
            const err = new Error('发送者与订单不匹配');
            err.code = 'SENDER_MISMATCH';
            throw err;
        }
        return await OrderChatMessage.create({
            orderId: order.orderId,
            senderId: sid,
            senderRole: 'consultant',
            receiverId: uid,
            receiverRole: 'user',
            content: text,
            contentType: ['text', 'image', 'file'].includes(contentType) ? contentType : 'text',
            isRead: false,
            readAt: null
        });
    }
    const err = new Error('无效的发送者角色');
    err.code = 'BAD_ROLE';
    throw err;
};

/**
 * 按订单拉取最近若干条消息，按时间正序（适合聊天窗口从上到下展示）
 * @param {number} orderId
 * @param {{ limit?: number }} [opts]
 */
OrderChatMessage.listRecentByOrderId = async function (orderId, opts = {}) {
    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 500);
    const rows = await OrderChatMessage.findAll({
        where: { orderId },
        order: [['id', 'DESC']],
        limit
    });
    return rows.reverse();
};

/**
 * 将「我是接收方」且未读的消息标为已读，返回被更新的消息 id 列表
 * @param {{ orderId: number, receiverRole: 'user'|'consultant', receiverId: number }} p
 */
/**
 * 当前用户/顾问作为订单参与方时，列出「有过聊天记录」的订单会话（含最后一条预览与未读数）
 * @param {{ role: 'user'|'consultant', userId?: number, consultantId?: number }} p
 * @returns {Promise<Array<{ orderId, orderStatus, userId, consultantId, serviceType, lastContent, lastAt, lastSenderRole, unreadCount }>>}
 */
OrderChatMessage.listConversationsForParticipant = async function ({ role, userId, consultantId }) {
    const baseSql = `
      SELECT o.order_id AS orderId, o.status AS orderStatus, o.user_id AS userId, o.consultant_id AS consultantId,
        o.service_type AS serviceType,
        lm.content AS lastContent,
        lm.created_at AS lastAt,
        lm.sender_role AS lastSenderRole,
        (SELECT COUNT(*) FROM order_chat_messages um
         WHERE um.order_id = o.order_id
         AND um.receiver_id = :meId
         AND um.receiver_role = :meRole
         AND um.is_read = 0) AS unreadCount
      FROM orders o
      INNER JOIN (
        SELECT order_id, MAX(id) AS max_id FROM order_chat_messages GROUP BY order_id
      ) latest ON latest.order_id = o.order_id
      INNER JOIN order_chat_messages lm ON lm.id = latest.max_id
      WHERE `;

    if (role === 'user' && userId != null) {
        const sql =
            baseSql +
            `o.user_id = :filterId
      ORDER BY lm.created_at DESC`;
        return await sequelize.query(sql, {
            replacements: { meId: userId, meRole: 'user', filterId: userId },
            type: QueryTypes.SELECT
        });
    }
    if (role === 'consultant' && consultantId != null) {
        const sql =
            baseSql +
            `o.consultant_id = :filterId
      ORDER BY lm.created_at DESC`;
        return await sequelize.query(sql, {
            replacements: { meId: consultantId, meRole: 'consultant', filterId: consultantId },
            type: QueryTypes.SELECT
        });
    }
    return [];
};

OrderChatMessage.markAsReadForReceiver = async function ({ orderId, receiverRole, receiverId }) {
    const rows = await OrderChatMessage.findAll({
        where: {
            orderId,
            receiverRole,
            receiverId,
            isRead: false
        },
        attributes: ['id']
    });
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    await OrderChatMessage.update(
        { isRead: true, readAt: new Date() },
        { where: { id: { [Op.in]: ids } } }
    );
    return ids;
};

module.exports = OrderChatMessage;
