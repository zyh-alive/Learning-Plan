// SSE：同一顾问可多终端同时连接，全部推送

const consultantConnections = new Map(); // consultantId -> Set<res>

exports.addConnection = function (consultantId, res) {
    const id = Number(consultantId);
    if (!consultantConnections.has(id)) {
        consultantConnections.set(id, new Set());
    }
    consultantConnections.get(id).add(res);
};

exports.removeConnection = function (consultantId, res) {
    const id = Number(consultantId);
    const set = consultantConnections.get(id);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) consultantConnections.delete(id);
};

exports.notifyConsultant = function (consultantId, data) {
    const id = Number(consultantId);
    const set = consultantConnections.get(id);
    if (!set || set.size === 0) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of [...set]) {
        try {
            res.write(payload);
        } catch (e) {
            set.delete(res);
        }
    }
    if (set.size === 0) consultantConnections.delete(id);
};

exports.getOnlineCount = function () {
    let n = 0;
    consultantConnections.forEach((s) => { n += s.size; });
    return n;
};
