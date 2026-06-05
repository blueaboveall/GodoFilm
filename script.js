const cameraView = document.getElementById('camera-view');
const recordBtn = document.getElementById('record-btn');
const altitudeText = document.getElementById('altitude-text');
const sliderWrapper = document.getElementById('slider-wrapper');
const cameraPage = document.getElementById('camera-page');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const totalDownloadBtn = document.getElementById('total-download-btn'); // 🌟 전체 다운로드 버튼 가져오기

let mediaRecorder;
let recordedChunks = [];
let currentSlideIndex = 0;
let totalSlides = 1;

let currentFacingMode = "user";
let db;

// 브라우저가 지원하는 최적의 비디오 포맷을 찾는 함수
function getSupportedMimeType() {
    const types = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=avc1',
        'video/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

// 브라우저 내부 비밀 저장소(IndexedDB) 열기
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

// 실시간 촬영 대기화면 전용 시계 구동 함수 (🎨 크기 축소, 코너 밀착 및 동글한 시스템 폰트 적용)
function startCameraClock() {
    let cameraTimeText = document.getElementById('camera-time-text');
    if (!cameraTimeText) {
        cameraTimeText = document.createElement('div');
        cameraTimeText.id = 'camera-time-text';
        
        // 🌟 상단/좌측 여백을 30px에서 14px로 대폭 줄여 구석에 바짝 붙임
        cameraTimeText.style.position = 'absolute';
        cameraTimeText.style.top = '14px';
        cameraTimeText.style.left = '14px';
        cameraTimeText.style.color = 'white';
        
        // 🌟 크기를 24px에서 15px로 슬림하게 줄이고, 자간을 조여 귀여운 느낌 유도
        cameraTimeText.style.fontSize = '15px';
        cameraTimeText.style.fontWeight = '600';
        
        // 🌟 각진 기본 폰트 대신, 기기별 가장 둥글고 세련된 라운드형 시스템 폰트셋 부여
        cameraTimeText.style.fontFamily = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        cameraTimeText.style.letterSpacing = '-0.3px';
        cameraTimeText.style.zIndex = '12'; // 🌟 버그 방어막보다 위로 올리기 위해 12로 변경!
        if (cameraPage) {
            cameraPage.style.position = 'relative'; // 기준점 고정
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
    setInterval(updateClock, 1000); // 1초마다 촬영 대기화면 시간 업데이트
}

// 카메라 켜기 (🛠️ 중복 코드 완전 정리본)
async function startCamera() {
    if (cameraView.srcObject) {
        cameraView.srcObject.getTracks().forEach(track => track.stop());
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: true
        });

        // 1. 화면 출력용 비디오 태그 설정
        cameraView.srcObject = stream;
        
        // 2. 화면엔 거울처럼 보여주기 (CSS)
        if (currentFacingMode === "user") {
            cameraView.style.transform = "scaleX(-1)";
        } else {
            cameraView.style.transform = "scaleX(1)";
        }

        // 🌟 [사파리 일시정지 아이콘 방지] 투명 터치 방어막 레이어 삽입
        let safariShield = document.getElementById('safari-shield');
        if (!safariShield) {
            safariShield = document.createElement('div');
            safariShield.id = 'safari-shield';
            safariShield.style.position = 'absolute';
            safariShield.style.top = '0';
            safariShield.style.left = '0';
            safariShield.style.width = '100%';
            safariShield.style.height = '100%';
            safariShield.style.backgroundColor = 'transparent';
            safariShield.style.zIndex = '1'; // 비디오 바로 위에 낮게 배치
            
            if (cameraView.parentElement) {
                cameraView.parentElement.style.position = 'relative';
                cameraView.parentElement.appendChild(safariShield);
            }
        }

        // 🛠️ 버튼이 원래 CSS 디자인 위치를 유지하면서 방어막 레이어만 뚫고 올라오도록 셋업
        if (recordBtn) recordBtn.style.zIndex = '10';
        if (switchCameraBtn) switchCameraBtn.style.zIndex = '10';

        // 3. 녹화용 캔버스 설정
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 비디오 메타데이터가 로드되어 '실제 화면 해상도'를 알 수 있을 때 캔버스 크기 세팅
        cameraView.onloadedmetadata = () => {
            canvas.width = cameraView.videoWidth;
            canvas.height = cameraView.videoHeight;
        };

        // 매 프레임마다 캔버스에 그리기
        function drawFrame() {
            if (cameraView.paused || cameraView.ended || !canvas.width) {
                requestAnimationFrame(drawFrame);
                return;
            }
            
            // 아이폰 화면 회전 등으로 인해 실시간으로 해상도가 변할 경우 대응
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
        
        // 비디오가 재생될 때 캔버스 드로잉 시작
        cameraView.onplay = drawFrame;

        // 4. 캔버스 스트림을 녹화
        const canvasStream = canvas.captureStream(30);
        canvasStream.addTrack(stream.getAudioTracks()[0]);

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(canvasStream, options);

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
        console.error("카메라 에러:", error);
        alert("카메라 혹은 마이크 권한을 허용해주세요!");
    }
}

// IndexedDB에 영상을 저장하는 함수 (촬영 시간 데이터 포함)
function saveVideoToDB(blob, altitude, recordTime) {
    return new Promise((resolve) => {
        const transaction = db.transaction(["videos"], "readwrite");
        const store = transaction.objectStore("videos");
        const request = store.add({ videoBlob: blob, altitudeText: altitude, recordTime: recordTime });
        request.onsuccess = (e) => resolve(e.target.result);
    });
}

// IndexedDB에서 고유 ID로 영상을 삭제하는 함수
function deleteVideoFromDB(id) {
    return new Promise((resolve) => {
        const transaction = db.transaction(["videos"], "readwrite");
        const store = transaction.objectStore("videos");
        const request = store.delete(id);
        request.onsuccess = () => resolve();
    });
}

// 디비에 저장되어 있던 영상들을 화면에 쭉 로드하는 함수
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

// 화면에 비디오 슬라이드 칸을 생성해주는 함수 (🎨 슬라이드 내 시간 자막도 대기화면과 똑같이 미니멀화)
function addVideoSlideToUI(blob, altitude, id, recordTime) {
    const videoURL = URL.createObjectURL(blob);

    const newSlide = document.createElement('div');
    newSlide.className = 'slide-page';
    newSlide.style.position = 'relative'; // 자막 배치를 위한 기준점 설정

    const newVideo = document.createElement('video');
    newVideo.src = videoURL;
    newVideo.className = 'saved-video';

    newVideo.muted = true;
    newVideo.playsInline = true;
    newVideo.setAttribute('playsinline', '');
    newVideo.controls = true;
    newVideo.loop = true;

    // 중앙 고도 자막 레이어
    const newOverlay = document.createElement('div');
    newOverlay.className = 'altitude-overlay';
    newOverlay.innerHTML = `<span>${altitude}</span>`;

    // 🌟 [스타일 수정] 영상 내부 왼쪽 상단 시간 자막 레이어 생성
    const timeOverlay = document.createElement('div');
    timeOverlay.className = 'time-overlay';
    
    // 🌟 대기화면 시계와 매커니즘 및 콤팩트 스타일 일치 (구석 밀착 및 크기 축소)
    timeOverlay.style.position = 'absolute';
    timeOverlay.style.top = '14px';
    timeOverlay.style.left = '14px';
    timeOverlay.style.color = 'white';
    timeOverlay.style.fontSize = '15px';
    timeOverlay.style.fontWeight = '600';
    timeOverlay.style.fontFamily = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    timeOverlay.style.letterSpacing = '-0.3px';
    timeOverlay.style.zIndex = '10';

    // 기존 데이터에 시간이 없으면 현재 시간으로 방어 처리
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
    newSlide.appendChild(timeOverlay); // 🌟 슬라이드 박스에 시간 자막 추가!
    newSlide.appendChild(deleteBtn);

    sliderWrapper.style.transition = 'none';
    sliderWrapper.insertBefore(newSlide, cameraPage);

    totalSlides++;
    currentSlideIndex++;
    updateSliderPosition();

    sliderWrapper.offsetHeight;
    sliderWrapper.style.transition = 'transform 0.3s ease-out';
}

// 슬라이드가 이동할 때 현재 화면의 비디오만 깨워서 재생시키는 로직
function updateSliderPosition() {
    sliderWrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

    const slides = sliderWrapper.children;
    for (let i = 0; i < slides.length; i++) {
        const video = slides[i].querySelector('.saved-video');
        if (video) {
            if (i === currentSlideIndex) {
                video.load();
                video.play().catch(err => console.log("자동재생 정책 우회 중: ", err));
            } else {
                video.pause();
            }
        }
    }
}

// 실시간 고도 측정
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

// REC 버튼
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

// 카메라 뒤집기 버튼
switchCameraBtn.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    startCamera();
});

