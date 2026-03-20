// Node 18+ 自带全局 fetch，无需安装 node-fetch
const BASE = process.env.API_BASE || 'http://localhost:3003';
async function processes(phone, token) {
    try {
        const start = Date.now();
        let res = await fetch(BASE + '/api/consultant/service/service', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ serviceType:'咨询',
                price: 100,//价格
                description: '咨询内容' ,

        })
        });
        if (!res.ok) return {phone,success: false,error: res.statusText};
        const time = Date.now() - start;
        return {phone,success: res.ok,time: time};
    } catch (err) {
        return {phone,success: false,error: err.message};
    }
}

async function test() {
    const promises = [];
    const total = 10000; 
    for (let i = 0; i < total; i++) {
        const phone = `130${String(i).padStart(8, '0')}`;
        //$是拼接字符串的符号，手机号是11位，所以需要用padStart方法补齐4位，用0补齐
        let res_token = await fetch(BASE + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password: '666666', role: 'consultant' })
        });
        const token = await res_token.json();
        promises.push(processes(phone, token.token));//返回一个对象，包含请求的响应状态、请求时间、手机号和错误信息

        }
    const results = await Promise.all(promises);//定义一个数组，用于存储所有请求的结果
    console.log(results.filter(r => r.error));//从原数组中抽出所有失败的请求作为新数组
    const okList = results.filter(r => r.success);
    const successful = okList.length;//成功的条数
    const failed = total-successful;//失败的条数
    const times = okList.map(r => r.time);
    if (successful > 0) {
        const averageTime = okList.reduce((sum, r) => sum + r.time, 0) / successful;//计算平均请求时间
        times.sort((a, b) => a - b);
        //sort是数组的方法，把括号里的函数应用到数组每一项，然后返回一个新数组
        //本质就是for循环，内部才是逻辑，外部sort只是用来排序，内部的逻辑可变（万能排序器）
        //a - b表示从小到大排序，b - a表示从大到小排序
        //sort的参数是一个函数，函数的作用是比较两个数的大小
        //函数的作用是比较两个数的大小，如果a小于b，则返回-1，如果a大于b，则返回1，如果a等于b，则返回0
        console.log(`最小请求时间: ${times[0]}ms`);
        console.log(`最大请求时间: ${times[times.length - 1]}ms`);
        console.log(`中位数请求时间: ${times[Math.floor(times.length / 2)]}ms`);
        //Math.floor是Math对象的方法，把小数向下取整
        console.log(`平均请求时间: ${averageTime}ms`);
    
    
    }
    //reduce是数组的方法，把括号里的函数应用到数组每一项，初始值为0，然后返回一个值
    //本质就是for循环，内部才是逻辑，外部reduce只是用来遍历数组，内部的逻辑可变（万能转换器）
   
    //=>表示变成，把数组中的每一项都变成一个新数组，就是提取，然后变成新数组
    //map是数组的方法，把括号里的函数应用到数组每一项，然后返回一个新数组

    console.log(`总请求:${total}, 成功: ${successful}, 失败: ${failed}`);//${}跟python中的+一样，表示拼接字符串
 
}
test();
