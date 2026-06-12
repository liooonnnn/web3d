// ==========================================================================
// Heritage 3D Curator Workspace - App Controller
// Handles URL routing, model-viewer bindings, uploader, annotations & reports
// ==========================================================================

// Preset Catalog Metadata Mapping
const presets = {
    wadang: {
        name: "8엽연화문와당 (소장번호: 18-1)",
        era: "삼국 시대 (백제)",
        desc: "백제 시대의 8엽연화문와당(수막새)입니다. 소장번호는 18-1이며, 지름 15.5cm, 두께 3.4cm 규격입니다. 태토는 고운 편이나 다량의 모래가 포함되어 있습니다. 연화색 기틀에 약간의 흑색조가 관찰되며, 중앙의 8엽 연화문양과 7과의 연자가 자리잡고 있습니다. 가장자리가 약간 파손된 흔적이 있어 사광 분석을 통해 보존 처리가 요구됩니다.",
        url: "https://modelviewer.dev/shared-assets/models/glTF-Sample-Assets/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb" // placeholder for detailed surface analysis
    },
    ewer: {
        name: "청자 주전자 (소장번호: 81)",
        era: "고려 시대 (추정)",
        desc: "고려 시대로 추정되는 청자 주전자(靑瓷酒煎子)입니다. 소장번호는 81이며, 높이 16.1cm, 구경 3.27cm, 굽지름 9.6cm 규격입니다. 녹청색 유약이 시유된 평저 바닥의 난형 몸체로, 주둥이가 길게 나 있고 구연부는 매우 좁으며 뚜껑받침이 있습니다. 손잡이가 부착되었던 흔적이 있으나 결실된 상태로 추정되어 접합면 정밀 분석이 필요합니다.",
        url: "https://modelviewer.dev/shared-assets/models/glTF-Sample-Assets/Models/Lantern/glTF-Binary/Lantern.glb" // placeholder for detailed parts structure
    }
};

// Global State
let activeModelKey = null;
let customModelBlobUrl = null;
let customModelName = "";

const hotspots = [];
let pendingHotspotPosition = null;
let pendingHotspotNormal = null;

// DOM Cache
let viewer;

// ==========================================================================
// Initialization & Router Setup
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
    viewer = document.getElementById('detail-viewer');
    
    initRouter();
    initUI();
    initViewerEvents();
});

// Client-side Hash Router
function initRouter() {
    const handleRoute = () => {
        const hash = window.location.hash || '#main';
        
        // Hide all views
        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.remove('active-view');
        });
        
        // Deactivate all nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Show matching view and update nav highlight
        if (hash === '#main') {
            document.getElementById('view-main').classList.add('active-view');
            document.getElementById('nav-link-main').classList.add('active');
        } 
        else if (hash === '#list') {
            document.getElementById('view-list').classList.add('active-view');
            document.getElementById('nav-link-list').classList.add('active');
        } 
        else if (hash === '#detail') {
            document.getElementById('view-detail').classList.add('active-view');
            document.getElementById('nav-link-detail').classList.add('active');
            
            // Fallback load: if detail view visited directly with no model loaded
            if (!viewer.src) {
                loadPresetModel('wadang');
            }
        }
        
        // Scroll view back to top
        const activeView = document.querySelector('.active-view');
        if (activeView) activeView.scrollTop = 0;
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // Run initial route on page load
}

