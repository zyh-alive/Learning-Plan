// 作用：定义数据结构，封装所有数据库操作

// 引入数据类型（定义字段类型用）
const { DataTypes } = require('sequelize');
// 引入数据库连接实例（来自 config/database.js）
const sequelize = require('../config/database');

// 定义 User 模型（对应数据库的 Users 表）
const User = sequelize.define('User', {
    // 定义字段：用户名，类型为字符串
    username: {
        type: DataTypes.STRING,
        allowNull: false,      // 不能为空
        unique: true           // 必须唯一
    },
    // 定义字段：密码，类型为字符串
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    // 可以加更多字段...
    age: DataTypes.INTEGER,
    email: DataTypes.STRING
});

// 自定义方法：根据用户名查找用户
// 这个方法是给 controller 调用的
User.findByUsername = async function(username) {
    // this 指向 User 模型本身
    return await this.findOne({ 
        where: { username } 
    });
};

// 自定义方法：创建新用户
User.createUser = async function(userData) {
    return await this.create(userData);
};

// 导出 User 模型，供 controller 使用
module.exports = User;