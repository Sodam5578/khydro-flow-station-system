/**
 * GISManager
 * Leaflet-based map manager for Flow Stations with Clean Basemap & Official 850 Standard Watershed Boundaries
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

    // 1. Create Dedicated Basins Pane (Between tiles and markers)
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
        const p = feature.properties;
        const tooltipHtml = `
          <div style="font-family: Pretendard, sans-serif; padding: 4px 6px;">
            <div style="font-size: 0.88rem; font-weight: 800; color: ${p.color};">
              🏞️ [${p.code}] ${p.name}
            </div>
            <div style="font-size: 0.75rem; color: #334155; margin-top: 3px;">
              권역: <b>${p.region}</b> | 중권역코드: <b>${p.midCode}</b>
            </div>
          </div>
        `;
        layer.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: "top",
          opacity: 0.95
        });

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({
              weight: 3.0,
              opacity: 1,
              fillOpacity: 0.28
            });
          },
          mouseout: (e) => {
            if (this.basinsLayer) {
              this.basinsLayer.resetStyle(e.target);
            }
          }
        });
      }
    });

    if (this.showBasins) {
      this.basinsLayer.addTo(this.map);
    }
  }

  toggleBasins(show) {
    this.showBasins = show;
    if (!this.map) return;

    if (!this.basinsLayer) {
      this.initBasinsLayer();
      return;
    }

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

  setFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    this.renderMarkers();
  }

  renderMarkers() {
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();
    this.allMarkers = [];

    const stations = this.currentStations.length > 0 ? this.currentStations : window.dataManager.getAll();

    let visibleCount = 0;

    stations.forEach(st => {
      const lat = st.coords?.lat;
      const lon = st.coords?.lon;
      if (!lat || !lon) return;

      const isDual = !!st.isDualGauge || st.gaugeCategory === "DUAL" || (st.gaugeType && st.gaugeType.includes("EWSV") && st.gaugeType.includes("ADVM"));

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

      // Filter: Checkboxes
      if (this.filters.dualOnly && !isDual) return;
      if (this.filters.operatingOnly && !st.isOperating2026) return;
      if (this.filters.floodOnly && !st.floodAlert) return;
      if (this.filters.droughtOnly && !st.droughtAlert) return;
      if (this.filters.calibOnly && !st.calib2026) return;
      if (this.filters.solarOnly && !st.solarInstall) return;

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
      if (isDual) {
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

      const popupHtml = `
        <div class="custom-map-popup">
          <div class="popup-header ${isDual ? "dual" : ""}">
            <div class="popup-title">
              <span>${st.name || "-"}</span>
              ${isDual ? "<span class=\"badge-dual-chip\">⚡ 이중화 지점</span>" : ""}
            </div>
            <div class="popup-subtitle">${st.region || "-"}권역 | ${st.river || "-"}천 (코드: ${st.code || "-"})</div>
          </div>
          <div class="popup-body">
            <div class="popup-row"><span class="popup-row-label">위치(주소):</span> <span style="font-weight:500;">${st.address || "-"}</span></div>
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
            <button class="btn btn-primary btn-sm" onclick="window.modalManager.openDetail(${st.id})">상세정보 및 편집</button>
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
