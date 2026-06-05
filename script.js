const cameraView = document.getElementById('camera-view');
const recordBtn = document.getElementById('record-btn');
const altitudeText = document.getElementById('altitude-text');
const sliderWrapper = document.getElementById('slider-wrapper');
const cameraPage = document.getElementById('camera-page');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const totalDownloadBtn = document.getElementById('total-download-btn');

let mediaRecorder;
let recordedChunks = [];
let currentSlideIndex = 0;
let totalSlides = 1;

let currentFacingMode = "user"; // "user"(전면) 또는 "environment"(후면)
let db;

function getSupportedMimeType() {
    const types = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("HikeCameraDB", 1);
        request.onupgradeneeded = function(e) {
            const database = e.target.result;
            database.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
        };
        request.onsuccess = function(e) {
            db = e.target.result;
            resolve();
        };
        request.onerror = function(e) {
            console.error("DB 에러", e);
            reject();
        };
    });
}

function startCameraClock() {
    let cameraTimeText = document.getElementById('camera-time-text');
    if (!cameraTimeText) {
        cameraTimeText = document.createElement('div');
        cameraTimeText.id = 'camera-time-text';
        cameraTimeText.style.position = 'absolute';
        cameraTimeText.style.top = '14px';
        cameraTimeText.style.left = '14px';
        cameraTimeText.style.color = 'white';
        cameraTimeText.style.fontSize = '15px';
        cameraTimeText.style.fontWeight = '600';
        cameraTimeText.style.fontFamily = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        cameraTimeText.style.letterSpacing = '-0.3px';
        cameraTimeText.style.zIndex = '12';
        if (cameraPage) {
            cameraPage.style.position = 'relative';
            cameraPage.appendChild(cameraTimeText);
        }
    }
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        cameraTimeText.innerText = `${hours}:${minutes}`;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// 📸 카메라 켜기 함수 (유령 방어막 제거 버전)
async function startCamera() {
    if (cameraView.srcObject) {
        cameraView.srcObject.getTracks().forEach(track => track.stop());
        cameraView.srcObject = null;
    }

    try {
        const constraints = {
            audio: true, 
            video: {
                facingMode: currentFacingMode === "user" ? "user" : { exact: "environment" }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraView.srcObject = stream;
        
        if (currentFacingMode === "user") {
            cameraView.style.transform = "scaleX(-1)";
        } else {
            cameraView.style.transform = "scaleX(1)";
        }

        // ❌ 버튼 클릭을 방해하던 투명 'safariShield' 생성 코드를 완벽하게 도려내어 버튼을 활성화했습니다!

        if (recordBtn) recordBtn.style.zIndex = '30';
        if (switchCameraBtn) switchCameraBtn.style.zIndex = '30';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        cameraView.onloadedmetadata = () => {
            canvas.width = cameraView.videoWidth;
            canvas.height = cameraView.videoHeight;
        };

        function drawFrame() {
            if (!cameraView.srcObject || cameraView.paused || cameraView.ended || !canvas.width) {
                requestAnimationFrame(drawFrame);
                return;
            }
            
            const vw = cameraView.videoWidth;
            const vh = cameraView.videoHeight;
            if (canvas.width !== vw || canvas.height !== vh) {
                canvas.width = vw;
                canvas.height = vh;
            }

            ctx.save();
            if (currentFacingMode === "user") {
                ctx.scale(-1, 1);
                ctx.drawImage(cameraView, -vw, 0, vw, vh);
            } else {
                ctx.drawImage(cameraView, 0, 0, vw, vh);
            }
            ctx.restore();
            requestAnimationFrame(drawFrame);
        }
        
        cameraView.onplay = drawFrame;

        const canvasStream = canvas.captureStream(30);
        const flippedVideoTrack = canvasStream.getVideoTracks()[0];

        const combinedStream = new MediaStream();
        combinedStream.addTrack(flippedVideoTrack);

        if (stream.getAudioTracks().length > 0) {
            combinedStream.addTrack(stream.getAudioTracks()[0]);
        }

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(combinedStream, options);

        mediaRecorder.ondataavailable = function(event) {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async function() {
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/mp4' });
            recordedChunks = [];
            const currentAltitude = altitudeText.innerText;
            const now = new Date();
            const recordTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const savedId = await saveVideoToDB(blob, currentAltitude, recordTime);
            addVideoSlideToUI(blob, currentAltitude, savedId, recordTime);
        };

    } catch (error) {
        console.error("카메라 작동 에러:", error);
        if (currentFacingMode === "environment") {
            currentFacingMode = "user";
            alert("후면 카메라 진입 제한으로 전면으로 우회 구동합니다.");
            startCamera();
        }
    }
}

function saveVideoToDB(blob, altitude, recordTime) {
    return new Promise((resolve) => {
        const transaction = db.transaction(["videos"], "readwrite");
        const store = transaction.objectStore("videos");
        const request = store.add({ videoBlob: blob, altitudeText: altitude, recordTime: recordTime });
        request.onsuccess = (e) => resolve(e.target.result);
    });
}

function deleteVideoFromDB(id) {
    return new Promise((resolve) => {
        const transaction = db.transaction(["videos"], "readwrite");
        const store = transaction.objectStore("videos");
        const request = store.delete(id);
        request.onsuccess = () => resolve();
    });
}

function loadSavedVideos() {
    const transaction = db.transaction(["videos"], "readonly");
    const store = transaction.objectStore("videos");
    const request = store.getAll();
    request.onsuccess = function(e) {
        const savedList = e.target.result;
        savedList.forEach(item => {
            addVideoSlideToUI(item.videoBlob, item.altitudeText, item.id, item.recordTime);
        });
    };
}

function addVideoSlideToUI(blob, altitude, id, recordTime) {
    const videoURL = URL.createObjectURL(blob);
    const newSlide = document.createElement('div');
    newSlide.className = 'slide-page';
    newSlide.style.position = 'relative';

    const newVideo = document.createElement('video');
    newVideo.src = videoURL;
    newVideo.className = 'saved-video';
    newVideo.muted = false; // 🔊 웹 슬라이드 확인 화면 소리 정상 출력!
    newVideo.playsInline = true;
    newVideo.setAttribute('playsinline', '');
    newVideo.controls = true;
    newVideo.loop = true;

    const newOverlay = document.createElement('div');
    newOverlay.className = 'altitude-overlay';
    newOverlay.innerHTML = `<span>${altitude}</span>`;

    const timeOverlay = document.createElement('div');
    timeOverlay.className = 'time-overlay';
    timeOverlay.style.position = 'absolute';
    timeOverlay.style.top = '14px';
    timeOverlay.style.left = '14px';
    timeOverlay.style.color = 'white';
    timeOverlay.style.fontSize = '15px';
    timeOverlay.style.fontWeight = '600';
    timeOverlay.style.fontFamily = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    timeOverlay.style.letterSpacing = '-0.3px';
    timeOverlay.style.zIndex = '10';

    const displayTime = recordTime || `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
    timeOverlay.innerHTML = `<span>${displayTime}</span>`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', '영상 삭제');
    deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
    `;

    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm("이 영상을 영구 삭제하시겠습니까?")) {
            await deleteVideoFromDB(id);
            const childrenArray = Array.from(sliderWrapper.children);
            const slideIndex = childrenArray.indexOf(newSlide);
            newSlide.remove();
            totalSlides--;
            if (slideIndex <= currentSlideIndex) {
                if (currentSlideIndex >= totalSlides) {
                    currentSlideIndex = totalSlides - 1;
                } else if (slideIndex < currentSlideIndex) {
                    currentSlideIndex--;
                }
            }
            updateSliderPosition();
        }
    });

    newSlide.appendChild(newVideo);
    newSlide.appendChild(newOverlay);
    newSlide.appendChild(timeOverlay);
    newSlide.appendChild(deleteBtn);

    sliderWrapper.style.transition = 'none';
    sliderWrapper.insertBefore(newSlide, cameraPage);

    totalSlides++;
    currentSlideIndex++;
    updateSliderPosition();

    sliderWrapper.offsetHeight;
    sliderWrapper.style.transition = 'transform 0.3s ease-out';
}

function updateSliderPosition() {
    sliderWrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
    const slides = sliderWrapper.children;
    for (let i = 0; i < slides.length; i++) {
        const video = slides[i].querySelector('.saved-video');
        if (video) {
            if (i === currentSlideIndex) {
                video.load();
                video.play().catch(err => console.log("자동재생 우회 중: ", err));
            } else {
                video.pause();
            }
        }
    }
}

function getRealAltitude() {
    navigator.geolocation.getCurrentPosition(async function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
            const data = await response.json();
            const elevation = Math.round(data.elevation[0]);
            altitudeText.innerText = "⛰️ 해발 " + elevation + "m";
        } catch (error) {
            altitudeText.innerText = "⛰️ 고도 로딩 실패";
        }
    }, function(error) {
        altitudeText.innerText = "⛰️ GPS 연결 실패";
    });
}

recordBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === 'recording') return;

    mediaRecorder.start();
    recordBtn.innerText = "녹화중";
    recordBtn.style.backgroundColor = "gray";
    recordBtn.style.borderColor = "gray";

    getRealAltitude();

    setTimeout(() => {
        mediaRecorder.stop();
        recordBtn.innerText = "REC";
        recordBtn.style.backgroundColor = "red";
        recordBtn.style.borderColor = "white";
    }, 3000); 
});

switchCameraBtn.addEventListener('click', async () => {
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await startCamera();
});

let touchStartX = 0;
let touchEndX = 0;
document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); });
document.addEventListener('mousedown', e => { touchStartX = e.screenX; });
document.addEventListener('mouseup', e => { touchEndX = e.screenX; handleSwipe(); });

function handleSwipe() {
    const swipeDistance = touchStartX - touchEndX;
    if (swipeDistance < -50) {
        if (currentSlideIndex > 0) {
            currentSlideIndex--;
            updateSliderPosition();
        }
    }
    if (swipeDistance > 50) {
        if (currentSlideIndex < totalSlides - 1) {
            currentSlideIndex++;
            updateSliderPosition();
        }
    }
}

// ==========================================
// 🚀 다운로드 시스템 (사파리 친화형 무음 무오류 인코더)
// ==========================================
totalDownloadBtn.addEventListener('click', generateTotalLogVideo);

