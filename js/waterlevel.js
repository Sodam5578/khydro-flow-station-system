class WaterLevelCompareManager {
  constructor() {
    this.currentStation = null;
    this.currentPeriod = "24h";
    this.chart = null;
    this.diffChart = null;
  }

  async openModal(stationCodeOrId, period = "24h") {
    this.currentStation = stationCodeOrId;
    this.currentPeriod = period;

    const modal = document.getElementById("waterlevel-modal");
    if (!modal) return;
    modal.classList.add("active");

    await this.loadData();
  }

  closeModal() {
    const modal = document.getElementById("waterlevel-modal");
    if (modal) modal.classList.remove("active");
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.diffChart) {
      this.diffChart.destroy();
      this.diffChart = null;
    }
  }

  setPeriod(period) {
    this.currentPeriod = period;
    document.querySelectorAll(".wl-period-btn").forEach(btn => {
      btn.classList.toggle("btn-primary", btn.dataset.period === period);
      btn.classList.toggle("btn-outline", btn.dataset.period !== period);
    });
    this.loadData();
  }

  toggleToleranceBand(show) {
    if (this.chart && this.chart.data.datasets.length >= 4) {
      this.chart.data.datasets[2].hidden = !show;
      this.chart.data.datasets[3].hidden = !show;
      this.chart.update();
    }
  }

  async loadData() {
    if (!window.apiClient || !this.currentStation) return;

    const loadingEl = document.getElementById("wl-loading");
    const contentEl = document.getElementById("wl-content");
    if (loadingEl) loadingEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";

    try {
      const res = await window.apiClient.getWaterLevelComparison(this.currentStation, this.currentPeriod);
      if (!res.success) {
        alert(res.error || "수위 비교 데이터를 불러오지 못했습니다.");
        this.closeModal();
        return;
      }

      this.renderView(res);
    } catch (e) {
      console.error("Failed to load water level comparison:", e);
      alert("수위 비교 데이터 조회 중 오류가 발생했습니다.");
    } finally {
      if (loadingEl) loadingEl.style.display = "none";
      if (contentEl) contentEl.style.display = "block";
    }
  }

  renderView(data) {
    const { station, summary, timeSeries, period } = data;

    // 1. Header Info
    const titleEl = document.getElementById("wl-modal-title");
    const subEl = document.getElementById("wl-modal-sub");
    if (titleEl) titleEl.textContent = `📊 실시간 수위 비교 분석 - ${station.name} (${station.river} / ${station.region})`;
    if (subEl) subEl.textContent = `관측소 코드: ${station.code} | 유속계: ${station.gaugeType} | 기준수위계: ${station.waterLevelType} | 기준수위: ${station.refWaterLevel.toFixed(2)}m`;

    // 2. Summary KPI Cards
    const gaugeEl = document.getElementById("wl-kpi-gauge");
    const refEl = document.getElementById("wl-kpi-ref");
    const diffEl = document.getElementById("wl-kpi-diff");
    const statBadgeEl = document.getElementById("wl-kpi-status-badge");
    const maxDiffEl = document.getElementById("wl-kpi-max-diff");
    const avgDiffEl = document.getElementById("wl-kpi-avg-diff");

    if (gaugeEl) gaugeEl.textContent = `${summary.currentGaugeWL.toFixed(3)} m`;
    if (refEl) refEl.textContent = `${summary.currentRefWL.toFixed(3)} m`;
    if (diffEl) diffEl.textContent = `${summary.currentDiffCm.toFixed(1)} cm`;
    if (maxDiffEl) maxDiffEl.textContent = `${summary.maxDiffCm.toFixed(1)} cm`;
    if (avgDiffEl) avgDiffEl.textContent = `${summary.avgDiffCm.toFixed(1)} cm`;

    if (statBadgeEl) {
      if (summary.status === "CRITICAL") {
        statBadgeEl.className = "badge badge-red";
        statBadgeEl.textContent = "🚨 경계 (수위차 ≥ 20cm)";
      } else if (summary.status === "ATTENTION") {
        statBadgeEl.className = "badge badge-amber";
        statBadgeEl.textContent = "⚠️ 관심 (수위차 ≥ 10cm)";
      } else {
        statBadgeEl.className = "badge badge-green";
        statBadgeEl.textContent = "✅ 정상 (10cm 이내)";
      }
    }

    // 3. Render Charts
    this.renderCharts(timeSeries, station, period, summary);

    // 4. Render Table
    this.renderTable(timeSeries);
  }

  renderCharts(timeSeries, station, period, summary) {
    const mainCanvas = document.getElementById("wl-chart-canvas");
    const diffCanvas = document.getElementById("wl-diff-canvas");
    if (!mainCanvas || !diffCanvas) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.diffChart) {
      this.diffChart.destroy();
      this.diffChart = null;
    }

    const labels = timeSeries.map(p => p.time);
    const gaugeData = timeSeries.map(p => p.gaugeWL);
    const refData = timeSeries.map(p => p.refWL);
    const diffData = timeSeries.map(p => p.diffCm);

    // Confidence / Tolerance Band (Ref ± 0.100m = ±10cm)
    const upperBand = refData.map(v => Number((v + 0.10).toFixed(3)));
    const lowerBand = refData.map(v => Number((v - 0.10).toFixed(3)));

    const showBand = document.getElementById("wl-toggle-tolerance-band") ? document.getElementById("wl-toggle-tolerance-band").checked : true;

    // --- 1. Top Chart: Water Level Curves (m) ---
    const mainCtx = mainCanvas.getContext("2d");
    this.chart = new Chart(mainCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `유속계 측정 수위 (${station.gaugeType})`,
            data: gaugeData,
            borderColor: "#2563eb",
            backgroundColor: "transparent",
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#2563eb",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 2,
            tension: 0.25,
            order: 1
          },
          {
            label: `기준 수위계 (${station.waterLevelType})`,
            data: refData,
            borderColor: "#16a34a",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#16a34a",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 2,
            tension: 0.25,
            order: 2
          },
          {
            label: `관심기준 상한 (+10cm)`,
            data: upperBand,
            borderColor: "rgba(22, 163, 74, 0.35)",
            borderWidth: 1,
            borderDash: [2, 2],
            pointRadius: 0,
            fill: "+1",
            backgroundColor: "rgba(34, 197, 94, 0.12)",
            hidden: !showBand,
            order: 3
          },
          {
            label: `관심기준 하한 (-10cm)`,
            data: lowerBand,
            borderColor: "rgba(22, 163, 74, 0.35)",
            borderWidth: 1,
            borderDash: [2, 2],
            pointRadius: 0,
            fill: false,
            hidden: !showBand,
            order: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          datalabels: { display: false },
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              font: { family: "Pretendard", size: 11, weight: "600" },
              filter: (item) => item.text && !item.text.includes("하한")
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(15, 23, 42, 0.94)",
            titleColor: "#f8fafc",
            bodyColor: "#f1f5f9",
            titleFont: { family: "Pretendard", size: 12, weight: "bold" },
            bodyFont: { family: "Pretendard", size: 11 },
            padding: 10,
            cornerRadius: 6,
            usePointStyle: true,
            callbacks: {
              title: (ctx) => `📅 관측시각: ${ctx[0].label}`,
              label: (ctx) => {
                if (ctx.datasetIndex === 2) return ` 🛡️ 관심기준 범위: ±10.0 cm (녹색 음영 영역)`;
                if (ctx.datasetIndex === 3) return null;
                return ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)} m`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: "Pretendard", size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            type: "linear",
            title: {
              display: true,
              text: "수위 (m)",
              font: { family: "Pretendard", size: 11, weight: "600" }
            },
            grid: { color: "rgba(226, 232, 240, 0.6)" }
          }
        }
      }
    });

    // --- 2. Bottom Sub Chart: Deviation Trend Curve (cm) ---
    const diffCtx = diffCanvas.getContext("2d");
    const warningLine = labels.map(() => 10.0);
    const criticalLine = labels.map(() => 20.0);

    const maxDiffVal = Math.max(25, summary.maxDiffCm + 4);

    this.diffChart = new Chart(diffCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "수위차 (|오차|, cm)",
            data: diffData,
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.12)",
            borderWidth: 1.8,
            fill: true,
            tension: 0.2,
            pointRadius: (ctx) => {
              const val = ctx.raw;
              return val >= 20 ? 3.5 : (val >= 10 ? 2.5 : 0);
            },
            pointBackgroundColor: (ctx) => {
              const val = ctx.raw;
              return val >= 20 ? "#dc2626" : (val >= 10 ? "#d97706" : "#0284c7");
            },
            pointHoverRadius: 6
          },
          {
            label: "관심 기준 (10cm)",
            data: warningLine,
            borderColor: "rgba(217, 119, 6, 0.85)",
            borderWidth: 1.2,
            borderDash: [4, 3],
            pointRadius: 0,
            fill: false
          },
          {
            label: "경계 기준 (20cm)",
            data: criticalLine,
            borderColor: "rgba(220, 38, 38, 0.85)",
            borderWidth: 1.2,
            borderDash: [4, 3],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          datalabels: { display: false },
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(15, 23, 42, 0.94)",
            titleColor: "#f8fafc",
            bodyColor: "#f1f5f9",
            titleFont: { family: "Pretendard", size: 12, weight: "bold" },
            bodyFont: { family: "Pretendard", size: 11 },
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              title: (ctx) => `📅 ${ctx[0].label}`,
              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  const val = ctx.parsed.y;
                  let statusStr = "✓ 정상";
                  if (val >= 20) statusStr = "🚨 경계 (≥20cm)";
                  else if (val >= 10) statusStr = "⚠️ 관심 (≥10cm)";
                  return ` 편차: ${val.toFixed(1)} cm [${statusStr}]`;
                }
                return null;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: "Pretendard", size: 9 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            type: "linear",
            min: 0,
            suggestedMax: maxDiffVal,
            title: {
              display: true,
              text: "편차 (cm)",
              font: { family: "Pretendard", size: 10, weight: "600" }
            },
            grid: { color: "rgba(226, 232, 240, 0.4)" }
          }
        }
      }
    });
  }

  renderTable(timeSeries) {
    const tbody = document.getElementById("wl-table-tbody");
    if (!tbody) return;

    // Show recent 30 points in reverse order (newest first)
    const recent = [...timeSeries].reverse().slice(0, 30);
    tbody.innerHTML = recent.map(p => {
      let badge = `<span class="badge badge-green">정상</span>`;
      if (p.status === "CRITICAL" || p.diffCm >= 20.0) badge = `<span class="badge badge-red">경계 (${p.diffCm}cm)</span>`;
      else if (p.status === "ATTENTION" || p.diffCm >= 10.0) badge = `<span class="badge badge-amber">관심 (${p.diffCm}cm)</span>`;

      return `
        <tr>
          <td style="font-weight:600; font-size:0.8rem;">${p.time}</td>
          <td style="font-weight:700; color:#2563eb;">${p.gaugeWL.toFixed(3)} m</td>
          <td style="font-weight:600; color:#16a34a;">${p.refWL.toFixed(3)} m</td>
          <td style="font-weight:800; color:${p.diffCm >= 10.0 ? (p.diffCm >= 20.0 ? '#dc2626' : '#d97706') : '#1e293b'};">${p.diffCm.toFixed(1)} cm</td>
          <td>${badge}</td>
        </tr>
      `;
    }).join("");
  }
}

window.waterLevelManager = new WaterLevelCompareManager();
