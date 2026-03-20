/**
 * WebSocket 订单聊天模块入口
 * - WebSocket：server.js 调用 setupWebSockets(server)
 * - 与聊天配套的 REST：order-chat/orderChatHttpRoutes.js（在 server.js 里先于 routes/orderRoute 挂载到 /api/order）
 * - 对外导出 broadcastOrderChat：供模块内 HTTP 控制器与 WS 共用房间推送
 */
const { setupOrderChatWs } = require('./order-chat/orderChatWsRoutes');
const { broadcastOrderChat } = require('./order-chat/broadcast');

/**
 * 注册所有 WebSocket 路径（目前仅订单聊天）
 * @param {import('http').Server} server
 */
function setupWebSockets(server) {
    setupOrderChatWs(server);
}

module.exports = {
    setupWebSockets,
    setupOrderChatWs,
    broadcastOrderChat
};
