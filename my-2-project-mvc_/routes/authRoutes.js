// 作用：只做一件事，把 URL 映射到对应的控制器方法

const express = require('express');
// 创建路由实例（相当于一个子路由器）
const router = express.Router();

// 引入控制器（来自 controllers/authController.js）
const authController = require('../controllers/authController');

// 定义路由映射关系

// POST /auth/login 请求 -> 调用 authController.login 方法
router.post('/login', authController.login);

// POST /auth/register 请求 -> 调用 authController.register 方法
router.post('/register', authController.register);

// GET /auth/users/:id 请求 -> 调用 authController.getUser 方法
router.get('/users/:id', authController.getUser);

// 导出路由，供 server.js 使用
module.exports = router;