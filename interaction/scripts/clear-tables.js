/**
 * 清空：订单聊天记录、订单评价表、冻结流水表、订单表、充值表、顾问服务表（全部数据删除，自增 id 会从 1 重新开始）
 * 使用：在项目根目录执行 node scripts/clear-tables.js
 */
const path = require('path');
const sequelize = require(path.join(__dirname, '../config/database'));
const FreezeRecord = require(path.join(__dirname, '../models/FreezeRecord'));
const Order = require(path.join(__dirname, '../models/Order'));
const Recharge = require(path.join(__dirname, '../models/recharge'));
const ConsultantService = require(path.join(__dirname, '../models/ConsultantService'));
const OrderChatMessage = require(path.join(__dirname, '../models/OrderChatMessage'));
const OrderReview = require(path.join(__dirname, '../models/OrderReview'));

async function clear() {
    try {
        // 按依赖顺序清空：先聊天记录（依赖订单），再评价（外键 orders），再冻结流水，再订单…
        const r0 = await OrderChatMessage.destroy({ where: {} });
        console.log('order_chat_messages 已清空，删除行数:', r0);

        const rRev = await OrderReview.destroy({ where: {} });
        console.log('order_reviews 已清空，删除行数:', rRev);

        const r1 = await FreezeRecord.destroy({ where: {} });
        console.log('freeze_records 已清空，删除行数:', r1);

        const r2 = await Order.destroy({ where: {} });
        console.log('orders 已清空，删除行数:', r2);

        const r3 = await Recharge.destroy({ where: {} });
        console.log('recharges 已清空，删除行数:', r3);

        const r4 = await ConsultantService.destroy({ where: {} });
        console.log('consultant_services 已清空，删除行数:', r4);

        console.log('全部完成。');
        process.exit(0);
    } catch (err) {
        console.error('清空失败:', err);
        process.exit(1);
    }
}

clear();
