const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize'); // 引入Sequelize
const app = express();

app.use(express.json());

// ==================== 1. 数据库连接 ====================
const sequelize = new Sequelize('testdb', 'root', '0409111151', { 
    host: 'localhost',
    dialect: 'mysql',
});

const User = sequelize.define('User', {
    username: DataTypes.STRING,
    password: DataTypes.STRING
});

(async () => {
    sequelize.sync(); // 创建表（如果不存在）

    app.get('/', (req, res) => {
        res.json({ message: 'Hello World' });
    });

    /*app.post('/login', (req, res) => {
        res.json({ 
            received: req.body,
            message: '登录接口收到请求'
        });
    });*/

    app.post('/login', async (req, res) => {  // 加 async
        // 新增：查询数据库
        const user = await User.findOne({
            where: { 
                username: req.body.username,
                password: req.body.password 
            }
        });
        
        if (user) {
            res.json({ 
                received: req.body,
                message: '登录成功',
                userId: user.id
            });
        } else {
            res.status(401).json({ 
                message: '用户名或密码错误'
            });
        }
    });

    // 新增：注册接口（方便你测试添加用户）
    app.post('/register', async (req, res) => {
        const user = await User.create(req.body);
        res.json({ 
            message: '注册成功',
            user: user
        });
    });

    const PORT = 3001;
    app.listen(PORT, () => {
        console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
    });
})();