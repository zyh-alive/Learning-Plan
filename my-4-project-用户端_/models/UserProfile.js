// 用户资料表：name, birth, gender, bio, about, coin, isCompleted
// 查找/新增/修改用 Sequelize 自带方法即可，不需要像 UserAuth 那样自己写：
//   - 新增：UserProfile.create({ userId, ... })
//   - 查找：UserProfile.findOne({ where: { userId } }) 或 findByPk(id)
//   - 修改：profile.save()

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const UserAuth = require('./UserAuth');

const UserProfile = sequelize.define('UserProfile', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,//不允许为空（必须填）
        unique: true,//唯一（不能重复）
        references: { model: 'user_auth', key: 'id' },//外键引用，引用user_auth表的id
        onDelete: 'CASCADE',//级联删除(当user_auth表的id被删除时，user_profile表的userId也会被删除)
        comment: '关联 user_auth.id'
    },
    name: { type: DataTypes.STRING(50), comment: '姓名' },
    birth: { type: DataTypes.DATEONLY, comment: '生日' },
    gender: { 
        type: DataTypes.TINYINT, 
        comment: '0:未知 1:男 2:女 3:其他'},
    bio: { type: DataTypes.STRING(500), comment: '简介' },
    about: { type: DataTypes.TEXT, comment: '关于' },
    coin: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '金币（默认 0，不做增减逻辑，仅展示）'
    },
    isCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,        // 默认未完善
        allowNull: false,           // 不允许为空
        comment: '资料是否完善'
    }
}, {
    tableName: 'user_profile',
    underscored: true,
    timestamps: true
});

UserAuth.hasOne(UserProfile, { foreignKey: 'userId' });
UserProfile.belongsTo(UserAuth, { foreignKey: 'userId' });

module.exports = UserProfile;
