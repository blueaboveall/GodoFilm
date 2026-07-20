// ==========================================
// 1. 전역 변수 및 DOM 요소 참조
// ==========================================
const cameraView = document.getElementById('camera-view');
const recordBtn = document.getElementById('record-btn');
const altitudeText = document.getElementById('altitude-text');
const sliderWrapper = document.getElementById('slider-wrapper');
const cameraPage = document.getElementById('camera-page');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const totalDownloadBtn = document.getElementById('total-download-btn');
const timerBtn = document.getElementById('timer-btn');
const timerMenu = document.getElementById('timer-menu');
const timerIconSvg = document.getElementById('timer-icon-svg');
const timerBtnText = document.getElementById('timer-btn-text');
const timerOptionBtns = document.querySelectorAll('.timer-option-btn');
const timerClearBtn = document.getElementById('timer-clear-btn');
const zoomBtn = document.getElementById('zoom-btn');
const zoomMenu = document.getElementById('zoom-menu');
const zoomBtnText = document.getElementById('zoom-btn-text');
const zoomOptionBtns = document.querySelectorAll('.zoom-option-btn');
const zoom05Btn = document.getElementById('zoom-05-btn');

let mediaRecorder;
let recordedChunks = [];
let currentSlideIndex = 0;
let totalSlides = 1;
let currentFacingMode = "user";
let db;
let selectedTimerSeconds = 0;
let currentZoomScale = 1.0;
let currentProject = null; // 현재 입장한 방(프로젝트) 정보

// 준비된 산 및 디자인 매핑 정보
const availableDesigns = {
  "소래산": {
    "산 정상": "bg-sorae-peak.png"
  },
  "배봉산": {
    "크래프트 (영어)": "bg-baebong-craft-english.png"
  },
  "수락산": {
    "산 정상": "bg-surak-peak.png"
  },
  "구름산": {
    "크래프트 (한글)": "bg-gooreum-craft-korean.png"
  },
  "미륵산": {
    "산 정상": "bg-mireuk-peak.png"
  }
};
const allDesigns = ["산 정상", "크래프트 (영어)", "크래프트 (한글)"];

