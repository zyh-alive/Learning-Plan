// 作用：负责数据库连接，让其他模块可以直接使用这个连接

const { Sequelize } = require('sequelize');

// 创建数据库连接实例
const sequelize = new Sequelize('testdb1', 'root', '0409111151', {
    host: 'localhost',
    dialect: 'mysql',
});

// 测试连接函数
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');
    } catch (error) {
        console.error('❌ 数据库连接失败：', error);
    }
}

// 导出 sequelize 实例，供其他模块使用
module.exports = sequelize;