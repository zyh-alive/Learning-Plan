// 顾问服务价格管理：设置/查看服务价格

const ConsultantService = require('../models/ConsultantService');

// ================================
// 🔑 公共函数：查询顾问服务列表（内部使用）
// ================================
async function queryConsultantServices(consultantId, isOwn = false) {
    // 1. 校验 ID
    const cid = parseInt(consultantId, 10);
    if (!cid || cid <= 0) {
        throw new Error('顾问 ID 格式错误');
    }

    // 2. 查询服务列表
    const services = await ConsultantService.findByConsultantId(cid);
    
    // 3. 格式化返回（根据是否是自己决定返回哪些字段）
    const list = services.map(s => {
        const item = {
            serviceId: s.serviceId,
            serviceType: s.serviceType,
            price: s.price,
            description: s.description
        };
        // 如果是顾问查自己的，额外返回时间字段
        if (isOwn) {
            item.createdAt = s.createdAt;
            item.updatedAt = s.updatedAt;
        }
        return item;
    });

    return { consultantId: cid, list };
}

// ================================
// 顾问设置服务价格 - POST /api/consultant/service
// ================================
exports.setService = async (req, res) => {
    try {
        const role = req.user.role || 'consultant';
        const consultantId = req.user.consultantId;
        
        // 1. 身份校验
        if (role !== 'consultant' || !consultantId) {
            return res.status(403).json({ message: '仅顾问可设置服务价格' });
        }

        // 2. 获取参数
        const { serviceType, price, description } = req.body;
        
        if (!serviceType || !price) {
            return res.status(400).json({ message: '请填写服务类型和价格' });
        }

        // 3. 校验服务类型
        if (!['咨询', '陪聊', '代办'].includes(serviceType)) {
            return res.status(400).json({ message: '服务类型必须是咨询/陪聊/代办之一' });
        }

        // 4. 校验价格
        const priceNum = Number(price);
        if (Number.isNaN(priceNum) || priceNum <= 0) {
            return res.status(400).json({ message: '价格必须大于 0' });
        }
        if (priceNum > 10000) {
            return res.status(400).json({ message: '价格不能超过 10000 金币' });
        }

        // 5. 创建或更新服务价格
        await ConsultantService.upsertService({
            consultantId,
            serviceType,
            price: priceNum,
            description: description ? String(description).trim() : null
        });

        res.json({
            message: '服务价格设置成功',
            data:{
                serviceType,
                price: priceNum,
                description
            }
        });
    } catch (err) {
        console.error('设置服务价格错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 查询服务列表（合并版）- GET /api/consultant/service/list
// ================================
// 用法：
// • 顾问查自己的：/api/consultant/service/list?mine=true
// • 用户查别人的：/api/consultant/service/list?consultantId=123
exports.getServiceList = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const { mine, consultantId } = req.query;
        
        let targetConsultantId;
        let isOwn = false;
        
        // 1. 判断查谁的服务
        if (mine === 'true') {
            // 顾问查自己的
            if (role !== 'consultant') {
                return res.status(403).json({ message: '仅顾问可查看自己的服务' });
            }
            targetConsultantId = req.user.consultantId;
            isOwn = true;
        } else if (consultantId) {
            // 查指定顾问的（任何人都可以查）
            targetConsultantId = parseInt(consultantId, 10);
            isOwn = (role === 'consultant' && req.user.consultantId === targetConsultantId);
        } else {
            return res.status(400).json({ message: '请指定查询顾问：?mine=true 或 ?consultantId=123' });
        }
        
        if (!targetConsultantId || targetConsultantId <= 0) {
            return res.status(400).json({ message: '顾问 ID 格式错误' });
        }

        // 2. 调用公共函数查询
        const result = await queryConsultantServices(targetConsultantId, isOwn);
        
        res.json({
            message: '获取成功',
            ...result
        });
    } catch (err) {
        console.error('查询服务列表错误:', err);
        if (err.message === '顾问 ID 格式错误') {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 顾问删除自己的一项服务 - DELETE /api/consultant/service/service/:serviceId
// ================================
exports.deleteService = async (req, res) => {
    try {
        const role = req.user.role || 'consultant';
        const consultantId = req.user.consultantId;
        if (role !== 'consultant' || !consultantId) {
            return res.status(403).json({ message: '仅顾问可删除服务' });
        }

        const serviceId = parseInt(req.params.serviceId, 10);
        if (!serviceId || serviceId <= 0) {
            return res.status(400).json({ message: '服务 ID 无效' });
        }

        const row = await ConsultantService.findOne({
            where: { serviceId, consultantId }
        });
        if (!row) {
            return res.status(404).json({ message: '服务不存在或无权删除' });
        }

        await row.destroy();
        res.json({
            message: '已删除该业务',
            data: { serviceId, serviceType: row.serviceType }
        });
    } catch (err) {
        console.error('删除服务错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};