// ==========================================
// 2. DOMContentLoaded (초기화 및 UI 이벤트)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const openModalBtn = document.getElementById("open-modal-btn");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const projectModal = document.getElementById("project-modal");
  const mountainTrigger = document.getElementById("mountain-trigger");
  const mountainOptions = document.getElementById("mountain-options");
  const designTrigger = document.getElementById("design-trigger");
  const designOptions = document.getElementById("design-options");
  const createProjectSubmitBtn = document.getElementById("create-project-submit-btn");
  const projectNameInput = document.getElementById("project-name-input");
  const projectGrid = document.querySelector(".project-grid");
  const mainContainer = document.getElementById("main-container");
  const homeView = document.getElementById("home-view");
  const cameraPageView = document.getElementById("camera-page-view");
  const backToHomeBtn = document.getElementById("back-to-home-btn");

  let projects = JSON.parse(localStorage.getItem("climbingProjects")) || [];

  // 프로젝트 목록 렌더링
  function renderProjects() {
    if (!projectGrid) return;
    projectGrid.innerHTML = "";
    const latestProjects = [...projects].reverse();
    latestProjects.forEach((proj, index) => {
      const originalIndex = projects.length - 1 - index;
      const card = document.createElement("div");
      card.className = "project-card";

      const pictureBox = document.createElement("div");
      pictureBox.className = "mountain-pic-box";

      const mountainTag = document.createElement("div");
      mountainTag.className = "mountain-tag";
      mountainTag.innerText = proj.mountain;
      pictureBox.appendChild(mountainTag);

      const info = document.createElement("div");
      info.className = "project-info";
      info.innerHTML = `
        <div class="project-title">${proj.name}</div>
        <div class="project-date">${proj.date}</div>
      `;

      const titleElement = info.querySelector('.project-title');

      function startEditing() {
        titleElement.contentEditable = "true";
        titleElement.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(titleElement);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      function saveEditing() {
        titleElement.contentEditable = "false";
        const newName = titleElement.innerText.trim();
        if (newName && newName !== proj.name) {
          projects[originalIndex].name = newName;
          localStorage.setItem("climbingProjects", JSON.stringify(projects));
        } else {
          titleElement.innerText = proj.name;
        }
      }

      titleElement.addEventListener("click", (e) => {
        e.stopPropagation();
        startEditing();
      });

      titleElement.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          titleElement.blur();
        }
      });

      titleElement.addEventListener("blur", saveEditing);

      // 더보기 버튼 및 팝업 메뉴
      const menuTrigger = document.createElement("div");
      menuTrigger.className = "menu-trigger";
      menuTrigger.innerHTML = '&#8942;'; // 세로 땡땡땡 기호
      
      const popup = document.createElement("div");
      popup.className = "project-menu-popup";

      const renameItem = document.createElement("div");
      renameItem.className = "menu-item";
      renameItem.innerHTML = '<span class="menu-text">이름 변경하기</span>';

      const deleteItem = document.createElement("div");
      deleteItem.className = "menu-item";
      deleteItem.innerHTML = '<span class="menu-text">삭제하기</span>';

      popup.appendChild(renameItem);
      popup.appendChild(deleteItem);

      menuTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".project-menu-popup").forEach(menu => {
          if (menu !== popup) menu.style.display = "none";
        });
        popup.style.display = popup.style.display === "block" ? "none" : "block";
      });

      renameItem.addEventListener("click", (e) => {
        e.stopPropagation();
        popup.style.display = "none";
        startEditing();
      });

      deleteItem.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("프로젝트를 삭제하시겠습니까?")) {
          projects.splice(originalIndex, 1);
          localStorage.setItem("climbingProjects", JSON.stringify(projects));
          renderProjects();
        }
      });

      // 카드 클릭 시 방 입장
      card.addEventListener("click", (e) => {
        if (e.target.closest(".menu-trigger")) return;
        if (e.target.closest(".project-menu-popup")) return;
        if (e.target.closest(".project-title")) return;

        currentProject = proj;
        loadSavedVideos(currentProject.id); // 입장 시 해당 프로젝트 영상만 불러오기

        let bgImageUrl = "my-background.png";
        if (availableDesigns[proj.mountain] && availableDesigns[proj.mountain][proj.design]) {
          bgImageUrl = availableDesigns[proj.mountain][proj.design];
        }

        if (homeView) homeView.style.display = "none";
        if (cameraPageView) cameraPageView.style.display = "flex";
        if (mainContainer) {
          mainContainer.classList.remove("home-mode");
          mainContainer.style.backgroundImage = `url('${bgImageUrl}')`;
        }
        startCamera();
        getRealAltitude();
      });

      card.appendChild(menuTrigger);
      card.appendChild(popup);
      card.appendChild(pictureBox);
      card.appendChild(info);
      projectGrid.appendChild(card);
    });
  }

  // 모달 열기
  if (openModalBtn) {
    openModalBtn.addEventListener("click", () => {
      if (projectModal) projectModal.style.display = "flex";
    });
  }

  // 모달 닫기
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (projectModal) projectModal.style.display = "none";
      if (mountainOptions) mountainOptions.classList.remove("show");
      if (designOptions) designOptions.classList.remove("show");
    });
  }

  // 홈으로 돌아가기
  if (backToHomeBtn) {
    backToHomeBtn.addEventListener("click", () => {
      if (cameraView && cameraView.srcObject) {
        cameraView.srcObject.getTracks().forEach(track => track.stop());
        cameraView.srcObject = null;
      }
      if (cameraPageView) cameraPageView.style.display = "none";
      if (homeView) homeView.style.display = "flex";
      if (mainContainer) {
        mainContainer.style.backgroundImage = "";
        mainContainer.classList.add("home-mode");
        currentProject = null;
      }
    });
  }

  // 산 드롭다운 토글
  if (mountainTrigger) {
    mountainTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (designOptions) designOptions.classList.remove("show");
      if (mountainOptions) mountainOptions.classList.toggle("show");
    });
  }

  // 디자인 드롭다운 토글
  if (designTrigger) {
    designTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (mountainOptions) mountainOptions.classList.remove("show");
      if (designOptions) designOptions.classList.toggle("show");
    });
  }

  // 디자인 옵션 업데이트
  function updateDesignOptions(selectedMountain) {
    if (!designOptions) return;
    designOptions.innerHTML = "";
    allDesigns.forEach(design => {
      const item = document.createElement("div");
      item.className = "option-item";
      const isAvailable = availableDesigns[selectedMountain] && availableDesigns[selectedMountain][design];
      if (isAvailable) {
        item.innerText = design;
        item.setAttribute("data-value", design);
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          designTrigger.innerText = design;
          designOptions.classList.remove("show");
        });
      } else {
        item.innerText = `${design} (준비중)`;
        item.classList.add("disabled");
      }
      designOptions.appendChild(item);
    });
  }

  // 산 선택 처리
  if (mountainOptions) {
    mountainOptions.querySelectorAll(".option-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const selectedMountain = item.getAttribute("data-value");
        mountainTrigger.innerText = selectedMountain;
        mountainOptions.classList.remove("show");
        designTrigger.innerText = "배경 선택하기";
        updateDesignOptions(selectedMountain);
      });
    });
  }

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener("click", () => {
    if (mountainOptions) mountainOptions.classList.remove("show");
    if (designOptions) designOptions.classList.remove("show");
    document.querySelectorAll(".project-menu-popup").forEach(menu => {
      menu.style.display = "none";
    });
  });

  // 새 프로젝트 완료 버튼 클릭 시
  if (createProjectSubmitBtn) {
    createProjectSubmitBtn.addEventListener("click", () => {
      const name = projectNameInput ? projectNameInput.value.trim() : "";
      const mountain = mountainTrigger ? mountainTrigger.innerText : "";
      const design = designTrigger ? designTrigger.innerText : "";

      if (!name) { alert("프로젝트 이름을 입력해주세요!"); return; }
      if (mountain === "산 선택하기") { alert("등산하실 산을 선택해주세요!"); return; }
      if (design === "배경 선택하기") { alert("디자인 배경을 선택해주세요!"); return; }

      const today = new Date();
      const formattedDate = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

      const newProject = {
        id: Date.now().toString(),
        name: name,
        mountain: mountain,
        design: design,
        date: formattedDate
      };

      projects.push(newProject);
      localStorage.setItem("climbingProjects", JSON.stringify(projects));

      if (projectNameInput) projectNameInput.value = "";
      if (mountainTrigger) mountainTrigger.innerText = "산 선택하기";
      if (designTrigger) designTrigger.innerText = "배경 선택하기";
      if (projectModal) projectModal.style.display = "none";
      renderProjects();
    });
  }

  renderProjects();
});

