// ========== 认证控制器：注册、登录、个人资料、改密码 ==========
// 同一套接口支持「客户(user)」和「顾问(consultant)」，通过 body 里 role 区分，实际查/写的表由 roleConfig 决定

const roleConfig = require('../config/roleConfig');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/verifyAccessToken');
const CODE_EXPIRE_MS = 5 * 60 * 1000;
const VERIFIED_EXPIRE_MS = 5 * 60 * 1000; // 验证通过后 5 分钟内要设置密码
const Order = require('../models/Order');
const { Op } = require('sequelize');

const codeStore = new Map();//Map作用是键值对，key:角色:手机号,value:验证码,过期时间           // phone -> { code, expiresAt }
const verifiedPhones = new Map();//Map作用是键值对，key:角色:手机号,value:验证码通过时间      // phone -> { verifiedAt }，验证码通过后标记，设置密码时校验

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));//生成6位验证码
}

// 客户资料：姓名、生日、性别、简介、关于 五项全部填写才算完善
function computeIsCompleted(profile) {
    const hasName = profile.name != null && String(profile.name).trim() !== '';
    const hasBirth = profile.birth != null && String(profile.birth).trim() !== '';
    const hasGender = profile.gender != null && profile.gender !== ''; // 0 也算已选
    const hasBio = profile.bio != null && String(profile.bio).trim() !== '';
    const hasAbout = profile.about != null && String(profile.about).trim() !== '';
    return hasName && hasBirth && hasGender && hasBio && hasAbout;
}

// 顾问资料：昵称 + 个性签名 + 工作时长 + 经历说明 四项均非空才算完善（与客户端展示一致）
function computeConsultantIsCompleted(profile) {
    if (!profile) return false;
    const hasName = profile.name != null && String(profile.name).trim() !== '';
    const hasSig = profile.signature != null && String(profile.signature).trim() !== '';
    const hasWd = profile.workDuration != null && String(profile.workDuration).trim() !== '';
    const hasEx = profile.experience != null && String(profile.experience).trim() !== '';
    return hasName && hasSig && hasWd && hasEx;
}

