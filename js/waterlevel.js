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

    // Reset period selector buttons
    document.querySelectorAll(".wl-period-btn").forEach(btn => {
      btn.classList.toggle("btn-primary", btn.dataset.period === period);
      btn.classList.toggle("btn-outline", btn.dataset.period !== period);
    });

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
    const nodataEl = document.getElementById("wl-nodata");

    if (loadingEl) loadingEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
    if (nodataEl) nodataEl.style.display = "none";

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
    }
  }

  renderView(data) {
    const { station, summary, timeSeries, period, hasData, message } = data;
    const contentEl = document.getElementById("wl-content");
    const nodataEl = document.getElementById("wl-nodata");
    const titleEl = document.getElementById("wl-modal-title");
    const subEl = document.getElementById("wl-modal-sub");

    // Case 1: Station is NOT in HydroMonitor (Before data acquisition / not linked)
    if (!hasData) {
      if (contentEl) contentEl.style.display = "none";
      if (nodataEl) {
        nodataEl.style.display = "block";
        const nodataTitle = document.getElementById("wl-nodata-title");
        const nodataDesc = document.getElementById("wl-nodata-desc");
        if (nodataTitle) nodataTitle.textContent = "자료 취득 전 (HydroMonitor 실시간 수위비교 미제공)";
        if (nodataDesc) {
          nodataDesc.innerHTML = `
            해당 관측소(<b>${station.name}</b>)는 아직 HydroMonitor 실시간 수위비교 시스템에 관측 자료가 등록되지 않았거나 자료 취득 전 상태입니다.<br>
            <span style="font-size: 0.82rem; color: #64748b; display: block; margin-top: 8px;">
              관측소 코드: <b>${station.code || "-"}</b> &nbsp;|&nbsp; 수계: <b>${station.river || "-"} (${station.region || "-"})</b> &nbsp;|&nbsp; 유속계: <b>${station.gaugeType || "-"}</b>
            </span>
            <span style="font-size: 0.8rem; color: #94a3b8; display: block; margin-top: 6px;">
              (현재 HydroMonitor 서버에서 실시간 수위 비교가 연계된 171개 관측소에 한해 실시간 수위 및 편차가 표출됩니다.)
            </span>
          `;
        }
      }

      if (titleEl) titleEl.textContent = `📊 실시간 수위 비교 분석 - ${station.name} (${station.river || ""} / ${station.region || ""})`;
      if (subEl) subEl.textContent = `관측소 코드: ${station.code || "-"} | 유속계: ${station.gaugeType || "-"} | 상태: 자료 취득 전 (HydroMonitor 미연계)`;
      return;
    }

    // Case 2: Station has live data from HydroMonitor
    if (nodataEl) nodataEl.style.display = "none";
    if (contentEl) contentEl.style.display = "block";

    // 1. Header Info
    if (titleEl) titleEl.textContent = `📊 실시간 수위 비교 분석 - ${station.name} (${station.river || ""} / ${station.region || ""})`;
    const refStInfo = station.refStation ? ` | 대응관측소: ${station.refStation}` : "";
    const updateTimeInfo = summary.lastUpdated ? ` | 대상시각: ${summary.lastUpdated}` : "";
    if (subEl) subEl.textContent = `관측소 코드: ${station.code} | 유속계: ${station.gaugeType}${refStInfo}${updateTimeInfo}`;

    // 2. Summary KPI Cards
    const gaugeEl = document.getElementById("wl-kpi-gauge");
    const refEl = document.getElementById("wl-kpi-ref");
    const diffEl = document.getElementById("wl-kpi-diff");
    const statBadgeEl = document.getElementById("wl-kpi-status-badge");
    const maxDiffEl = document.getElementById("wl-kpi-max-diff");
    const avgDiffEl = document.getElementById("wl-kpi-avg-diff");

    if (gaugeEl) gaugeEl.textContent = summary.currentGaugeWL !== null ? `${summary.currentGaugeWL.toFixed(3)} m` : "결측";
    if (refEl) refEl.textContent = summary.currentRefWL !== null ? `${summary.currentRefWL.toFixed(3)} m` : "결측";
    if (diffEl) diffEl.textContent = summary.currentDiffCm !== null ? `${summary.currentDiffCm.toFixed(1)} cm` : "-";
    if (maxDiffEl) maxDiffEl.textContent = summary.maxDiffCm !== null ? `${summary.maxDiffCm.toFixed(1)} cm` : "-";
    if (avgDiffEl) avgDiffEl.textContent = summary.avgDiffCm !== null ? `${summary.avgDiffCm.toFixed(1)} cm` : "-";

    if (statBadgeEl) {
      if (summary.status === "CRITICAL") {
        statBadgeEl.className = "badge badge-red";
        statBadgeEl.textContent = `🚨 ${summary.statusLabel || "경계 (수위차 ≥ 20cm)"}`;
      } else if (summary.status === "ATTENTION") {
        statBadgeEl.className = "badge badge-amber";
        statBadgeEl.textContent = `⚠️ ${summary.statusLabel || "관심 (수위차 ≥ 10cm)"}`;
      } else if (summary.status === "MISSING") {
        statBadgeEl.className = "badge badge-gray";
        statBadgeEl.textContent = `📡 ${summary.statusLabel || "자료 결측"}`;
      } else {
        statBadgeEl.className = "badge badge-green";
        statBadgeEl.textContent = `✅ ${summary.statusLabel || "정상 (10cm 이내)"}`;
      }
    }

    // 3. Render Charts
    this.renderCharts(timeSeries || [], station, period, summary);

    // 4. Render Table
    this.renderTable(timeSeries || []);
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

    if (!timeSeries || timeSeries.length === 0) return;

    const labels = timeSeries.map(p => p.time);
    const gaugeData = timeSeries.map(p => p.gaugeWL);
    const refData = timeSeries.map(p => p.refWL);
    const diffData = timeSeries.map(p => p.diffCm);

    // Confidence / Tolerance Band (Ref ± 0.100m = ±10cm)
    const upperBand = refData.map(v => v !== null ? Number((v + 0.10).toFixed(3)) : null);
    const lowerBand = refData.map(v => v !== null ? Number((v - 0.10).toFixed(3)) : null);

    const showBand = document.getElementById("wl-toggle-tolerance-band") ? document.getElementById("wl-toggle-tolerance-band").checked : true;

    // --- 1. Top Chart: Water Level Curves (m) ---
    const mainCtx = mainCanvas.getContext("2d");
    this.chart = new Chart(mainCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `자동유량측정시설 수위 (${station.gaugeType || "유속계"})`,
            data: gaugeData,
            borderColor: "#2563eb",
            backgroundColor: "transparent",
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#2563eb",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 2,
            spanGaps: false,
            tension: 0.15,
            order: 1
          },
          {
            label: `수위관측소 원수위 (${station.refStation || "대응관측소"})`,
            data: refData,
            borderColor: "#dc2626",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#dc2626",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 2,
            spanGaps: false,
            tension: 0.15,
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
            spanGaps: false,
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
            spanGaps: false,
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
                if (ctx.datasetIndex === 2) return ` 🛡️ 관심기준 범위: ±10.0 cm (녹색 음영)`;
                if (ctx.datasetIndex === 3) return null;
                const val = ctx.parsed.y;
                return val !== null ? ` ${ctx.dataset.label}: ${val.toFixed(3)} m` : ` ${ctx.dataset.label}: 결측`;
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

    const maxDiffVal = Math.max(25, (summary.maxDiffCm || 0) + 4);

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
            tension: 0.15,
            spanGaps: false,
            pointRadius: (ctx) => {
              const val = ctx.raw;
              if (val === null) return 0;
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
                  if (val === null) return ` 편차: 결측`;
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

    if (!timeSeries || timeSeries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:#64748b;">표시할 수위 시계열 데이터가 없습니다.</td></tr>`;
      return;
    }

    // Show recent 30 points in reverse order (newest first)
    const recent = [...timeSeries].reverse().slice(0, 30);
    tbody.innerHTML = recent.map(p => {
      let badge = `<span class="badge badge-green">정상</span>`;
      if (p.status === "MISSING" || p.gaugeWL === null || p.refWL === null) {
        badge = `<span class="badge badge-gray">결측</span>`;
      } else if (p.status === "CRITICAL" || (p.diffCm !== null && p.diffCm >= 20.0)) {
        badge = `<span class="badge badge-red">경계 (${p.diffCm}cm)</span>`;
      } else if (p.status === "ATTENTION" || (p.diffCm !== null && p.diffCm >= 10.0)) {
        badge = `<span class="badge badge-amber">관심 (${p.diffCm}cm)</span>`;
      }

      const gaugeStr = p.gaugeWL !== null ? `${p.gaugeWL.toFixed(3)} m` : `<span style="color:#94a3b8;">결측</span>`;
      const refStr = p.refWL !== null ? `${p.refWL.toFixed(3)} m` : `<span style="color:#94a3b8;">결측</span>`;
      const diffStr = p.diffCm !== null ? `${p.diffCm.toFixed(1)} cm` : `<span style="color:#94a3b8;">-</span>`;
      const diffColor = p.diffCm !== null ? (p.diffCm >= 20.0 ? '#dc2626' : (p.diffCm >= 10.0 ? '#d97706' : '#1e293b')) : '#94a3b8';

      return `
        <tr>
          <td style="font-weight:600; font-size:0.8rem;">${p.time}</td>
          <td style="font-weight:700; color:#2563eb;">${gaugeStr}</td>
          <td style="font-weight:600; color:#dc2626;">${refStr}</td>
          <td style="font-weight:800; color:${diffColor};">${diffStr}</td>
          <td>${badge}</td>
        </tr>
      `;
    }).join("");
  }
}

window.waterLevelManager = new WaterLevelCompareManager();
