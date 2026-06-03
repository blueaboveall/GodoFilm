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

// 실시간 촬영 대기화면 전용 시계 구동 함수
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
        cameraTimeText.style.zIndex = '10';
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

// 카메라 켜기
async function startCamera() {
    if (cameraView.srcObject) {
        cameraView.srcObject.getTracks().forEach(track => track.stop());
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: true
        });

        cameraView.srcObject = stream;
        
        if (currentFacingMode === "user") {
            cameraView.style.transform = "scaleX(-1)";
        } else {
            cameraView.style.transform = "scaleX(1)";
        }

        const videoTrack = stream.getVideoTracks()[0];
        const { width, height } = videoTrack.getSettings();
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        function drawFrame() {
            if (cameraView.paused || cameraView.ended) return;
            
            ctx.save();
            if (currentFacingMode === "user") {
                ctx.scale(-1, 1);
                ctx.drawImage(cameraView, -width, 0, width, height);
            } else {
                ctx.drawImage(cameraView, 0, 0, width, height);
            }
            ctx.restore();
            requestAnimationFrame(drawFrame);
        }
        
        cameraView.onplay = drawFrame;

        const canvasStream = canvas.captureStream(30);
        
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            canvasStream.addTrack(audioTracks[0]);
        }

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { 
            mimeType,
            audioBitsPerSecond: 128000
        } : {};
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
            const recordTime = `${String(now.getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
            const savedId = await saveVideoToDB(blob, currentAltitude, recordTime);
            addVideoSlideToUI(blob, currentAltitude, savedId, recordTime);
        };

    } catch (error) {
        console.error("카메라 에러:", error);
        alert("카메라 혹은 마이크 권한을 허용해주세요!");
    }
}

// IndexedDB에 영상을 저장하는 함수
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

// 디비에 저장되어 있던 영상들을 화면에 로드하는 함수
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

// 화면에 비디오 슬라이드 칸을 생성해주는 함수 (🎨 웹사이트 슬라이드 압축/찌그러짐 완전 해결 버전)
function addVideoSlideToUI(blob, altitude, id, recordTime) {
    const videoURL = URL.createObjectURL(blob);

    const newSlide = document.createElement('div');
    newSlide.className = 'slide-page';
    
    // 🌟 넘치는 세로 영상을 칼같이 잘라내기(Cut) 위해 슬라이드 상자에 넘침 숨김 처리 추가
    newSlide.style.position = 'relative'; 
    newSlide.style.overflow = 'hidden'; 

    const newVideo = document.createElement('video');
    newVideo.src = videoURL;
    newVideo.className = 'saved-video';

    // 🌟 [핵심 수정] 영상을 억지로 구겨 넣지 않고, 가로폭을 채운 뒤 넘치는 위아래는 싹둑 쳐내서(Cut) 원본 비율 유지
    newVideo.style.setProperty('width', '100%', 'important');
    newVideo.style.setProperty('height', '100%', 'important');
    newVideo.style.setProperty('object-fit', 'cover', 'important'); // 찌그러짐 방지 마법의 명령어
    newVideo.style.setProperty('object-position', 'center', 'important'); // 영상을 상자 정중앙에 정렬

    newVideo.muted = false; 
    newVideo.playsInline = true;
    newVideo.setAttribute('playsinline', '');
    newVideo.controls = true;
    newVideo.loop = true;

    // 중앙 고도 자막 레이어
    const newOverlay = document.createElement('div');
    newOverlay.className = 'altitude-overlay';
    newOverlay.innerHTML = `<span>${altitude}</span>`;

    // 영상 내부 왼쪽 상단 시간 자막 레이어 생성
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
// 슬라이드가 이동할 때 현재 화면의 비디오 처리
function updateSliderPosition() {
    sliderWrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

    const slides = sliderWrapper.children;
    for (let i = 0; i < slides.length; i++) {
        const video = slides[i].querySelector('.saved-video');
        if (video) {
            if (i === currentSlideIndex) {
                video.load();
                video.muted = false; 
                video.play().catch(err => console.log("자동재생 정책 우회 중: ", err));
            } else {
                video.pause();
                video.muted = true;  
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
// 비디오 캔버스 병합 인코더 시스템 (소리 강제 추출 및 자막 좌표 전면 교정)
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
        hiddenVideo.muted = false; 
        hiddenVideo.playsInline = true;
        hiddenVideo.setAttribute('playsinline', '');
        hiddenVideo.setAttribute('crossorigin', 'anonymous');
        hiddenVideo.preload = 'auto';

        const canvasStream = canvas.captureStream(30);
        const encodedChunks = [];

        // 🌟 [3번 문제 해결] 모바일 자동재생 보안 정책 우회용 AudioContext 소리 결합 로직
        let audioContext, audioDestination, mediaElementSource;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass();
            audioDestination = audioContext.createMediaStreamDestination();
            mediaElementSource = audioContext.createMediaElementSource(hiddenVideo);
            
            // 비디오 소리를 오디오 믹서로 보내고, 최종 녹화 스트림에 강제로 유입시킴
            mediaElementSource.connect(audioDestination);
            mediaElementSource.connect(audioContext.destination); // 모니터링용 링크
            
            const compiledAudioTrack = audioDestination.stream.getAudioTracks()[0];
            if (compiledAudioTrack) {
                canvasStream.addTrack(compiledAudioTrack);
            }
        } catch (audioErr) {
            console.log("웹 오디오 시스템 초기화 우회:", audioErr);
        }

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
            
            if (audioContext) audioContext.close();
        };

        canvasRecorder.start();

        for (const item of savedList) {
            hiddenVideo.src = URL.createObjectURL(item.videoBlob);

            await new Promise((resolve) => {
                hiddenVideo.onloadedmetadata = () => {
                    if (hiddenVideo.videoWidth > 0) resolve();
                    else hiddenVideo.onloadeddata = resolve;
                };
            });

            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            hiddenVideo.volume = 1.0;
            await hiddenVideo.play().catch(e => console.log("비디오 소리 트랙 활성화 우회 중:", e));

            let isCurrentVideoPlaying = true;
            hiddenVideo.onended = () => { isCurrentVideoPlaying = false; };

            while (isCurrentVideoPlaying) {
                ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

                // 1. 영상 상자 틀 고정 (가로폭 85%, 16:9 가로형 비율)
                const containerWidth = canvas.width * 0.85; 
                const containerHeight = containerWidth * (9 / 16); 
                const videoX = (canvas.width - containerWidth) / 2;
                const videoY = (canvas.height - containerHeight) / 2;

                const rawW = hiddenVideo.videoWidth || 720;
                const rawH = hiddenVideo.videoHeight || 1280;
                
                const realVideoWidth = Math.min(rawW, rawH);
                const realVideoHeight = Math.max(rawW, rawH);
                
                const drawWidth = containerWidth;
                const drawHeight = containerWidth * (realVideoHeight / realVideoWidth);
                
                const offsetX = videoX;
                const offsetY = videoY - (drawHeight - containerHeight) / 2;

                // 2. 영상 크롭해서 상자 안에 그리기
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(videoX, videoY, containerWidth, containerHeight, 20);
                ctx.clip(); 
                ctx.drawImage(hiddenVideo, offsetX, offsetY, drawWidth, drawHeight);
                ctx.restore();

                // 🌟 [2번 문제 해결 - 자막 대폭 교정]
                // 3. 시간 자막 그리기 (좌측 정렬 초기화 후 박스 내 안착, 가독성 확보를 위해 24px로 확대)
                ctx.save();
                ctx.font = "600 24px system-ui, -apple-system, sans-serif";
                ctx.fillStyle = "white";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                const displayTime = item.recordTime || "00:00";
                ctx.fillText(displayTime, videoX + 25, videoY + 25);
                ctx.restore();

                // 4. 고도 자막 그리기 (우측 쏠림 방지를 위한 타 정렬 차단 및 중앙 완전 일치 계산)
                ctx.save();
                ctx.font = "bold 38px sans-serif";
                ctx.fillStyle = "white";
                ctx.textAlign = "center";      // 기준 좌표로부터 완벽히 좌우 균등 분배 정렬
                ctx.textBaseline = "middle";    // 기준 좌표로부터 상하 위아래 정중앙 정렬
                
                // canvas.width / 2 = 360px (전체 가로의 딱 절반 중앙점)
                // videoY + (containerHeight / 2) = 영상 박스의 딱 상하 가운데 지점
                ctx.fillText(item.altitudeText, canvas.width / 2, videoY + (containerHeight / 2));
                ctx.restore();

                await new Promise(requestAnimationFrame);
            }
        }

        canvasRecorder.stop();
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
