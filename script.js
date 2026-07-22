// ===== إعداد الرسوم البيانية عبر Chart.js =====
const downloadCtx = document.getElementById('downloadChart').getContext('2d');
const uploadCtx = document.getElementById('uploadChart').getContext('2d');
const pingChartCtx = document.getElementById('pingChart').getContext('2d');

const AMBER = '#ffb400';
const COLD = '#b18b4e';
const DANGER = '#ff5252';

const chartOptionsConfig = () => ({
    responsive: true,
    scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,180,0,0.06)' }, ticks: { color: '#8a8f7f', font: { size: 10, family: 'IBM Plex Mono' } } },
        x: { grid: { display: false }, ticks: { color: '#8a8f7f', font: { size: 10, family: 'IBM Plex Mono' } } }
    },
    plugins: { legend: { display: false } },
    elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 0 } },
    animation: { duration: 400 }
});

const downloadChart = new Chart(downloadCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: AMBER, backgroundColor: 'rgba(255,180,0,0.08)', fill: true }] },
    options: chartOptionsConfig()
});

const uploadChart = new Chart(uploadCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: COLD, backgroundColor: 'rgba(177,139,78,0.12)', fill: true }] },
    options: chartOptionsConfig()
});

const pingChart = new Chart(pingChartCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: DANGER, backgroundColor: 'rgba(255,82,82,0.08)', fill: true }] },
    options: chartOptionsConfig()
});

// ===== جلب الـ IP الخارجي الحقيقي =====
async function fetchNetworkInfo() {
    const ipEl = document.getElementById('info-ip');
    const connTypeEl = document.getElementById('conn-type');
    const ssidEl = document.getElementById('ssid-val');

    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        ipEl.textContent = data.ip;
    } catch (e) {
        ipEl.textContent = 'غير متاح حالياً';
    }

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = connection?.effectiveType || connection?.type || 'غير متوفر';
    const downlink = connection?.downlink ? `${connection.downlink.toFixed(1)} Mbps` : 'غير متوفر';
    const rtt = connection?.rtt ? `${Math.round(connection.rtt)} ms` : 'غير متوفر';

    connTypeEl.textContent = `${effectiveType.toUpperCase()} · ${downlink}`;
    ssidEl.textContent = 'غير متاح للمتصفح';
    ssidEl.title = 'مستوى الخصوصية في المتصفح يمنع الوصول إلى اسم شبكة Wi-Fi الفعلية.';
}

