/**
 * 根据 order_reviews 表全量重算顾问资料上的评价数、平均分（与线上一致）
 *
 * 规则：
 * - 只统计 to_role = 'consultant' 的评价（to_user_id = consultant_profile.consultant_id）
 * - review_count = 该顾问评价条数；rating = AVG(rating)，四舍五入保留 2 位小数
 * - 没有任何评价的顾问：review_count = 0，rating = 0
 *
 * 使用：在项目根目录执行
 *   node scripts/sync-consultant-ratings-from-reviews.js
 */
const path = require('path');
const sequelize = require(path.join(__dirname, '../config/database'));
const ConsultantProfile = require(path.join(__dirname, '../models/ConsultantProfile'));
const OrderReview = require(path.join(__dirname, '../models/OrderReview'));

async function main() {
    const t = await sequelize.transaction();
    try {
        const rows = await sequelize.query(
            `
            SELECT
                to_user_id AS consultantId,
                COUNT(*) AS cnt,
                AVG(rating) AS avgRating
            FROM order_reviews
            WHERE to_role = 'consultant'
            GROUP BY to_user_id
            `,
            { type: sequelize.QueryTypes.SELECT, transaction: t }
        );

        await ConsultantProfile.update(
            { reviewCount: 0, rating: 0 },
            { where: {}, transaction: t }
        );

        for (const row of rows) {
            const cid = Number(row.consultantId ?? row.consultant_id);
            const cnt = Number(row.cnt) || 0;
            const rawAvg = Number(row.avgRating);
            const rating =
                Number.isFinite(rawAvg) ? Math.round(rawAvg * 100) / 100 : 0;

            const [affected] = await ConsultantProfile.update(
                { reviewCount: cnt, rating: Math.min(5, Math.max(0, rating)) },
                { where: { consultantId: cid }, transaction: t }
            );
            if (affected === 0) {
                console.warn(
                    `[跳过] 评价里有 to_user_id=${cid}，但 consultant_profile 无此顾问行`
                );
            } else {
                console.log(`顾问 #${cid}: reviewCount=${cnt}, rating=${rating}`);
            }
        }

        await t.commit();
        console.log('同步完成。');
        process.exit(0);
    } catch (err) {
        await t.rollback();
        console.error('同步失败:', err);
        process.exit(1);
    }
}

main();
