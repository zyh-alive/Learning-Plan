//售后业务逻辑：用户售后、顾问售后
//1.顾客发起退款
//2.支付平台处理退款，将退款金额退回顾客
//3.支付平台告知后台，后台更新订单状态为退款成功
//4.后台更新顾客金币余额
//5.后台更新顾问金币余额
//6.后台更新订单状态为退款成功

const Order = require('../models/Order');
const {Op} = require('sequelize');
const FundTransaction = require('../models/FundTransaction');
const sequelize = require('../config/database');
const UserProfile = require('../models/UserProfile');
const ConsultantProfile = require('../models/ConsultantProfile');

function toMoney(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;//isFinite：判断是否为有限数，是则返回true，否则返回false
}

//用户申请售后，订单状态改为servicing_requested
//用户提交售后申请后，订单状态改为completed,资金返回给顾客，顾问端扣除，资金流水写入fund_transactions表
//post /api/servicing/user
exports.userServicing = async (req, res) => {
    try {//try：尝试
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        const { servicingReasonType } = req.body;//从前端传入售后原因类型，必须先解析出来
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可申请售后' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        const order = await Order.findOne({ where: { orderId } });
        if (!order) {
            return res.status(404).json({ message: '订单不存在' });
        } 
        if (order.userId !== userId) {
            return res.status(403).json({ message: '无权申请售后' });
        }
        if (!['completed', 'pending_review'].includes(order.status)) {//includes：判断是否包含，是则返回true，否则返回false
            return res.status(400).json({ message: '订单状态异常，无法申请售后' });
        }
        const dup = await FundTransaction.findOne({
            where: {
                orderId,
                servicingReasonType: { [Op.ne]: null }
            }
        });
        if (dup) {
            return res.status(400).json({ message: '该订单已申请售后' });
        }
        
        const typeTrim = String(servicingReasonType).trim();
        if (!typeTrim) {
            return res.status(400).json({ message: '请选择售后原因' });
        }

        const { content } = req.body || {};
        const detailsTrim = String(content).trim();
        if (!detailsTrim) {
            return res.status(400).json({ message: '请填写售后申请详情' });
        }
        if (detailsTrim.length > 200) {//如果内容长度大于200，则返回错误
            return res.status(400).json({ message: '售后申请详情须在 200 字以内' });
        }

        //const servicingRefundDetailsStr = detailsTrim.length ? detailsTrim : servicingReasonType;//如果内容长度为0，则设置为售后原因类型，否则设置为内容
        const profile = await UserProfile.findOne({ where: { userId: order.userId } });
        const cprof = await ConsultantProfile.findOne({ where: { consultantId: order.consultantId } });
        if (!profile || !cprof) {
            return res.status(404).json({ message: '用户资料或顾问资料不存在，无法申请售后' });
        }
        const transaction = await sequelize.transaction();//开启事务，保证数据一致性
        try {
            order.status = 'servicing_requested';//订单状态改为售后申请中
            await order.save({ transaction });//保存订单
            const orderAmt = toMoney(order.price);
            const profileAfter = Math.round((toMoney(profile.coin)) * 100) / 100;
            profile.coin = profileAfter;//更新用户剩余金额
            await profile.save({ transaction });
            const cprofAfter = Math.round((toMoney(cprof.coin) - orderAmt) * 100) / 100;
            cprof.coin = cprofAfter;//更新顾问剩余金额
            await cprof.save({ transaction });
            await FundTransaction.createFundTransaction(
                {
                    orderId,
                    userId: order.userId,
                    consultantId: order.consultantId,
                    transactionType: '售后退款',
                    fundStatus: 'servicing_refunded',
                    reason: '售后退款',
                    purpose: null,
                    transactionAmount: orderAmt,
                    customerBalanceAfter: profileAfter,//更新用户剩余金额
                    consultantBalanceAfter: cprofAfter,//更新顾问剩余金额
                    operatedAt: new Date(),
                    servicingReasonType: typeTrim,
                    servicingRefundDetails: detailsTrim,
                },
                { transaction }
            );
            order.status = 'servicing_completed';//订单状态改为售后完成
            await order.save({ transaction });//保存订单
            await transaction.commit();
            res.status(201).json({
                message: '售后申请成功,资金返回请注意查收',
                data: {
                    orderId: order.orderId,
                    status: order.status,
                    operatedAt: order.operatedAt,
                }
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('userServicing:', err);//err：错误信息
        res.status(500).json({ message: '服务器错误' });
    }
};

//用户或者顾问查询自己的售后列表
//get /api/servicing/list
exports.getServicingList = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        
        /*if (role !== 'user' && role !== 'consultant' || !userId || !consultantId) {
            return res.status(403).json({ message: '仅客户或顾问可查询售后列表' });
        }//判断角色和ID是否存在*/
        if (role !== 'user'||role !== 'consultant') {
            return res.status(403).json({ message: '仅客户或顾问可查询售后列表' });
        }
        const { page = 1, limit = 10 } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        const offset = (pageNum - 1) * limitNum;
        const condition = role === 'user' ? { userId } : { consultantId };
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { ...condition, transactionType: '售后退款' },
            order: [['operatedAt', 'DESC']],
            limit: limitNum,//限制每页显示的条数
            offset,//偏移量
        });
        console.log("count是",count);
        console.log("rows是",rows);
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;
            const amt = row.transactionAmount;
            const type = row.servicingReasonType;
            const details = row.servicingRefundDetails;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                servicingReasonType: type,
                servicingRefundDetails: details,
                operatedAt: row.operatedAt,
            };
        }));   
        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 }
            }
        });
        console.log("l是",list);
    } catch (err) {
        console.error('getServicingList:', err);//err：错误信息
        res.status(500).json({ message: '服务器错误' });
    }
};