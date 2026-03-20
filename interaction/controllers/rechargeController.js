// 充值业务逻辑：用户充值金币

const Recharge = require('../models/recharge');
const UserProfile = require('../models/UserProfile');
const sequelize = require('../config/database');

// ================================
// 用户充值金币 - POST /api/recharge
// ================================
exports.recharge = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        
        // 1. 身份校验
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可充值' });
        }

        // 2. 获取充值金额
        const { amount } = req.body;
        const amountNum = Number(amount);
        
        if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: '充值金额必须大于 0' });
        }
        if (amountNum > 10000) {
            return res.status(400).json({ message: '单次充值金额不能超过 10000' });
        }

        // 3. 事务操作：更新金币 + 创建充值记录
        const transaction = await sequelize.transaction();//开启事务，转账事务，保证数据一致性       
        try {
            // 查用户资料
            const profile = await UserProfile.findOne({
                where: { userId },
                transaction,
                lock: transaction.LOCK.UPDATE
                // 行锁，防止并发问题（一次一个请求只能操作一行数据）
                // 用户余额 100，同时发起两次充值 50
                // 请求A: 读取余额 = 100
                // 请求B: 读取余额 = 100
                // 请求A: 计算 100+50 = 150，写入 150
                // 请求B: 计算 100+50 = 150，写入 150

                // 最终余额：150 ❌ 应该是 200
                // 丢了 50 块钱！
            });
            
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }

            // 计算充值后的余额
            const oldBalance = profile.coin || 0;
            const newBalance = oldBalance + amountNum;

            // 更新金币
            profile.coin = newBalance;
            await profile.save({ transaction });

            // 创建充值记录
            await Recharge.createRecharge({
                userId,
                amount: amountNum,
                balanceAfter: newBalance,
                rechargeTime: new Date()
            }, { transaction });

            // 提交事务
            await transaction.commit();//正式写入数据库

            // 4. 返回结果
            res.json({
                message: '充值成功',
                data: {
                    rechargeAmount: amountNum,
                    oldBalance,
                    newBalance,
                    rechargeTime: new Date()
                }
            });
        } catch (err) {
            // 出错回滚
            await transaction.rollback();//回滚事务，保证数据一致性
            throw err;
        }
    } catch (err) {
        console.error('充值错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 查询充值记录 - GET /api/recharge/history
// ================================
exports.getHistory = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可查看充值记录' });
        }

        // 参数解析：默认每页 100 条，方便一页展示全部历史
        const { page = 1, limit } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        
        const offset = (pageNum - 1) * limitNum;

        // 查询充值记录
        const { count, rows } = await Recharge.findAndCountAll({
            where: { userId },
            attributes: ['rechargeId', 'amount', 'balanceAfter', 'rechargeTime'],
            limit: limitNum,
            offset,
            order: [['rechargeTime', 'DESC']]
        });

        // 格式化返回
        const list = rows.map(item => ({
            rechargeId: item.rechargeId,
            amount: item.amount,
            balanceAfter: item.balanceAfter,
            rechargeTime: item.rechargeTime
        }));

        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)
                }
            }
        });
    } catch (err) {
        console.error('查询充值记录错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 查询当前金币余额 - GET /api/recharge/balance
// ================================
exports.getBalance = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '请先登录' });
        }

        // 查用户资料
        const profile = await UserProfile.findOne({
            where: { userId },
            attributes: ['coin']
        });

        if (!profile) {
            return res.status(404).json({ message: '用户资料不存在' });
        }

        res.json({
            message: '获取成功',
            data: {
                userId,
                coin: profile.coin || 0
            }
        });
    } catch (err) {
        console.error('查询余额错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};