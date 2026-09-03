/**
 * GISManager
 * Leaflet-based map manager for Flow Stations with Clean Basemap & Official 850 Standard Watershed Boundaries
 * Enhanced with Dynamic Station Counts in all Filter Layer options & Real-time Diagnostic Pin Alerts (🚨 Pulse).
 */
class GISManager {
  constructor() {
    this.map = null;
    this.markersLayer = null;
    this.basinsLayer = null;
    this.allMarkers = [];
    this.currentStations = [];
    this.showBasins = true;
    this.filters = {
      region: "all",
      gaugeType: "all",
      installYear: "all",
      monitorStatus: "all", // "all", "normal", "abnormal"
      operatingOnly: false,
      floodOnly: false,
      droughtOnly: false,
      calibOnly: false,
      solarOnly: false,
      dualOnly: false,
      searchKeyword: ""
    };
  }

  init(containerId = "map") {
    if (this.map) return;

    // Center on South Korea
    this.map = L.map(containerId, {
      center: [36.3, 127.8],
      zoom: 7.5,
      zoomControl: true
    });

    // 1. Create Dedicated Basins Pane
    this.map.createPane("basinsPane");
    this.map.getPane("basinsPane").style.zIndex = 350;

    // 2. Base Tile Layers
    const esriGrayBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 16
    });

    const esriGrayLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      attribution: "",
      maxZoom: 16
    });

    const esriTopo = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 18
    });

    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    });

    const cleanLightGroup = L.layerGroup([esriGrayBase, esriGrayLabels]);
    cleanLightGroup.addTo(this.map);

    const baseMaps = {
      "심플 라이트 (추천)": cleanLightGroup,
      "지형 및 수계 지도": esriTopo,
      "일반 표준지도": osmLayer
    };

    L.control.layers(baseMaps, null, { position: "topleft" }).addTo(this.map);

    // 3. Render Real 850 Standard Watersheds
    this.initBasinsLayer();

    // 4. Render Station Markers on top
    this.markersLayer = L.layerGroup().addTo(this.map);

    this.renderMarkers();
  }

  initBasinsLayer() {
    const geojsonData = window.REAL_STANDARD_BASINS_GEOJSON;
    if (!geojsonData) {
      console.warn("REAL_STANDARD_BASINS_GEOJSON is not loaded yet.");
      return;
    }

    if (this.basinsLayer && this.map.hasLayer(this.basinsLayer)) {
      this.map.removeLayer(this.basinsLayer);
    }

    this.basinsLayer = L.geoJSON(geojsonData, {
      pane: "basinsPane",
      style: (feature) => {
        const c = feature.properties.color || "#3b82f6";
        return {
          color: c,
          weight: 1.2,
          opacity: 0.85,
          fillColor: c,
          fillOpacity: 0.08
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const title = props.name || "표준유역";
        const code = props.code || "";
        const area = props.area ? `${props.area.toLocaleString()} ㎢` : "-";
        const mainRiver = props.mainRiver || "-";

        layer.bindTooltip(`
          <div style="font-family:'Pretendard',sans-serif; font-size:12px; line-height:1.4;">
            <div style="font-weight:700; color:#1e3a8a;">🌊 ${title} <span style="font-size:10px; color:#64748b;">(${code})</span></div>
            <div style="color:#475569; font-size:11px;">본류: <b>${mainRiver}</b> | 면적: <b>${area}</b></div>
          </div>
        `, { sticky: true, className: 'basin-leaflet-tooltip' });

        layer.on("mouseover", () => {
          layer.setStyle({
            weight: 2.5,
            opacity: 1,
            fillOpacity: 0.2
          });
        });

        layer.on("mouseout", () => {
          this.basinsLayer.resetStyle(layer);
        });
      }
    });

    if (this.showBasins) {
      this.basinsLayer.addTo(this.map);
    }
  }

  toggleBasins(show) {
    this.showBasins = show;
    if (!this.map || !this.basinsLayer) return;

    if (show) {
      if (!this.map.hasLayer(this.basinsLayer)) {
        this.basinsLayer.addTo(this.map);
      }
    } else {
      if (this.map.hasLayer(this.basinsLayer)) {
        this.map.removeLayer(this.basinsLayer);
      }
    }
  }

  getRegionClass(region) {
    if (!region) return "pin-river-other";
    if (region.includes("한강")) return "pin-river-han";
    if (region.includes("낙동강")) return "pin-river-nakdong";
    if (region.includes("금강")) return "pin-river-geum";
    if (region.includes("영산강") || region.includes("섬진강")) return "pin-river-yeongsan";
    return "pin-river-other";
  }

  setStations(stations) {
    this.currentStations = stations || [];
    this.renderMarkers();
  }

  updateFilterLabelsWithCounts() {
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    if (!allStations || allStations.length === 0) return;
    const liveIssuesMap = window.liveIssuesMap || {};
    const totalCount = allStations.length;

    // 1. Region Counts
    let hanCount = 0, nakdongCount = 0, geumCount = 0, yeongsanCount = 0;
    allStations.forEach(st => {
      const reg = st.region || "";
      if (reg.includes("한강")) hanCount++;
      else if (reg.includes("낙동강")) nakdongCount++;
      else if (reg.includes("금강")) geumCount++;
      else if (reg.includes("영산강") || reg.includes("섬진강")) yeongsanCount++;
    });

    const regionSelect = document.getElementById("gis-filter-region");
    if (regionSelect) {
      const cur = this.filters.region;
      regionSelect.innerHTML = `
        <option value="all" ${cur === "all" ? "selected" : ""}>전체 권역 보기 (${totalCount}개소)</option>
        <option value="한강" ${cur === "한강" ? "selected" : ""}>한강 권역 (${hanCount}개소)</option>
        <option value="낙동강" ${cur === "낙동강" ? "selected" : ""}>낙동강 권역 (${nakdongCount}개소)</option>
        <option value="금강" ${cur === "금강" ? "selected" : ""}>금강 권역 (${geumCount}개소)</option>
        <option value="영산강" ${cur === "영산강" ? "selected" : ""}>영산강·섬진강 권역 (${yeongsanCount}개소)</option>
      `;
    }

    // 2. Gauge Type Counts
    let dualCount = 0, ewsvCount = 0, advmCount = 0;
    allStations.forEach(st => {
      const isDual = !!st.isDualGauge || st.gaugeCategory === "DUAL" || (st.gaugeType && st.gaugeType.includes("EWSV") && st.gaugeType.includes("ADVM"));
      if (isDual) dualCount++;
      else if (st.gaugeType && st.gaugeType.includes("EWSV")) ewsvCount++;
      else if (st.gaugeType && st.gaugeType.includes("ADVM")) advmCount++;
    });

    const gaugeSelect = document.getElementById("gis-filter-gauge");
    if (gaugeSelect) {
      const cur = this.filters.gaugeType;
      gaugeSelect.innerHTML = `
        <option value="all" ${cur === "all" ? "selected" : ""}>전체 형식 보기 (${totalCount}개소)</option>
        <option value="DUAL" ${cur === "DUAL" ? "selected" : ""}>⚡ EWSV + ADVM (이중화 ${dualCount}개소)</option>
        <option value="EWSV" ${cur === "EWSV" ? "selected" : ""}>EWSV (전자파 단독 ${ewsvCount}개소)</option>
        <option value="ADVM" ${cur === "ADVM" ? "selected" : ""}>ADVM (초음파 단독 ${advmCount}개소)</option>
      `;
    }

    // 3. Monitor Status Counts
    let abnormalCount = 0;
    allStations.forEach(st => {
      const stCodeStr = String(st.code || "").trim();
      const stNameStr = String(st.name || "").trim();
      const cleanName = stNameStr.replace(/[\(\)\s]/g, "");
      const hasIssue = (stCodeStr && liveIssuesMap[stCodeStr]) || (stNameStr && liveIssuesMap[stNameStr]) || (cleanName && liveIssuesMap[cleanName]);
      if (hasIssue) abnormalCount++;
    });
    const normalCount = Math.max(0, totalCount - abnormalCount);

    const monitorSelect = document.getElementById("gis-filter-monitor");
    if (monitorSelect) {
      const cur = this.filters.monitorStatus;
      monitorSelect.innerHTML = `
        <option value="all" ${cur === "all" ? "selected" : ""}>전체 관측상태 보기 (${totalCount}개소)</option>
        <option value="abnormal" ${cur === "abnormal" ? "selected" : ""} style="color:#b91c1c; font-weight:700;">🚨 이상 발생 지점만 보기 (${abnormalCount}개소)</option>
        <option value="normal" ${cur === "normal" ? "selected" : ""}>✅ 정상 수신 지점만 보기 (${normalCount}개소)</option>
      `;
    }

    // 4. Designated Checkboxes Counts
    let operatingCount = 0, floodCount = 0, droughtCount = 0, calibCount = 0, solarCount = 0;
    allStations.forEach(st => {
      if (st.isOperating2026) operatingCount++;
      if (st.floodAlert) floodCount++;
      if (st.droughtAlert) droughtCount++;
      if (st.calib2026) calibCount++;
      if (st.solarInstall) solarCount++;
    });

    const setCheckLabel = (checkId, labelText) => {
      const input = document.getElementById(checkId);
      if (input && input.parentElement) {
        const span = input.parentElement.querySelector("span");
        if (span) span.textContent = labelText;
      }
    };

    setCheckLabel("gis-check-dual", `⚡ 이중화(EWSV+ADVM) 지점 (${dualCount}개소)`);
    setCheckLabel("gis-check-operating", `2026년 정상 운영 지점 (${operatingCount}개소)`);
    setCheckLabel("gis-check-flood", `홍수특보 지정 지점 (${floodCount}개소)`);
    setCheckLabel("gis-check-drought", `갈수예보 지정 지점 (${droughtCount}개소)`);
    setCheckLabel("gis-check-calib", `26년 검정대상 지점 (${calibCount}개소)`);
    setCheckLabel("gis-check-solar", `태양광 설치 지점 (${solarCount}개소)`);

    // 5. Install Year Counts
    const yearSelect = document.getElementById("gis-filter-year");
    if (yearSelect) {
      const yearsMap = {};
      allStations.forEach(st => {
        if (st.installYear) {
          const y = String(st.installYear).trim();
          yearsMap[y] = (yearsMap[y] || 0) + 1;
        }
      });
      const sortedYears = Object.keys(yearsMap).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
      const currentVal = this.filters.installYear;

      let optionsHtml = `<option value="all" ${currentVal === "all" ? "selected" : ""}>전체 설치년도 보기 (${totalCount}개소)</option>`;
      sortedYears.forEach(y => {
        optionsHtml += `<option value="${y}" ${currentVal === y ? "selected" : ""}>${y}년 설치 (${yearsMap[y]}개소)</option>`;
      });
      yearSelect.innerHTML = optionsHtml;
    }
  }

  setFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    this.renderMarkers();
  }

  renderMarkers() {
    if (!this.map || !this.markersLayer) return;

    this.updateFilterLabelsWithCounts();
    this.markersLayer.clearLayers();
    this.allMarkers = [];

    const stations = this.currentStations.length > 0 ? this.currentStations : window.dataManager.getAll();
    const liveIssuesMap = window.liveIssuesMap || {};

    let visibleCount = 0;

    stations.forEach(st => {
      const lat = st.coords?.lat;
      const lon = st.coords?.lon;
      if (!lat || !lon) return;

      const isDual = !!st.isDualGauge || st.gaugeCategory === "DUAL" || (st.gaugeType && st.gaugeType.includes("EWSV") && st.gaugeType.includes("ADVM"));

      // Check real-time issues by code and name
      let issues = [];
      const stCodeStr = String(st.code || "").trim();
      const stNameStr = String(st.name || "").trim();
      const cleanName = stNameStr.replace(/[\(\)\s]/g, "");

      if (stCodeStr && liveIssuesMap[stCodeStr]) {
        issues = liveIssuesMap[stCodeStr];
      } else if (stNameStr && liveIssuesMap[stNameStr]) {
        issues = liveIssuesMap[stNameStr];
      } else if (cleanName && liveIssuesMap[cleanName]) {
        issues = liveIssuesMap[cleanName];
      }
      const isAbnormal = issues.length > 0;

      // Filter: Region
      if (this.filters.region !== "all" && !st.region.includes(this.filters.region)) {
        return;
      }

      // Filter: Gauge Type (EWSV / ADVM / DUAL)
      if (this.filters.gaugeType !== "all") {
        if (this.filters.gaugeType === "DUAL" && !isDual) return;
        if (this.filters.gaugeType === "EWSV" && (isDual || !st.gaugeType?.includes("EWSV"))) return;
        if (this.filters.gaugeType === "ADVM" && (isDual || !st.gaugeType?.includes("ADVM"))) return;
      }

      // Filter: Install Year
      if (this.filters.installYear !== "all") {
        if (String(st.installYear).trim() !== this.filters.installYear) return;
      }

      // Filter: Real-time Monitor Status
      if (this.filters.monitorStatus === "abnormal" && !isAbnormal) return;
      if (this.filters.monitorStatus === "normal" && isAbnormal) return;

      // Filter: Designated Flags
      if (this.filters.operatingOnly && !st.isOperating2026) return;
      if (this.filters.floodOnly && !st.floodAlert) return;
      if (this.filters.droughtOnly && !st.droughtAlert) return;
      if (this.filters.calibOnly && !st.calib2026) return;
      if (this.filters.solarOnly && !st.solarInstall) return;
      if (this.filters.dualOnly && !isDual) return;

      // Filter: Keyword search
      if (this.filters.searchKeyword) {
        const kw = this.filters.searchKeyword.toLowerCase().trim();
        const match = (st.name && st.name.toLowerCase().includes(kw)) ||
                      (st.river && st.river.toLowerCase().includes(kw)) ||
                      (st.region && st.region.toLowerCase().includes(kw)) ||
                      (st.address && st.address.toLowerCase().includes(kw)) ||
                      (st.code && String(st.code).includes(kw));
        if (!match) return;
      }

      visibleCount++;

      const regionClass = this.getRegionClass(st.region);
      
      let markerHtml = "";
      if (isAbnormal) {
        markerHtml = `
          <div class="station-pin pin-issue-abnormal" title="🚨 실시간 이상 감지: ${st.name} (${issues.length}건 이상)">
            <span>🚨</span>
          </div>
        `;
      } else if (isDual) {
        markerHtml = `
          <div class="station-pin pin-gauge-dual" title="⚡ 이중화: ${st.name} (${st.gaugeType})">
            <span>⚡</span>
          </div>
        `;
      } else {
        const iconLetter = st.gaugeType?.includes("EWSV") ? "E" : (st.gaugeType?.includes("ADVM") ? "A" : "○");
        markerHtml = `
          <div class="station-pin ${regionClass}" title="${st.name} (${st.gaugeType})">
            ${iconLetter}
          </div>
        `;
      }

      const customIcon = L.divIcon({
        className: "custom-div-icon",
        html: markerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      // Real-time issues alert card in popup
      let warningBoxHtml = "";
      if (isAbnormal) {
        const firstIssue = issues[0];
        warningBoxHtml = `
          <div class="popup-warning-box">
            <div class="popup-warning-header">
              <span>🚨 실시간 관측 이상 감지 (${issues.length}건)</span>
            </div>
            ${issues.slice(0, 3).map(iss => `
              <div class="popup-warning-item">
                • <b>[${iss.ruleId}] ${iss.problem}</b>: ${iss.detail} <span style="color:#b91c1c; font-weight:700;">(연속 ${iss.continuousCount}회)</span>
              </div>
            `).join("")}
          </div>
        `;
      }

      const primaryIssue = isAbnormal ? issues[0] : null;
      const scheduleBtnAction = primaryIssue 
        ? `window.scheduleManager.openAddModalWithStation(${st.id}, '${st.name}', '[${primaryIssue.ruleId}] ${primaryIssue.problem}', '${primaryIssue.detail} (연속 ${primaryIssue.continuousCount}회)')`
        : `window.scheduleManager.openAddModalWithStation(${st.id}, '${st.name}', '', '')`;

      const headerBadge = isAbnormal 
        ? '<span class="badge" style="background:#fef2f2; color:#b91c1c; font-weight:700;">🚨 조치 필요</span>' 
        : (isDual ? '<span class="badge-dual-chip">⚡ 이중화 지점</span>' : '');

      const popupHtml = `
        <div class="custom-map-popup">
          <div class="popup-header ${isAbnormal ? "abnormal" : (isDual ? "dual" : "")}" style="${isAbnormal ? "background: linear-gradient(135deg, #b91c1c, #991b1b); color: white;" : ""}">
            <div class="popup-title">
              <span>${st.name || "-"}</span>
              ${headerBadge}
            </div>
            <div class="popup-subtitle" style="${isAbnormal ? "color:#fecaca;" : ""}">${st.region || "-"}권역 | ${st.river || "-"}천 (코드: ${st.code || "-"})</div>
          </div>
          
          <div class="popup-body">
            ${warningBoxHtml}
            <div class="popup-row" style="margin-top:4px;"><span class="popup-row-label">위치(주소):</span> <span style="font-weight:500;">${st.address || "-"}</span></div>
            <div class="popup-row">
              <span class="popup-row-label">유속계 형식:</span> 
              <span><b style="color:${isDual ? "#7c3aed" : "#1d4ed8"};">${st.gaugeType || "-"}</b> ${isDual ? "(EWSV+ADVM 복합)" : ""}</span>
            </div>
            <div class="popup-row">
              <span class="popup-row-label">장비 대수:</span> 
              <span>EWSV: <b>${st.ewsvCount||"-"}대</b> / ADVM: <b>${st.advmCount||"-"}대</b></span>
            </div>
            <div class="popup-row"><span class="popup-row-label">설치/개시:</span> <span>${st.installYear || "-"}년 / ${st.obsStartYear || "-"}년</span></div>
            <div class="popup-row"><span class="popup-row-label">26년 운영여부:</span> <span>${st.isOperating2026 ? "<span class=\"badge badge-green\">운영중</span>" : "<span class=\"badge badge-gray\">미운영/대기</span>"}</span></div>
            <div class="popup-row"><span class="popup-row-label">지정 구분:</span> <span>${st.floodAlert ? "<span class=\"badge badge-red\">홍수</span> " : ""}${st.droughtAlert ? "<span class=\"badge badge-amber\">갈수</span> " : ""}${st.calib2026 ? "<span class=\"badge badge-cyan\">검정</span>" : ""}${!st.floodAlert && !st.droughtAlert && !st.calib2026 ? "-" : ""}</span></div>
          </div>
          
          <div class="popup-footer">
            <button class="btn btn-outline btn-sm" onclick="window.modalManager.openDetail(${st.id})">상세정보 & 편집</button>
            <button class="btn btn-primary btn-sm" style="${isAbnormal ? "background:#dc2626; border-color:#dc2626;" : ""}" onclick="${scheduleBtnAction}">
              🚗 점검일정 잡기
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.stationId = st.id;

      marker.addTo(this.markersLayer);
      this.allMarkers.push(marker);
    });

    const counterEl = document.getElementById("map-visible-count");
    if (counterEl) {
      counterEl.textContent = visibleCount;
    }
  }

  focusStation(id) {
    const station = window.dataManager.getById(id);
    if (!station || !station.coords?.lat || !station.coords?.lon) return;

    if (!this.map) return;

    this.map.setView([station.coords.lat, station.coords.lon], 13, { animate: true });

    const targetMarker = this.allMarkers.find(m => m.stationId === station.id);
    if (targetMarker) {
      targetMarker.openPopup();
    }
  }

  resetView() {
    if (this.map) {
      this.map.setView([36.3, 127.8], 7.5, { animate: true });
    }
  }
}

window.gisManager = new GISManager();
