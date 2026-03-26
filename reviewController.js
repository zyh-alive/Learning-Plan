// ========== 评价控制器：与订单流程解耦，仅负责 order_reviews + 将订单标为已完成 ==========
// 路由前缀：/api/reviews（见 routes/reviewRoute.js、server.js）
//
// 业务：客户对「待评价」订单提交评分与文字 → 写入 order_reviews，订单 status → completed

const { Op } = require('sequelize');//Op：操作符
const sequelize = require('../config/database');
const Order = require('../models/Order');
const OrderReview = require('../models/OrderReview');
const ConsultantProfile = require('../models/ConsultantProfile');
const UserProfile = require('../models/UserProfile');

/**
 * 订单+评价列表（两接口共用）
 * @param {{ consultantId: number, mode: 'public' | 'owner', filter: 'reviews_only' | 'all' }} p
 */
//fetchConsultantOrderReviewFeed：查询顾问订单评价列表
async function fetchConsultantOrderReviewFeed({ currentUserId=null, consultantId, filter }) {//consultantId：顾问ID，mode：模式，filter：过滤条件
    const cid = Number(consultantId);
    if (!Number.isFinite(cid) || cid <= 0) {//isFinite：判断是否为有限数，<=0：小于等于0    
        return { error: '顾问 ID 无效', status: 400 };
    }

    const profile = await ConsultantProfile.findOne({
        where: { consultantId: cid },
        attributes: ['consultantId']
    });
    if (!profile) {
        return { error: '顾问不存在', status: 404 };
    }
    const orders = await Order.findAll({
        where: {
            consultantId: cid,
            status: { [Op.in]: ['pending_review', 'completed', 'servicing_completed','servicing_requested'] }//in：在范围内
        },
        attributes: ['orderId', 'serviceType', 'serviceContent', 'status', 'completedAt' ,'userId'],
    });
    const reviews = await OrderReview.findAll({
        where: {

            rating: { [Op.ne]: null },
            content: { [Op.ne]: null },
            reviewAt: { [Op.ne]: null }
        },
        attributes: ['rating', 'content', 'reviewAt','orderId',],//attributes：属性，'rating'：评分，'content'：评价内容，
    });
    const userNames = await UserProfile.findAll({
        where: { userId: { [Op.in]: orders.map(o => o.userId) } },
        attributes: ['userId', 'name']
    });
    const reviewsMap = {};//创建一个对象，用于存储订单ID和评价信息
    for (const review of reviews) {
        reviewsMap[review.orderId] = review;
    }
    const nameMap = {};//创建一个对象，用于存储用户ID和用户姓名
    for (const user of userNames) {
        nameMap[user.userId] = user.name;
    }
    //格式化订单评价列表
    const list = orders.map((o) => {
        //o：订单信息
        //const rev = Array.isArray(o.reviews) && o.reviews.length ? o.reviews[0] : null;//isArray：判断是否为数组，length：数组长度，[0]：取第一个元素
        const rev = reviewsMap[o.orderId];
        const name = nameMap[o.userId];
        const item = {//item：订单评价信息
            userId: o.userId,//用户ID
            name: name,
            orderId: o.orderId,//订单ID
            serviceType: o.serviceType,//服务类型
            serviceContent: o.serviceContent,//服务内容
            orderStatus: o.status,//订单状态
            rating: rev != null ? Number(rev.rating) : null,//评分
            reviewContent: rev ? rev.content : null,//评价内容
            reviewedAt: rev ? rev.reviewAt : null,//评价时间
            completedAt: o.completedAt,//完成时间
        };//返回订单评价信息
        return item;
    });
    //如果当前用户存在，则筛选出当前用户的评价订单
    if(currentUserId){
        const myreviews = list.filter(item => item.userId === currentUserId&&item.rating !== null&&item.reviewContent !== null);//筛选出当前用户的评价订单
        const otherreviews = list.filter(item => item.userId !== currentUserId&&item.rating !== null&&item.reviewContent !== null);//筛选出其他用户的评价订单
        const noreviews = list.filter(item =>  item.rating === null&&item.reviewContent === null);//筛选出没有评价的订单
        //分组排序
        myreviews.sort((a, b) => b.reviewedAt - a.reviewedAt);//降序，最新评价排在最前面
        otherreviews.sort((a, b) => b.reviewedAt - a.reviewedAt);//降序，最新评价排在最前面
        noreviews.sort((a, b) => b.reviewedAt - a.reviewedAt);//降序，最新评价排在最前面
        return { list: [...myreviews, ...otherreviews, ...noreviews], filter };//合并排序后的评价订单列表
    }else{
        if(filter === 'reviews_only'){
            const onlyreviews = list.filter(item => item.rating !== null&&item.reviewContent !== null);//筛选出有评价的订单
            onlyreviews.sort((a, b) => b.reviewedAt - a.reviewedAt);//降序，最新评价排在最前面
            return { list: onlyreviews, filter };
        }else{
            const after_sort_list = list.sort((a, b) => b.completedAt - a.completedAt);//降序，最新评价排在最前面
            return { list: after_sort_list, filter };
        }
    }
};

