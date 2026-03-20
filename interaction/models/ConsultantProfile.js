const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const ConsultantAuth = require('./ConsultantAuth');

const ConsultantProfile = sequelize.define('ConsultantProfile', {
    consultantId: {
        type: DataTypes.INTEGER,
        allowNull: false,//不允许为空（必须填）
        unique: true,//唯一（不能重复）
        references: { model: 'consultant_auth', key: 'id' },//外键引用，引用consultant_auth表的id
        onDelete: 'CASCADE',//级联删除(当consultant_auth表的id被删除时，consultant_profile表的consultantId也会被删除)
        comment: '关联 consultant_auth.id'
    },
    name: { type: DataTypes.STRING(50), comment: '顾问昵称' },
    coin: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '金币（默认 0，不做增减逻辑，仅展示）'
    },
    workStatus: { 
        type: DataTypes.TINYINT, 
        defaultValue: 0,
        comment: '工作状态 0:离线 1:空闲 2:忙碌'
    },
    totalOrders: { 
        type: DataTypes.INTEGER, 
        defaultValue: 0,
        comment: '总订单数'
    },
    rating: { 
        type: DataTypes.DECIMAL(3, 2), 
        defaultValue: 0.00,
        comment: '评分（0.00-5.00）'
    },
    reviewCount: { 
        type: DataTypes.INTEGER, 
        defaultValue: 0,
        comment: '评论数'
    },
    /** 对外展示（客户端顾问主页同步） */
    signature: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '个性签名'
    },
    workDuration: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '工作时长（展示文案，如从业年限）'
    },
    experience: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '经历说明'
    },
    isCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,        // 默认未完善
        allowNull: false,           // 不允许为空
        comment: '资料是否完善'
    },
    token_version: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'token版本号，改密码+1'
    }
}, {
    tableName: 'consultant_profile',
    underscored: true,
    timestamps: true
});

ConsultantAuth.hasOne(ConsultantProfile, { foreignKey: 'consultantId' });
ConsultantProfile.belongsTo(ConsultantAuth, { foreignKey: 'consultantId' });

module.exports = ConsultantProfile;