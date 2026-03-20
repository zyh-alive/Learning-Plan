/**
 * 访问令牌校验（纯函数）：HTTP 中间件与 WebSocket 共用同一套逻辑。
 * - Express 路由：middleware/auth.js 里包装成 authenticateToken(req,res,next)
 * - WebSocket：ws/order-chat/orderChatWsController.js 里 await verifyAccessToken(token) 后再处理订单房间逻辑
 */
const jwt = require('jsonwebtoken');
const roleConfig = require('../config/roleConfig');

const JWT_SECRET = 'my-secret-key-123';

/**
 * 校验 Bearer 同款的 JWT 字符串：验签 + Profile.token_version 与 payload 一致。
 * @param {string|undefined|null} token - 不含 "Bearer " 前缀的纯 token
 * @returns {Promise<
 *   | { ok: true, user: object }
 *   | { ok: false, httpStatus: number, message: string, code: string }
 * >}
 */
async function verifyAccessToken(token) {
    if (token == null || String(token).trim() === '') {
        return { ok: false, httpStatus: 401, message: '未提供 token', code: 'NO_TOKEN' };
    }

    let decoded;
    try {
        decoded = jwt.verify(String(token).trim(), JWT_SECRET);
    } catch (e) {
        return { ok: false, httpStatus: 403, message: 'token 无效或已过期', code: 'INVALID_JWT' };
    }

    try {
        const role = decoded.role || 'user';
        const { Profile, idKey } = roleConfig.get(role);
        const id = decoded[idKey];
        if (id == null) {
            return { ok: false, httpStatus: 403, message: 'token 无效', code: 'INVALID_PAYLOAD' };
        }

        const profile = await Profile.findOne({ where: { [idKey]: id }, attributes: ['token_version'] });
        if (!profile) {
            return { ok: false, httpStatus: 403, message: '用户不存在', code: 'NO_USER' };
        }

        const tokenVer = profile.token_version != null ? profile.token_version : 0;
        const decodedVer = decoded.token_version != null ? decoded.token_version : 0;
        if (decodedVer !== tokenVer) {
            return { ok: false, httpStatus: 403, message: 'token 已过期，请重新登录', code: 'TOKEN_REVOKED' };
        }
    } catch (err) {
        console.error('verifyAccessToken / Profile 校验失败:', err);
        return { ok: false, httpStatus: 500, message: '服务器错误', code: 'SERVER' };
    }

    return { ok: true, user: decoded };
}

module.exports = { JWT_SECRET, verifyAccessToken };
