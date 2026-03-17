// 业务逻辑：同一套接口，通过参数 role（user | consultant）走同一通道，仅切换使用的表（由 roleConfig 配置）

const roleConfig = require('../config/roleConfig');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'my-secret-key-123';
const CODE_EXPIRE_MS = 5 * 60 * 1000;
const VERIFIED_EXPIRE_MS = 5 * 60 * 1000; // 验证通过后 5 分钟内要设置密码

const codeStore = new Map();           // phone -> { code, expiresAt }
const verifiedPhones = new Map();      // phone -> { verifiedAt }，验证码通过后标记，设置密码时校验

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
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

// 检查手机号是否已注册 - POST /auth/check-phone（只查不发码，供前端先判断再决定是否发验证码）
exports.checkPhone = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        const role = req.body.role || 'user';  // ✅ 1. 获取 role
        const { Auth } = roleConfig.get(role);  // ✅ 2. 拿模型配置
        if (!phone) {
            return res.status(400).json({ message: '请填写手机号' });
        }
        const exist = await Auth.findByPhone(phone);
        if (exist) {
            return res.status(400).json({ message: '该手机号已注册' });
        }
        res.json({ message: '可以注册' });
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
        const exist = await Auth.findByPhone(phone);
        if (exist) {
            return res.status(400).json({ message: '该手机号已注册' });
        }
        const code = generateCode();
        const key = `${role}:${phone}`;
        codeStore.set(key, { code, expiresAt: Date.now() + CODE_EXPIRE_MS });
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
        const stored = codeStore.get(key);
        if (!stored) return res.status(400).json({ message: '请先获取验证码' });
        if (Date.now() > stored.expiresAt) {
            codeStore.delete(key);
            return res.status(400).json({ message: '验证码已过期，请重新获取' });
        }
        if (stored.code !== String(code)) return res.status(400).json({ message: '验证码错误，请重新输入' });
        codeStore.delete(key);

        const exist = await Auth.findByPhone(phone);
        if (exist) return res.status(400).json({ message: '该手机号已注册' });

        verifiedPhones.set(key, { verifiedAt: Date.now() });
        res.json({ message: '请设置密码' });
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
        const verified = verifiedPhones.get(key);
        if (!verified) return res.status(400).json({ message: '请先完成验证码验证' });
        if (Date.now() > verified.verifiedAt + VERIFIED_EXPIRE_MS) {
            verifiedPhones.delete(key);
            return res.status(400).json({ message: '验证已过期，请重新获取验证码' });
        }
        verifiedPhones.delete(key);

        const exist = await Auth.findByPhone(phone);
        if (exist) return res.status(400).json({ message: '该手机号已注册' });

        const auth = await Auth.create({ phone, password });
        await Profile.create({ [idKey]: auth.id });

        const token = jwt.sign(
            { [idKey]: auth.id, phone: auth.phone, role },
            JWT_SECRET,
            { expiresIn: '2h' }
        );
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

        const auth = await Auth.findByPhone(phone);
        if (!auth) return res.status(400).json({ message: '账号不存在，请注册' });
        if (auth.password !== password) return res.status(400).json({ message: '密码错误，请重新输入' });

        const token = jwt.sign(
            { [idKey]: auth.id, phone: auth.phone, role },
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
        // 客户：始终按五项是否全填计算，不信任数据库里的 isCompleted
        const isCompleted = profile
            ? (role === 'user' ? computeIsCompleted(profile) : (profile.isCompleted ?? !!profile.isCompleted))
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

        const { name, birth, gender, bio, about, coin, isCompleted, workStatus, totalOrders, rating, reviewCount } = req.body;
        if (name !== undefined) profile.name = name === '' ? null : name;
        if (coin !== undefined) profile.coin = parseInt(coin, 10) || 0;
        if (typeof isCompleted === 'boolean') profile.isCompleted = isCompleted;

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
        const { Auth, idKey } = roleConfig.get(role);
        const authId = req.user[idKey];
        const user = await Auth.findByPk(authId);
        if (!user) return res.status(404).json({ message: '用户不存在' });
        if (user.password !== oldPassword) return res.status(400).json({ message: '原密码错误，请重新输入' });

        user.password = newPassword;
        await user.save();
        res.json({ message: '密码修改成功，请重新登录' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};
