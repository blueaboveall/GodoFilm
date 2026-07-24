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
let currentProject = null;
let projects = JSON.parse(localStorage.getItem("climbingProjects") || "[]");

const availableDesigns = {
  "소래산": { "산 정상": "bg-sorae-peak.png" },
  "배봉산": { "크래프트 (영어)": "bg-baebong-craft-english.png" },
  "수락산": { "산 정상": "bg-surak-peak.png" },
  "구름산": { "크래프트 (한글)": "bg-gooreum-craft-korean.png" },
  "미륵산": { "산 정상": "bg-mireuk-peak.png" }
};

// [개선 1] 각 산에 활성화할 디자인을 '배열(Array)'로 매핑 (1개 이상 확장 가능)
const mountainDesignMap = {
  "소래산": ["산 정상"],
  "배봉산": ["크래프트 (영어)"],
  "수락산": ["산 정상"],
  "구름산": ["크래프트 (한글)"],
  "미륵산": ["산 정상"]
};

// [개선 2] 이모지, 괄호, 공백을 모두 제거하고 순수 텍스트만 추출하는 정교한 유틸리티
function normalizeText(text) {
  if (!text) return '';
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\(준비 중\)/g, '')
    .replace(/[\s()]/g, '')
    .trim();
}

// 셀 기본 스타일 강제 적용 함수
function applyCellLayoutStyles(cell) {
  cell.style.display = "flex";
  cell.style.alignItems = "center";
  cell.style.justifyContent = "center";
  cell.style.textAlign = "center";
  cell.style.boxShadow = "none";
  cell.style.webkitBoxShadow = "none";
  cell.style.filter = "none";
}

