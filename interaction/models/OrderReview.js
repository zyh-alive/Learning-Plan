/**
 * 订单评价表：一单一评（order_id 唯一）
 * 表名：order_reviews
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderReview = sequelize.define(
    'OrderReview',
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
            unique: true,
            comment: '订单 ID（orders.order_id），一单一评；与订单表外键关联',
            references: { model: 'orders', key: 'order_id' },
            onDelete: 'CASCADE'
        },
        fromUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '评价人 ID（user 时为 user_auth.id，consultant 时为 consultant_auth.id）'
        },
        fromRole: {
            type: DataTypes.ENUM('user', 'consultant'),
            allowNull: false,
            comment: '评价人角色'
        },
        toUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '被评价人 ID'
        },
        toRole: {
            type: DataTypes.ENUM('user', 'consultant'),
            allowNull: false,
            comment: '被评价人角色'
        },
        rating: {
            type: DataTypes.DECIMAL(3, 1),
            allowNull: false,
            validate: {
                min: 1,
                max: 5
            },
            comment: '评分 1.0～5.0，步长 0.1'
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: '文字评价'
        },
        tags: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: '评价标签，如 ["专业","耐心"]'
        },
        replyContent: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: '被评价方回复'
        },
        replyAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '回复时间'
        }
    },
    {
        tableName: 'order_reviews',
        underscored: true,
        timestamps: true,
        updatedAt: false,
        indexes: [
            { unique: true, fields: ['order_id'] },
            { fields: ['from_user_id'] },
            { fields: ['to_user_id'] },
            { fields: ['to_user_id', 'to_role'] }
        ],
        comment: '订单评价'
    }
);

// 创建评价（封装 create，方便后续加逻辑）
OrderReview.createReview = async function (data) {
    return await this.create(data);
};

// 按订单 ID 查一条
OrderReview.findByOrderId = async function (orderId) {
    return await this.findOne({ where: { orderId } });
};

// 按主键查一条
OrderReview.findById = async function (id) {
    return await this.findByPk(id);
};

// 被评价人为某用户时的评价列表
OrderReview.findByToUser = async function (toUserId, toRole) {
    return await this.findAll({
        where: { toUserId, toRole },
        order: [['createdAt', 'DESC']]
    });
};

// 评价人为某用户时的评价列表
OrderReview.findByFromUser = async function (fromUserId, fromRole) {
    return await this.findAll({
        where: { fromUserId, fromRole },
        order: [['createdAt', 'DESC']]
    });
};

const Order = require('./Order');
OrderReview.belongsTo(Order, {
    foreignKey: 'orderId',
    targetKey: 'orderId',
    as: 'order'
});
Order.hasMany(OrderReview, {
    foreignKey: 'orderId',
    sourceKey: 'orderId',
    as: 'reviews'
});

module.exports = OrderReview;
