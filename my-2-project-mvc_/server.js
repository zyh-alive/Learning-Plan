// 作用：组装所有模块，启动服务器

const express = require('express');
// 引入路由模块（来自 routes/authRoutes.js）
const authRoutes = require('./routes/authRoutes');
const sequelize = require('./config/database');
require('./models/User');
const app = express();

// 中间件：解析 JSON 请求体
app.use(express.json());

// 挂载路由模块
// 所有以 /auth 开头的请求，都交给 authRoutes 处理
// 例如：/auth/login, /auth/register, /auth/users/123
app.use('/auth', authRoutes);

// 可以挂载更多路由模块
// app.use('/posts', postRoutes);
// app.use('/comments', commentRoutes);
// 根路由（可以直接写在入口，也可以单独拆出去）
app.get('/', (req, res) => {
    res.json({ message: 'Hello World' });
});
(async () => {
    await sequelize.sync({ alter: true });
    // 启动服务器
    const PORT = 3002;
    app.listen(PORT, () => {
        console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
    });
})();