// ==========================================
// 2. DOMContentLoaded (UI 초기화 및 이벤트)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const openModalBtn = document.getElementById("open-modal-btn");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const projectModal = document.getElementById("project-modal");
  const createProjectSubmitBtn = document.getElementById("create-project-submit-btn");
  const projectNameInput = document.getElementById("project-name-input");
  const projectGrid = document.querySelector(".project-grid");
  const mainContainer = document.getElementById("main-container");
  const homeView = document.getElementById("home-view");
  const cameraPageView = document.getElementById("camera-page-view");
  const backToHomeBtn = document.getElementById("back-to-home-btn");

  // DOM 로드 시 초기 셀 원본 이름 보존
  const allSelectCells = document.querySelectorAll('.select-cell');
  allSelectCells.forEach(cell => {
    applyCellLayoutStyles(cell);
    const rawName = cell.innerText;
    const cleanBaseName = rawName.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').replace(/\(준비 중\)/g, '').trim();
    cell.setAttribute('data-base-name', cleanBaseName);
    cell.innerText = cleanBaseName;
  });

  // [개선 3] 산 선택 시 해당 산에 맞는 디자인만 동적으로 활성화하는 핵심 함수
  function updateDesignOptions(selectedMountain) {
    const cellGroups = document.querySelectorAll('.horizontal-cell-group');
    if (cellGroups.length < 2) return;

    const designGroup = cellGroups[1];
    const designCells = designGroup.querySelectorAll('.select-cell');

    const cleanSelectedMountain = selectedMountain ? normalizeText(selectedMountain) : null;

    // 선택된 산의 허용 디자인 목록 찾아오기
    let allowedDesigns = [];
    if (cleanSelectedMountain) {
      for (const [mName, designs] of Object.entries(mountainDesignMap)) {
        if (normalizeText(mName) === cleanSelectedMountain) {
          allowedDesigns = designs.map(d => normalizeText(d));
          break;
        }
      }
    }

    designCells.forEach(cell => {
      applyCellLayoutStyles(cell);
      const baseName = cell.getAttribute('data-base-name') || normalizeText(cell.innerText);
      const cleanCellName = normalizeText(baseName);

      // 1. 산이 선택되지 않은 상태 -> 모든 디자인 아이콘 활성화
      if (!selectedMountain) {
        cell.innerText = baseName;
        cell.classList.remove('disabled');
        cell.style.opacity = '1';
        cell.style.pointerEvents = 'auto';
      } 
      // 2. 특정 산 선택 상태 -> 허용 목록에 있는 디자인만 활성화, 나머지는 (준비 중)
      else {
        if (allowedDesigns.includes(cleanCellName)) {
          cell.innerText = baseName;
          cell.classList.remove('disabled');
          cell.style.opacity = '1';
          cell.style.pointerEvents = 'auto';
        } else {
          cell.innerText = `${baseName} (준비 중)`;
          cell.classList.add('disabled');
          cell.classList.remove('active');
          cell.style.opacity = '0.35';
          cell.style.pointerEvents = 'none';
        }
      }
    });
  }

  // 가로 셀 선택 클릭 이벤트 (산 / 디자인 선택)
  const cellGroups = document.querySelectorAll('.horizontal-cell-group');
  cellGroups.forEach((group, groupIndex) => {
    group.addEventListener('click', (e) => {
      const targetCell = e.target.closest('.select-cell');
      if (!targetCell || targetCell.classList.contains('disabled')) return;

      group.querySelectorAll('.select-cell').forEach(cell => {
        cell.classList.remove('active');
        applyCellLayoutStyles(cell);
      });

      targetCell.classList.add('active');
      applyCellLayoutStyles(targetCell);

      // 산(첫 번째 그룹)을 클릭했을 때 해당 산의 매핑 디자인 업데이트
      if (groupIndex === 0) {
        const selectedMountain = targetCell.getAttribute('data-base-name') || targetCell.innerText;
        updateDesignOptions(selectedMountain);
      }
    });
  });

  // 프로젝트 목록 리렌더링
  function renderProjects() {
    if (!projectGrid) return;
    projectGrid.innerHTML = "";

    if (!db) {
      renderCards([]);
      return;
    }

    const transaction = db.transaction(["videos"], "readonly");
    const store = transaction.objectStore("videos");
    const request = store.getAll();

    request.onsuccess = function (e) {
      const allVideos = e.target.result || [];
      renderCards(allVideos);
    };

    function renderCards(allVideos) {
      const latestProjects = [...projects].reverse();
      latestProjects.forEach((proj, index) => {
        const originalIndex = projects.length - 1 - index;
        const card = document.createElement("div");
        card.className = "project-card";

        const pictureBox = document.createElement("div");
        pictureBox.className = "mountain-pic-box";

        const projectVideos = allVideos.filter(item => item.projectid === proj.id);
        if (projectVideos.length > 0) {
          const firstVideo = projectVideos[0];
          const safeBlob = new Blob([firstVideo.videoBlob], { type: firstVideo.videoBlob.type || 'video/mp4' });
          const videoURL = URL.createObjectURL(safeBlob);
          const videoThumbnail = document.createElement("video");
          videoThumbnail.src = videoURL;
          videoThumbnail.preload = "metadata";
          videoThumbnail.muted = true;
          videoThumbnail.playsInline = true;
          videoThumbnail.style.width = "100%";
          videoThumbnail.style.height = "100%";
          videoThumbnail.style.objectFit = "cover";
          videoThumbnail.currentTime = 0.1;
          if ((firstVideo.facingMode || "user") === "user") {
            videoThumbnail.style.transform = "scaleX(-1)";
          }
          pictureBox.appendChild(videoThumbnail);
        } else {
          const mountainTag = document.createElement("div");
          mountainTag.className = "mountain-tag";
          mountainTag.innerText = proj.mountain;
          pictureBox.appendChild(mountainTag);
        }

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

        const menuTrigger = document.createElement("div");
        menuTrigger.className = "menu-trigger";
        menuTrigger.innerHTML = '&#8942;';

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

        deleteItem.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm("프로젝트를 삭제하시겠습니까? \n관련 영상도 모두 완전히 삭제됩니다.")) {
            const targetProjectId = projects[originalIndex].id;
            projects.splice(originalIndex, 1);
            localStorage.setItem("climbingProjects", JSON.stringify(projects));
            await deleteProjectVideos(targetProjectId);
            renderProjects();
          }
        });

        card.addEventListener("click", (e) => {
          if (e.target.closest(".menu-trigger")) return;
          if (e.target.closest(".project-menu-popup")) return;
          if (e.target.closest(".project-title")) return;

          currentProject = proj;
          loadSavedVideos(currentProject.id);

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
  }

  window.refreshProjectGrid = renderProjects;

  if (openModalBtn) {
    openModalBtn.addEventListener("click", () => {
      if (projectModal) {
        projectModal.style.display = "flex";
        projectModal.classList.add("show");

        document.querySelectorAll('.horizontal-cell-group .select-cell').forEach(cell => {
          cell.classList.remove('active');
        });

        if (projectNameInput) projectNameInput.value = "";
        updateDesignOptions(null);
      }
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (projectModal) {
        projectModal.classList.remove("show");
        projectModal.style.display = "none";
      }
    });
  }

  if (projectModal) {
    projectModal.addEventListener("click", (e) => {
      if (e.target === projectModal) {
        projectModal.classList.remove("show");
        projectModal.style.display = "none";
      }
    });
  }

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
      }
      currentProject = null;
      renderProjects();
    });
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".project-menu-popup").forEach(menu => {
      menu.style.display = "none";
    });
  });

  if (createProjectSubmitBtn) {
    createProjectSubmitBtn.addEventListener("click", () => {
      const name = projectNameInput ? projectNameInput.value.trim() : "";
      const cellGroups = document.querySelectorAll('.horizontal-cell-group');
      let mountain = "";
      let design = "";

      if (cellGroups.length >= 2) {
        const activeMountain = cellGroups[0].querySelector('.select-cell.active');
        if (activeMountain) {
          mountain = activeMountain.getAttribute('data-base-name') || activeMountain.innerText.trim();
        }

        const activeDesign = cellGroups[1].querySelector('.select-cell.active');
        if (activeDesign) {
          design = activeDesign.getAttribute('data-base-name') || activeDesign.innerText.trim();
        }
      }

      if (!name) { alert("프로젝트 이름을 입력해주세요!"); return; }
      if (!mountain) { alert("등산하실 산을 선택해주세요!"); return; }
      if (!design) { alert("배경 디자인을 선택해주세요!"); return; }

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
      document.querySelectorAll('.select-cell.active').forEach(cell => cell.classList.remove('active'));

      if (projectModal) {
        projectModal.classList.remove("show");
        projectModal.style.display = "none";
      }

      renderProjects();
    });
  }

  renderProjects();
});

