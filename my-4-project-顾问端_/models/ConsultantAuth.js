// 用户登录表：手机号 + 密码

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConsultantAuth = sequelize.define('ConsultantAuth', {
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,//不允许为空（必须填）
        unique: true,//唯一（不能重复）
        comment: '手机号',
        validate: {
            notEmpty: { msg: '手机号不能为空' },
            len: { args: [11, 11], msg: '手机号必须是11位' },
            is: {
                args: [/^1[3-9]\d{9}$/, 'i'],  // 中国手机号正则
                msg: '请输入正确的中国大陆手机号'
            }
        }
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false,//不允许为空（必须填）
        comment: '密码',
        validate: {
            notEmpty: {
                msg: '密码不能为空'
            },
            len: {
                args: [6, 20],
                msg: '密码长度必须在 6-20 个字符之间'
            }
        }
    }
}, {
    tableName: 'consultant_auth',
    underscored: true,//下划线（驼峰转下划线）
    timestamps: true//时间戳（创建和更新时间）
});

ConsultantAuth.findByPhone = async function (phone) {
    return await this.findOne({ where: { phone } });
};

ConsultantAuth.createConsultant = async function (data) {
    return await this.create(data);
};

module.exports = ConsultantAuth;
