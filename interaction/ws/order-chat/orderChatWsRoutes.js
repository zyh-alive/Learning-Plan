/**
 * 订单聊天 WebSocket 路由：将 HTTP Server 的 upgrade 事件挂载到 /ws/order-chat
 * （纯 HTTP 的 Express 路由仍在 routes/orderRoute.js）
 */
const WebSocket = require('ws');
const url = require('url');
const { handleOrderChatConnection } = require('./orderChatWsController');

const PATH_ORDER_CHAT = '/ws/order-chat';

/**
 * @param {import('http').Server} server
 */
function setupOrderChatWs(server) {
    const wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const pathname = url.parse(request.url).pathname || '';
        if (pathname === PATH_ORDER_CHAT) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleOrderChatConnection(ws, request).catch(() => {
                    try {
                        ws.close(1011, 'error');
                    } catch (e) { /* ignore */ }
                });
            });
        } else {
            socket.destroy();
        }
    });
}

module.exports = { setupOrderChatWs, PATH_ORDER_CHAT };