// ==========================================
// 3. 미디어 및 기타 유틸리티 함수
// ==========================================
function getSupportedMimeType() {
  const types = ['video/mp4', 'video/webm; codecs=vp9', 'video/webm'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("HikeCameraDB", 2);
    request.onupgradeneeded = function(e) {
      const database = e.target.result;
      if (database.objectStoreNames.contains("videos")) {
        database.deleteObjectStore("videos");
      }
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
  } catch (error) {
    console.error("카메라 작동 에러:", error);
    if (currentFacingMode === "environment") {
      currentFacingMode = "user";
      alert("후면 카메라 진입 제한으로 전면으로 우회 구동합니다. \n다시 한번 시도해 주세요.");
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
      facingMode: facingMode || "user"
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

function deleteProjectVideos(projectid) {
  return new Promise((resolve) => {
    if (!db) { resolve(); return; }
    const transaction = db.transaction(["videos"], "readwrite");
    const store = transaction.objectStore("videos");
    const request = store.openCursor();
    request.onsuccess = function(e) {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.projectid === projectid) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

function loadSavedVideos(projectid) {
  if (sliderWrapper) {
    const savedSlides = sliderWrapper.querySelectorAll(':scope > .slide-page:not(#camera-page)');
    savedSlides.forEach(slide => slide.remove());
  }
  totalSlides = 1;
  currentSlideIndex = 0;
  if (sliderWrapper) sliderWrapper.style.transform = 'translateX(0px)';

  return new Promise((resolve) => {
    if (!db) { resolve(); return; }
    const transaction = db.transaction(["videos"], "readonly");
    const store = transaction.objectStore("videos");
    const request = store.getAll();

    request.onsuccess = function(e) {
      const allVideos = e.target.result || [];
      const filteredVideos = allVideos.filter(item => item.projectid === projectid);
      filteredVideos.forEach(item => {
        addVideoSlideToUI(item.videoBlob, item.altitudeText, item.id, item.recordTime, false, item.facingMode || "user");
      });
      currentSlideIndex = totalSlides - 1;
      updateSliderPosition();
      resolve();
    };
  });
}

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
  newVideo.playsInline = true;
  newVideo.setAttribute('playsinline', '');
  newVideo.loop = true;

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
    if (confirm("이 영상을 삭제하시겠습니까?")) {
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
      altitudeText.innerText = "해발 " + Math.round(data.elevation[0]) + "m";
    } catch (error) {
      altitudeText.innerText = "고도 로딩 실패";
    }
  }, function() {
    altitudeText.innerText = "GPS 연결 실패";
  });
}

function executionRecord() {
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

    const savedId = await saveVideoToDB(recordedBlob, currentAltitude, recordTime, currentProject ? currentProject.id : null, currentFacingMode);
    addVideoSlideToUI(recordedBlob, currentAltitude, savedId, recordTime, true, currentFacingMode);
  };

  mediaRecorder.start(200);
  recordBtn.innerText = "녹화중";
  recordBtn.style.backgroundColor = "gray";
  recordBtn.style.borderColor = "gray";

  getRealAltitude();

  setTimeout(() => {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      recordBtn.innerText = "REC";
      recordBtn.style.backgroundColor = "red";
      recordBtn.style.borderColor = "white";
    }
  }, 3300);
}

if (recordBtn) {
  recordBtn.addEventListener('click', () => {
    if ((mediaRecorder && mediaRecorder.state === 'recording') || recordBtn.innerText.includes("초")) return;
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
      document.activeElement && document.activeElement.blur();
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
    if (cameraView && cameraView.srcObject) applyHardwareZoom(cameraView.srcObject, currentZoomScale);
    updateCameraTransformStyle();
    if (zoomMenu) zoomMenu.classList.remove('open');
  });
});

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
  const swipeDistanceX = touchStartX - touchEndX;
  const swipeDistanceY = touchStartY - touchEndY;
  if (Math.abs(swipeDistanceX) < 40 || Math.abs(swipeDistanceY) > 60) return;

  if (swipeDistanceX < -50 && currentSlideIndex > 0) {
    currentSlideIndex--;
    updateSliderPosition();
  }
  if (swipeDistanceX > 50 && currentSlideIndex < totalSlides - 1) {
    currentSlideIndex++;
    updateSliderPosition();
  }
}

