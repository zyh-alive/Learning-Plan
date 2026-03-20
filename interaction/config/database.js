// ========== 数据库连接：所有查库、写库都通过这个连接 ==========
// 别的文件用：const sequelize = require('../config/database'); 然后 sequelize.query / Model 都用它

const { Sequelize } = require('sequelize');

// 创建一个 MySQL 连接：数据库名、用户名、密码、主机、类型
const sequelize = new Sequelize('testdb3', 'root', '0409111151', {
    host: 'localhost',   // 本机 MySQL
    dialect: 'mysql',    // 用的是 MySQL
});

// 可选：测试连接是否成功（当前 server.js 没调用，需要时可手动调）
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');
    } catch (error) {
        console.error('❌ 数据库连接失败：', error);
    }
}

// 导出连接实例；models 里的表定义都会用 sequelize.define，用的就是这里这个实例
module.exports = sequelize;