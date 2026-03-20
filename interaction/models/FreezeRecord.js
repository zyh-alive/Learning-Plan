/**
 * 订单资金流水：每次状态变化追加一行（支付=frozen，完成=released，取消/拒绝=refunded），id 自增。
 * 后台查看：按订单号排序即可，例如 ORDER BY order_id ASC, id ASC（同一订单多行按 id 为时间先后）。
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FreezeRecord = sequelize.define(
    'FreezeRecord',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        orderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '关联订单，同一订单多条记录共享此 id'
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        consultantId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: '本笔涉及金额'
        },
        status: {
            type: DataTypes.ENUM('frozen', 'released', 'refunded'),
            allowNull: false,
            comment: 'frozen冻结中 released已释放给顾问 refunded已退回'
        },
        operatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            comment: '操作时间'
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '操作原因说明'
        },
        /** main=订单本金 rush=加急款（同一订单可各有一条 frozen） */
        purpose: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'main',
            comment: 'main 订单款 rush 加急款'
        }
    },
    {
        tableName: 'freeze_records',
        underscored: true,
        timestamps: false,
        indexes: [{ fields: ['order_id'] }, { fields: ['user_id'] }]
    }
);

FreezeRecord.STATUS_LABEL = {
    frozen: '冻结中',
    released: '已释放给顾问',
    refunded: '已退回'
};

module.exports = FreezeRecord;
