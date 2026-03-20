// 订单表：用户下单、顾问接单、状态流转
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
    // 主键：订单 ID，自增长
    orderId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '订单 ID，主键，自增长'
    },
    
    // 下单用户 = user_auth.id（与 JWT 里 userId、user_profile.user_id 一致）
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '下单用户 ID（谁下的单）',
        references: { model: 'user_auth', key: 'id' },
        onDelete: 'CASCADE'
    },
    
    // 指定顾问 = consultant_auth.id（与 consultant_profile.consultant_id 一致）
    consultantId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '接单顾问 ID（谁接的单），接单前为空',
        references: { model: 'consultant_auth', key: 'id' },
        onDelete: 'SET NULL'
    },
    
    // 订单状态
    status: {
        type: DataTypes.ENUM(
            'pending',
            'accepted',
            'start_invited',
            'in_service',
            'pending_review',
            'completed',
            'cancelled',
            'expired',
            'pending_rush'
        ),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'pending待接单 pending_rush加急待接单 … expired过期'
    },
    
    // 订单金额
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '订单金额'
    },

    paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '客户完成支付（冻结金币）的时间，未支付为空'
    },

    /** 接单等待时长（秒），支付成功时起算；默认 24 小时 */
    survivalSeconds: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 86400,
        comment: '已支付待接单存活时间（秒），默认 86400=24h'
    },

    /** 接单截止时间（支付时写入 paidAt + survivalSeconds） */
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '超过此时刻仍未接单则订单过期并退款'
    },

    /** 系统标记为过期的时间 */
    expiredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '订单因超时未接单而过期的时间'
    },

    // 服务类型
    serviceType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '服务类型（咨询、陪聊、代办等）'
    },
    
    // 服务内容描述
    serviceContent: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '服务内容描述（用户填的需求）'
    },
    
    // 服务地址（可选）
    address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '服务地址（如果有线下服务）'
    },
    
    // 联系电话（可选）
    contactPhone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '联系电话'
    },
    
    // 预约服务时间（可选）
    scheduledTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '预约的服务时间'
    },
    
    // 顾问接单时间（可为空）
    acceptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '顾问接单时间'
    },
    
    // 订单完成时间（可为空）
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '订单完成时间'
    },
    
    // 订单取消时间（可为空）
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '订单取消时间'
    },
    
    // 取消原因（可选）
    cancelReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '取消原因'
    },

    /** 加急说明（客户填写） */
    rushDescription: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '加急描述'
    },
    /** 加急费用（金币），一般为订单价的一半 */
    rushFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '加急费用'
    },
    /** 加急接单窗口（秒），默认 3600=1 小时 */
    rushDurationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 3600,
        comment: '加急时长（秒）'
    },
    rushPaidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '加急款支付时间'
    },
    rushExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '加急接单截止时间'
    }
}, {
    tableName: 'orders',           // 数据库表名
    underscored: true,             // 字段自动转下划线
    timestamps: true               // 自动添加 created_at / updated_at
});

Order.findByOrderId = async function (orderId) {
    return await this.findOne({ where: { orderId } });
};

// 根据用户 ID 查询订单列表
Order.findByUserId = async function (userId) {
    return await this.findAll({ 
        where: { userId },
        order: [['createdAt', 'DESC']]
    });
};

// 创建订单（封装 create，方便后续加逻辑）
Order.createOrder = async function (data) {
    return await this.create(data);
};

// 根据状态查询订单(目前好像还没用到)
Order.findByStatus = async function (status) {
    return await this.findAll({ 
        where: { status },
        order: [['createdAt', 'DESC']]
    });
};

module.exports = Order;