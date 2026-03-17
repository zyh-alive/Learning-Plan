const jwt = require('jsonwebtoken');

const JWT_SECRET = 'my-secret-key-123';  // 和上面保持一致

// 验证 token 的中间件
const authenticateToken = (req, res, next) => {
    // 从请求头获取 token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // Bearer TOKEN 格式
    
    if (!token) {
        return res.status(401).json({ message: '未提供 token' });
    }
    
    // 验证 token
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'token 无效或已过期' });
        }
        
        // 把用户信息存到 req 里，后面的路由可以用
        req.user = user;
        next();  // 放行
    });
};

module.exports = authenticateToken;