// 检查手机号是否已注册 - POST /auth/check-phone（只查不发码，供前端先判断再决定是否发验证码）
exports.checkPhone = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        const role = req.body.role || 'user';  // ✅ 1. 获取 role
        const { Auth } = roleConfig.get(role);  // ✅ 2. 拿模型配置
        if (!phone) {
            return res.status(400).json({ message: '请填写手机号' });
        }
        const exist = await Auth.findByPhone(phone, {
            attributes: ['status'],//查询状态
        });//在正常状态的顾客或顾问下查询
        if (exist && exist.status === 'active') {
            return res.status(400).json({ message: '该手机号已注册' });
        }
        else if (exist && exist.status === 'inactive') {
            return res.status(400).json({ message: '该手机号已注销,请换个手机号注册' });
        }
        res.json({ message: '该手机号未注册,可以注册' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 发送验证码 - POST /auth/send-code（仅未注册时发码；前端应先调 check-phone 再调此接口）
exports.sendCode = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        const role = req.body.role || 'user';  // ✅ 1. 获取 role
        const { Auth } = roleConfig.get(role);  // ✅ 2. 拿模型配置
        if (!phone) {
            return res.status(400).json({ message: '请填写手机号' });
        }
        const exist = await Auth.findByPhone(phone, {
            attributes: ['status'],//查询状态
        });//在正常状态的顾客或顾问下查询
        if (exist && exist.status === 'active') {
            return res.status(400).json({ message: '该手机号已注册' });
        }
        /*两遍校验防止用户在 checkPhone 之后、sendCode 之前的间隙中，该手机号被别人注册了（虽然概率低，但存在）*/
        const code = generateCode();
        const key = `${role}:${phone}`;//key:角色:手机号,是对象的键
        codeStore.set(key, { code, expiresAt: Date.now() + CODE_EXPIRE_MS });//codeStore:对象,code:验证码,expiresAt:过期时间
        //set作用是设置键值对，key:角色:手机号,value:验证码,过期时间
        //codeStore:对象,code:验证码,expiresAt:过期时间
        // 模拟发到手机：不返回 code，仅在控制台打印（正式环境可接短信服务）
        console.log('[验证码] 已发送到手机 ' + phone + '，验证码：' + code + '（开发环境请在此查看）');
        res.json({ message: '验证码已发送到手机' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 第一步：验证码校验，通过后只提示“请设置密码”，不创建用户、不返回 token
exports.verifyCode = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        const role = req.body.role || 'user';  // ✅ 1. 获取 role
        const { Auth } = roleConfig.get(role);  // ✅ 2. 拿模型配置 
        const code = req.body.code;
        if (!phone) return res.status(400).json({ message: '请填写手机号' });
        if (!code) return res.status(400).json({ message: '请先获取验证码' });

        const key = `${role}:${phone}`;
        const stored = codeStore.get(key);//第一遍存验证码的对象,key:角色:手机号,value:验证码,过期时间
        if (!stored) return res.status(400).json({ message: '请先获取验证码' });//如果第一遍存验证码的对象不存在，返回请先获取验证码
        if (Date.now() > stored.expiresAt) {//直接算出过期时间和目前的时间进行比对，如果过期了，删除验证码
            codeStore.delete(key);//过期删除验证码
            return res.status(400).json({ message: '验证码已过期，请重新获取' });//如果过期了，删除验证码
        }
        if (stored.code !== String(code)) return res.status(400).json({ message: '验证码错误，请重新输入' });//如果验证码错误，返回验证码错误，请重新输入
        //string作用是将code转换为字符串,因为stored.code是字符串,code是数字,从对象中获取的值都是字符串
        //前面的stored.code是原来存储在Map里面的，后面的code是前端输入的，比对后不一样，则验证码错误，然后删除对象中的键值对
        codeStore.delete(key);

        const exist = await Auth.findByPhone(phone);//在正常状态的顾客或顾问下查询
        if (exist) return res.status(400).json({ message: '该手机号已注册' });//如果该手机号已注册，返回该手机号已注册
        //第三遍校验防止用户在 verifyCode 之后、setPassword 之前的间隙中，该手机号被别人注册了（虽然概率低，但存在）
        verifiedPhones.set(key, { verifiedAt: Date.now() });//第二遍存验证码通过时间，key:角色:手机号,value:验证码通过时间
        //只存验证码通过时间，不存验证码，因为验证码已经通过，不需要再存，节省空间
        res.json({ message: '请设置密码' });//返回请设置密码
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 第二步：设置密码并创建账号，只在这里返回 token，前端拿 token 直接进主页，无需再登录
exports.setPassword = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        const role = req.body.role || 'user';  // ✅ 1. 获取 role
        const { Auth, Profile ,idKey} = roleConfig.get(role);  // ✅ 2. 拿模型配置     
        const password = req.body.password;
        if (!phone) return res.status(400).json({ message: '请填写手机号' });
        if (!password) return res.status(400).json({ message: '请填写密码' });

        const key = `${role}:${phone}`;
        const verified = verifiedPhones.get(key);//获取验证码验证通过的时间对象，key:角色:手机号,value:验证码通过时间
        if (!verified) return res.status(400).json({ message: '请先完成验证码验证' });//如果验证码验证通过的时间对象不存在，返回请先完成验证码验证
        if (Date.now() > verified.verifiedAt + VERIFIED_EXPIRE_MS) {
            //现在的时间和验证通过的时间进行比对，如果过期了，删除验证码验证通过的时间对象，验证码通过后5分钟内有效
            verifiedPhones.delete(key);
            return res.status(400).json({ message: '验证已过期，请重新获取验证码' });//如果过期了，删除验证码验证通过的时间对象
        }
        verifiedPhones.delete(key);//如果没有过期，则删除验证码验证通过的时间对象，因为验证码已经通过，不需要再存，节省空间

        const exist = await Auth.findByPhone(phone);
        if (exist) return res.status(400).json({ message: '该手机号已注册' });
        //第四次校验防止用户在 setPassword 之后、login 之前的间隙中，该手机号被别人注册了（虽然概率低，但存在）

        const auth = await Auth.create({ phone, password, status: 'active' });
        //创建用户，状态为正常，因为用户刚注册，还没有登录，所以状态为正常
        const profile = await Profile.create({ [idKey]: auth.id });  // 新用户 profile 默认 token_version=0

        const token = jwt.sign(
            { [idKey]: auth.id, phone: auth.phone, role, token_version: (profile && profile.token_version != null) ? profile.token_version : 0 },
            JWT_SECRET,
            { expiresIn: '2h' }
        );
        //两小时过期，过期后需要重新登录
        res.status(201).json({
            message: '注册成功',
            token,
            user: { id: auth.id, phone: auth.phone }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 登录 - POST /auth/login（手机号当账号，密码登录）
exports.login = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        const role = req.body.role || 'user';  // ✅ 1. 获取 role
        const { Auth ,Profile ,idKey} = roleConfig.get(role);  // ✅ 2. 拿模型配置     
        const password = req.body.password;
        if (!phone) return res.status(400).json({ message: '请填写手机号' });
        if (!password) return res.status(400).json({ message: '请填写密码' });

        const auth = await Auth.findByPhone(phone, {
            attributes: ['status'],//查询状态
        });//在正常状态的顾客或顾问下查询
        if (!auth) return res.status(400).json({ message: '账号不存在，请注册' });
        if (auth && auth.status === 'inactive') return res.status(400).json({ message: '该账号已注销,请重新注册' });
        if (auth.password !== password) return res.status(400).json({ message: '密码错误，请重新输入' });

        const profile = await Profile.findOne({ where: { [idKey]: auth.id }, attributes: ['token_version'] });
        const ver = (profile && profile.token_version != null) ? profile.token_version : 0;

        const token = jwt.sign(
            { [idKey]: auth.id, phone: auth.phone, role, token_version: ver },
            JWT_SECRET,
            { expiresIn: '2h' }
        );
        res.json({
            message: '登录成功',
            token,
            user: { id: auth.id, phone: auth.phone }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 获取用户资料 - GET /auth/users/:id（role 从 token 里取，与当前登录身份一致）
exports.getUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const role = req.user.role || 'user';
        const { Auth, Profile, idKey } = roleConfig.get(role);
        const authUserId = req.user[idKey];
        if (authUserId !== parseInt(userId, 10)) {
            return res.status(403).json({ message: '无权查看' });
        }
        const auth = await Auth.findByPk(userId, { attributes: ['id', 'phone'] });
        if (!auth) return res.status(404).json({ message: '用户不存在' });

        const profile = await Profile.findOne({ where: { [idKey]: userId } });
        const profileData = profile ? profile.toJSON() : {};
        // 客户 / 顾问：均按字段实时计算，不信任库里可能过期的 isCompleted
        const isCompleted = profile
            ? role === 'user'
                ? computeIsCompleted(profile)
                : computeConsultantIsCompleted(profile)
            : false;
        // 调试小红点：看终端里 profile 各字段和 isCompleted（客户端未填全时应为 false）
        if (role === 'user') {
            const p = profile ? profile.toJSON() : {};
            console.log('[getUser 客户] name=%s birth=%s gender=%s bio=%s about=%s => isCompleted=%s', p.name, p.birth, p.gender, p.bio, p.about, isCompleted);
        }

        const userData = {
            id: auth.id,
            phone: auth.phone,
            name: profileData.name ?? null,
            coin: profileData.coin ?? 0,
            isCompleted
        };

        if (role === 'user') {
            userData.birth = profileData.birth ?? null;
            userData.gender = profileData.gender ?? null;
            userData.bio = profileData.bio ?? null;
            userData.about = profileData.about ?? null;
        } else if (role === 'consultant') {
            userData.workStatus = profileData.workStatus ?? 0;
            userData.totalOrders = profileData.totalOrders ?? 0;
            userData.rating = profileData.rating != null ? Number(profileData.rating) : 0;
            userData.reviewCount = profileData.reviewCount ?? 0;
            userData.signature = profileData.signature ?? null;
            userData.workDuration = profileData.workDuration ?? null;
            userData.experience = profileData.experience ?? null;
        }

        res.json({
            message: '获取成功',
            role,
            user: userData
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 修改个人资料 - PUT /auth/users/:id（role 从 token 取）
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const role = req.user.role || 'user';
        const { Profile, idKey } = roleConfig.get(role);
        const authUserId = req.user[idKey];
        if (authUserId !== parseInt(userId, 10)) {
            return res.status(403).json({ message: '只能修改自己的资料' });
        }
        const profile = await Profile.findOne({ where: { [idKey]: userId } });
        if (!profile) return res.status(404).json({ message: '用户资料不存在' });

        const {
            name,
            birth,
            gender,
            bio,
            about,
            coin,
            isCompleted,
            workStatus,
            totalOrders,
            rating,
            reviewCount,
            signature,
            workDuration,
            experience
        } = req.body;
        if (name !== undefined) profile.name = name === '' ? null : name;
        if (coin !== undefined) {
            const c = parseFloat(coin);
            profile.coin = Number.isFinite(c) ? Math.round(c * 100) / 100 : 0;
        }
        // 顾问 isCompleted 仅由字段计算，不接受前端伪造
        if (typeof isCompleted === 'boolean' && role !== 'consultant') profile.isCompleted = isCompleted;

        if (role === 'user') {
            if (birth !== undefined) profile.birth = birth === '' ? null : birth;
            if (gender !== undefined) profile.gender = gender === '' ? null : gender;
            if (bio !== undefined) profile.bio = bio === '' ? null : bio;
            if (about !== undefined) profile.about = about === '' ? null : about;
            if (name !== undefined || birth !== undefined || gender !== undefined || bio !== undefined || about !== undefined) {
                profile.isCompleted = computeIsCompleted(profile);
            }
        } else if (role === 'consultant') {
            if (workStatus !== undefined) profile.workStatus = parseInt(workStatus, 10) || 0;
            if (totalOrders !== undefined) profile.totalOrders = parseInt(totalOrders, 10) || 0;
            if (rating !== undefined) profile.rating = parseFloat(rating) || 0;
            if (reviewCount !== undefined) profile.reviewCount = parseInt(reviewCount, 10) || 0;
            if (signature !== undefined) {
                profile.signature =
                    signature === '' || signature == null
                        ? null
                        : String(signature).trim().slice(0, 200);
            }
            if (workDuration !== undefined) {
                profile.workDuration =
                    workDuration === '' || workDuration == null
                        ? null
                        : String(workDuration).trim().slice(0, 100);
            }
            if (experience !== undefined) {
                profile.experience =
                    experience === '' || experience == null
                        ? null
                        : String(experience).trim().slice(0, 5000);
            }
            profile.isCompleted = computeConsultantIsCompleted(profile);
        }

        await profile.save();

        const userRes = {
            id: parseInt(userId, 10),
            name: profile.name,
            coin: profile.coin,
            isCompleted: profile.isCompleted
        };
        if (role === 'user') {
            userRes.birth = profile.birth;
            userRes.gender = profile.gender;
            userRes.bio = profile.bio;
            userRes.about = profile.about;
        } else if (role === 'consultant') {
            userRes.workStatus = profile.workStatus;
            userRes.totalOrders = profile.totalOrders;
            userRes.rating = profile.rating;
            userRes.reviewCount = profile.reviewCount;
            userRes.signature = profile.signature;
            userRes.workDuration = profile.workDuration;
            userRes.experience = profile.experience;
        }
        res.json({
            message: '修改成功',
            role,
            user: userRes
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 修改密码 - POST /auth/change-password（role 从 token 取）
exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: '请填写原密码和新密码' });
        }
        const role = req.user.role || 'user';
        const { Auth, Profile, idKey } = roleConfig.get(role);
        const authId = req.user[idKey];
        const user = await Auth.findByPk(authId);
        if (!user) return res.status(404).json({ message: '用户不存在' });
        if (user.password !== oldPassword) return res.status(400).json({ message: '原密码错误，请重新输入' });

        user.password = newPassword;
        await user.save();

        // token_version 在 Profile 表，+1 后旧 token 在中间件里会校验失败，需重新登录
        const profile = await Profile.findOne({ where: { [idKey]: authId } });
        if (profile) {
            profile.token_version = (profile.token_version || 0) + 1;
            await profile.save();
        }
        res.json({ message: '密码修改成功，请重新登录' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//注销用户 - POST /auth/logout（role 从 token 取）
exports.logout = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const { Auth,  idKey, Profile } = roleConfig.get(role);  //  拿模型配置     
        const authId = req.user[idKey];
        const user = await Auth.findByPk(authId, {
            attributes: ['status'],//查询状态
        });//在正常状态的顾客或顾问下查询
        if (!user) return res.status(404).json({ message: '用户不存在' });
        if (role === 'consultant') {
            const result = await Order.findByConsultant({
                where: { consultantId: authId, status: { [Op.in]: ['inserv_ice','accepted','start_invited'] } },
                attributes: ['orderId'],//查询订单ID
            });//在正常状态的顾问下查询
            if (result.length > 0) {
                return res.status(400).json({ message: '您有服务中的订单，请先完成订单再注销' });//返回您有服务中的订单，请先完成订单再注销
            }
        }else{
            const result = await Order.findAll({
                where: { userId: authId, status: { [Op.in]: ['pending','accepted',] } },
                attributes: ['orderId'],//查询订单ID
            });//在正常状态的顾客下查询
            if (result.length > 0) {
                // 对每个订单，构造假的 req 和 res，然后调用 cancelOrder
                for (const order of result) {
                    // 构造假的 req 对象
                    const fakeReq = {
                        user: {
                            role: 'user',
                            userId: authId
                        },
                        params: {
                            orderId: order.orderId//订单ID
                        },
                        body: {
                            cancelReason: '顾问注销账号，订单自动取消'//取消原因
                        }
                    }
                    // 构造假的 res 对象
                    let responseData = null;
                    let responseStatus = null;
                    
                    const fakeRes = {
                        status: function(code) {
                            responseStatus = code;
                            return this;
                        },
                        json: function(data) {//这里的data是伪造的响应数据
                            responseData = data;
                            return this;
                        }
                    };
                    try{
                        await cancelOrder(fakeReq, fakeRes);
                    }catch(err){
                        console.error(err);
                    }
                    if (responseStatus >= 200 && responseStatus < 300) {
                        console.log(`[注销] 订单#${order.orderId} 已取消（自动）`);
                    } else {
                        console.error(`[注销] 订单#${order.orderId} 取消失败（自动）: ${responseData?.message || '未知错误'}`);
                    }
                }
            }
            const result_in_service = await Order.findAll({
                where: { userId: authId, status: 'in_service'},
                attributes: ['orderId'],//查询订单ID
            });//在正常状态的顾客下查询
            if (result_in_service.length > 0) {
                return res.status(400).json({ message: '您有服务中的订单，请先完成订单再注销' });//返回您有服务中的订单，请先完成订单再注销
            }
        }
        console.log('authId是：', authId);
        console.log('idKey是：', idKey);
        console.log('[idKey]:authId是：', [idKey],authId);
        const logOff = await Auth.update({ status: 'inactive',updatedAt: new Date() }, { where: { id: authId } });//logOff是数组，数组里面是是否成功
        console.log('logOff是：', logOff);
        const profile = await Profile.findOne({ where: { [idKey]: authId } });
        if (profile) {
            profile.token_version = (profile.token_version || 0) + 1;
            await profile.save();
        }
        if (logOff[0] > 0) {
            res.json({ message: '注销成功，期待与您的再次相遇！' });//返回注销成功
        } else {
            res.json({ message: '注销失败,请稍后重试！' });//返回注销失败,请稍后重试
        }
        // token_version 在 Profile 表，+1 后旧 token 在中间件里会校验失败，需重新登录
        
    }catch(err){
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};