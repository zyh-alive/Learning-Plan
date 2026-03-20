// 客户端用户 SSE：userId -> Set<res>

const userConnections = new Map();

exports.addUserConnection = function (userId, res) {
    const id = Number(userId);
    if (!userConnections.has(id)) userConnections.set(id, new Set());
    userConnections.get(id).add(res);
};

exports.removeUserConnection = function (userId, res) {
    const id = Number(userId);
    const set = userConnections.get(id);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) userConnections.delete(id);
};

exports.notifyUser = function (userId, data) {
    const id = Number(userId);
    const set = userConnections.get(id);
    if (!set || !set.size) return;
    const line = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of [...set]) {
        try {
            res.write(line);
        } catch (e) {
            set.delete(res);
        }
    }
    if (set.size === 0) userConnections.delete(id);
};
