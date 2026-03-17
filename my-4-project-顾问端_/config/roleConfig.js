// 告诉程序：role 对应哪个模型
const UserAuth = require('../models/UserAuth');
const UserProfile = require('../models/UserProfile');
const ConsultantAuth = require('../models/ConsultantAuth');
const ConsultantProfile = require('../models/ConsultantProfile');

const models = {
    user: {
        Auth: UserAuth,
        Profile: UserProfile,
        idKey: 'userId'
    },
    consultant: {
        Auth: ConsultantAuth,
        Profile: ConsultantProfile,
        idKey: 'consultantId'
    }
};

function get(role) {
    return models[role] || models.user;
}

module.exports = {
    models,
    get
};
