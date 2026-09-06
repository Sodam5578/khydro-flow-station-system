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
  }

  setPeriod(period) {
    this.currentPeriod = period;
    document.querySelectorAll(".wl-period-btn").forEach(btn => {
      btn.classList.toggle("btn-primary", btn.dataset.period === period);
      btn.classList.toggle("btn-outline", btn.dataset.period !== period);
    });
    this.loadData();
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
        statBadgeEl.textContent = "🚨 경보 (오차 > 10cm)";
      } else if (summary.status === "ATTENTION") {
        statBadgeEl.className = "badge badge-amber";
        statBadgeEl.textContent = "⚠️ 주의 (오차 > 5cm)";
      } else {
        statBadgeEl.className = "badge badge-green";
        statBadgeEl.textContent = "✅ 정상 (허용범위 내)";
      }
    }

    // 3. Render Chart
    this.renderChart(timeSeries, station, period);

    // 4. Render Table
    this.renderTable(timeSeries);
  }

  renderChart(timeSeries, station, period) {
    const canvas = document.getElementById("wl-chart-canvas");
    if (!canvas) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const labels = timeSeries.map(p => p.time);
    const gaugeData = timeSeries.map(p => p.gaugeWL);
    const refData = timeSeries.map(p => p.refWL);
    const diffData = timeSeries.map(p => p.diffCm);

    const ctx = canvas.getContext("2d");
    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `유속계 측정 수위 (${station.gaugeType})`,
            data: gaugeData,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            borderWidth: 2.2,
            pointRadius: period === "7d" ? 1.5 : 2,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            label: `기준 수위계 (${station.waterLevelType})`,
            data: refData,
            borderColor: "#16a34a",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            type: "bar",
            label: "수위차 (|오차|, cm)",
            data: diffData,
            backgroundColor: diffData.map(v => v > 10 ? "rgba(220, 38, 38, 0.6)" : (v > 5 ? "rgba(217, 119, 6, 0.5)" : "rgba(100, 116, 139, 0.25)")),
            borderColor: diffData.map(v => v > 10 ? "#dc2626" : (v > 5 ? "#d97706" : "#94a3b8")),
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: "yDiff",
            barPercentage: 0.6
          }
        ]
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
            position: "top",
            labels: {
              boxWidth: 14,
              font: { family: "Pretendard", size: 12, weight: "600" }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 2) {
                  return `수위차: ${context.parsed.y.toFixed(1)} cm`;
                }
                return `${context.dataset.label}: ${context.parsed.y.toFixed(3)} m`;
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
            display: true,
            position: "left",
            title: {
              display: true,
              text: "수위 (m)",
              font: { family: "Pretendard", size: 11, weight: "600" }
            },
            grid: { color: "rgba(226, 232, 240, 0.6)" }
          },
          yDiff: {
            type: "linear",
            display: true,
            position: "right",
            min: 0,
            suggestedMax: 15,
            title: {
              display: true,
              text: "수위차 (cm)",
              font: { family: "Pretendard", size: 11, weight: "600" }
            },
            grid: { display: false }
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
      if (p.status === "CRITICAL") badge = `<span class="badge badge-red">경보 (${p.diffCm}cm)</span>`;
      else if (p.status === "ATTENTION") badge = `<span class="badge badge-amber">주의 (${p.diffCm}cm)</span>`;

      return `
        <tr>
          <td style="font-weight:600; font-size:0.8rem;">${p.time}</td>
          <td style="font-weight:700; color:#2563eb;">${p.gaugeWL.toFixed(3)} m</td>
          <td style="font-weight:600; color:#16a34a;">${p.refWL.toFixed(3)} m</td>
          <td style="font-weight:800; color:${p.diffCm > 5 ? '#dc2626' : '#1e293b'};">${p.diffCm.toFixed(1)} cm</td>
          <td>${badge}</td>
        </tr>
      `;
    }).join("");
  }
}

window.waterLevelManager = new WaterLevelCompareManager();
