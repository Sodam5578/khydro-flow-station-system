/**
 * StatsManager
 * Handles KPI card summaries and Chart.js visualizations on Dashboard with explicit numbers & percentages.
 */
class StatsManager {
  constructor() {
    this.regionChart = null;
    this.gaugeChart = null;
    this.yearChart = null;
    this.datalabelsRegistered = false;
  }

  ensurePlugin() {
    if (!this.datalabelsRegistered && window.ChartDataLabels) {
      Chart.register(ChartDataLabels);
      this.datalabelsRegistered = true;
    }
  }

  update() {
    this.ensurePlugin();
    const stations = window.dataManager.getAll();

    const totalCount = stations.length;
    const operatingCount = stations.filter(s => s.isOperating2026).length;
    
    // Gauge Breakdown
    const dualCount = stations.filter(s => s.isDualGauge || s.gaugeCategory === "DUAL" || (s.gaugeType && s.gaugeType.includes("EWSV") && s.gaugeType.includes("ADVM"))).length;
    const ewsvSoloCount = stations.filter(s => !s.isDualGauge && s.gaugeCategory !== "DUAL" && s.gaugeType?.includes("EWSV") && !s.gaugeType?.includes("ADVM")).length;
    const advmSoloCount = stations.filter(s => !s.isDualGauge && s.gaugeCategory !== "DUAL" && s.gaugeType?.includes("ADVM") && !s.gaugeType?.includes("EWSV")).length;

    const calibCount = stations.filter(s => s.calib2026).length;
    const solarCount = stations.filter(s => s.solarInstall).length;

    // Update KPI Cards
    const totalEl = document.getElementById("kpi-total-stations");
    if (totalEl) totalEl.textContent = `${totalCount}개소`;

    const opEl = document.getElementById("kpi-operating-stations");
    if (opEl) opEl.textContent = `${operatingCount}개소`;

    const rateEl = document.getElementById("kpi-operating-rate");
    if (rateEl) rateEl.textContent = totalCount > 0 ? `운영율 ${((operatingCount/totalCount)*100).toFixed(1)}%` : "-";
    
    const gaugeKpiEl = document.getElementById("kpi-gauge-ewsv");
    if (gaugeKpiEl) {
      gaugeKpiEl.innerHTML = `
        <div style="font-size:1.15rem; font-weight:800; color:#1e293b; line-height:1.2;">
          EWSV <span style="color:#2563eb;">${ewsvSoloCount}</span> <span style="font-weight:400; color:#cbd5e1; margin:0 2px;">|</span> ADVM <span style="color:#0284c7;">${advmSoloCount}</span>
        </div>
        <div style="font-size:0.95rem; font-weight:700; color:#7c3aed; margin-top:4px;">
          ⚡ 이중화 <span style="font-weight:800;">${dualCount}</span>개소
        </div>
      `;
    }

    const calibEl = document.getElementById("kpi-calib-stations");
    if (calibEl) calibEl.textContent = `${calibCount}개소`;

    const solarEl = document.getElementById("kpi-solar-stations");
    if (solarEl) solarEl.textContent = `${solarCount}개소`;

    // Render 3 Charts with clean explicit numbers
    this.renderRegionChart(stations);
    this.renderGaugeChart(ewsvSoloCount, advmSoloCount, dualCount);
    this.renderYearChart(stations);
  }

