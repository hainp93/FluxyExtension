const SERVER_API = "http://localhost:3000/update-token";
const CHECK_API = "http://localhost:3000/api/check-request";
const SITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";

console.log("🚀 AutoFlow V99: Ultra Sniffer (Fix Loop)");

let lastSentTime = 0; // Biến chống spam

function sendToServer(data) {
    fetch(SERVER_API, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).catch(() => { });
}

// 1. MỒI NHỬ TOKEN (Giữ nguyên)
function triggerAuthRequest() {
    fetch('https://labs.google/fx/api/trpc/videoFx.getUserSettings?input=%7B%22json%22%3Anull%7D').catch(() => { });
}

// 2. CHECK LỆNH TỪ SERVER (Giữ nguyên logic)
setInterval(async () => {
    try {
        const res = await fetch(CHECK_API);
        const data = await res.json();

        // LỆNH F5
        if (data.reload) {
            let [tab] = await chrome.tabs.query({ url: "*://labs.google/*" });
            if (tab) {
                console.log("🔄 Server yêu cầu F5...");
                chrome.tabs.reload(tab.id, {}, () => {
                    // Sau 5s thì thả mồi để ép token xuất hiện
                    setTimeout(() => {
                        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: triggerAuthRequest });
                    }, 5000);
                });
            }
        }

        // LỆNH LẤY RECAPTCHA
        if (data.needToken) { fetchRecaptcha(data.tokenAction || 'VIDEO_GENERATION'); }
    } catch (e) { }
}, 1000);

// 3. BẮT GÓI TIN MẠNG (SỬA LẠI ĐOẠN NÀY)
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        const isAisandboxApi = details.url.includes("aisandbox-pa.googleapis.com");
        const isLabsGoogle = details.url.includes("labs.google") || details.url.includes("googleapis.com");
        if (!isLabsGoogle) return;

        // Ưu tiên headers từ aisandbox-pa (chứa x-goog-user-project)
        // Cho phép bypass spam check cho aisandbox-pa
        if (!isAisandboxApi && Date.now() - lastSentTime < 3000) return;

        const auth = details.requestHeaders.find(h => h.name.toLowerCase() === 'authorization');
        if (auth && auth.value.includes("Bearer")) {
            const bearer = auth.value.replace("Bearer ", "");

            // Chỉ lấy token dài (token thật)
            if (bearer.length > 50) {
                lastSentTime = Date.now();

                chrome.cookies.getAll({ url: "https://labs.google" }, (cookies) => {
                    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                    sendToServer({
                        bearerToken: bearer,
                        cookie: cookieStr,
                        userAgent: navigator.userAgent,
                        headers: details.requestHeaders
                    });
                });
            }
        }
    },
    { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]
);

// 4. LẤY RECAPTCHA (Giữ nguyên)
async function fetchRecaptcha(action = 'VIDEO_GENERATION') {
    let [tab] = await chrome.tabs.query({ url: "*://labs.google/*" });
    if (!tab) return;
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (key, rcAction) => {
                return new Promise((resolve) => {
                    if (window.grecaptcha?.enterprise?.execute) {
                        window.grecaptcha.enterprise.execute(key, { action: rcAction })
                            .then(resolve).catch(() => resolve(null));
                    } else resolve(null);
                });
            },
            args: [SITE_KEY, action]
        });
        if (result[0]?.result) sendToServer({ recaptchaToken: result[0].result });
    } catch (e) { }
}

// 5. QUÉT PROJECT ID (Giữ nguyên)
setInterval(async () => {
    let [tab] = await chrome.tabs.query({ url: "*://labs.google/*" });
    if (!tab) return;
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            if (window.location.href.includes("/project/")) {
                const match = window.location.href.match(/project\/([a-f0-9\-]{36})/);
                return match ? match[1] : null;
            }
            // Fallback quét thẻ A
            const links = document.querySelectorAll('a[href*="/project/"]');
            for (let link of links) {
                const match = link.getAttribute('href').match(/project\/([a-f0-9\-]{36})/);
                if (match) return match[1];
            }
            return null;
        }
    }).then(res => { if (res[0]?.result) sendToServer({ projectId: res[0].result }); }).catch(() => { });
}, 2000);

// 6. NHẬN SỰ KIỆN CAUS TỪ CONTENT SCRIPT
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CAUS_FOUND" && message.data) {
        fetch("http://localhost:3000/api/save-caus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ causList: message.data })
        }).catch(e => { });
    }
});