async function generateTotalLogVideo() {
    const transaction = db.transaction(["videos"], "readonly");
    const store = transaction.objectStore("videos");
    const request = store.getAll();

    request.onsuccess = async function(e) {
        const savedList = e.target.result.sort((a, b) => a.id - b.id);
        if (savedList.length === 0) {
            alert("아직 촬영된 등산 추억 영상이 없습니다! 먼저 영상을 녹화해 주세요.");
            return;
        }

        totalDownloadBtn.disabled = true;
        totalDownloadBtn.innerText = "⏳ 등산 log 제작 중...";

        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 1280;
        const ctx = canvas.getContext('2d');

        const bgImg = new Image();
        bgImg.src = 'my-background.png';
        await new Promise((resolve) => { bgImg.onload = resolve; });

        const hiddenVideo = document.createElement('video');
        hiddenVideo.muted = true; 
        hiddenVideo.playsInline = true;
        hiddenVideo.setAttribute('playsinline', ''); 
        
        hiddenVideo.style.position = 'fixed';
        hiddenVideo.style.top = '0';
        hiddenVideo.style.left = '-9999px'; 
        hiddenVideo.style.width = '1px';
        hiddenVideo.style.height = '1px';
        hiddenVideo.style.opacity = '0.01';
        hiddenVideo.style.pointerEvents = 'none';
        document.body.appendChild(hiddenVideo);

        const canvasStream = canvas.captureStream(30);
        const encodedChunks = [];

        function getDownloadMimeType() {
            const appleFriendlyTypes = [
                'video/mp4;codecs=avc1',   
                'video/mp4;codecs=h264',
                'video/mp4'
            ];
            for (const type of appleFriendlyTypes) {
                if (MediaRecorder.isTypeSupported(type)) return type;
            }
            return 'video/webm';
        }

        const downloadMimeType = getDownloadMimeType();
        const canvasRecorder = new MediaRecorder(canvasStream, downloadMimeType ? { mimeType: downloadMimeType } : {});

        canvasRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) encodedChunks.push(event.data);
        };

        canvasRecorder.onstop = () => {
            const actualMime = canvasRecorder.mimeType || '';
            let extension = 'mp4';
            if (actualMime.includes('webm')) extension = 'webm';

            const finalBlob = new Blob(encodedChunks, { type: actualMime || 'video/mp4' });
            const finalVideoURL = URL.createObjectURL(finalBlob);

            const now = new Date();
            const formattedDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = finalVideoURL;
            downloadAnchor.download = `${formattedDate} 등산log.${extension}`;
            downloadAnchor.click();

            totalDownloadBtn.disabled = false;
            totalDownloadBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4M7 10l5 5 5-5M12 15V3"/>
                </svg><span>등산log 다운로드</span>`;
        };

        canvasRecorder.start();

        for (const item of savedList) {
            hiddenVideo.src = URL.createObjectURL(item.videoBlob);
            await new Promise((resolve) => { hiddenVideo.onloadeddata = resolve; });
            await hiddenVideo.play();

            let isCurrentVideoPlaying = true;
            hiddenVideo.onended = () => { isCurrentVideoPlaying = false; };

            while (isCurrentVideoPlaying) {
                ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

                const containerWidth = canvas.width * 0.85; 
                const containerHeight = containerWidth * (9 / 16); 
                const videoX = (canvas.width - containerWidth) / 2;
                const videoY = (canvas.height - containerHeight) / 2;

                const drawWidth = containerWidth;
                const drawHeight = containerWidth * (hiddenVideo.videoHeight / hiddenVideo.videoWidth);
                const offsetX = videoX;
                const offsetY = videoY - (drawHeight - containerHeight) / 2;

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(videoX, videoY, containerWidth, containerHeight, 20);
                ctx.clip(); 
                ctx.drawImage(hiddenVideo, offsetX, offsetY, drawWidth, drawHeight);
                ctx.restore();

                ctx.fillStyle = "white"; 
                ctx.font = "600 22px -apple-system, Apple SD Gothic Neo, Malgun Gothic, sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                
                const timeX = videoX + 18; 
                const timeY = videoY + 18; 
                const displayTime = item.recordTime || "00:00";
                ctx.fillText(displayTime, timeX, timeY);

                ctx.font = "bold 27px -apple-system, Apple SD Gothic Neo, Malgun Gothic, sans-serif"; 
                ctx.textBaseline = "middle";
                ctx.textAlign = "left"; 

                const fullAltitudeText = item.altitudeText || "⛰️ 해발 0m";
                const emojiStr = "⛰️";
                const cleanText = fullAltitudeText.replace("⛰️", "").trim(); 

                const fixedEmojiWidth = 31; 
                const gap = 9;  
                const textWidth = ctx.measureText(cleanText).width;
                
                const totalContentWidth = fixedEmojiWidth + gap + textWidth;
                const startX = (canvas.width - totalContentWidth) / 2;
                const centerY = videoY + (containerHeight / 2);

                ctx.fillText(emojiStr, startX, centerY);
                ctx.fillText(cleanText, startX + fixedEmojiWidth + gap, centerY);

                await new Promise(requestAnimationFrame);
            }
        }

        canvasRecorder.stop();
        hiddenVideo.remove(); 
    };
}

async function initApp() {
    await initDatabase();
    loadSavedVideos();
    await startCamera();
    startCameraClock(); 
    altitudeText.innerText = "⛰️ 초기 고도 측정 중...";
    getRealAltitude();
}

initApp();