  renderRegionChart(stations) {
    const ctx = document.getElementById("chart-region");
    if (!ctx) return;

    // Grouping by standard river basins
    const countsMap = {
      "낙동강권역": 0,
      "한강권역": 0,
      "영산강·섬진강": 0,
      "금강권역": 0
    };

    stations.forEach(s => {
      const r = (s.region || "").trim();
      if (r.includes("낙동강")) countsMap["낙동강권역"]++;
      else if (r.includes("한강")) countsMap["한강권역"]++;
      else if (r.includes("영산강") || r.includes("섬진강")) countsMap["영산강·섬진강"]++;
      else if (r.includes("금강")) countsMap["금강권역"]++;
      else {
        countsMap["기타"] = (countsMap["기타"] || 0) + 1;
      }
    });

    // Filter out zero entries
    const labels = [];
    const dataValues = [];
    const colors = [];
    const colorPalette = {
      "낙동강권역": "#ea580c",
      "한강권역": "#2563eb",
      "영산강·섬진강": "#9333ea",
      "금강권역": "#059669",
      "기타": "#64748b"
    };

    let sum = 0;
    Object.keys(countsMap).forEach(key => {
      const val = countsMap[key];
      if (val > 0) {
        labels.push(key);
        dataValues.push(val);
        colors.push(colorPalette[key] || "#64748b");
        sum += val;
      }
    });

    const total = sum > 0 ? sum : 1;

    // Explicit Labels for Legend
    const legendLabels = labels.map((label, idx) => {
      const val = dataValues[idx];
      const pct = ((val / total) * 100).toFixed(1);
      return `${label}: ${val}개소 (${pct}%)`;
    });

    if (this.regionChart) {
      this.regionChart.destroy();
      this.regionChart = null;
    }

    this.regionChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: legendLabels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 14,
              font: { size: 12, family: "Pretendard" },
              padding: 10
            }
          },
          datalabels: {
            display: (context) => {
              const val = context.dataset.data[context.dataIndex];
              return val > 0;
            },
            color: "#ffffff",
            font: { weight: "bold", size: 12, family: "Pretendard" },
            formatter: (value) => {
              if (!value || isNaN(value)) return "";
              const pct = ((value / total) * 100).toFixed(1);
              return `${value}개소\n(${pct}%)`;
            },
            textAlign: "center"
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = ((val / total) * 100).toFixed(1);
                return ` ${val}개소 (${pct}%)`;
              }
            }
          }
        },
        cutout: "55%"
      }
    });
  }

  renderGaugeChart(ewsvSolo, advmSolo, dualCount) {
    const ctx = document.getElementById("chart-gauge");
    if (!ctx) return;

    const rawLabels = ["EWSV (전자파 단독)", "ADVM (초음파 단독)", "⚡ EWSV+ADVM (이중화)"];
    const rawValues = [ewsvSolo, advmSolo, dualCount];
    const rawColors = ["#2563eb", "#0284c7", "#7c3aed"];

    const labels = [];
    const dataValues = [];
    const colors = [];

    let sum = 0;
    rawValues.forEach((val, idx) => {
      if (val > 0) {
        labels.push(rawLabels[idx]);
        dataValues.push(val);
        colors.push(rawColors[idx]);
        sum += val;
      }
    });

    const total = sum > 0 ? sum : 1;

    // Explicit Labels for Legend
    const legendLabels = labels.map((label, idx) => {
      const val = dataValues[idx];
      const pct = ((val / total) * 100).toFixed(1);
      return `${label}: ${val}개소 (${pct}%)`;
    });

    if (this.gaugeChart) {
      this.gaugeChart.destroy();
      this.gaugeChart = null;
    }

    this.gaugeChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: legendLabels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 14,
              font: { size: 12, family: "Pretendard" },
              padding: 12
            }
          },
          datalabels: {
            display: (context) => {
              const val = context.dataset.data[context.dataIndex];
              return val > 0;
            },
            color: "#ffffff",
            font: { weight: "bold", size: 12, family: "Pretendard" },
            formatter: (value) => {
              if (!value || isNaN(value)) return "";
              const pct = ((value / total) * 100).toFixed(1);
              return `${value}개소\n(${pct}%)`;
            },
            textAlign: "center"
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = ((val / total) * 100).toFixed(1);
                return ` ${val}개소 (${pct}%)`;
              }
            }
          }
        },
        cutout: "55%"
      }
    });
  }

  renderYearChart(stations) {
    const ctx = document.getElementById("chart-year");
    if (!ctx) return;

    const years = {};
    stations.forEach(s => {
      let y = s.installYear;
      if (y && !isNaN(y) && Number(y) > 2000) {
        years[y] = (years[y] || 0) + 1;
      }
    });

    const sortedYears = Object.keys(years).sort();
    const dataValues = sortedYears.map(y => years[y]);

    if (this.yearChart) {
      this.yearChart.destroy();
      this.yearChart = null;
    }

    this.yearChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: sortedYears.map(y => `${y}년`),
        datasets: [{
          label: "설치 관측소 수",
          data: dataValues,
          borderColor: "#059669",
          backgroundColor: "rgba(5, 150, 105, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: "#059669",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 20 }
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            align: "top",
            anchor: "end",
            offset: 4,
            color: "#059669",
            font: { weight: "bold", size: 11, family: "Pretendard" },
            formatter: (value) => `${value}개소`
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y}개소 설치`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 10, font: { family: "Pretendard" } },
            grid: { color: "#f1f5f9" }
          },
          x: {
            grid: { display: false },
            ticks: { font: { family: "Pretendard" } }
          }
        }
      }
    });
  }
}

window.statsManager = new StatsManager();
