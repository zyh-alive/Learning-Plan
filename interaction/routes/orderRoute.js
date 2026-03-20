// ========== 订单相关路由：/api/order/* 的请求都进这里 ==========
// 格式：方法 + 路径 → 先过 authenticateToken（要登录），再调 orderController 里对应方法

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');   // 校验 JWT，通过后 req.user 有用户信息
const orderController = require('../controllers/orderController');
const reviewController = require('../controllers/reviewController');

// 顾问：订单与评价列表（与 GET /:orderId/pay 等同层，须先注册避免被 orderId 吃掉）
router.get(
    '/consultant/orders-review-feed',
    authenticateToken,
    reviewController.listOwnerConsultantOrdersFeed
);

// 客户：创建订单（选顾问、服务类型、填需求）
router.post('/create', authenticateToken, orderController.createOrder);
// 客户：我的订单列表
router.get('/list', authenticateToken, orderController.getList);
// 任意角色：订单详情（用于支付页、确认开始页等）
router.get('/detail/:orderId', authenticateToken, orderController.getOrderDetail);

// SSE 推送：不需要 Bearer token，用 query 里带 token（前端 EventSource 用）
router.get('/user/stream', orderController.userSseStream);           // 用户端：收「顾问邀请开始服务」等
router.get('/consultant/stream', orderController.consultantSseStream); // 顾问端：收「新订单」等

// 顾问：接单中心看到的待处理/已接单列表
router.get('/consultant/orders', authenticateToken, orderController.getConsultantOrders);

// 订单聊天 HTTP 已迁至 ws/order-chat/orderChatHttpRoutes.js，并在 server.js 先于本文件挂载

// 客户：加急（须在 /:orderId/pay 之前注册，避免 orderId 吞掉 rush 路径）
router.get('/:orderId/rush/preview', authenticateToken, orderController.getRushPreview);
router.post('/:orderId/rush/pay', authenticateToken, orderController.payRushOrder);

// 客户：支付订单（扣金币、写冻结流水、推给顾问）
router.post('/:orderId/pay', authenticateToken, orderController.payOrder);
// 顾问：接单
router.post('/:orderId/accept', authenticateToken, orderController.acceptOrder);
// 顾问：邀请客户「开始服务」
router.post('/:orderId/request-start', authenticateToken, orderController.requestStart);
// 客户：同意或拒绝「开始服务」（拒绝会取消订单并退款）
router.post('/:orderId/respond-start', authenticateToken, orderController.respondStart);
// 顾问：标记订单完成（冻结金额释放给顾问）
router.post('/:orderId/complete', authenticateToken, orderController.completeOrder);
// 评价已迁至 /api/reviews/:orderId（routes/reviewRoute.js + controllers/reviewController.js）
// 客户：取消订单（若已支付会退金币）
router.put('/:orderId/cancel', authenticateToken, orderController.cancelOrder);

module.exports = router;
