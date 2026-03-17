// 作用：只做一件事，把 URL 映射到对应的控制器方法

const express = require('express');
// 创建路由实例（相当于一个子路由器）
const router = express.Router();

// 引入控制器（来自 controllers/authController.js）
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');
// 定义路由映射关系


// 公开接口（不需要登录就能访问）
router.post('/check-phone', authController.checkPhone); // 检查手机号是否已注册（先调此接口，再决定是否发验证码）
router.post('/send-code', authController.sendCode);     // 发送验证码
router.post('/verify-code', authController.verifyCode); // 验证码校验，通过后返回「请设置密码」（不返回 token）
router.post('/set-password', authController.setPassword); // 设置密码并创建账号，返回 token，直接进主页
router.post('/login', authController.login);            // 老用户登录（仅此处与 set-password 会返回 token）

// 需要登录才能访问的接口
router.get('/profile', authenticateToken, (req, res) => {
    res.json({
        message: '这是个人资料',
        user: req.user   // { userId, phone }
    });
});

router.get('/users/:id', authenticateToken, authController.getUser);
router.put('/users/:id', authenticateToken, authController.updateProfile);

// POST /auth/change-password 请求 -> 修改密码
router.post('/change-password', authenticateToken, authController.changePassword);

// 导出路由，供 server.js 使用
module.exports = router;