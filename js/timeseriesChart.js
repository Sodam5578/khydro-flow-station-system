/**
 * TimeSeriesChartManager
 * Handles 7-tab independent 24-hour time-series charts inside Station Detail Modal.
 * 1. waterLevel (수위, m)
 * 2. velocity (유속, m/s)
 * 3. snr (초음파 신호강도, Count/dB)
 * 4. windSpeed (풍속, m/s)
 * 5. windDeg (풍향, °)
 * 6. ac (AC 전압, V)
 * 7. dc (DC 전압, V)
 */

class TimeSeriesChartManager {
  constructor() {
    this.chart = null;
    this.currentCode = null;
    this.activeTab = "waterLevel";
    this.cachedData = null;
    this.tabConfigs = {
      waterLevel: {
        title: "🌊 수위 추이",
        unit: "m",
        color: "#2563eb",
        bgColor: "rgba(37, 99, 235, 0.12)",
        label: "수위 (m)",
        field: "waterLevel",
        guideText: "💡 최근 24시간 동안의 10분 주기 수위 변화 곡선입니다."
      },
      velocity: {
        title: "⏩ 유속 추이",
        unit: "m/s",
        color: "#059669",
        bgColor: "rgba(5, 150, 105, 0.12)",
        label: "평균 유속 (m/s)",
        field: "velocity",
        guideText: "💡 관측 지점의 수류 유속 시계열입니다."
      },
      snr: {
        title: "📡 SNR 품질 추이",
        unit: "Count",
        color: "#7c3aed",
        bgColor: "rgba(124, 58, 237, 0.12)",
        label: "SNR",
        field: "snr",
        threshold: 70,
        thresholdLabel: "SNR 기준선 (70)",
        guideText: "🛡️ 수신 신호품질 지표인 SNR 기준 70 이상을 유지해야 정상 수신으로 인정됩니다."
      },
      windSpeed: {
        title: "🌬️ 실시간 풍속 추이",
        unit: "m/s",
        color: "#0284c7",
        bgColor: "rgba(2, 132, 199, 0.12)",
        label: "풍속 (m/s)",
        field: "windSpeed",
        guideText: "💡 국사 기상 센서에서 측정된 풍속 시계열입니다."
      },
      windDeg: {
        title: "🧭 실시간 풍향 추이 (0~360°)",
        unit: "°",
        color: "#d97706",
        bgColor: "rgba(217, 119, 6, 0.12)",
        label: "풍향 (°)",
        field: "windDeg",
        minY: 0,
        maxY: 360,
        guideText: "🧭 0°(북풍), 90°(동풍), 180°(남풍), 270°(서풍)"
      },
      ac: {
        title: "⚡ 상용전원(AC) 입력전압 안정성",
        unit: "V",
        color: "#b45309",
        bgColor: "rgba(180, 83, 9, 0.1)",
        label: "AC 전압 (V)",
        field: "ac",
        rangeMin: 209,
        rangeMax: 231,
        rangeLabel: "정상 안전구간 (209V ~ 231V)",
        guideText: "⚡ 상용전원 정상 안전 허용범위는 209V ~ 231V (공칭 220V)입니다."
      },
      dc: {
        title: "🔋 배터리 및 태양광 충전전압(DC) 추이",
        unit: "V",
        color: "#0891b2",
        bgColor: "rgba(8, 145, 178, 0.12)",
        label: "DC 전압 (V)",
        field: "dc",
        rangeMin: 11.5,
        rangeMax: 14.5,
        warningThreshold: 11.8,
        warningLabel: "방전 경고선 (11.8V)",
        guideText: "🔋 정상 충전범위: 11.5V ~ 14.5V (주간 태양광 충전 / 야간 배터리 방전)"
      }
    };
  }