// 손가락/마우스 슬라이드 스와이프
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
// 비디오 캔버스 병합 인코더 시스템
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
                'video/mp4',
                'video/quicktime'          
            ];
            for (const type of appleFriendlyTypes) {
                if (MediaRecorder.isTypeSupported(type)) return type;
            }
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9';
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
            
            if (actualMime.includes('webm')) {
                extension = 'webm';
            } else if (actualMime.includes('quicktime')) {
                extension = 'mov';
            }

            const finalBlob = new Blob(encodedChunks, { type: actualMime || 'video/mp4' });
            const finalVideoURL = URL.createObjectURL(finalBlob);

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0'); 
            const day = String(now.getDate()).padStart(2, '0');
            const formattedDate = `${year}.${month}.${day}`;

            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = finalVideoURL;
            
            downloadAnchor.download = `${formattedDate} 등산log.${extension}`;
            downloadAnchor.click();

            if (extension === 'webm') {
                alert("⚠️ 현재 브라우저가 MP4 녹화를 지원하지 않아 WebM으로 다운로드되었습니다. 맥북 QuickTime 대신 Chrome 브라우저나 VLC 플레이어를 이용해 주세요.");
            }

            totalDownloadBtn.disabled = false;
            totalDownloadBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4M7 10l5 5 5-5M12 15V3"/>
                </svg><span>등산log 다운로드</span>`;
        };

        canvasRecorder.start();

        for (const item of savedList) {
            hiddenVideo.src = URL.createObjectURL(item.videoBlob);

            await new Promise((resolve) => {
                hiddenVideo.onloadeddata = resolve; 
            });
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

                ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;

                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
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

// 앱 시작 초기화
async function initApp() {
    await initDatabase();
    loadSavedVideos();
    await startCamera();
    startCameraClock(); 

    altitudeText.innerText = "⛰️ 초기 고도 측정 중...";
    getRealAltitude();
}

initApp();
