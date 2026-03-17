// 作用：只做一件事，把 URL 映射到对应的控制器方法

const express = require('express');
// 创建路由实例（相当于一个子路由器）
const router = express.Router();

// 引入控制器（来自 controllers/authController.js）
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');
// 定义路由映射关系


// 公开接口（不需要登录就能访问）
// POST /auth/login 请求 -> 调用 authController.login 方法
router.post('/login', authController.login);
// POST /auth/register 请求 -> 调用 authController.register 方法
router.post('/register', authController.register);


// 需要登录才能访问的接口
router.get('/profile', authenticateToken, (req, res) => {
    // 从 token 里拿到的用户信息
    res.json({
        message: '这是个人资料',
        user: req.user  // 就是之前存进去的 { userId, username }
    });
});

// GET /auth/users/:id 请求 -> 调用 authController.getUser 方法
router.get('/users/:id', authenticateToken,authController.getUser);

// 导出路由，供 server.js 使用
module.exports = router;