// ==========================================
// 3. 미디어 및 유틸리티 함수들
// ==========================================
function getSupportedMimeType() {
    // iOS 사파리 인코딩 충돌을 막기 위해 codecs=avc1 등의 엄격한 조건 제거
    const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    // 기존 1에서 2로 버전을 올려서 DB를 올바르게 재구축합니다.
    const request = indexedDB.open("Hike CameraDB", 2);
    request.onupgradeneeded = function(e) {
      const database = e.target.result;
      if (database.objectStoreNames.contains("videos")) {
        database.deleteObjectStore("videos"); // 꼬인 옛날 데이터 초기화
      }
      // autolncrement(오타) -> autoIncrement 로 정상 수정
      database.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = function(e) { db = e.target.result; resolve(); };
    request.onerror = function(e) { console.error("DB 에러", e); reject(); };
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
    cameraTimeText.style.zIndex = '12';
    cameraTimeText.style.fontFamily = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    if (cameraPage) {
      cameraPage.style.position = 'relative';
      cameraPage.appendChild(cameraTimeText);
    }
  }

  function updateClock() {
    const now = new Date();
    if (cameraTimeText) {
      cameraTimeText.innerText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
}

async function startCamera() {
    if (!cameraView) return;
    if (cameraView.srcObject) {
        cameraView.srcObject.getTracks().forEach(track => track.stop());
        cameraView.srcObject = null;
    }
    
    if (currentFacingMode === "user") {
        if (zoom05Btn) zoom05Btn.classList.add('hide-option');
        if (currentZoomScale === 0.5) currentZoomScale = 1.0;
        if (zoomBtnText) zoomBtnText.innerText = '1x';
    } else {
        if (zoom05Btn) zoom05Btn.classList.remove('hide-option');
    }
    
    try {
        const constraints = {
            audio: true,
            video: { 
                facingMode: currentFacingMode === "user" ? "user" : { exact: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraView.srcObject = stream;
        cameraView.muted = true;
        await cameraView.play();
        
        applyHardwareZoom(stream, currentZoomScale);
        updateCameraTransformStyle();
        
        if (recordBtn) recordBtn.style.zIndex = '30';
        if (switchCameraBtn) switchCameraBtn.style.zIndex = '30';

        // ✅ [수정] 이 위치에 있던 mediaRecorder 생성 로직을 전부 삭제했습니다.
        
    } catch (error) {
        console.error("카메라 작동 에러:", error);
        if (currentFacingMode === "environment") {
            currentFacingMode = "user";
            alert("후면 카메라 진입 제한으로 전면으로 우회 구동합니다.");
            startCamera();
        }
    }
}

function applyHardwareZoom(stream, zoomValue) {
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
    const capabilities = videoTrack.getCapabilities();
    if (capabilities.zoom) {
      const targetZoom = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, zoomValue));
      videoTrack.applyConstraints({ advanced: [{ zoom: targetZoom }] }).catch(err => console.log(err));
    }
  }
}

function updateCameraTransformStyle() {
  if (!cameraView) return;
  let baseScaleX = (currentFacingMode === "user") ? -1 : 1;
  let visualScale = currentZoomScale < 1.0 ? 1.0 : currentZoomScale;
  cameraView.style.transform = `scale(${baseScaleX * visualScale}, ${visualScale})`;
}

function saveVideoToDB(blob, altitude, recordTime, projectid, facingMode) {
 return new Promise((resolve, reject) => {
 if (!db) { resolve(null); return; }
 const transaction = db.transaction(["videos"], "readwrite");
 const store = transaction.objectStore("videos");
 const request = store.add({
 videoBlob: blob,
 altitudeText: altitude,
 recordTime: recordTime,
 projectid: projectid,
 facingMode: facingMode || "user" // ✅ 촬영 방향 정보 추가 저장
 });
 
 request.onsuccess = (e) => resolve(e.target.result);
 request.onerror = (e) => reject(e.target.error);
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

// 🔥 [요청 수정 반영 완료] 카메라 화면은 유지하고 프로젝트 전용 저장 영상 슬라이드만 제어하는 함수
function loadSavedVideos(projectid) {
 if (sliderWrapper) {
 const savedSlides = sliderWrapper.querySelectorAll(':scope > .slide-page:not(#camera-page)');
 savedSlides.forEach(slide => slide.remove());
 totalSlides = 1;
 currentSlideIndex = 0;
 sliderWrapper.style.transform = 'translateX(0px)';
 }
 return new Promise((resolve) => {
 if (!db) {
 resolve();
 return;
 }
 const transaction = db.transaction(["videos"], "readonly");
 const store = transaction.objectStore("videos");
 const request = store.getAll();
 
 request.onsuccess = function(e) {
 const allVideos = e.target.result || [];
 const filteredVideos = allVideos.filter(item => item.projectid === projectid);
 
 filteredVideos.forEach(item => {
 // ✅ 불러올 때 facingMode 정보(없으면 기본값 user) 전달
 addVideoSlideToUI(item.videoBlob, item.altitudeText, item.id, item.recordTime, false, item.facingMode || "user");
 });
 
 currentSlideIndex = totalSlides - 1;
 if (typeof updateSliderPosition === 'function') {
 updateSliderPosition();
 } else {
 sliderWrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
 }
 resolve();
 }; 
 });
}

// ✅ 파라미터 끝에 facingMode 추가
function addVideoSlideToUI(blob, altitude, id, recordTime, autoMove = true, facingMode = "user") {
 if (!sliderWrapper || !cameraPage) return;
 const safeBlob = new Blob([blob], { type: blob.type || 'video/mp4' });
 const videoURL = URL.createObjectURL(safeBlob);
 const newSlide = document.createElement('div');
 newSlide.className = 'slide-page';
 newSlide.style.position = 'relative';
const newVideo = document.createElement('video');
newVideo.src = videoURL;
newVideo.className = 'saved-video';
// muted 관련 설정 2줄 삭제! (자바스크립트로 부드럽게 제어할 예정입니다)
newVideo.playsInline = true;
newVideo.setAttribute('playsinline', '');
newVideo.loop = true;

 // ✅ 전면 카메라일 경우, 재생 화면을 좌우 반전 처리
 if (facingMode === "user") {
 newVideo.style.transform = 'scaleX(-1)';
 }

newVideo.addEventListener('click', (e) => {
    e.stopPropagation();
    if (newVideo.paused) {
        newVideo.play().catch(err => console.log(err));
    } else {
        newVideo.pause();
    }
});
 const newOverlay = document.createElement('div');
 newOverlay.className = 'altitude-overlay';
 newOverlay.innerHTML = `<span>${altitude}</span>`;
 newOverlay.style.pointerEvents = 'none';
 const timeOverlay = document.createElement('div');
 timeOverlay.className = 'time-overlay';
 timeOverlay.style.position = 'absolute';
 timeOverlay.style.top = '14px';
 timeOverlay.style.left = '14px';
 timeOverlay.style.color = 'white';
 timeOverlay.style.fontSize = '15px';
 timeOverlay.style.fontWeight = '600';
 timeOverlay.style.zIndex = '10';
 timeOverlay.style.pointerEvents = 'none';
 timeOverlay.innerHTML = `<span>${recordTime || '00:00'}</span>`;  
 const deleteBtn = document.createElement('button');
 deleteBtn.className = 'delete-btn';
 deleteBtn.setAttribute('aria-label', '영상 삭제');
 deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
 
 deleteBtn.addEventListener('click', async (e) => {
 e.stopPropagation();
 e.preventDefault();
 newVideo.pause();
 if (confirm("이 영상을 삭제하시겠습니까?"
 )) {
 await deleteVideoFromDB(id);
 newSlide.remove();
 totalSlides--;
 if (currentSlideIndex >= totalSlides) currentSlideIndex = totalSlides - 1;
 updateSliderPosition();
 } else {
 newVideo.play().catch(err => console.log(err));
 }
 });
 newSlide.appendChild(newVideo);
 newSlide.appendChild(newOverlay);
 newSlide.appendChild(timeOverlay);
 newSlide.appendChild(deleteBtn);
 sliderWrapper.style.transition = 'none';
 sliderWrapper.insertBefore(newSlide, cameraPage);
 totalSlides++;
 if (autoMove) currentSlideIndex++;
 updateSliderPosition();
 sliderWrapper.offsetHeight; 
 sliderWrapper.style.transition = 'transform 0.3s ease-out';
}

function getRealAltitude() {
  if (!altitudeText) return;
  navigator.geolocation.getCurrentPosition(async function(position) {
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}`);
      const data = await response.json();
      altitudeText.innerText = "⛰️해발 " + Math.round(data.elevation[0]) + "m";
    } catch (error) {
      altitudeText.innerText = "고도 로딩 실패";
    }
  }, function() {
    altitudeText.innerText = "GPS 연결 실패";
  });
}

function executionRecord() {
 // 카메라 뷰에 활성화된 스트림이 없으면 중단
 if (!cameraView || !cameraView.srcObject || !recordBtn) return;
 const stream = cameraView.srcObject;
 const mimeType = getSupportedMimeType();
 const options = mimeType ? { mimeType } : {};
 
 mediaRecorder = new MediaRecorder(stream, options);
 recordedChunks = [];
 mediaRecorder.ondataavailable = (e) => {
 if (e.data.size > 0) {
 recordedChunks.push(e.data);
 }
 };
 mediaRecorder.onstop = async () => {
 const recordedBlob = new Blob(recordedChunks, { 
 type: mediaRecorder.mimeType || 'video/mp4' 
 });
 recordedChunks = [];
 const currentAltitude = altitudeText ? altitudeText.innerText : "해발 0m";
 const now = new Date();
 const recordTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
 
 // ✅ currentFacingMode를 DB와 UI에 함께 전달
 const savedId = await saveVideoToDB(recordedBlob, currentAltitude, recordTime, currentProject ? currentProject.id : null, currentFacingMode);
 addVideoSlideToUI(recordedBlob, currentAltitude, savedId, recordTime, true, currentFacingMode);
 };
 
mediaRecorder.start(200); // 데이터 쪼개기: 200ms 단위로 데이터를 기록해 마지막 프레임 유실 방지
recordBtn.innerText = "녹화중";
recordBtn.style.backgroundColor = "gray";
recordBtn.style.borderColor = "gray";
getRealAltitude();

setTimeout(() => {
    if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    recordBtn.innerText = "REC";
    recordBtn.style.backgroundColor = "red";
    recordBtn.style.borderColor = "white";
}, 3300); // 3000 -> 3300으로 0.3초 늘려서 녹화 준비 딜레이 보상
}

if (recordBtn) {
    recordBtn.addEventListener('click', () => {
        // ✅ 수정됨: mediaRecorder가 존재하고 '녹화 중'일 때만 작동을 막음
        if ((mediaRecorder && mediaRecorder.state === 'recording') || 
            recordBtn.innerText.includes("초")) return;
            
        if (selectedTimerSeconds > 0) {
            let timeLeft = selectedTimerSeconds;
            recordBtn.innerText = `${timeLeft}초`;
            recordBtn.style.backgroundColor = "orange";
            
            const countdownInterval = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    executionRecord();
                } else {
                    recordBtn.innerText = `${timeLeft}초`;
                }
            }, 1000);
        } else {
            executionRecord();
        }
    });
}

if (switchCameraBtn) {
  switchCameraBtn.addEventListener('click', async () => {
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await startCamera();
  });
}

if (timerBtn) {
  timerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (zoomMenu) zoomMenu.classList.remove('open');
    if (timerMenu) {
      if (selectedTimerSeconds > 0) {
        if (timerClearBtn) {
          timerClearBtn.classList.remove('hide-option');
          timerClearBtn.style.display = 'inline-block';
        }
      } else {
        if (timerClearBtn) {
          timerClearBtn.classList.add('hide-option');
          timerClearBtn.style.display = 'none';
        }
      }
      timerMenu.classList.toggle('open');
    }
  });
}

if (timerClearBtn) {
  timerClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedTimerSeconds = 0;
    if (timerIconSvg) timerIconSvg.style.display = 'block';
    if (timerBtnText) timerBtnText.style.display = 'none';
    if (timerClearBtn) timerClearBtn.style.display = 'none';
    if (timerMenu) timerMenu.classList.remove('open');
  });
}

if (zoomBtn) {
  zoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (timerMenu) timerMenu.classList.remove('open');
    if (zoomMenu) zoomMenu.classList.toggle('open');
  });
}

timerOptionBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const secs = parseInt(btn.getAttribute('data-secs'));
    selectedTimerSeconds = secs;
    if (secs === 0) {
      if (timerIconSvg) timerIconSvg.style.display = 'block';
      if (timerBtnText) timerBtnText.style.display = 'none';
      if (timerClearBtn) timerClearBtn.style.display = 'none';
    } else {
      if (timerIconSvg) timerIconSvg.style.display = 'none';
      if (timerBtnText) {
        timerBtnText.innerText = `${secs}s`;
        timerBtnText.style.display = 'block';
      }
      if (timerClearBtn) timerClearBtn.style.display = 'block';
    }
    if (timerMenu) timerMenu.classList.remove('open');
  });
});

zoomOptionBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const zoomVal = parseFloat(btn.getAttribute('data-zoom'));
    currentZoomScale = zoomVal;
    if (zoomBtnText) zoomBtnText.innerText = `${zoomVal}x`;
    if (cameraView && cameraView.srcObject)
      applyHardwareZoom(cameraView.srcObject, currentZoomScale);
    updateCameraTransformStyle();
    if (zoomMenu) zoomMenu.classList.remove('open');
  });
});

// 터치/스와이프 처리
let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;
document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
});

document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipe();
});

document.addEventListener('mousedown', e => {
  touchStartX = e.screenX;
  touchStartY = e.screenY;
});

document.addEventListener('mouseup', e => {
  touchEndX = e.screenX;
  touchEndY = e.screenY;
  handleSwipe();
});

function handleSwipe() {
  // OCR 공백 결합 수정
  const swipeDistanceX = touchStartX - touchEndX;
  const swipeDistanceY = touchStartY - touchEndY;
  
  if (Math.abs(swipeDistanceX) < 40 || Math.abs(swipeDistanceY) > 60) return;
  
  // 오른쪽으로 화면을 밀었을 때 (이전 과거 영상 보기) - 빈 중괄호 버그 수정
  if (swipeDistanceX < -50 && currentSlideIndex > 0) {
    currentSlideIndex--;
    updateSliderPosition();
  }
  
  // 왼쪽으로 화면을 밀었을 때 (다음 영상 또는 카메라 화면으로 돌아가기)
  if (swipeDistanceX > 50 && currentSlideIndex < totalSlides - 1) {
    currentSlideIndex++;
    updateSliderPosition();
  }
}

function updateSliderPosition() {
  if (!sliderWrapper) return;
  // 중간 공백 및 오타 제거
  sliderWrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  
  Array.from(sliderWrapper.children).forEach((slide, i) => {
    const video = slide.querySelector('.saved-video');
    if (video) {
if (i === currentSlideIndex) {
    video.currentTime = 0;
    video.muted = false; // ✨ 화면에 보일 때 소리를 켭니다!
    video.play().catch(err => {
        // 브라우저 정책상 켜진 소리로 자동재생이 막히면 음소거로라도 재생되도록 폴백 처리
        console.log("Autoplay fallback muted mode:", err);
        video.muted = true; 
        video.play().catch(e => console.log(e));
        // 기존에 있던 video.pause(); 삭제 완료
    });
} else {
    video.pause();
    video.muted = true; // ✨ 안 보이는 영상은 혹시 모를 소리 겹침 방지를 위해 음소거
}
    }
  });
}

// 전체 합병 동영상 다운로드
async function generateTotalLogVideo() {
 if (!totalDownloadBtn) return;
 const transaction = db.transaction(["videos"], "readonly");
 const store = transaction.objectStore("videos");
 const request = store.getAll();
 request.onsuccess = async function(e) {
 let items = e.target.result || [];
 if (currentProject) {
 items = items.filter(item => item.projectid === currentProject.id);
 }
 if (!items || items.length === 0) {
 alert("아직 저장된 고도필름이 없습니다. 먼저 영상을 촬영해 주세요!");
 return;
 }
 const originalBtnText = totalDownloadBtn.innerHTML;
 totalDownloadBtn.innerText = "🎞️ 고도필름 제작 중...";
 totalDownloadBtn.disabled = true;
 try {
 const canvas = document.createElement('canvas');
 canvas.width = 1080;
 canvas.height = 1920;
 const ctx = canvas.getContext('2d');
 const canvasStream = canvas.captureStream(30);
 const mimeType = getSupportedMimeType();
 const options = mimeType ? { mimeType } : {};
 const canvasRecorder = new MediaRecorder(canvasStream, options);
 const chunks = [];
 canvasRecorder.ondataavailable = (ev) => {
 if (ev.data.size > 0) chunks.push(ev.data);
 };
 canvasRecorder.onstop = () => {
 const resultBlob = new Blob(chunks, { type: canvasRecorder.mimeType || 'video/mp4' });
 const downloadUrl = URL.createObjectURL(resultBlob);
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1; // 1월은 0으로 시작하므로 +1
const day = now.getDate();
const fileName = `${year}년 ${month}월 ${day}일의 고도필름.mp4`;

const a = document.createElement('a');
a.href = downloadUrl;
a.download = fileName; // 변경 완료!
document.body.appendChild(a); 
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(downloadUrl);
 totalDownloadBtn.innerHTML = originalBtnText;
 totalDownloadBtn.disabled = false;
 };
 canvasRecorder.start();
const bgImg = new Image(); // 변수명을 bgImg로 통일
let logBgUrl = "my-background.png";

if (currentProject && availableDesigns[currentProject.mountain] && availableDesigns[currentProject.mountain][currentProject.design]) {
    logBgUrl = availableDesigns[currentProject.mountain][currentProject.design];
}
bgImg.src = logBgUrl;
await new Promise((resolve) => {
    bgImg.onload = resolve;
    bgImg.onerror = resolve;
});

// 🔥 [수정] 변수명을 bgImg로 완벽히 통일한 Crop 좌표 계산
let bgSx = 0, bgSy = 0, bgSw = bgImg.naturalWidth, bgSh = bgImg.naturalHeight;
if (bgImg.complete && bgImg.naturalWidth !== 0) {
    const canvasRatio = canvas.width / canvas.height; // 1080 / 1920 = 0.5625
    const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;

    if (imgRatio > canvasRatio) {
        // 이미지가 캔버스 비율보다 가로로 더 넓은 경우 (좌우를 잘라냄)
        bgSw = bgImg.naturalHeight * canvasRatio;
        bgSx = (bgImg.naturalWidth - bgSw) / 2;
    } else {
        // 이미지가 캔버스 비율보다 세로로 더 긴 경우 (위아래를 잘라냄 - 현재 케이스)
        bgSh = bgImg.naturalWidth / canvasRatio;
        bgSy = (bgImg.naturalHeight - bgSh) / 2;
    }
}

for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const hiddenVideo = document.createElement('video');
    hiddenVideo.src = URL.createObjectURL(item.videoBlob);
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    
    await new Promise((resolve) => {
        hiddenVideo.onloadeddata = resolve;
    });
    await hiddenVideo.play();
    
    const containerWidth = 960;
    const containerHeight = 540;
    const videoX = (canvas.width - containerWidth) / 2;
    const videoY = (canvas.height - containerHeight) / 2;
    
    while (!hiddenVideo.ended && !hiddenVideo.paused) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 🔥 [수정] 강제로 늘리는 중복 코드를 삭제하고 정상적인 Crop 코드만 유지
        if (bgImg.complete && bgImg.naturalWidth !== 0) {
            ctx.drawImage(bgImg, bgSx, bgSy, bgSw, bgSh, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = "#1c1c1e";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        const targetRatio = containerWidth / containerHeight;
        const videoRatio = hiddenVideo.videoWidth / hiddenVideo.videoHeight;
        let drawWidth, drawHeight;
        
        if (videoRatio > targetRatio) {
            drawHeight = containerHeight;
            drawWidth = containerHeight * videoRatio;
        } else {
            drawWidth = containerWidth;
            drawHeight = containerWidth / videoRatio;
        }
        
        const offsetX = videoX - (drawWidth - containerWidth) / 2;
        const offsetY = videoY - (drawHeight - containerHeight) / 2;
 
 ctx.save();
 ctx.beginPath();
 if (ctx.roundRect) {
 ctx.roundRect(videoX, videoY, containerWidth, containerHeight, 20);
 } else {
 ctx.rect(videoX, videoY, containerWidth, containerHeight);
 }
 ctx.clip();

 // ✅ [핵심 추가] 전면 카메라 촬영본일 경우, 캔버스에 그릴 때 비디오 영역만 좌우 반전
 if ((item.facingMode || "user") === "user") {
 ctx.translate(videoX + containerWidth / 2, 0);
 ctx.scale(-1, 1);
 ctx.translate(-(videoX + containerWidth / 2), 0);
 }

 ctx.drawImage(hiddenVideo, offsetX, offsetY, drawWidth, drawHeight);
 ctx.restore();
 
 ctx.fillStyle = "white";
 ctx.font = "600 41px -apple-system, sans-serif";
 ctx.textAlign = "left";
 ctx.textBaseline = "top";
 ctx.fillText(item.recordTime || "00:00", videoX + 18, videoY + 18);
 ctx.font = "bold 46px -apple-system, sans-serif";
 ctx.textBaseline = "middle";
 const cleanText = (item.altitudeText || "해발 0m").trim();
 const totalContentWidth = 31 + 9 + ctx.measureText(cleanText).width;
 const startX = (canvas.width - totalContentWidth) / 2;
 ctx.fillText(cleanText, startX + 40, videoY + (containerHeight / 2));
 await new Promise(requestAnimationFrame);
 }
        URL.revokeObjectURL(hiddenVideo.src);
        hiddenVideo.remove();
    }
    
    // 마지막 영상이 끝난 후 프레임이 온전히 기록되도록 0.3초(300ms) 여유를 줍니다.
    await new Promise(resolve => setTimeout(resolve, 300));
    
    canvasRecorder.stop();
} catch (err) {
    console.error("전체 영상 생성 에러:", err);
 alert("동영상 생성을 실패했습니다.");
 totalDownloadBtn.innerHTML = originalBtnText;
 totalDownloadBtn.disabled = false;
 }
 };
}

if (totalDownloadBtn) {
  totalDownloadBtn.addEventListener('click', generateTotalLogVideo);
}

// 앱 실행 및 초기화
async function initApp() {
  await initDatabase();
  // 최초 로드 시에는 공백으로 호출
  await loadSavedVideos("");
  startCameraClock();
}

initApp();
