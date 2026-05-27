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

        if (data.resolveMediaUrl) {
            resolveMediaUrl(data.resolveMediaUrl);
        }

        if (data.needImageUpload) {
            uploadImageViaPage();
        }

        if (data.needVideoGen) {
            executeVideoGen();
        }

        if (data.downloadVideo) {
            downloadVideoViaChrome(data.downloadVideo);
        }
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
        if (result[0]?.result) sendToServer({ recaptchaToken: result[0].result, action: action });
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

// 7. TẢI VIDEO QUA CHROME.DOWNLOADS
let isDownloadingVideo = false;
async function downloadVideoViaChrome(mediaName) {
    if (isDownloadingVideo) return;
    isDownloadingVideo = true;
    console.log(`📥 Bắt đầu tải video qua chrome.downloads: ${mediaName}`);
    try {
        const tRPCUrl = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${mediaName}`;
        const filename = `veo_1080p_${Date.now()}.mp4`;

        const downloadId = await new Promise((resolve, reject) => {
            chrome.downloads.download({
                url: tRPCUrl,
                filename: filename,
                saveAs: false,
                conflictAction: 'uniquify'
            }, (id) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(id);
                }
            });
        });

        console.log(`⬇️ Download ID: ${downloadId}, chờ hoàn thành...`);

        // Chờ hoàn thành tải xuống (tối đa 5 phút)
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                chrome.downloads.onChanged.removeListener(listener);
                reject(new Error('chrome.downloads timeout sau 300s'));
            }, 300000);

            function listener(delta) {
                if (delta.id !== downloadId) return;
                if (delta.state?.current === 'complete') {
                    clearTimeout(timer);
                    chrome.downloads.onChanged.removeListener(listener);
                    resolve();
                } else if (delta.state?.current === 'interrupted') {
                    clearTimeout(timer);
                    chrome.downloads.onChanged.removeListener(listener);
                    const errReason = delta.error?.current || 'INTERRUPTED';
                    reject(new Error(`Download bị gián đoạn: ${errReason}`));
                }
            }
            chrome.downloads.onChanged.addListener(listener);
        });

        const items = await new Promise(resolve => chrome.downloads.search({ id: downloadId }, resolve));
        const filePath = items?.[0]?.filename;

        if (!filePath) {
            throw new Error('Không lấy được đường dẫn file sau khi tải');
        }

        console.log(`✅ chrome.downloads hoàn thành: ${filePath}`);
        await fetch('http://localhost:3000/api/save-video-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        }).catch(() => {});

    } catch (e) {
        console.log('❌ Lỗi downloadVideoViaChrome:', e.message);
        await fetch('http://localhost:3000/api/video-download-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: e.message })
        }).catch(() => {});
    } finally {
        isDownloadingVideo = false;
    }
}

// 8. GIẢI QUYẾT REDIRECT URL
let isResolvingMedia = false;
async function resolveMediaUrl(mediaName) {
    if (isResolvingMedia) return;
    isResolvingMedia = true;
    try {
        const targetUrl = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${mediaName}`;
        const res = await fetch(targetUrl, { redirect: 'follow', credentials: 'include' });
        const finalUrl = res.url;
        if (finalUrl && finalUrl !== targetUrl) {
            await fetch('http://localhost:3000/api/save-media-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: finalUrl })
            });
            console.log('✅ Resolve video URL OK:', finalUrl.substring(0, 100));
        } else {
            console.log('❌ Không redirect — status:', res.status, '| url:', finalUrl?.substring(0, 80));
        }
    } catch (e) {
        console.log('Lỗi resolve media URL:', e.message);
    } finally {
        isResolvingMedia = false;
    }
}

