// ========== 顾问服务价格路由：/api/consultant/service/* ==========
// 顾问设置「咨询/陪聊/代办」等类型和价格；用户端选顾问时也会查某顾问的服务列表
const express = require('express');
const router = express.Router();
const consultantServiceController = require('../controllers/consultantServiceController');
const authenticateToken = require('../middleware/auth');

router.post('/service', authenticateToken, consultantServiceController.setService);   // 新增或更新一条服务价格
router.delete('/service/:serviceId', authenticateToken, consultantServiceController.deleteService); // 删除自己的一项服务
router.get('/service/list', authenticateToken, consultantServiceController.getServiceList);  // 列表：mine=true 查自己，consultantId= 查指定顾问
router.get('/services/list', authenticateToken, consultantServiceController.getServiceList); // 同上，兼容另一种路径

module.exports = router;