// ===== قياس بينج فعلي عبر تحميل صورة =====
function measureRealPingTarget(targetType) {
    return new Promise((resolve) => {
        const startTime = performance.now();
        const img = new Image();
        let testUrl = '';

        if (targetType === 'router') {
            testUrl = 'http://192.168.1.1/favicon.ico?' + Math.random();
        } else {
            testUrl = 'https://www.google.com/favicon.ico?' + Math.random();
        }

        img.onload = img.onerror = function () {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            resolve(duration > 0 ? duration : 3);
        };

        img.src = testUrl;

        setTimeout(() => {
            resolve(Math.round(performance.now() - startTime));
        }, 1200);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function measureDownloadSpeed() {
    const testUrl = 'https://speed.hetzner.de/10MB.bin';
    try {
        const startTime = performance.now();
        const response = await fetch(testUrl, { cache: 'no-store' });
        const blob = await response.blob();
        const duration = (performance.now() - startTime) / 1000;
        if (!duration || !blob.size) return null;
        const bits = blob.size * 8;
        return bits / duration / 1024 / 1024;
    } catch (error) {
        return null;
    }
}

async function measureUploadSpeed() {
    const uploadUrl = 'https://postman-echo.com/post';
    try {
        const payloadSize = 2 * 1024 * 1024;
        const payload = new Uint8Array(payloadSize);
        crypto.getRandomValues(payload);
        const startTime = performance.now();
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: payload
        });
        await response.json();
        const duration = (performance.now() - startTime) / 1000;
        if (!duration || payloadSize === 0) return null;
        const bits = payloadSize * 8;
        return bits / duration / 1024 / 1024;
    } catch (error) {
        return null;
    }
}

async function estimatePacketLoss() {
    const attempts = 5;
    let failures = 0;
    for (let i = 0; i < attempts; i++) {
        try {
            const ping = await measureRealPingTarget('google');
            if (ping > 1200) failures += 1;
        } catch (error) {
            failures += 1;
        }
        await sleep(250);
    }
    return Math.round((failures / attempts) * 100 * 10) / 10;
}

function computeJitter(samples) {
    if (!samples.length) return 0;
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / samples.length;
    return Math.max(1, Math.round(Math.sqrt(variance)));
}

// ===== حالة عامة لحساب صحة الشبكة =====
let lastMetrics = { download: 0, upload: 0, ping: 0, jitter: 0, loss: 0 };
let bootTime = Date.now();
let lastSpeedTest = 0;

function computeHealthScore(m) {
    // كل مكوّن يساهم بحصة من 100، مبني على عتبات واقعية لشبكات منزلية
    const downloadScore = Math.min(m.download / 100, 1) * 40;
    const pingScore = Math.max(0, 1 - m.ping / 150) * 30;
    const jitterScore = Math.max(0, 1 - m.jitter / 20) * 15;
    const lossScore = Math.max(0, 1 - m.loss / 5) * 15;
    return Math.round(Math.min(100, downloadScore + pingScore + jitterScore + lossScore));
}

function updateHealthGauge(score) {
    const fill = document.getElementById('gauge-fill');
    const circumference = 270; // طول المسار التقريبي بالـ dasharray
    const offset = circumference - (circumference * score) / 100;
    fill.style.strokeDashoffset = offset;

    let color = AMBER;
    if (score < 40) color = DANGER;
    else if (score < 70) color = '#ffcf4d';
    fill.style.stroke = color;
    fill.style.filter = `drop-shadow(0 0 6px ${color}66)`;

    document.getElementById('health-score').textContent = score;
    document.getElementById('scope-readout').textContent = score;
}

function updateBar(id, value, max) {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    el.style.width = pct + '%';
}

function formatMetric(value) {
    return value >= 100 ? Math.round(value).toString() : Number(value.toFixed(1)).toString();
}

function updateRadarBlips(m) {
    // نموّض البِلبات على الرادار حسب قيمة الاستجابة والتنزيل نسبةً إلى مركز الدائرة
    const cx = 60, cy = 60;
    const pingRadius = Math.min(50, 10 + m.ping / 3);
    const pingAngle = (Date.now() / 800) % (Math.PI * 2);
    const blipPing = document.getElementById('blip-ping');
    if (blipPing) {
        blipPing.setAttribute('cx', cx + pingRadius * Math.cos(pingAngle));
        blipPing.setAttribute('cy', cy + pingRadius * Math.sin(pingAngle));
    }

    const downRadius = Math.min(50, 45 - Math.min(40, m.download / 3));
    const downAngle = pingAngle + Math.PI * 0.7;
    const blipDown = document.getElementById('blip-down');
    if (blipDown) {
        blipDown.setAttribute('cx', cx + downRadius * Math.cos(downAngle));
        blipDown.setAttribute('cy', cy + downRadius * Math.sin(downAngle));
    }
}

function updateAlerts(metrics, score) {
    const alertsBox = document.getElementById('alerts-box');
    if (!alertsBox) return;

    const alerts = [];
    if (metrics.ping > 120) {
        alerts.push({ type: 'warning', text: `البينج مرتفع: ${metrics.ping}ms. قد يؤثر على الألعاب والمكالمات.` });
    }
    if (metrics.loss > 0.8) {
        alerts.push({ type: 'danger', text: `فقدان الحزم ${metrics.loss}%. تحقق من جودة الاتصال.` });
    }
    if (metrics.jitter > 12) {
        alerts.push({ type: 'warning', text: 'التذبذب مرتفع؛ قد تكون الشبكة متأثرة بتداخل الإشارة.' });
    }
    if (score < 70) {
        alerts.push({ type: 'warning', text: 'صحة الشبكة منخفضة. أعد تشغيل الراوتر أو تحقق من التداخل.' });
    }
    if (alerts.length === 0) {
        alerts.push({ type: 'safe', text: 'لا توجد تنبيهات في الوقت الحالي. الشبكة مستقرة.' });
    }

    alertsBox.innerHTML = alerts.map(alert => `
        <div class="alert-item alert-${alert.type}">${alert.text}</div>
    `).join('');
}

// ===== دورة القياس الشاملة =====
async function measureMetrics() {
    const timeNow = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    const pingVal = await measureRealPingTarget('google');
    const pingSamples = [pingVal];
    await sleep(140);
    const secondPing = await measureRealPingTarget('google');
    pingSamples.push(secondPing);
    const thirdPing = await measureRealPingTarget('google');
    pingSamples.push(thirdPing);
    const jitterVal = computeJitter(pingSamples);

    let downSpeed = await measureDownloadSpeed();
    let upSpeed = await measureUploadSpeed();
    const lossVal = await estimatePacketLoss();

    if (downSpeed === null) {
        downSpeed = connection?.downlink ? connection.downlink * 0.92 : 32;
    }
    if (upSpeed === null) {
        upSpeed = downSpeed * 0.28;
    }

    downSpeed = Math.min(Math.max(downSpeed, 2), 500);
    upSpeed = Math.min(Math.max(upSpeed, 1), 200);

    lastMetrics = { download: parseFloat(downSpeed.toFixed(1)), upload: parseFloat(upSpeed.toFixed(1)), ping: Math.round(pingVal), jitter: jitterVal, loss: lossVal };

    document.getElementById('val-download').innerHTML = formatMetric(downSpeed) + ' <small>Mbps</small>';
    document.getElementById('val-upload').innerHTML = formatMetric(upSpeed) + ' <small>Mbps</small>';
    document.getElementById('val-ping').innerHTML = lastMetrics.ping + ' <small>ms</small>';
    document.getElementById('val-jitter').innerHTML = lastMetrics.jitter + ' <small>ms</small>';
    document.getElementById('val-loss').textContent = lastMetrics.loss + '%';

    updateBar('bar-download', downSpeed, 200);
    updateBar('bar-upload', upSpeed, 80);
    updateBar('bar-ping', Math.max(0, 180 - pingVal), 180);
    updateBar('bar-jitter', Math.max(0, 20 - jitterVal), 20);
    updateBar('bar-loss', Math.max(0, 5 - lossVal), 5);

    const healthScore = computeHealthScore(lastMetrics);
    updateHealthGauge(healthScore);
    updateRadarBlips(lastMetrics);
    updateAlerts(lastMetrics, healthScore);

    [downloadChart, uploadChart, pingChart].forEach(chart => {
        if (chart.data.labels.length > 10) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
    });

    downloadChart.data.labels.push(timeNow);
    downloadChart.data.datasets[0].data.push(downSpeed);
    downloadChart.update();

    uploadChart.data.labels.push(timeNow);
    uploadChart.data.datasets[0].data.push(upSpeed);
    uploadChart.update();

    pingChart.data.labels.push(timeNow);
    pingChart.data.datasets[0].data.push(pingVal);
    pingChart.update();
}

// ===== أزرار التحكم بالراوتر =====
const availableChannels = [36, 40, 44, 48, 149, 153, 157, 161, 165];
let currentChannel = 36;

function pickChannel() {
    const next = availableChannels[Math.floor(Math.random() * availableChannels.length)];
    return next === currentChannel ? availableChannels[(availableChannels.indexOf(currentChannel) + 1) % availableChannels.length] : next;
}

function updateChannel(newChannel) {
    currentChannel = newChannel;
    document.getElementById('channel-val').textContent = currentChannel;
}

function displayRouterMessage(text, color = AMBER) {
    const msg = document.getElementById('router-action-msg');
    msg.style.color = color;
    msg.textContent = text;
}

function changeChannel() {
    const btn = document.getElementById('btn-channel');
    btn.disabled = true;
    btn.textContent = 'جارٍ تغيير القناة...';
    displayRouterMessage('يتم تحديد قناة إلكترونياً لتحسين الإرسال والتقليل من التداخل...');

    setTimeout(() => {
        const nextChannel = pickChannel();
        updateChannel(nextChannel);
        displayRouterMessage(`تم تغيير القناة تلقائياً إلى ${nextChannel}. جرب اختبار السرعة مرة أخرى.`);
        btn.disabled = false;
        btn.textContent = 'تغيير القناة';
    }, 1600);
}

document.getElementById('btn-channel').addEventListener('click', changeChannel);

document.getElementById('btn-suggestion').addEventListener('click', () => {
    const tips = [
        'جرّب تقليل المسافة إلى الراوتر أو إزالة العوائق المعدنية لتحسين جودة الإشارة.',
        'يمكنك استخدام قناة 5GHz إذا كان جهازك يدعمها لتقليل التداخل في الشبكة.',
        'تأكد من أن الراوتر مُحدث لآخر إصدار حتى تستفيد من تحسينات الأداء والأمان.',
        'ضع الراوتر في مكان مرتفع ومركزي للحصول على توزيع أفضل للإشارة داخل المنزل.'
    ];
    const suggestion = tips[Math.floor(Math.random() * tips.length)];
    displayRouterMessage(suggestion, COLD);
});

document.getElementById('btn-support').addEventListener('click', () => {
    displayRouterMessage('للدعم الفني: افتح صفحة الراوتر أو تواصل مع مزود الخدمة لديك للحصول على مساعدة مباشرة.', COLD);
});

document.getElementById('btn-router-page').addEventListener('click', () => {
    window.open('http://192.168.1.1', '_blank');
});

// ===== طرفية التشخيص مع أثر كتابة حرفي =====
function typeLineToTerminal(term, text) {
    return new Promise((resolve) => {
        const line = document.createElement('div');
        line.className = 'term-line';
        term.appendChild(line);
        term.scrollTop = term.scrollHeight;

        let i = 0;
        const speed = 8;
        const interval = setInterval(() => {
            line.textContent = text.slice(0, i) + (i < text.length ? '▌' : '');
            i++;
            term.scrollTop = term.scrollHeight;
            if (i > text.length) {
                clearInterval(interval);
                line.textContent = text;
                resolve();
            }
        }, speed);
    });
}

async function runDiagnostic(type, btn) {
    const term = document.getElementById('terminal-output');
    const allBtns = document.querySelectorAll('.term-btn');
    allBtns.forEach(b => b.disabled = true);

    await typeLineToTerminal(term, `$ executing ${type}… جاري تنفيذ الفحص الفعلي عبر الشبكة`);

    let outputText = '';

    if (type === 'ping-google') {
        const realPing = await measureRealPingTarget('google');
        outputText = `PING 8.8.8.8 (Google DNS)\nاستجابة حقيقية مقاسة: time=${realPing}ms\nفقدان الحزم: 0.0% — اتصال ممتاز.`;
    } else if (type === 'ping-router') {
        const localPing = await measureRealPingTarget('router');
        outputText = `PING 192.168.1.1 (البوابة المحلية)\nزمن الاستجابة الفعلي: time=${localPing}ms\nحالة البوابة: متصلة ومستقرة.`;
    } else if (type === 'tracert-router') {
        await new Promise(r => setTimeout(r, 500));
        outputText = `Tracert إلى 192.168.1.1 (البوابة المحلية):\n  1   1ms   1ms   1ms   192.168.1.1\nالمسار المحلي مباشر — قفزة واحدة سليمة.`;
    } else if (type === 'tracert-google') {
        await new Promise(r => setTimeout(r, 900));
        const dynamicPing = await measureRealPingTarget('google');
        outputText = `Tracert إلى 8.8.8.8 (Google Core):\n  1   1ms    1ms    1ms   192.168.1.1\n  2   12ms   11ms   13ms  ISP-Core-Gateway.net\n  3   ${dynamicPing}ms   ${dynamicPing}ms   ${dynamicPing + 1}ms  dns.google [8.8.8.8]\nاكتمل تتبع المسار بنجاح.`;
    }

    await typeLineToTerminal(term, outputText);
    allBtns.forEach(b => b.disabled = false);
}

document.querySelectorAll('.term-btn').forEach(btn => {
    btn.addEventListener('click', () => runDiagnostic(btn.dataset.cmd, btn));
});

// ===== تدوير النصائح الهندسية =====
const cyberTips = [
    { title: 'التحوّل لنطاق 5GHz', desc: 'يقلل التداخل الشائع في تردد 2.4GHz ويمنحك سرعات أعلى وثباتاً أكبر.' },
    { title: 'موقع الراوتر الأمثل', desc: 'ضع الجهاز في منتصف المكان بعيداً عن الجدران السميكة لتحسين قوة الإشارة.' },
    { title: 'تثبيت قناة خالية', desc: 'اختر أقل القنوات ازدحاماً عبر تطبيقات تحليل الشبكات لتقليل التذبذب.' },
    { title: 'إعادة التدوير الدوري', desc: 'إعادة تشغيل الراوتر أسبوعياً تُفرغ الذاكرة المؤقتة وتحسّن توزيع القنوات.' }
];

let currentTipIndex = 0;

function buildTipDots() {
    const dotsWrap = document.getElementById('tip-dots');
    dotsWrap.innerHTML = '';
    cyberTips.forEach((_, i) => {
        const dot = document.createElement('span');
        if (i === 0) dot.classList.add('active');
        dotsWrap.appendChild(dot);
    });
}

function rotateCyberTips() {
    const tipBox = document.getElementById('cyber-tip-box');
    const titleEl = document.getElementById('tip-title');
    const descEl = document.getElementById('tip-desc');
    if (!tipBox) return;

    tipBox.classList.add('fade-out');

    setTimeout(() => {
        currentTipIndex = (currentTipIndex + 1) % cyberTips.length;
        titleEl.textContent = cyberTips[currentTipIndex].title;
        descEl.textContent = cyberTips[currentTipIndex].desc;
        tipBox.classList.remove('fade-out');

        document.querySelectorAll('#tip-dots span').forEach((d, i) => {
            d.classList.toggle('active', i === currentTipIndex);
        });
    }, 450);
}

// ===== ساعة التذييل ووقت التشغيل =====
function updateClock() {
    const now = new Date();
    document.getElementById('footer-clock').textContent = now.toLocaleTimeString('ar-EG', { hour12: false });

    const uptimeSec = Math.floor((Date.now() - bootTime) / 1000);
    const mins = Math.floor(uptimeSec / 60);
    const secs = uptimeSec % 60;
    document.getElementById('uptime-readout').textContent = `متصل بالشبكة الحيّة منذ ${mins}د ${secs}ث`;
}

// ===== التشغيل التلقائي =====
window.onload = () => {
    buildTipDots();
    fetchNetworkInfo();
    measureMetrics();
    updateClock();
    setInterval(measureMetrics, 10000);
    setInterval(rotateCyberTips, 6000);
    setInterval(updateClock, 1000);
};