/**
 * 订单聊天 WebSocket：房间内广播（与 HTTP 发消息后推送共用同一套房间状态）
 */

function roomKey(orderId) {
    return String(orderId);
}

/** orderId -> Set<WebSocket> */
const rooms = new Map();

function addToRoom(orderId, ws) {
    const key = roomKey(orderId);
    if (!rooms.has(key)) rooms.set(key, new Set());
    rooms.get(key).add(ws);
    ws._orderRoomKey = key;
}

function removeFromRoom(ws) {
    const key = ws._orderRoomKey;
    if (!key || !rooms.has(key)) return;
    rooms.get(key).delete(ws);
    if (rooms.get(key).size === 0) rooms.delete(key);
}

function broadcastToOrderRoom(orderId, payload) {
    const key = roomKey(orderId);
    const set = rooms.get(key);
    if (!set) return;
    const str = JSON.stringify(payload);
    set.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(str);
    });
}

/** 供 HTTP 控制器在落库后向订单聊天室内所有连接推送 */
function broadcastOrderChat(orderId, payload) {
    broadcastToOrderRoom(orderId, payload);
}

module.exports = {
    addToRoom,
    removeFromRoom,
    broadcastToOrderRoom,
    broadcastOrderChat
};