function updateSliderPosition() {
  if (!sliderWrapper) return;
  sliderWrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  Array.from(sliderWrapper.children).forEach((slide, i) => {
    const video = slide.querySelector('.saved-video');
    if (video) {
      if (i === currentSlideIndex) {
        video.currentTime = 0;
        video.muted = false;
        video.play().catch(err => {
          console.log("Autoplay fallback muted mode:", err);
          video.muted = true;
          video.play().catch(e => console.log(e));
        });
      } else {
        video.pause();
        video.muted = true;
      }
    }
  });
}

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
      alert("아직 저장된 고도필름이 없습니다. \n먼저 영상을 촬영해 주세요!");
      return;
    }

    const originalBtnText = totalDownloadBtn.innerHTML;
    totalDownloadBtn.innerText = "고도필름 제작 시작...";
    totalDownloadBtn.disabled = true;

    const renderOverlay = document.createElement('div');
    renderOverlay.id = 'render-blur-overlay';
    renderOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(7, 7, 9, 0.85); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
      z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: white; font-family: -apple-system, sans-serif;
    `;

    const renderStatus = document.createElement('div');
    renderStatus.innerText = "고도필름 제작 중... (0%)";
    renderStatus.style.cssText = "font-size: 18px; font-weight: 600; margin-bottom: 20px; letter-spacing: -0.5px;";
    renderOverlay.appendChild(renderStatus);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1290;
      canvas.height = 2622;
      const ctx = canvas.getContext('2d');
      canvas.style.cssText = "width: 210px; height: 427px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); background: #1c1c1e;";

      renderOverlay.appendChild(canvas);
      document.body.appendChild(renderOverlay);

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
        const fileName = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일의 고도필름.mp4`;

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        renderOverlay.remove();
        totalDownloadBtn.innerHTML = originalBtnText;
        totalDownloadBtn.disabled = false;
      };

      canvasRecorder.start();

      const bgImg = new Image();
      let logBgUrl = "my-background.png";
      if (currentProject && availableDesigns[currentProject.mountain] && availableDesigns[currentProject.mountain][currentProject.design]) {
        logBgUrl = availableDesigns[currentProject.mountain][currentProject.design];
      }
      bgImg.src = logBgUrl;
      await new Promise((resolve) => { bgImg.onload = resolve; bgImg.onerror = resolve; });

      let bgSx = 0, bgSy = 0, bgSw = bgImg.naturalWidth, bgSh = bgImg.naturalHeight;
      if (bgImg.complete && bgImg.naturalWidth !== 0) {
        const canvasRatio = canvas.width / canvas.height;
        const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
        if (imgRatio > canvasRatio) {
          bgSw = bgImg.naturalHeight * canvasRatio;
          bgSx = (bgImg.naturalWidth - bgSw) / 2;
        } else {
          bgSh = bgImg.naturalWidth / canvasRatio;
          bgSy = (bgImg.naturalHeight - bgSh) / 2;
        }
      }

      const hiddenVideo = document.createElement('video');
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.setAttribute('playsinline', '');
      hiddenVideo.setAttribute('muted', '');
      hiddenVideo.style.cssText = "position: absolute; width: 1px; height: 1px; opacity: 0.01; pointer-events: none;";
      renderOverlay.appendChild(hiddenVideo);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const videoObjectUrl = URL.createObjectURL(item.videoBlob);
        hiddenVideo.src = videoObjectUrl;

        await new Promise((resolve) => { hiddenVideo.onloadeddata = resolve; });
        await hiddenVideo.play();

        let isCurrentVideoPlaying = true;
        hiddenVideo.onended = () => { isCurrentVideoPlaying = false; };

        const containerWidth = 1146;
        const containerHeight = 645;
        const videoX = (canvas.width - containerWidth) / 2;
        const videoY = (canvas.height - containerHeight) / 2;

        while (isCurrentVideoPlaying) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
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
            ctx.roundRect(videoX, videoY, containerWidth, containerHeight, 24);
          } else {
            ctx.rect(videoX, videoY, containerWidth, containerHeight);
          }
          ctx.clip();

          if ((item.facingMode || "user") === "user") {
            ctx.translate(videoX + containerWidth / 2, 0);
            ctx.scale(-1, 1);
            ctx.translate(-(videoX + containerWidth / 2), 0);
          }

          ctx.drawImage(hiddenVideo, offsetX, offsetY, drawWidth, drawHeight);
          ctx.restore();

          ctx.fillStyle = "white";
          ctx.font = "600 49px -apple-system, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(item.recordTime || "00:00", videoX + 22, videoY + 22);

          ctx.font = "bold 55px -apple-system, sans-serif";
          ctx.textBaseline = "middle";
          const cleanText = (item.altitudeText || "해발 0m").trim();
          const totalContentWidth = 48 + ctx.measureText(cleanText).width;
          const startX = (canvas.width - totalContentWidth) / 2;
          ctx.fillText(cleanText, startX + 48, videoY + (containerHeight / 2));

          const currentProgress = hiddenVideo.duration ? (hiddenVideo.currentTime / hiddenVideo.duration) : 0;
          const percent = Math.min(99, Math.round(((i + currentProgress) / items.length) * 100));

          renderStatus.innerText = `고도필름 제작 중... (${percent}%)`;
          totalDownloadBtn.innerText = `고도필름 제작 중... (${percent}%)`;

          await new Promise(requestAnimationFrame);
        }

        URL.revokeObjectURL(videoObjectUrl);
      }

      hiddenVideo.pause();
      hiddenVideo.src = "";
      hiddenVideo.load();
      hiddenVideo.remove();

      renderStatus.innerText = "파일 저장 중...";
      totalDownloadBtn.innerText = "파일 저장 중...";
      await new Promise(resolve => setTimeout(resolve, 500));

      canvasRecorder.stop();
    } catch (err) {
      console.error("전체 영상 생성 에러:", err);
      alert("필름 현상에 실패했습니다.");
      if (document.getElementById('render-blur-overlay')) {
        document.getElementById('render-blur-overlay').remove();
      }
      totalDownloadBtn.innerHTML = originalBtnText;
      totalDownloadBtn.disabled = false;
    }
  };
}

if (totalDownloadBtn) {
  totalDownloadBtn.addEventListener('click', generateTotalLogVideo);
}

// ==========================================
// 4. 앱 초기화 및 구동
// ==========================================
async function initApp() {
  await initDatabase();
  await loadSavedVideos("");
  startCameraClock();
  if (window.refreshProjectGrid) {
    window.refreshProjectGrid();
  }
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('fade-out');
    }
  }, 2800);
}

initApp();