/** GET /api/reviews/consultants/:id/reviews — 客户端看某顾问已评价订单（无顾问长文案、无客户标识） */
//客户只能看到顾问的已评价订单列表，不能看到待评价和已完成订单
exports.listPublicConsultantReviews = async (req, res) => {
    try {
        const consultantId = parseInt(req.params.id, 10);
        const currentUserId = req.user.userId;
        const raw = (req.query.filter || 'reviews_only').toLowerCase();//raw：原始查询条件，toLowerCase：转换为小写，'all'：包含待评价和已评价，'reviews_only'：仅包含已评价和没有评价
        const filter = raw === 'all' ? 'all' : 'reviews_only' ;//filter：过滤条件，'all'：包含待评价和已评价，'reviews_only'：仅包含已评价和没有评价，'reviews_only'：仅包含已评价
        const result = await fetchConsultantOrderReviewFeed({
            currentUserId,
            consultantId,
            filter
        });
        if (result.error) {
            return res.status(result.status).json({ message: result.error });
        }
        res.json({
            message: '获取成功',
            data: { list: result.list, filter: result.filter }
        });
    } catch (err) {
        console.error('listPublicConsultantReviews:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/** GET /api/reviews/consultant/orders-review-feed?filter=reviews_only|all */
//顾问查询总订单评价列表
exports.listOwnerConsultantOrdersFeed = async (req, res) => {
    try {
        const role = req.user.role || '';
        const cid = req.user.consultantId;
        if (role !== 'consultant' || cid == null) {//role：角色，'consultant'：顾问，'user'：顾客
            return res.status(403).json({ message: '仅顾问可查看' });
        }
        const raw = (req.query.filter || 'reviews_only').toLowerCase();//raw：原始查询条件，toLowerCase：转换为小写
        const filter = raw === 'all' ? 'all' : 'reviews_only';//filter：过滤条件，'all'：包含待评价和已评价，'reviews_only'：仅包含已评价
        const result_all = await fetchConsultantOrderReviewFeed({
            consultantId: Number(cid),
            filter
        });
        
        if (result_all.error) {//error：错误信息
            return res.status(result_all.status).json({ message: result_all.error});
        }
        res.status(200).json({ message: '获取成功', data: { list: result_all.list, filter: result_all.filter} });

    } catch (err) {//err：错误信息
        console.error('listOwnerConsultantOrdersFeed:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//顾问查询只包含已评价的订单评价列表
exports.listOwnerConsultantReviewsFeed = async (req, res) => {
    try {
        const role = req.user.role || '';
        const cid = req.user.consultantId;
        if (role !== 'consultant' || cid == null) {//role：角色，'consultant'：顾问，'user'：顾客
            return res.status(403).json({ message: '仅顾问可查看' });
        }

        const raw = (req.query.filter || 'reviews_only').toLowerCase();//raw：原始查询条件，toLowerCase：转换为小写
        const filter = raw === 'all' ? 'all' : 'reviews_only';//filter：过滤条件，'all'：包含待评价和已评价，'reviews_only'：仅包含已评价和没有评价，'reviews_only'：仅包含已评价
        const result_filter =await fetchConsultantOrderReviewFeed({
            consultantId: Number(cid),
            filter: 'reviews_only'
        });
        if (result_filter.error) {//error：错误信息
            return res.status(result_filter.status).json({ message: result_filter.error });
        }
        res.status(200).json({ message: '获取成功', data: { list: result_filter.list, filter: result_filter.filter} });
    } catch (err) {//err：错误信息
        console.error('listOwnerConsultantOrdersFeed:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/**
 * POST /api/reviews/:orderId
 * 待评价 → 写入 order_reviews + 订单改为 completed 并写 completed_at
 */
exports.submitReview = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可评价' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        const order = await Order.findByOrderId(orderId);
        if (!order || order.userId !== userId) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'pending_review') {
            return res.status(400).json({ message: '当前订单不在待评价状态' });
        }
        if (order.consultantId == null) {
            return res.status(400).json({ message: '订单无承接顾问，无法评价' });
        }
        const dup = await OrderReview.findByOrderId(orderId);
        if (dup) {
            return res.status(400).json({ message: '该订单已评价过' });
        }

        const { rating, content, tags } = req.body || {};
        const raw = Number(rating);
        if (Number.isNaN(raw)) {
            return res.status(400).json({ message: '评分格式无效' });
        }
        const deci = Math.round(raw * 10);
        if (deci < 10 || deci > 50) {
            return res.status(400).json({ message: '评分须在 1.0～5.0 之间（步长 0.1）' });
        }
        const r = deci / 10;
        let tagsJson = null;
        if (tags != null && Array.isArray(tags)) {
            tagsJson = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);//如果标签不为空，则去除空格，过滤空值，取前20个标签
            if (tagsJson.length === 0) tagsJson = null;//如果标签数组为空，则设置为null
        }
        const trimmedContent = content != null ? String(content).trim() : '';//如果内容不为空，则去除空格
        if (trimmedContent.length > 100) {//如果内容长度大于100，则返回错误
            return res.status(400).json({ message: '文字评价须在 100 字以内' });
        }
        const contentStr = trimmedContent.length ? trimmedContent : null;//如果内容长度为0，则设置为null

        const consultantId = Number(order.consultantId);
        const transaction = await sequelize.transaction();//开启事务，保证数据一致性
        try {
            await OrderReview.create(//创建评价
                {
                    orderId,
                    fromUserId: userId,
                    fromRole: 'user',
                    toUserId: consultantId,
                    toRole: 'consultant',
                    rating: r,
                    content: contentStr,
                    tags: tagsJson,
                    reviewAt: new Date()//评价时间
                },
                { transaction }
            );
            order.status = 'completed';//订单状态改为已完成
            order.completedAt = new Date();//完成时间
            await order.save({ transaction });//保存订单

            const cprof = await ConsultantProfile.findOne({
                where: { consultantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (cprof) {//cprof：顾问资料
                const prevCount = Math.max(0, parseInt(String(cprof.reviewCount || 0), 10) || 0);//parseInt：将字符串转换为整数，String：将数字转换为字符串，max：取最大值，0：最小值，||0：如果为空，则返回0
                const prevRating = Number(cprof.rating) || 0;//Number：将字符串转换为数字，||0：如果为空，则返回0
                const newCount = prevCount + 1;//newCount：新评价数
                const newAvg =
                    prevCount === 0 ? r : (prevRating * prevCount + r) / newCount;//newAvg：新平均评分
                const rounded = Math.round(newAvg * 100) / 100;//rounded：四舍五入，保留2位小数
                cprof.reviewCount = newCount;//newCount：新评价数
                cprof.rating = Math.min(5, Math.max(0, rounded));
                await cprof.save({ transaction });//保存顾问资料    
            } else {
                console.warn(`[评价] 订单#${orderId} 顾问#${consultantId} 无 consultant_profile，未同步评分/评价数`);
            }

            await transaction.commit();
        } catch (e) {
            await transaction.rollback();
            if (e.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({ message: '该订单已评价过' });
            }
            throw e;
        }

        res.json({
            message: '评价成功，订单已完成',
            data: { orderId: order.orderId, status: order.status, completedAt: order.completedAt }
        });
    } catch (err) {
        console.error('submitReview:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};
