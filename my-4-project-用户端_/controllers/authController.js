// 业务逻辑：手机号当账号，验证码注册、密码登录、个人资料（双表）

const UserAuth = require('../models/UserAuth');
const UserProfile = require('../models/UserProfile');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'my-secret-key-123';
const CODE_EXPIRE_MS = 5 * 60 * 1000;
const VERIFIED_EXPIRE_MS = 5 * 60 * 1000; // 验证通过后 5 分钟内要设置密码

const codeStore = new Map();           // phone -> { code, expiresAt }
const verifiedPhones = new Map();      // phone -> { verifiedAt }，验证码通过后标记，设置密码时校验

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function computeIsCompleted(profile) {
    const hasName = profile.name != null && String(profile.name).trim() !== '';
    const hasOther = [profile.birth, profile.gender, profile.bio, profile.about].some(
        v => v != null && String(v).trim() !== ''
    );
    return hasName && hasOther;
}

// 检查手机号是否已注册 - POST /auth/check-phone（只查不发码，供前端先判断再决定是否发验证码）
exports.checkPhone = async (req, res) => {
    try {
        const phone = req.body.phone != null ? String(req.body.phone).trim() : '';
        if (!phone) {
            return res.status(400).json({ message: '请填写手机号' });
        }
        const exist = await UserAuth.findByPhone(phone);
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
        if (!phone) {
            return res.status(400).json({ message: '请填写手机号' });
        }
        const exist = await UserAuth.findByPhone(phone);
        if (exist) {
            return res.status(400).json({ message: '该手机号已注册' });
        }
        const code = generateCode();
        codeStore.set(phone, { code, expiresAt: Date.now() + CODE_EXPIRE_MS });
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
        const code = req.body.code;
        if (!phone) return res.status(400).json({ message: '请填写手机号' });
        if (!code) return res.status(400).json({ message: '请先获取验证码' });

        const stored = codeStore.get(phone);
        if (!stored) return res.status(400).json({ message: '请先获取验证码' });
        if (Date.now() > stored.expiresAt) {
            codeStore.delete(phone);
            return res.status(400).json({ message: '验证码已过期，请重新获取' });
        }
        if (stored.code !== String(code)) return res.status(400).json({ message: '验证码错误，请重新输入' });
        codeStore.delete(phone);

        const exist = await UserAuth.findByPhone(phone);
        if (exist) return res.status(400).json({ message: '该手机号已注册' });

        verifiedPhones.set(phone, { verifiedAt: Date.now() });
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
        const password = req.body.password;
        if (!phone) return res.status(400).json({ message: '请填写手机号' });
        if (!password) return res.status(400).json({ message: '请填写密码' });

        const verified = verifiedPhones.get(phone);
        if (!verified) return res.status(400).json({ message: '请先完成验证码验证' });
        if (Date.now() > verified.verifiedAt + VERIFIED_EXPIRE_MS) {
            verifiedPhones.delete(phone);
            return res.status(400).json({ message: '验证已过期，请重新获取验证码' });
        }
        verifiedPhones.delete(phone);

        const exist = await UserAuth.findByPhone(phone);
        if (exist) return res.status(400).json({ message: '该手机号已注册' });

        const userAuth = await UserAuth.createUser({ phone, password });
        await UserProfile.create({ userId: userAuth.id });

        const token = jwt.sign(
            { userId: userAuth.id, phone: userAuth.phone },
            JWT_SECRET,
            { expiresIn: '2h' }
        );
        res.status(201).json({
            message: '注册成功',
            token,
            user: { id: userAuth.id, phone: userAuth.phone }
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
        const password = req.body.password;
        if (!phone) return res.status(400).json({ message: '请填写手机号' });
        if (!password) return res.status(400).json({ message: '请填写密码' });

        const user = await UserAuth.findByPhone(phone);
        if (!user) return res.status(400).json({ message: '账号不存在，请重新输入' });
        if (user.password !== password) return res.status(400).json({ message: '密码错误，请重新输入' });

        const token = jwt.sign(
            { userId: user.id, phone: user.phone },
            JWT_SECRET,
            { expiresIn: '2h' }
        );
        res.json({
            message: '登录成功',
            token,
            user: { id: user.id, phone: user.phone }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 获取用户资料 - GET /auth/users/:id
exports.getUser = async (req, res) => {
    try {
        const userId = req.params.id;
        if (req.user.userId !== parseInt(userId, 10)) {
            return res.status(403).json({ message: '无权查看' });
        }
        const auth = await UserAuth.findByPk(userId, { attributes: ['id', 'phone'] });
        if (!auth) return res.status(404).json({ message: '用户不存在' });

        const profile = await UserProfile.findOne({ where: { userId } });
        const profileData = profile ? profile.toJSON() : {};
        const isCompleted = profile ? (profile.isCompleted ?? computeIsCompleted(profile)) : false;

        res.json({
            message: '获取成功',
            user: {
                id: auth.id,
                phone: auth.phone,
                name: profileData.name ?? null,
                birth: profileData.birth ?? null,
                gender: profileData.gender ?? null,
                bio: profileData.bio ?? null,
                about: profileData.about ?? null,
                coin: profileData.coin ?? 0,
                isCompleted
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 修改个人资料 - PUT /auth/users/:id
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        if (req.user.userId !== parseInt(userId, 10)) {
            return res.status(403).json({ message: '只能修改自己的资料' });
        }
        const profile = await UserProfile.findOne({ where: { userId } });
        if (!profile) return res.status(404).json({ message: '用户资料不存在' });

        const { name, birth, gender, bio, about, coin, isCompleted } = req.body;
        if (name !== undefined) profile.name = name === '' ? null : name;
        if (birth !== undefined) profile.birth = birth === '' ? null : birth;
        if (gender !== undefined) profile.gender = gender === '' ? null : gender;
        if (bio !== undefined) profile.bio = bio === '' ? null : bio;
        if (about !== undefined) profile.about = about === '' ? null : about;
        if (coin !== undefined) profile.coin = parseInt(coin, 10) || 0;
        if (typeof isCompleted === 'boolean') profile.isCompleted = isCompleted;
        else if (name !== undefined || birth !== undefined || gender !== undefined || bio !== undefined || about !== undefined) {
            profile.isCompleted = computeIsCompleted(profile);
        }
        await profile.save();

        res.json({
            message: '修改成功',
            user: {
                id: parseInt(userId, 10),
                name: profile.name,
                birth: profile.birth,
                gender: profile.gender,
                bio: profile.bio,
                about: profile.about,
                coin: profile.coin,
                isCompleted: profile.isCompleted
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 修改密码 - POST /auth/change-password
exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: '请填写原密码和新密码' });
        }

        const user = await UserAuth.findByPk(req.user.userId);
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