  /**
   * Initializes or refreshes time-series chart inside station modal.
   */
  async loadAndRender(stationCode, defaultTab = "waterLevel") {
    this.currentCode = stationCode;
    this.activeTab = defaultTab;

    const container = document.getElementById("station-timeseries-container");
    if (!container) return;

    // Loading State
    container.innerHTML = `
      <div style="text-align:center; padding:1.5rem; color:#64748b;">
        <div style="font-size:1.5rem; margin-bottom:6px;">⏳</div>
        <div>최근 24시간 실시간 시계열 관측 자료를 불러오는 중입니다...</div>
      </div>
    `;

    try {
      const res = await fetch(`/api/monitor/timeseries/${encodeURIComponent(stationCode)}`);
      const json = await res.json();

      if (!json.success || !json.hasData || !json.points || json.points.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:3rem 1.5rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1; margin:1rem 0;">
            <div style="font-size:2.5rem; margin-bottom:0.8rem;">📡</div>
            <h3 style="font-size:1.15rem; font-weight:700; color:#1e293b; margin-bottom:0.5rem;">실시간 관측자료 미수집 지점</h3>
            <p style="color:#64748b; font-size:0.88rem; line-height:1.6; max-width:520px; margin:0 auto;">
              ${json.message || `해당 관측소(<b>지점코드: ${stationCode}</b>)는 현재 실시간 관측자료 수집 대상에 포함되지 않았거나, 2026년 구축예정/미운영 상태로 수신된 관측자료가 없습니다.`}
            </p>
          </div>
        `;
        return;
      }

      this.cachedData = json;
      this.renderView();
    } catch (e) {
      console.error("[TimeSeriesChart] Error loading data:", e);
      container.innerHTML = `
        <div style="text-align:center; padding:1rem; color:#ef4444; background:#fef2f2; border-radius:8px;">
          ⚠️ 시계열 데이터 조회 중 오류가 발생했습니다. (${e.message})
        </div>
      `;
    }
  }

  formatValue(field, val) {
    if (val === null || val === undefined || val === "" || isNaN(val)) return "-";
    const num = Number(val);
    if (field === "waterLevel" || field === "velocity") {
      return num.toFixed(2);
    }
    if (field === "windSpeed" || field === "dc" || field === "ac") {
      return num.toFixed(1);
    }
    if (field === "snr" || field === "windDeg") {
      return Math.round(num).toString();
    }
    return String(val);
  }

  /**
   * Renders the tab buttons and chart canvas.
   */
  renderView() {
    const container = document.getElementById("station-timeseries-container");
    if (!container || !this.cachedData) return;

    const tabs = [
      { key: "waterLevel", icon: "🌊", name: "수위" },
      { key: "velocity", icon: "⏩", name: "유속" },
      { key: "snr", icon: "📡", name: "SNR" },
      { key: "windSpeed", icon: "🌬️", name: "풍속" },
      { key: "windDeg", icon: "🧭", name: "풍향" },
      { key: "ac", icon: "⚡", name: "AC전압" },
      { key: "dc", icon: "🔋", name: "DC전압" }
    ];

    const currentConf = this.tabConfigs[this.activeTab] || this.tabConfigs.waterLevel;
    const rawVal = this.cachedData.points[this.cachedData.points.length - 1]?.[currentConf.field];
    const latestVal = this.formatValue(currentConf.field, rawVal);

    container.innerHTML = `
      <!-- 7 Tab Buttons Navigation -->
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; background:#f1f5f9; padding:6px; border-radius:8px;">
        ${tabs.map(t => {
          const isActive = t.key === this.activeTab;
          return `
            <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}" 
                    onclick="window.timeSeriesChartManager.switchTab('${t.key}')" 
                    style="font-size:0.8rem; padding:4px 10px; border-radius:6px; flex:1 1 auto; min-width:80px; font-weight:${isActive ? '700' : '500'}; background:${isActive ? '#1e40af' : '#ffffff'}; color:${isActive ? '#ffffff' : '#334155'}; border:1px solid ${isActive ? '#1e40af' : '#cbd5e1'};">
              <span>${t.icon}</span> <span>${t.name}</span>
            </button>
          `;
        }).join("")}
      </div>

      <!-- Chart Header Banner -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:6px 10px; background:#f8fafc; border-radius:6px; border-left:4px solid ${currentConf.color};">
        <div>
          <span style="font-weight:700; font-size:0.9rem; color:#1e293b;">${currentConf.title}</span>
          <span style="font-size:0.75rem; color:#64748b; margin-left:8px;">${currentConf.guideText}</span>
        </div>
        <div style="font-size:0.85rem; font-weight:800; color:${currentConf.color};">
          현재 측정값: <span style="font-size:1.05rem;">${latestVal}</span> ${currentConf.unit}
        </div>
      </div>

      <!-- Chart Canvas Container -->
      <div style="position:relative; width:100%; height:230px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
        <canvas id="ts-canvas-detail"></canvas>
      </div>
    `;

    this.drawChart();
  }

  /**
   * Switches active tab and redraws canvas without re-fetching network.
   */
  switchTab(tabKey) {
    if (this.activeTab === tabKey) return;
    this.activeTab = tabKey;
    this.renderView();
  }

  /**
   * Draws the Chart.js instance for the active tab.
   */
  drawChart() {
    const canvas = document.getElementById("ts-canvas-detail");
    if (!canvas || !this.cachedData) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const conf = this.tabConfigs[this.activeTab];
    const dataValues = this.cachedData.series[conf.field] || [];
    const timeLabels = this.cachedData.timeLabels || [];

    const datasets = [
      {
        label: `${conf.label}`,
        data: dataValues,
        borderColor: conf.color,
        backgroundColor: conf.bgColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.25
      }
    ];

    // Optional Threshold lines (e.g., SNR 70, AC bands, DC warning)
    if (conf.threshold) {
      datasets.push({
        label: conf.thresholdLabel,
        data: Array(dataValues.length).fill(conf.threshold),
        borderColor: "#ef4444",
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      });
    }

    if (conf.rangeMin !== undefined && conf.rangeMax !== undefined) {
      datasets.push({
        label: `${conf.rangeMin}${conf.unit} (하한)`,
        data: Array(dataValues.length).fill(conf.rangeMin),
        borderColor: "rgba(16, 185, 129, 0.7)",
        borderWidth: 1.2,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false
      });
      datasets.push({
        label: `${conf.rangeMax}${conf.unit} (상한)`,
        data: Array(dataValues.length).fill(conf.rangeMax),
        borderColor: "rgba(16, 185, 129, 0.7)",
        borderWidth: 1.2,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false
      });
    }

    if (conf.warningThreshold !== undefined) {
      datasets.push({
        label: conf.warningLabel,
        data: Array(dataValues.length).fill(conf.warningThreshold),
        borderColor: "#ef4444",
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      });
    }

    const ctx = canvas.getContext("2d");
    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: timeLabels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              boxWidth: 12,
              font: { size: 11, weight: "bold" },
              padding: 6
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                return this.cachedData.labels ? (this.cachedData.labels[idx] || "") : "";
              },
              label: (item) => {
                const raw = item.raw;
                let formatted = item.formattedValue;
                if (typeof raw === "number") {
                  if (conf.field === "waterLevel" || conf.field === "velocity") {
                    formatted = raw.toFixed(2);
                  } else if (conf.field === "windSpeed" || conf.field === "dc" || conf.field === "ac") {
                    formatted = raw.toFixed(1);
                  }
                }
                return ` ${item.dataset.label}: ${formatted} ${conf.unit}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: "#f1f5f9" },
            ticks: {
              maxTicksLimit: 12,
              font: { size: 10 },
              color: "#64748b"
            }
          },
          y: {
            grid: { color: "#f1f5f9" },
            min: conf.minY,
            max: conf.maxY,
            ticks: {
              font: { size: 10 },
              color: "#64748b",
              callback: (val) => {
                if (typeof val === "number") {
                  if (conf.field === "waterLevel" || conf.field === "velocity") {
                    return val.toFixed(2) + " " + conf.unit;
                  }
                  if (conf.field === "windSpeed" || conf.field === "dc" || conf.field === "ac") {
                    return val.toFixed(1) + " " + conf.unit;
                  }
                }
                return val + " " + conf.unit;
              }
            }
          }
        }
      }
    });
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}

window.timeSeriesChartManager = new TimeSeriesChartManager();