// 9. UPLOAD ẢNH QUA PAGE
let isUploading = false;
async function uploadImageViaPage() {
    if (isUploading) return;
    isUploading = true;
    try {
        let [tab] = await chrome.tabs.query({ url: "*://labs.google/*" });
        if (!tab) {
            console.log('❌ Không tìm thấy tab labs.google để upload ảnh');
            await fetch('http://localhost:3000/api/save-media-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaId: 'FAILED' }) }).catch(() => {});
            return;
        }

        const dataRes = await fetch('http://localhost:3000/api/get-upload-image-data');
        if (!dataRes.ok) { console.log('❌ Không lấy được image data'); return; }
        const { base64, projectId, bearerToken } = await dataRes.json();
        if (!base64 || !projectId) { console.log('❌ Thiếu base64 hoặc projectId'); return; }

        console.log(`🖼️ Upload ảnh qua MAIN world (${Math.round(base64.length / 1024)}KB)...`);

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async (imageBase64, pid, bearer) => {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
                    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/flow/uploadImage', {
                        method: 'POST',
                        credentials: 'include',
                        headers: headers,
                        body: JSON.stringify({
                            clientContext: { projectId: pid, tool: 'PINHOLE' },
                            imageBytes: imageBase64
                        })
                    });
                    if (!res.ok) {
                        const errText = await res.text().catch(() => '');
                        return { error: `HTTP ${res.status}: ${errText.substring(0, 200)}` };
                    }
                    const data = await res.json();
                    return { mediaId: data?.media?.name || null, mediaDebug: JSON.stringify(data?.media || {}).substring(0, 300) };
                } catch (e) { return { error: e.message }; }
            },
            args: [base64, projectId, bearerToken || null]
        });

        const resultData = result?.[0]?.result;
        const mediaId = resultData?.mediaId || null;
        if (resultData?.error) {
            console.log('❌ Upload MAIN world lỗi:', resultData.error);
        } else if (mediaId) {
            console.log('✅ Upload ảnh MAIN world OK:', mediaId, '| media obj:', resultData.mediaDebug);
        }
        await fetch('http://localhost:3000/api/save-media-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaId: mediaId || 'FAILED', mediaDebug: resultData?.mediaDebug || '' })
        });
    } catch (e) {
        console.log('Lỗi uploadImageViaPage:', e.message);
        await fetch('http://localhost:3000/api/save-media-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaId: 'FAILED' }) }).catch(() => {});
    } finally {
        isUploading = false;
    }
}

// 10. SINH VIDEO QUA PAGE
let isGeneratingVideo = false;
async function executeVideoGen() {
    if (isGeneratingVideo) return;
    isGeneratingVideo = true;
    try {
        let [tab] = await chrome.tabs.query({ url: "*://labs.google/*" });
        if (!tab) {
            console.log('❌ Không tìm thấy tab labs.google để gọi video gen');
            await fetch('http://localhost:3000/api/save-video-gen-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'NO_TAB' }) }).catch(() => {});
            return;
        }

        const dataRes = await fetch('http://localhost:3000/api/get-pending-video-gen');
        if (!dataRes.ok) { console.log('❌ Không lấy được video gen data'); return; }
        const { url, payload, bearerToken } = await dataRes.json();
        if (!url || !payload) { console.log('❌ Thiếu url hoặc payload'); return; }

        console.log(`🎬 Gọi video gen qua MAIN world: ${url.substring(url.lastIndexOf('/') + 1)}...`);

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async (apiUrl, apiPayload, bearer) => {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
                    const res = await fetch(apiUrl, {
                        method: 'POST',
                        credentials: 'include',
                        headers: headers,
                        body: JSON.stringify(apiPayload)
                    });
                    const text = await res.text();
                    if (!res.ok) return { error: `HTTP ${res.status}: ${text.substring(0, 300)}` };
                    try { return { data: JSON.parse(text) }; } catch(e) { return { error: 'JSON parse fail: ' + text.substring(0, 200) }; }
                } catch (e) { return { error: e.message }; }
            },
            args: [url, payload, bearerToken || null]
        });

        const resultData = result?.[0]?.result;
        if (resultData?.error) {
            console.log('❌ Video gen MAIN world lỗi:', resultData.error);
            await fetch('http://localhost:3000/api/save-video-gen-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: resultData.error }) });
        } else if (resultData?.data) {
            console.log('✅ Video gen MAIN world OK');
            await fetch('http://localhost:3000/api/save-video-gen-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: resultData.data }) });
        } else {
            await fetch('http://localhost:3000/api/save-video-gen-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'NO_RESULT' }) });
        }
    } catch (e) {
        console.log('Lỗi executeVideoGen:', e.message);
        await fetch('http://localhost:3000/api/save-video-gen-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) }).catch(() => {});
    } finally {
        isGeneratingVideo = false;
    }
}