/**
 * 订单聊天 HTTP 路由（挂在 /api/order 下，与纯订单路由串联；须先于 /:orderId/pay 等同层路由注册）
 * 对应控制器：同目录 orderChatHttpController.js
 */
const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/auth');
const orderChatHttpController = require('./orderChatHttpController');

router.get('/chat/conversations', authenticateToken, orderChatHttpController.getChatConversations);
router.get('/:orderId/chat/messages', authenticateToken, orderChatHttpController.getOrderChatMessages);
router.post('/:orderId/chat/messages', authenticateToken, orderChatHttpController.postOrderChatMessage);
router.post('/:orderId/chat/read', authenticateToken, orderChatHttpController.markOrderChatRead);

module.exports = router;
