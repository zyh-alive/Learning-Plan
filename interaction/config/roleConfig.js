// ========== roleConfig 是干什么的？（只服务「注册/登录/个人资料」） ==========
//
// 它【不是】全项目统一配置，也【不是】要把所有表都写进来。
//
// 原因：客户和顾问用的是两套「账号+资料」表（user_auth/user_profile 和 consultant_auth/consultant_profile），
// 但注册、登录、查/改个人资料用的是【同一套接口】/auth/xxx，只是请求里带 role=user 或 consultant。
// 用 roleConfig.get(role) 拿到「当前角色该用哪两个模型 + id 字段名」，这样 authController 里逻辑只写一份。
//
// 为什么 Order、FreezeRecord、ConsultantService、recharge 等表不用进 roleConfig？
// 因为那些在各自业务控制器里用，接口已按路由或 req.user.role 分支，或表里同时有 userId/consultantId，
// 不需要「按角色选一套表」。只有认证+资料这块是「同一套代码、两套表」，所以只配置这两套。
//
const UserAuth = require('../models/UserAuth');
const UserProfile = require('../models/UserProfile');
const ConsultantAuth = require('../models/ConsultantAuth');
const ConsultantProfile = require('../models/ConsultantProfile');

const models = {
    user: {
        Auth: UserAuth,        // 用户登录表
        Profile: UserProfile, // 用户资料（姓名、金币等）
        idKey: 'userId'
    },
    consultant: {
        Auth: ConsultantAuth,
        Profile: ConsultantProfile,
        idKey: 'consultantId'
    }
};

function get(role) {
    return models[role] || models.user;  // 没传或乱传 role 就按用户处理
}

module.exports = {
    models,
    get
};
