const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FundTransaction = sequelize.define('FundTransaction', {
    // 主键：交易 ID，自增长
    transactionId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '交易 ID，主键，自增长'
    },
    // 用户 ID（关联 user_auth.id）
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '用户 ID',
        references: { model: 'user_auth', key: 'id' },
        onDelete: 'RESTRICT'//保留用户，不删除交易记录
    },
    // 交易类型
    transactionType: {
        type: DataTypes.ENUM('充值', '提现', '消费', '订单取消退款', '售后退款'),
        allowNull: false,
        comment: '交易类型'
    },
    // 交易金额
    transactionAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '交易金额'
    },
    //交易后顾客剩余金额
    customerBalanceAfter: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull:  true,
        comment: '交易后顾客剩余金额'
    },
    //交易后顾问剩余金额
    consultantBalanceAfter: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull:  true,
        comment: '交易后顾问剩余金额'
    },
    //订单号
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '订单号',
        references: { model: 'orders', key: 'order_id' },
        onDelete: 'SET NULL'
    },
    //顾问ID
    consultantId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '顾问ID',
        references: { model: 'consultant_auth', key: 'id' },
        onDelete: 'RESTRICT'//保留顾问，不删除交易记录
    },
    //资金状态
    fundStatus: {
        type: DataTypes.ENUM('frozen', 'released', 'refunded', 'completed', 'servicing_refunded'),
        allowNull: false,
        comment: '资金状态 frozen冻结中 released已释放给顾问 refunded已退回 completed已完成充值/提现 servicing_refunded售后退款中'
    },
    //操作原因
    reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '操作原因说明'
    },
    //操作时间
    operatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '操作时间'
    },
    //* main=订单本金 rush=加急款（同一订单可各有一条 frozen） */
    purpose: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'main 订单款 rush 加急款'
    },
    //订单抽成
    orderCommission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '订单抽成20%（平台抽成20%）'
    },
    //售后原因类型
    servicingReasonType: {
        type: DataTypes.ENUM('服务不满意', '服务不及时', '服务不专业', '服务不热情', '服务不耐心', '服务不周到', '服务不规范', '服务不标准', '服务不一致'),
        allowNull: true,
        comment: '售后退款原因：服务不满意，服务不及时，服务不专业，服务不热情，服务不耐心，服务不周到，服务不规范，服务不标准，服务不一致'
    },
    //售后退款详情描述
    servicingRefundDetails: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '售后退款详情描述'
    }
}, {
    tableName: 'fund_transactions',
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ['order_id'] }, { fields: ['user_id'] }]
});
//创建充值记录（可传 { transaction } 参与事务）
FundTransaction.createFundTransaction = async function (data, options) {
    return await this.create(data, options || {});
};


module.exports = FundTransaction;