// ==========================================================================
// Core UI Event Listeners
// ==========================================================================
function initUI() {
    // Nav Header click logo routes to main
    document.getElementById('brand-logo').addEventListener('click', () => {
        window.location.hash = '#main';
    });

    // Main Page Hero actions
    document.getElementById('btn-hero-upload').addEventListener('click', () => {
        document.getElementById('catalog-file-input').click();
    });

    // Catalog Preset Card clicks
    document.querySelectorAll('.catalog-card[data-preset]').forEach(card => {
        card.addEventListener('click', () => {
            const presetKey = card.dataset.preset;
            loadPresetModel(presetKey);
        });
    });

    // Catalog Search
    const searchInput = document.getElementById('catalog-search');
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.catalog-card[data-preset]').forEach(card => {
            const name = card.dataset.name.toLowerCase();
            const era = card.dataset.era.toLowerCase();
            if (name.includes(val) || era.includes(val)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });

    // File Upload Card
    const uploadCard = document.getElementById('catalog-upload-card');
    const fileInput = document.getElementById('catalog-file-input');

    uploadCard.addEventListener('click', () => fileInput.click());
    
    uploadCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadCard.classList.add('dragover');
    });
    
    uploadCard.addEventListener('dragleave', () => {
        uploadCard.classList.remove('dragover');
    });
    
    uploadCard.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadCard.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleLocalFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleLocalFileUpload(e.target.files[0]);
        }
    });

    // Detail Sidebar Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // model-viewer Toolbar Buttons
    document.getElementById('btn-vw-reset').addEventListener('click', resetCamera);
    
    const btnRotate = document.getElementById('btn-vw-rotate');
    btnRotate.addEventListener('click', () => {
        const auto = viewer.hasAttribute('auto-rotate');
        if (auto) {
            viewer.removeAttribute('auto-rotate');
            btnRotate.classList.remove('active');
        } else {
            viewer.setAttribute('auto-rotate', '');
            btnRotate.classList.add('active');
        }
    });

    document.getElementById('btn-vw-screenshot').addEventListener('click', captureScreenshot);

    // Sidebar Lighting Lab Inputs
    const sliderExposure = document.getElementById('render-exposure');
    sliderExposure.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-exposure').innerText = `${val.toFixed(1)}x`;
        viewer.exposure = val;
    });

    const sliderShadowIntensity = document.getElementById('render-shadow-intensity');
    sliderShadowIntensity.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-shadow-intensity').innerText = val.toFixed(1);
        viewer.shadowIntensity = val;
    });

    const sliderShadowSoftness = document.getElementById('render-shadow-softness');
    sliderShadowSoftness.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-shadow-softness').innerText = val.toFixed(2);
        viewer.shadowSoftness = val;
    });

    // Skybox Environment Prefabs
    const selectSkybox = document.getElementById('select-skybox');
    selectSkybox.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'default') {
            viewer.removeAttribute('skybox-image');
            viewer.environmentImage = '';
        } else if (val === 'legacy') {
            // Low light indoor environment
            viewer.environmentImage = 'legacy';
        } else if (val === 'sunset') {
            // High contrast golden sunlight environment
            viewer.environmentImage = 'https://modelviewer.dev/shared-assets/environments/spruit_sunrise_1k_hdr.hdr';
        }
    });

    // Hotspot Dialog Buttons
    document.getElementById('btn-anno-save').addEventListener('click', savePendingHotspot);
    document.getElementById('btn-anno-cancel').addEventListener('click', () => {
        document.getElementById('annotation-form').style.display = 'none';
        pendingHotspotPosition = null;
        pendingHotspotNormal = null;
        document.getElementById('txt-status').innerText = '주석 생성이 취소되었습니다.';
    });

    // Report Exporter
    document.getElementById('btn-export-report').addEventListener('click', exportReport);
}

// Switch Sidebar tabs
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });
}

// ==========================================================================
// 3D Model Load Actions
// ==========================================================================

