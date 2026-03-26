// 充值业务逻辑：用户充值金币

const FundTransaction = require('../models/FundTransaction');
const UserProfile = require('../models/UserProfile');
const ConsultantProfile = require('../models/ConsultantProfile');
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
        const rowAmount = req.body.transactionAmount!=null?req.body.transactionAmount:req.body.amount;
        const amountNum = Number(rowAmount);
        if (rowAmount==null || rowAmount===''||Number.isNaN(amountNum) || amountNum <= 0) {
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
            const oldBalance = Number(profile.coin || 0);
            const newBalance = Math.round((oldBalance + amountNum) * 100) / 100;

            // 更新金币
            profile.coin = newBalance;
            await profile.save({ transaction });

            // 创建充值记录
            await FundTransaction.createFundTransaction({
                userId,
                transactionType: '充值',
                fundStatus: 'completed',
                reason: '用户充值成功',
                purpose: null,
                transactionAmount: amountNum,
                customerBalanceAfter: newBalance,
                operatedAt: new Date(),
            }, { transaction });

            // 提交事务
            await transaction.commit();//正式写入数据库

            // 4. 返回结果
            res.json({
                message: '充值成功',
                data: {
                    transactionAmount: amountNum,//交易金额
                    customerBalanceAfter: newBalance,//交易后顾客剩余金额
                    newBalance,//新余额
                   operatedAt: new Date()//操作时间
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
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { userId, transactionType: '充值' },
            attributes: ['transactionId', 'transactionAmount', 'customerBalanceAfter', 'operatedAt'],
            limit: limitNum,
            offset,
            order: [['operatedAt', 'DESC']]
        });

        // 格式化返回
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;//安全转换：如果数据模型有 toJSON() 方法就调用，否则直接返回item
            const amt = row.transactionAmount;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                customerBalanceAfter: row.customerBalanceAfter,
                operatedAt: row.operatedAt
        };//返回到回调函数的结果数组中
    }));

        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)||1
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
        if (role === 'user') {
        const userId = req.user.userId;
            if (role !== 'user' && role !== 'consultant') {
                return res.status(403).json({ message: '请先登录' });
            }
            const profile = await UserProfile.findOne({
                where: { userId },
                attributes: ['coin']
            });
            if (!profile) {
                return res.status(404).json({ message: '用户资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    userId,
                    coin: profile.coin || 0
                }
            });
        }
        if (role === 'consultant') {
            const consultantId = req.user.consultantId;
            if (consultantId == null) {
                return res.status(403).json({ message: 'token 无效' });
            }
            const profile_consultant = await ConsultantProfile.findOne({
                where: { consultantId },
                attributes: ['coin']
            });
            if (!profile_consultant) {
                return res.status(404).json({ message: '顾问资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    consultantId,
                    coin: profile_consultant.coin || 0
                }
            });
        }
    } catch (err) {
        console.error('查询余额错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//用户或顾问提现金币 - POST /api/transaction/withdraw
exports.withdraw = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        
        // 1. 身份校验
            if (role !== 'user' && role !== 'consultant') {
            return res.status(403).json({ message: '仅登录客户可提现' });
        }

        // 2. 获取提现金额
        const rowAmount = req.body.transactionAmount!=null?req.body.transactionAmount:req.body.amount;
        const amountNum = Number(rowAmount);
        if (rowAmount==null || rowAmount===''||Number.isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: '提现金额必须大于 0' });
        }
        

        // 3. 事务操作：更新金币 + 创建提现记录
        const transaction = await sequelize.transaction();//开启事务，转账事务，保证数据一致性
        try {
            // 查用户资料
            const Model = role === 'user' ? UserProfile : ConsultantProfile;//动态选择模型
            const ID = role === 'user' ? {userId }: {consultantId};//动态选择ID
            const profile = await Model.findOne({
                where: { ...ID },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }
            //提现金额不能超过用户剩余金额
            if (amountNum > Number(profile.coin || 0)) {
                return res.status(400).json({ message: '提现金额不能超过用户剩余金额' });
            }
            // 计算提现后的余额
            const oldBalance = Number(profile.coin || 0);
            const newBalance = Math.round((oldBalance - amountNum) * 100) / 100;

            // 更新金币
            profile.coin = newBalance;
            await profile.save({ transaction });

            // 创建提现记录
            const condition_money = role === 'user' ? 'customerBalanceAfter' : 'consultantBalanceAfter';
            await FundTransaction.createFundTransaction({
                ...ID,
                transactionType: '提现',
                fundStatus: 'completed',
                reason: role === 'user' ? '用户提现成功' : '顾问提现成功',
                purpose: null,
                transactionAmount: amountNum,
                [condition_money]: newBalance,//[]取值，动态传入customerBalanceAfter或consultantBalanceAfter
                operatedAt: new Date(),
            }, { transaction });

            // 提交事务
            await transaction.commit();//正式写入数据库

            // 4. 返回结果
            res.json({
                message: '提现成功',
                data: {
                    transactionAmount: amountNum,
                    [condition_money]: newBalance,
                    newBalance,
                    operatedAt: new Date()
                }
            });
        } catch (err) {
            // 出错回滚
            await transaction.rollback();//回滚事务，保证数据一致性
            throw err;
        }
    } catch (err) {
        console.error('提现错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//查询提现记录 - GET /api/transaction/withdraw/history
exports.getWithdrawHistory = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        
        if (role !== 'user' && role !== 'consultant') {
            return res.status(403).json({ message: '仅登录客户可查看提现记录' });
        }
        const { page = 1, limit } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        
        const offset = (pageNum - 1) * limitNum;
        const condition = role === 'user' ? {userId }: {consultantId};//condition：{userId:userId}或{consultantId:consultantId}
        const condition_money = role === 'user' ? 'customerBalanceAfter' : 'consultantBalanceAfter';//attribute不让传对象，只能传字符串
        
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { ...condition, transactionType: '提现' },//...condition解包，展开为userId和consultantId
            attributes: ['transactionId', 'transactionAmount', condition_money, 'operatedAt'],
            limit: limitNum,
            offset,
            order: [['operatedAt', 'DESC']]
        });
        console.log("查到了查到了查到了查到了查到了");
        // 格式化返回
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;
            const amt = row.transactionAmount;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                balanceAfter: row[condition_money],
                operatedAt: row.operatedAt
        };
    }));


        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)||1
                }
            }
        });
        console.log("l是",list);
    } catch (err) {
        console.error('查询提现记录错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//查询提现余额 - GET /api/transaction/withdraw/balance
exports.getWithdrawBalance = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        if (role === 'user') {
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
            if (role !== 'user' && role !== 'consultant') {
                return res.status(403).json({ message: '请先登录' });
            }
            const profile = await UserProfile.findOne({
                where: { userId },
                attributes: ['coin']
            });
            if (!profile) {
                return res.status(404).json({ message: '用户资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    userId,
                    coin: profile.coin || 0
                }
            });
        }
        if (role === 'consultant') {
            const consultantId = req.user.consultantId;
            if (consultantId == null) {
                return res.status(403).json({ message: 'token 无效' });
            }
            const profile_consultant = await ConsultantProfile.findOne({
                where: { consultantId },
                attributes: ['coin']
            });
            if (!profile_consultant) {
                return res.status(404).json({ message: '顾问资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    consultantId,
                    coin: profile_consultant.coin || 0
                }
            });
        }
    } catch (err) {
        console.error('查询提现余额错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//顾客或顾问流水查询 - GET /api/transaction/customerOrConsultant/history
//顾客端只显示自己的充值，提现，付款，退款记录；顾问端只显示自己的提现，收款，扣款记录
exports.getCustomerOrConsultantHistory = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;   
        const consultantId = req.user.consultantId;
        
        if (role !== 'user' && role !== 'consultant') {
            return res.status(403).json({ message: '仅登录客户或顾问可查看流水记录' });
        }
        // 参数解析：默认每页 100 条，方便一页展示全部历史
        console.log("role是shishsihsihsishishsishishis",role);
        const { page = 1, limit } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        
        const offset = (pageNum - 1) * limitNum;
        const condition_money = role === 'user' ? 'customerBalanceAfter' : 'consultantBalanceAfter';//condition_money：'customerBalanceAfter'或'consultantBalanceAfter'
        const condition = role === 'user' ? {userId, fundStatus:['completed', 'refunded','frozen','servicing_refunded']}: {consultantId, fundStatus:['completed', 'released','servicing_refunded']};//condition：{userId:userId, fundStatus:['completed', 'refunded','frozen','servicing_refunded']}或{consultantId:consultantId, fundStatus:['completed', 'released','servicing_refunded']}
        //查询顾客流水记录    
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { ...condition},
            attributes: [
                'transactionId',
                'transactionAmount',
                condition_money,
                'operatedAt',
                'transactionType',
                'fundStatus'
            ],
            limit: limitNum,
            offset,
            order: [['operatedAt', 'DESC']]
        });
        //格式化返回
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;
            const amt = row.transactionAmount;
            const type = row.transactionType;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                transactionType: type,
                fundStatus: row.fundStatus,
                [condition_money]: row[condition_money],
                operatedAt: row.operatedAt
            };
        }));
        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)||1
                }
            }
        });//返回结果
        console.log("list是list是list是list是list是",list);
    }
    catch (err) {
        console.error('查询顾客流水记录错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};