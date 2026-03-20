// ========== 登录校验中间件：需要登录的接口都会先过这里 ==========
// 路由里写成：router.get('/xxx', authenticateToken, controller.xxx)，请求会先到这里再进 controller
// 实际校验逻辑在 utils/verifyAccessToken.js（WebSocket 等处共用）

const { verifyAccessToken } = require('../utils/verifyAccessToken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    verifyAccessToken(token)
        .then((result) => {
            if (!result.ok) {
                return res.status(result.httpStatus).json({ message: result.message });
            }
            req.user = result.user;
            next();
        })
        .catch((err) => {
            console.error('authenticateToken:', err);
            res.status(500).json({ message: '服务器错误' });
        });
};

module.exports = authenticateToken;