// Load preconfigured library item
function loadPresetModel(key) {
    const data = presets[key];
    if (!data) return;

    activeModelKey = key;
    
    // Clear old blob reference if any
    if (customModelBlobUrl) {
        URL.revokeObjectURL(customModelBlobUrl);
        customModelBlobUrl = null;
        customModelName = "";
    }

    // Set model-viewer sources
    document.getElementById('txt-status').innerText = `'${data.name}' 리소스 로드 중...`;
    viewer.src = data.url;

    // Load active file display banner
    document.getElementById('active-filename').innerHTML = `<i class="fa-solid fa-cube text-gold"></i> ${data.name}`;

    // Fill metadata cards
    document.getElementById('detail-input-title').value = data.name;
    document.getElementById('detail-input-era').value = data.era;
    document.getElementById('detail-input-desc').value = data.desc;

    // Sync library highlight item
    document.querySelectorAll('.catalog-card[data-preset]').forEach(card => {
        card.classList.toggle('active', card.dataset.preset === key);
    });

    // Reset controls & Clear previous model's hotspots
    resetModelViewerState();

    // Route to workspace detail
    window.location.hash = '#detail';
    document.getElementById('txt-status').innerText = `'${data.name}' 모델 로드 완료.`;
}

// Local file upload handling (GLB)
function handleLocalFileUpload(file) {
    if (!file.name.endsWith('.glb')) {
        alert('이 시스템은 GLB 확장자 포맷만 로드 가능합니다.');
        return;
    }

    // Clear old uploader blob reference to save RAM
    if (customModelBlobUrl) {
        URL.revokeObjectURL(customModelBlobUrl);
    }

    activeModelKey = 'custom';
    customModelName = file.name;
    
    // Create direct RAM address for file
    customModelBlobUrl = URL.createObjectURL(file);
    viewer.src = customModelBlobUrl;

    // Update headers and text inputs
    document.getElementById('active-filename').innerHTML = `<i class="fa-solid fa-cloud-arrow-up text-gold"></i> ${file.name}`;
    document.getElementById('detail-input-title').value = file.name.replace('.glb', '');
    document.getElementById('detail-input-era').value = '사용자 업로드 스캔 데이터';
    document.getElementById('detail-input-desc').value = `로컬 드라이브에서 업로드된 3D 스캔 데이터 파일입니다.\n\n파일명: ${file.name}\n용량: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    resetModelViewerState();
    
    window.location.hash = '#detail';
    document.getElementById('txt-status').innerText = `스캔 데이터 '${file.name}' 업로드 완료.`;
}

// Clean UI variables when loading new 3D models
function resetModelViewerState() {
    // Delete hot buttons from model-viewer DOM
    document.querySelectorAll('.hotspot-marker').forEach(btn => btn.remove());
    hotspots.length = 0;
    
    updateHotspotListUI();
    resetCamera();

    // Close annotation form
    document.getElementById('annotation-form').style.display = 'none';
    pendingHotspotPosition = null;
    pendingHotspotNormal = null;

    // Reset default exposures in sliders
    document.getElementById('render-exposure').value = 1.0;
    document.getElementById('val-exposure').innerText = '1.0x';
    viewer.exposure = 1.0;

    document.getElementById('render-shadow-intensity').value = 1.0;
    document.getElementById('val-shadow-intensity').innerText = '1.0';
    viewer.shadowIntensity = 1.0;

    document.getElementById('render-shadow-softness').value = 0.5;
    document.getElementById('val-shadow-softness').innerText = '0.5';
    viewer.shadowSoftness = 0.5;

    document.getElementById('select-skybox').value = 'default';
    viewer.removeAttribute('skybox-image');
    viewer.environmentImage = '';
}

// Reset camera to default orientation
function resetCamera() {
    viewer.cameraOrbit = "45deg 75deg auto";
    viewer.cameraTarget = "auto auto auto";
}

// ==========================================================================
// model-viewer Double Click Event & Hotspots Placement
// ==========================================================================
function initViewerEvents() {
    // Double click to place hotspot
    viewer.addEventListener('dblclick', (e) => {
        // Calculate coordinates relative to model-viewer bounds
        const rect = viewer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Query model-viewer ray intersect position & normal vector
        const hit = viewer.positionAndNormalFromPoint(x, y);
        if (hit) {
            pendingHotspotPosition = hit.position.toString();
            pendingHotspotNormal = hit.normal.toString();

            // Open input form tab
            document.getElementById('annotation-form').style.display = 'block';
            document.getElementById('anno-title').value = '';
            document.getElementById('anno-desc').value = '';
            document.getElementById('anno-title').focus();

            switchTab('tab-annos');
            document.getElementById('txt-status').innerText = '핫스팟 위치 탐지 완료. 상세 보존 상태를 적어주세요.';
        }
    });
}

// Save hotspot from dialog fields
function savePendingHotspot() {
    const title = document.getElementById('anno-title').value.trim();
    const desc = document.getElementById('anno-desc').value.trim();

    if (!title) {
        alert('진단 명칭(제목)을 입력해주세요.');
        return;
    }

    const id = Date.now().toString();
    const index = hotspots.length + 1;

    // Create marker button tag conforming to model-viewer HTML slot specs
    const btn = document.createElement('button');
    btn.className = 'hotspot-marker';
    btn.innerText = index;
    btn.slot = `hotspot-${id}`;
    btn.setAttribute('data-position', pendingHotspotPosition);
    btn.setAttribute('data-normal', pendingHotspotNormal);
    
    // Add fly-to zoom focus on click
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusOnHotspot(id);
    });

    // Append directly as child of model-viewer
    viewer.appendChild(btn);

    // Save metadata
    const data = {
        id,
        index,
        title,
        desc,
        position: pendingHotspotPosition,
        normal: pendingHotspotNormal,
        element: btn
    };
    hotspots.push(data);

    // Clear variables
    document.getElementById('annotation-form').style.display = 'none';
    pendingHotspotPosition = null;
    pendingHotspotNormal = null;

    updateHotspotListUI();
    document.getElementById('txt-status').innerText = `[마커 ${index}] 주석 저장 완료.`;
}

// Draw lists of annotations in sidebar
function updateHotspotListUI() {
    const listContainer = document.getElementById('hotspots-list');
    document.getElementById('hotspots-count').innerText = hotspots.length;

    if (hotspots.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-map-pin"></i>
                <p>등록된 손상 진단 내역이 없습니다.<br>3D 모델 표면을 더블 클릭해 보세요.</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';
    hotspots.forEach(h => {
        const card = document.createElement('div');
        card.className = 'hotspot-card';
        card.id = `hotspot-card-${h.id}`;
        card.innerHTML = `
            <div class="hotspot-card-header">
                <span class="hotspot-card-title">
                    <span class="hotspot-card-index">${h.index}</span> ${h.title}
                </span>
            </div>
            <p class="hotspot-card-desc">${h.desc || '세부 진단 평문 기록이 비어있습니다.'}</p>
            <div class="hotspot-card-actions">
                <button class="fly-btn" onclick="event.stopPropagation(); window.focusOnHotspot('${h.id}')">
                    <i class="fa-solid fa-magnifying-glass-plus"></i> 상세 이동
                </button>
                <button class="delete-btn" onclick="event.stopPropagation(); window.deleteHotspot('${h.id}')">
                    <i class="fa-solid fa-trash-can"></i> 삭제
                </button>
            </div>
        `;
        card.addEventListener('click', () => focusOnHotspot(h.id));
        listContainer.appendChild(card);
    });
}

// Pan & Zoom model-viewer camera onto specific hotspot
function focusOnHotspot(id) {
    const h = hotspots.find(item => item.id === id);
    if (!h) return;

    // Toggle active markers styles
    hotspots.forEach(item => {
        item.element.classList.remove('active');
        const card = document.getElementById(`hotspot-card-${item.id}`);
        if (card) card.classList.remove('selected');
    });

    h.element.classList.add('active');
    const activeCard = document.getElementById(`hotspot-card-${h.id}`);
    if (activeCard) {
        activeCard.classList.add('selected');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Centering model-viewer target onto the 3D position
    // h.position format: "x_val m y_val m z_val m" (model-viewer native string coordinate)
    viewer.cameraTarget = h.position;

    // Move camera angle to face the hotspot closely
    // Format: "theta(azimuth) phi(polar) radius(distance)"
    // We can zoom in by reducing the radius
    viewer.cameraOrbit = `45deg 75deg 0.35m`;
    
    document.getElementById('txt-status').innerText = `[마커 ${h.index}] 지점으로 이동.`;
}
window.focusOnHotspot = focusOnHotspot; // Bind globally for onclick card callbacks

// Delete Hotspot
function deleteHotspot(id) {
    const idx = hotspots.findIndex(item => item.id === id);
    if (idx === -1) return;

    // Delete button tag
    hotspots[idx].element.remove();
    hotspots.splice(idx, 1);

    // Re-index remaining markers
    hotspots.forEach((h, i) => {
        h.index = i + 1;
        h.element.innerText = h.index;
    });

    updateHotspotListUI();
    document.getElementById('txt-status').innerText = '주석 핀이 해제되었습니다.';
}
window.deleteHotspot = deleteHotspot;

// ==========================================================================
// Snapshot Capture & Report Generation
// ==========================================================================

// Capture high resolution PNG snapshot of model-viewer
function captureScreenshot() {
    document.getElementById('txt-status').innerText = '스냅샷을 컴파일 중...';

    // Query native model-viewer data toBlob
    viewer.toBlob({ idealAspect: true }).then((blob) => {
        const url = URL.createObjectURL(blob);
        const title = document.getElementById('detail-input-title').value.trim().replace(/\s+/g, '_');
        
        const link = document.createElement('a');
        link.download = `Heritage3D_modelviewer_${title}_Snapshot.png`;
        link.href = url;
        link.click();
        
        // Cleanup reference
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        document.getElementById('txt-status').innerText = '스냅샷 다운로드 시작.';
    }).catch(err => {
        console.error(err);
        alert('스냅샷 생성 중 에러가 발생했습니다.');
    });
}

// Generate complete diagnostic curation Markdown report
function exportReport() {
    const title = document.getElementById('detail-input-title').value.trim();
    const era = document.getElementById('detail-input-era').value.trim();
    const desc = document.getElementById('detail-input-desc').value.trim();
    const author = document.getElementById('report-author').value.trim() || '기록되지 않음';
    const notes = document.getElementById('report-notes').value.trim() || '기록되지 않음';

    let md = `# 디지털 헤리티지 상태 정밀 보존 진단서\n\n`;
    md += `**■ 진단 보고 조사관:** ${author}\n`;
    md += `**■ 보고 일자:** ${new Date().toLocaleDateString('ko-KR')}\n\n`;
    md += `---\n\n`;

    md += `## 1. 분석 대상 유물 메타데이터\n`;
    md += `- **유물 지정 명칭:** ${title}\n`;
    md += `- **추정 고대 역사 연대:** ${era}\n`;
    md += `- **3D 뷰어 엔진:** Google @google/model-viewer WebXR AR Engine\n\n`;
    md += `**■ 역사/학술적 의의 개요:**\n> ${desc.replace(/\n/g, '\n> ')}\n\n`;
    md += `---\n\n`;

    md += `## 2. 조사관 종합 보존 판정 및 총평\n`;
    md += `${notes.replace(/\n/g, '\n')}\n\n`;
    md += `---\n\n`;

    md += `## 3. 정밀 관찰 주석 (3D Hotspots) 진단 일지 (${hotspots.length}개)\n`;
    if (hotspots.length === 0) {
        md += `*스캔본 표면에 기록된 마킹 포인트가 없습니다.*\n`;
    } else {
        hotspots.forEach(h => {
            md += `### [진단 마커 ${h.index}] ${h.title}\n`;
            md += `- **로컬 표면 3D 좌표:** ${h.position}\n`;
            md += `- **구체적 상태 소견:** ${h.desc || '소견이 작성되지 않았습니다.'}\n\n`;
        });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.download = `Heritage3D_Curation_Report_${title.replace(/\s+/g, '_')}.md`;
    link.href = url;
    link.click();
    
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    document.getElementById('txt-status').innerText = '상태 진단서 다운로드 완료.';
}
