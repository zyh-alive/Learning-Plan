// 顾问服务价格表：一个顾问可以设置多种服务的价格

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConsultantService = sequelize.define('ConsultantService', {
    // 主键：服务记录 ID，自增长
    serviceId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '服务记录 ID，主键，自增长'
    },
    
    // 顾问 ID（关联 consultant_auth.id）
    consultantId: {
        type: DataTypes.INTEGER,
        allowNull: false,//不允许为空（必须填）
        comment: '顾问 ID',
        references: { model: 'consultant_auth', key: 'id' },//外键引用
        onDelete: 'CASCADE'//顾问删除，服务记录级联删除
    },
    
    // 服务类型（枚举：咨询/陪聊/代办）
    serviceType: {
        type: DataTypes.ENUM('咨询', '陪聊', '代办'),
        allowNull: false,//不允许为空
        comment: '服务类型：咨询/陪聊/代办'
    },
    
    // 服务价格（金币）
    price: {
        type: DataTypes.DECIMAL(10, 2),//最多 10 位，2 位小数
        allowNull: false,//不允许为空
        comment: '服务价格（金币）'
    },
    
    // 服务描述（可选）
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,//允许为空
        comment: '服务描述'
    }
}, {
    tableName: 'consultant_services',  // 数据库表名
    underscored: true,//下划线（驼峰转下划线）
    timestamps: true,//时间戳（自动添加 created_at / updated_at）

    // 必须用数据库实际列名（underscored），否则 sync 会生成 consultantId 导致报错
    indexes: [
        {
            unique: true,
            fields: ['consultant_id', 'service_type'],
            name: 'uk_consultant_service'
        }
    ]
});

// ============ 静态方法（仿照 UserAuth 风格） ============

// 根据顾问 ID 查询服务列表
ConsultantService.findByConsultantId = async function (consultantId) {
    return await this.findAll({ 
        where: { consultantId },
        order: [['serviceType', 'ASC']]
    });
};

// 根据顾问 ID + 服务类型查询（下单时用）
ConsultantService.findByConsultantAndType = async function (consultantId, serviceType) {
    return await this.findOne({ 
        where: { consultantId, serviceType }
    });
};

// 创建或更新服务价格
ConsultantService.upsertService = async function (data) {
    return await this.upsert(data);
};

module.exports = ConsultantService;