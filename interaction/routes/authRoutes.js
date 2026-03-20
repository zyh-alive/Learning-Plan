// ========== 认证相关路由：/auth/* 的请求都进这里 ==========
// 只做一件事：把「URL + 方法」映射到 authController 里对应函数；要登录的加 authenticateToken

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');

// ---------- 公开接口：不需要带 token ----------
router.post('/check-phone', authController.checkPhone);   // 检查手机号是否已注册，前端决定要不要发验证码
router.post('/send-code', authController.sendCode);       // 发验证码（未注册才发，控制台打印，正式可接短信）
router.post('/verify-code', authController.verifyCode); // 验验证码，通过只提示「请设置密码」，不返回 token
router.post('/set-password', authController.setPassword); // 设置密码并注册，返回 token，前端可进主页
router.post('/login', authController.login);             // 老用户登录，成功返回 token

// ---------- 需要登录：请求头带 Authorization: Bearer <token> ----------
router.get('/profile', authenticateToken, (req, res) => {
    const u = req.user;  // 中间件验过 token 后塞进来的
    const id = u.userId ?? u.consultantId;
    res.json({
        message: '这是个人资料',
        user: { ...u, userId: id, id }
    });
});

router.get('/users/:id', authenticateToken, authController.getUser);       // 查某个用户的资料（含金币等）
router.put('/users/:id', authenticateToken, authController.updateProfile); // 更新个人资料

router.post('/change-password', authenticateToken, authController.changePassword); // 修改密码

module.exports = router;