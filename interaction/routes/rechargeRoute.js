// ========== 充值相关路由：/api/recharge/* ==========
const express = require('express');
const router = express.Router();
const rechargeController = require('../controllers/rechargeController');
const authenticateToken = require('../middleware/auth');

router.post('/', authenticateToken, rechargeController.recharge);   // 充值：加用户金币，记一条充值记录
router.get('/history', authenticateToken, rechargeController.getHistory); // 当前用户的充值记录列表
router.get('/balance', authenticateToken, rechargeController.getBalance); // 当前用户金币余额

module.exports = router;