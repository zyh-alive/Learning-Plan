// ========== 评价相关路由：/api/reviews/* ==========
// 与订单支付、接单等解耦；模型仍用 Order、OrderReview（数据与订单关联）

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

// 客户：对指定订单提交评价（订单须为待评价且归属当前用户）
router.post('/:orderId', authenticateToken, reviewController.submitReview);

module.exports = router;
