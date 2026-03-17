// 作用：处理具体的业务逻辑，调用模型操作数据

// 引入 User 模型（来自 models/User.js）
const User = require('../models/User');

// 登录逻辑 - 处理 POST /login 请求
exports.login = async (req, res) => {
    try {
        // 1. 从请求中获取数据（req.body 由 express.json() 解析）
        const { username, password } = req.body;
        
        // 2. 调用模型的方法查询数据库
        //    这里会跳到 models/User.js 的 findByUsername 方法
        const user = await User.findByUsername(username);
        
        // 3. 业务逻辑判断
        if (!user) {
            // 用户不存在
            return res.status(401).json({ 
                message: '用户名不存在' 
            });
        }
        
        if (user.password !== password) {
            // 密码错误（实际项目要用 bcrypt 加密验证）
            return res.status(401).json({ 
                message: '密码错误' 
            });
        }
        
        // 4. 登录成功，返回响应
        res.json({ 
            message: '登录成功',
            userId: user.id,
            username: user.username
        });
        
    } catch (error) {
        // 5. 错误处理
        console.error('登录错误：', error);
        res.status(500).json({ 
            message: '服务器错误' 
        });
    }
};

// 注册逻辑 - 处理 POST /register 请求
exports.register = async (req, res) => {
    try {
        const { username, password, age, email } = req.body;
        
        // 调用模型的方法创建用户
        // 这里会跳到 models/User.js 的 createUser 方法
        const user = await User.createUser({
            username,
            password,
            age,
            email
        });
        
        // 注册成功，返回用户信息（密码不要返回）
        res.status(201).json({ 
            message: '注册成功',
            user: {
                id: user.id,
                username: user.username,
                age: user.age,
                email: user.email
            }
        });
        
    } catch (error) {
        // 处理唯一约束错误（用户名重复）
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ 
                message: '用户名已存在' 
            });
        }
        
        console.error('注册错误：', error);
        res.status(500).json({ 
            message: '服务器错误' 
        });
    }
};

// 获取用户信息 - 处理 GET /users/:id
exports.getUser = async (req, res) => {
    try {
        // req.params.id 来自 URL 参数，如 /users/123
        const userId = req.params.id;
        
        // 直接使用 Sequelize 的原生方法
        // 也可以封装到模型里，这里为了演示直接使用
        const user = await User.findByPk(userId, {
            attributes: ['id', 'username', 'age', 'email'] // 只返回这些字段
        });
        
        if (!user) {
            return res.status(404).json({ 
                message: '用户不存在' 
            });
        }
        
        res.json({ 
            message: '获取成功',
            user 
        });
        
    } catch (error) {
        console.error('获取用户错误：', error);
        res.status(500).json({ 
            message: '服务器错误' 
        });
    }
};