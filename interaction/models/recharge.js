// 充值记录表：记录用户每次充值，只增不改

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Recharge = sequelize.define('Recharge', {
    // 主键：充值 ID，自增长
    rechargeId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '充值 ID，主键，自增长'
    },
    
    // 用户 ID（关联 user_auth.id）
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,//不允许为空
        comment: '用户 ID',
        references: { model: 'user_auth', key: 'id' },
        onDelete: 'CASCADE'//用户删除，充值记录级联删除
    },
    
    // 充值金额
    amount: {
        type: DataTypes.DECIMAL(10, 2),//最多 10 位，2 位小数
        allowNull: false,//不允许为空
        comment: '充值金额'
    },
    
    // 充值后剩余金额（充值时的金币余额）
    balanceAfter: {
        type: DataTypes.DECIMAL(10, 2),//最多 10 位，2 位小数
        allowNull: false,//不允许为空
        comment: '充值后剩余金额（充值时的金币余额）'
    },
    
    // 充值时间
    rechargeTime: {
        type: DataTypes.DATE,
        allowNull: false,//不允许为空
        defaultValue: DataTypes.NOW,
        comment: '充值时间'
    }
}, {
    tableName: 'recharges',          // 数据库表名
    underscored: true,//下划线（驼峰转下划线）
    timestamps: true//时间戳（自动添加 created_at / updated_at）
});

// ============ 静态方法（仿照 UserAuth 风格） ============

// 根据用户 ID 查询充值记录
Recharge.findByUserId = async function (userId) {
    return await this.findAll({ 
        where: { userId },
        order: [['rechargeTime', 'DESC']]
    });
};

// 创建充值记录（可传 { transaction } 参与事务）
Recharge.createRecharge = async function (data, options) {
    return await this.create(data, options || {});
};

module.exports = Recharge;
