// ========== 顾问列表/详情路由：/api/consultants/* ==========
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const consultController = require('../controllers/consultController');
const reviewController = require('../controllers/reviewController');

router.get('/list', authenticateToken, consultController.getList);   // 顾问列表（客户选顾问时用）
// 须在 /:id 之前注册，避免被当成 id
router.get('/:id/reviews', authenticateToken, reviewController.listPublicConsultantReviews);
router.get('/:id', authenticateToken, consultController.getDetail); // 某个顾问的详情

module.exports = router;
