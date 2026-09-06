/**
 * ScheduleManager
 * Enhanced Team Inspection & Task Calendar Controller for Flow Observation Network.
 * Features:
 *  1. Korean Legal Public Holidays Display & Red Highlighting (신정, 설날, 3·1절, 어린이날, 광복절, 추석, 한글날, 성탄절 등).
 *  2. Vacation & Leave Schedule Support (🌴 휴가·연차).
 *  3. Multi-Select Searchable Station Picker (Tag Chips + Real-time Search).
 *  4. Multi-Assignee & Companion Attendees (출장 동행자 지원).
 *  5. Role & Ownership Permission Guard (Creator, Assignee, Attendees, Admin).
 *  6. Month Calendar & Timeline List View with SQLite DB Persistence.
 */

// Korean Legal Public Holidays Map (2025 ~ 2027)
const KOREAN_HOLIDAYS = {
  // 2025
  "2025-01-01": "신정",
  "2025-01-28": "설날 연휴",
  "2025-01-29": "설날",
  "2025-01-30": "설날 연휴",
  "2025-03-01": "3·1절",
  "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날",
  "2025-05-06": "대체공휴일",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석 연휴",
  "2025-10-06": "추석",
  "2025-10-07": "추석 연휴",
  "2025-10-08": "대체공휴일",
  "2025-10-09": "한글날",
  "2025-12-25": "성탄절",

  // 2026
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "3·1절",
  "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",

  // 2027
  "2027-01-01": "신정",
  "2027-02-06": "설날 연휴",
  "2027-02-07": "설날",
  "2027-02-08": "설날 연휴",
  "2027-02-09": "대체공휴일",
  "2027-03-01": "3·1절",
  "2027-05-05": "어린이날",
  "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일",
  "2027-08-15": "광복절",
  "2027-08-16": "대체공휴일",
  "2027-09-14": "추석 연휴",
  "2027-09-15": "추석",
  "2027-09-16": "추석 연휴",
  "2027-10-03": "개천절",
  "2027-10-04": "대체공휴일",
  "2027-10-09": "한글날",
  "2027-10-11": "대체공휴일",
  "2027-12-25": "성탄절"
};

class ScheduleManager {
  constructor() {
    this.currentDate = new Date();
    this.currentView = "calendar";
    this.schedules = [];
    this.selectedAssignee = "all";
    this.selectedType = "all";
    this.searchTerm = "";
    this.currentEditingId = null;
    this.selectedStations = [];
    this.stationSearchKeyword = "";
  }

  async init() {
    this.bindEvents();
    await this.loadSchedules();
  }

  bindEvents() {
    const searchInput = document.getElementById("sched-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.renderCurrentView();
      });
    }

    // Close station dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const dropdown = document.getElementById("sched-station-dropdown");
      const searchInput = document.getElementById("sched-station-search-input");
      if (dropdown && searchInput && !dropdown.contains(e.target) && e.target !== searchInput) {
        dropdown.style.display = "none";
      }
    });
  }

  async loadSchedules() {
    if (window.apiClient) {
      try {
        const res = await window.apiClient.getSchedules();
        if (res.success && Array.isArray(res.schedules)) {
          this.schedules = res.schedules.map(s => {
            let stIds = [];
            if (s.station_id) {
              if (String(s.station_id).startsWith("[")) {
                try { stIds = JSON.parse(s.station_id); } catch(e) { stIds = [s.station_id]; }
              } else {
                stIds = String(s.station_id).split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
              }
            }

            return {
              id: s.id,
              title: s.title,
              stationIds: stIds,
              stationId: stIds[0] || s.station_id,
              stationName: s.station_name || "",
              scheduleType: s.schedule_type,
              startDate: s.start_date,
              endDate: s.end_date || s.start_date,
              assignee: s.assignee,
              attendees: s.attendees || "",
              status: s.status || "scheduled",
              description: s.description || "",
              createdBy: s.created_by
            };
          });
        }
      } catch (e) {
        console.error("Failed to load schedules from server:", e);
      }
    }

    this.renderCurrentView();
    this.renderKPIs();
  }

  /* Multi-Select Searchable Station Picker Logic */
  showStationDropdown() {
    const dropdown = document.getElementById("sched-station-dropdown");
    if (!dropdown) return;
    dropdown.style.display = "block";
    this.renderStationDropdownList();
  }

  hideStationDropdown() {
    const dropdown = document.getElementById("sched-station-dropdown");
    if (dropdown) dropdown.style.display = "none";
  }

  onStationSearch(keyword) {
    this.stationSearchKeyword = (keyword || "").trim().toLowerCase();
    this.showStationDropdown();
  }

  renderStationDropdownList() {
    const dropdown = document.getElementById("sched-station-dropdown");
    if (!dropdown) return;

    const allStations = window.dataManager.getAll();
    let filtered = allStations;

    if (this.stationSearchKeyword) {
      filtered = allStations.filter(st => {
        const name = (st.name || "").toLowerCase();
        const river = (st.river || "").toLowerCase();
        const reg = (st.region || "").toLowerCase();
        const code = String(st.code || "").toLowerCase();
        return name.includes(this.stationSearchKeyword) || river.includes(this.stationSearchKeyword) || reg.includes(this.stationSearchKeyword) || code.includes(this.stationSearchKeyword);
      });
    }

    if (filtered.length === 0) {
      dropdown.innerHTML = `<div style="padding:0.75rem; text-align:center; color:#94a3b8; font-size:0.8rem;">검색어에 일치하는 관측소가 없습니다.</div>`;
      return;
    }

    dropdown.innerHTML = filtered.slice(0, 50).map(st => {
      const isSelected = this.selectedStations.some(s => s.id === st.id);
      return `
        <div class="station-dropdown-item ${isSelected ? "selected" : ""}" 
             onclick="window.scheduleManager.toggleStation(${st.id})">
          <div>
            <span style="font-weight:700;">${st.name}</span>
            <span style="font-size:0.75rem; color:#64748b; margin-left:4px;">(${st.region || "-"} / ${st.river || "-"} / ${st.code || "-"})</span>
          </div>
          <div>
            ${isSelected ? '<span style="color:#059669; font-weight:700;">✓ 선택됨</span>' : '<span style="color:#2563eb; font-size:0.75rem;">+ 추가</span>'}
          </div>
        </div>
      `;
    }).join("");
  }

  toggleStation(stationId) {
    const st = window.dataManager.getById(stationId);
    if (!st) return;

    const existingIdx = this.selectedStations.findIndex(s => s.id === st.id);
    if (existingIdx >= 0) {
      this.selectedStations.splice(existingIdx, 1);
    } else {
      this.selectedStations.push({
        id: st.id,
        name: st.name,
        river: st.river,
        region: st.region
      });
    }

    this.renderSelectedStationChips();
    this.renderStationDropdownList();
  }

  removeStation(stationId) {
    this.selectedStations = this.selectedStations.filter(s => s.id !== stationId);
    this.renderSelectedStationChips();
    this.renderStationDropdownList();
  }

  renderSelectedStationChips(isReadOnly = false) {
    const container = document.getElementById("sched-selected-stations-chips");
    const countEl = document.getElementById("sched-selected-station-count");
    if (!container) return;

    if (countEl) {
      countEl.textContent = `${this.selectedStations.length}개소 선택됨`;
    }

    if (this.selectedStations.length === 0) {
      container.innerHTML = `<span style="font-size:0.75rem; color:#94a3b8; line-height:28px;">* 선택된 관측소가 없습니다. (지정하지 않으면 일반 업무/회의/휴가 일정으로 등록됩니다)</span>`;
      return;
    }

    container.innerHTML = this.selectedStations.map(st => `
      <span class="station-tag-chip">
        <span>📍 ${st.name}</span>
        ${!isReadOnly ? `<span class="remove-chip" onclick="window.scheduleManager.removeStation(${st.id})">&times;</span>` : ""}
      </span>
    `).join("");
  }

  /* Attendees Helper: Quick Toggle Team Members */
  toggleAttendee(name) {
    const input = document.getElementById("sched-form-attendees");
    if (!input) return;

    let current = input.value.split(",").map(s => s.trim()).filter(Boolean);
    const idx = current.indexOf(name);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(name);
    }
    input.value = current.join(", ");
  }

  /* Permission Check: Can current user edit or delete this schedule? */
  canEditSchedule(s) {
    if (!s) return false;
    const currentUser = window.apiClient?.user;
    if (!currentUser) return false;
    // 최고 관리자(admin)는 모든 일정 수정 및 드래그 이동 가능
    if (currentUser.role === "admin" || currentUser.username === "admin") return true;

    const currentName = currentUser.name;
    const currentUsername = currentUser.username;

    // 본인 등록 일정, 본인 담당 일정, 본인 동행 일정만 수정 가능
    const isCreator = s.createdBy && (s.createdBy.includes(currentUsername) || s.createdBy.includes(currentName));
    const isAssignee = s.assignee === currentName || s.assignee === "전체";
    const isAttendee = (s.attendees || "").split(",").map(a => a.trim()).includes(currentName);

    return !!(isCreator || isAssignee || isAttendee);
  }

  onFilterChange() {
    const assigneeSelect = document.getElementById("sched-filter-assignee");
    if (assigneeSelect) this.selectedAssignee = assigneeSelect.value;

    const typeSelect = document.getElementById("sched-filter-type");
    if (typeSelect) this.selectedType = typeSelect.value;

    this.renderCurrentView();
  }

  switchView(viewMode) {
    this.currentView = viewMode;
    const calContainer = document.getElementById("sched-calendar-container");
    const listContainer = document.getElementById("sched-list-container");
    const btnCal = document.getElementById("sched-btn-cal-view");
    const btnList = document.getElementById("sched-btn-list-view");

    if (viewMode === "calendar") {
      if (calContainer) calContainer.style.display = "block";
      if (listContainer) listContainer.style.display = "none";
      if (btnCal) btnCal.classList.add("active");
      if (btnList) btnList.classList.remove("active");
    } else {
      if (calContainer) calContainer.style.display = "none";
      if (listContainer) listContainer.style.display = "block";
      if (btnCal) btnCal.classList.remove("active");
      if (btnList) btnList.classList.add("active");
    }

    this.renderCurrentView();
  }

  renderCurrentView() {
    if (this.currentView === "calendar") {
      this.renderCalendar();
    } else {
      this.renderList();
    }
  }

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.renderCalendar();
    this.renderKPIs();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.renderCalendar();
    this.renderKPIs();
  }

  today() {
    this.currentDate = new Date();
    this.renderCalendar();
    this.renderKPIs();
  }

  getFilteredSchedules() {
    let filtered = [...this.schedules];

    if (this.selectedAssignee !== "all") {
      filtered = filtered.filter(s => {
        const matchesAssignee = s.assignee === this.selectedAssignee || s.assignee === "전체";
        const matchesAttendee = (s.attendees || "").includes(this.selectedAssignee);
        return matchesAssignee || matchesAttendee;
      });
    }

    if (this.selectedType !== "all") {
      filtered = filtered.filter(s => s.scheduleType === this.selectedType);
    }

    if (this.searchTerm) {
      filtered = filtered.filter(s => {
        const title = (s.title || "").toLowerCase();
        const stName = (s.stationName || "").toLowerCase();
        const desc = (s.description || "").toLowerCase();
        const assignee = (s.assignee || "").toLowerCase();
        const attendees = (s.attendees || "").toLowerCase();
        return title.includes(this.searchTerm) || stName.includes(this.searchTerm) || desc.includes(this.searchTerm) || assignee.includes(this.searchTerm) || attendees.includes(this.searchTerm);
      });
    }

    return filtered;
  }

  renderKPIs() {
    const yyyy = this.currentDate.getFullYear();
    const mm = String(this.currentDate.getMonth() + 1).padStart(2, "0");
    const monthPrefix = `${yyyy}-${mm}`;

    const thisMonthSchedules = this.schedules.filter(s => s.startDate && s.startDate.startsWith(monthPrefix));

    const totalEl = document.getElementById("kpi-sched-total");
    const checkEl = document.getElementById("kpi-sched-check");
    const maintEl = document.getElementById("kpi-sched-maint");
    const calibEl = document.getElementById("kpi-sched-calib");
    const vacEl = document.getElementById("kpi-sched-vacation");

    if (totalEl) totalEl.textContent = `${thisMonthSchedules.length}건`;
    if (checkEl) checkEl.textContent = `${thisMonthSchedules.filter(s => s.scheduleType === "check").length}건`;
    if (maintEl) maintEl.textContent = `${thisMonthSchedules.filter(s => s.scheduleType === "maint").length}건`;
    if (calibEl) calibEl.textContent = `${thisMonthSchedules.filter(s => s.scheduleType === "calib").length}건`;
    if (vacEl) vacEl.textContent = `${thisMonthSchedules.filter(s => s.scheduleType === "vacation").length}건`;
  }

  renderCalendar() {
    const grid = document.getElementById("calendar-days-grid");
    const monthTitle = document.getElementById("calendar-current-month");
    if (!grid) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    if (monthTitle) {
      monthTitle.textContent = `${year}년 ${month + 1}월`;
    }

    const firstDay = new Date(year, month, 1);
    const startingDay = firstDay.getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const todayDate = new Date();
    const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;

    const filteredSchedules = this.getFilteredSchedules();

    // 1. Build flat array of all calendar grid days (35 or 42 days)
    const calendarDays = [];

    // Trailing previous month days
    for (let i = startingDay - 1; i >= 0; i--) {
      const d = prevLastDate - i;
      const prevMonthIdx = month === 0 ? 12 : month;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonthIdx).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      calendarDays.push({
        dateStr,
        dayNum: d,
        isOtherMonth: true,
        isToday: dateStr === todayStr,
        holidayName: KOREAN_HOLIDAYS[dateStr] || "",
        dayOfWeek: calendarDays.length % 7
      });
    }

    // Current month days
    for (let d = 1; d <= lastDate; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      calendarDays.push({
        dateStr,
        dayNum: d,
        isOtherMonth: false,
        isToday: dateStr === todayStr,
        holidayName: KOREAN_HOLIDAYS[dateStr] || "",
        dayOfWeek: calendarDays.length % 7
      });
    }

    // Leading next month days
    const totalRendered = calendarDays.length;
    const remaining = (7 - (totalRendered % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextMonthIdx = month + 2 > 12 ? 1 : month + 2;
      const nextYear = month + 2 > 12 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonthIdx).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      calendarDays.push({
        dateStr,
        dayNum: d,
        isOtherMonth: true,
        isToday: dateStr === todayStr,
        holidayName: KOREAN_HOLIDAYS[dateStr] || "",
        dayOfWeek: calendarDays.length % 7
      });
    }

    // 2. Process in chunks of 7 days (Week by Week) with Apple Calendar Slot Packing
    let gridHtml = "";
    const weeksCount = calendarDays.length / 7;

    for (let w = 0; w < weeksCount; w++) {
      const weekDays = calendarDays.slice(w * 7, (w + 1) * 7);
      const weekStartStr = weekDays[0].dateStr;
      const weekEndStr = weekDays[6].dateStr;

      // Find all schedules overlapping this week
      const weekSchedules = filteredSchedules.filter(s => {
        const start = s.startDate;
        const end = s.endDate || s.startDate;
        return start <= weekEndStr && end >= weekStartStr;
      });

      // Sort: Multi-day spans first (longer duration first), then single days, then by id
      weekSchedules.sort((a, b) => {
        const aStart = a.startDate;
        const aEnd = a.endDate || a.startDate;
        const bStart = b.startDate;
        const bEnd = b.endDate || b.startDate;
        const aDuration = (new Date(aEnd) - new Date(aStart));
        const bDuration = (new Date(bEnd) - new Date(bStart));
        if (bDuration !== aDuration) return bDuration - aDuration;
        return a.id - b.id;
      });

      // Slot allocation array: slots[slotIndex][dayIndex (0..6)] = item | null
      const slots = [];

      weekSchedules.forEach(s => {
        const start = s.startDate;
        const end = s.endDate || s.startDate;

        // Calculate startDayIdx and endDayIdx within this week (0..6)
        let startIdx = 0;
        let endIdx = 6;

        for (let i = 0; i < 7; i++) {
          if (weekDays[i].dateStr === start) startIdx = i;
          if (weekDays[i].dateStr < start) startIdx = i + 1;
          if (weekDays[i].dateStr === end) endIdx = i;
          if (weekDays[i].dateStr > end && endIdx === 6) endIdx = Math.max(0, i - 1);
        }

        startIdx = Math.max(0, Math.min(6, startIdx));
        endIdx = Math.max(startIdx, Math.min(6, endIdx));

        // Find lowest available slot
        let targetSlot = -1;
        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
          let canFit = true;
          for (let dIdx = startIdx; dIdx <= endIdx; dIdx++) {
            if (slots[sIdx][dIdx] !== null) {
              canFit = false;
              break;
            }
          }
          if (canFit) {
            targetSlot = sIdx;
            break;
          }
        }

        if (targetSlot === -1) {
          targetSlot = slots.length;
          slots.push([null, null, null, null, null, null, null]);
        }

        for (let dIdx = startIdx; dIdx <= endIdx; dIdx++) {
          slots[targetSlot][dIdx] = {
            schedule: s,
            isMultiDay: start !== end,
            isStart: weekDays[dIdx].dateStr === start || dIdx === 0,
            isEnd: weekDays[dIdx].dateStr === end || dIdx === 6,
            isMiddle: weekDays[dIdx].dateStr > start && weekDays[dIdx].dateStr < end && dIdx !== 0 && dIdx !== 6,
            isEndOfWeek: dIdx === 6 && weekDays[dIdx].dateStr < end,
            isStartOfWeek: dIdx === 0 && weekDays[dIdx].dateStr > start
          };
        }
      });

      // Render the 7 day cells for this week
      for (let dIdx = 0; dIdx < 7; dIdx++) {
        const day = weekDays[dIdx];
        let cellClasses = "calendar-day-cell";
        if (day.isOtherMonth) cellClasses += " other-month";
        if (day.isToday) cellClasses += " today";
        if (dIdx === 0) cellClasses += " sun";
        if (dIdx === 6) cellClasses += " sat";
        if (day.holidayName) cellClasses += " holiday";

        // Render slots for this specific day
        let eventsHtml = "";
        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
          const item = slots[sIdx][dIdx];
          if (!item) {
            eventsHtml += `<div class="schedule-chip-spacer"></div>`;
          } else {
            const s = item.schedule;
            let chipClass = "chip-type-check";
            let icon = "🚗";
            if (s.scheduleType === "maint") { chipClass = "chip-type-maint"; icon = "🛠️"; }
            else if (s.scheduleType === "calib") { chipClass = "chip-type-calib"; icon = "🎯"; }
            else if (s.scheduleType === "meeting") { chipClass = "chip-type-meeting"; icon = "💻"; }
            else if (s.scheduleType === "vacation") { chipClass = "chip-type-vacation"; icon = "🌴"; }
            else if (s.scheduleType === "emergency") { chipClass = "chip-type-emergency"; icon = "🚨"; }

            const statusDone = s.status === "completed" ? "✓" : "";
            let peopleLabel = `[${s.assignee}]`;
            if (s.attendees) {
              const count = s.attendees.split(",").filter(Boolean).length;
              peopleLabel = `[${s.assignee}+${count}]`;
            }
            const stCount = (s.stationIds && s.stationIds.length > 1) ? ` (+${s.stationIds.length})` : "";

            let spanClass = "chip-span-single";
            let contentHtml = "";

            if (!item.isMultiDay) {
              // Single day event
              spanClass = "chip-span-single";
              contentHtml = `
                <span style="flex-shrink:0;">${icon}</span>
                <span style="font-weight:700; flex-shrink:0;">${peopleLabel}</span>
                <span class="chip-title">${s.title}${stCount}</span>
                ${statusDone ? `<span style="flex-shrink:0; font-weight:700;">${statusDone}</span>` : ""}
              `;
            } else {
              // Multi-day continuous event
              if (item.isStart) {
                spanClass = item.isEndOfWeek ? "chip-span-start" : (item.isEnd ? "chip-span-single" : "chip-span-start");
                contentHtml = `
                  <span style="flex-shrink:0;">${icon}</span>
                  <span style="font-weight:700; flex-shrink:0;">${peopleLabel}</span>
                  <span class="chip-title">${s.title}${stCount}</span>
                `;
              } else if (item.isEnd) {
                spanClass = "chip-span-end";
                contentHtml = `<span class="chip-title" style="visibility:hidden;">&nbsp;</span>`;
              } else {
                spanClass = item.isEndOfWeek ? "chip-span-end-of-week" : "chip-span-middle";
                contentHtml = `<span class="chip-title" style="visibility:hidden;">&nbsp;</span>`;
              }
            }

            const end = s.endDate || s.startDate;
            const canEdit = this.canEditSchedule(s);
            eventsHtml += `
              <div class="schedule-chip ${spanClass} ${chipClass}" 
                   ${canEdit ? `draggable="true" ondragstart="window.scheduleManager.onDragStart(event, ${s.id})" ondragend="window.scheduleManager.onDragEnd(event)"` : ""}
                   title="${s.title} (${s.startDate}~${end}) [${s.assignee}${s.attendees ? `, ${s.attendees}` : ""}]${canEdit ? " (마우스로 끌어서 날짜 이동 가능)" : ""}"
                   onclick="event.stopPropagation(); window.scheduleManager.openEditModal(${s.id})">
                ${contentHtml}
              </div>
            `;
          }
        }

        gridHtml += `
          <div class="${cellClasses}" 
               ondragover="window.scheduleManager.onDragOver(event)"
               ondragenter="window.scheduleManager.onDragEnter(event)"
               ondragleave="window.scheduleManager.onDragLeave(event)"
               ondrop="window.scheduleManager.onDrop(event, '${day.dateStr}')"
               onclick="window.scheduleManager.openAddModal('${day.dateStr}')">
            <div class="day-header">
              <span class="day-number">${day.dayNum}</span>
              ${day.holidayName ? `<span class="holiday-label" title="${day.holidayName}">${day.holidayName}</span>` : ""}
            </div>
            <div class="day-events">
              ${eventsHtml}
            </div>
          </div>
        `;
      }
    }

    grid.innerHTML = gridHtml;
  }

  /* Drag and Drop Date Rescheduling */
  onDragStart(e, scheduleId) {
    this.draggedScheduleId = scheduleId;
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", String(scheduleId));
      e.dataTransfer.effectAllowed = "move";
    }
    const chip = e.currentTarget;
    if (chip) chip.classList.add("is-dragging");
  }

  onDragEnd(e) {
    this.draggedScheduleId = null;
    const chip = e.currentTarget;
    if (chip) chip.classList.remove("is-dragging");
    document.querySelectorAll(".calendar-day-cell.drag-target-hover").forEach(el => {
      el.classList.remove("drag-target-hover");
    });
  }

  onDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  onDragEnter(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    if (cell && cell.classList.contains("calendar-day-cell")) {
      cell.classList.add("drag-target-hover");
    }
  }

  onDragLeave(e) {
    const cell = e.currentTarget;
    if (cell && cell.classList.contains("calendar-day-cell")) {
      // Only remove if leaving the cell itself
      if (!cell.contains(e.relatedTarget)) {
        cell.classList.remove("drag-target-hover");
      }
    }
  }

  async onDrop(e, targetDateStr) {
    e.preventDefault();
    const cell = e.currentTarget;
    if (cell) cell.classList.remove("drag-target-hover");

    const scheduleId = parseInt(e.dataTransfer?.getData("text/plain") || this.draggedScheduleId, 10);
    if (!scheduleId) return;

    const schedule = this.schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    // Permission check
    if (!this.canEditSchedule(schedule)) {
      alert("본인이 등록한 일정만 날짜를 변경할 수 있습니다.");
      return;
    }

    // Calculate new start & end dates preserving duration
    const oldStart = new Date(schedule.startDate);
    const oldEnd = new Date(schedule.endDate || schedule.startDate);
    const targetStart = new Date(targetDateStr);

    const diffTime = targetStart.getTime() - oldStart.getTime();
    if (diffTime === 0) return; // Same date dropped

    const newEnd = new Date(oldEnd.getTime() + diffTime);
    const newStartDate = targetDateStr;
    const newEndDate = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, "0")}-${String(newEnd.getDate()).padStart(2, "0")}`;

    const oldStartStr = schedule.startDate;
    const oldEndStr = schedule.endDate || schedule.startDate;

    // Optimistic UI update
    schedule.startDate = newStartDate;
    schedule.endDate = newEndDate;
    this.renderCurrentView();
    this.renderKPIs();

    // Persist to server
    try {
      if (window.apiClient) {
        const res = await window.apiClient.updateSchedule(schedule.id, {
          title: schedule.title,
          scheduleType: schedule.scheduleType,
          startDate: newStartDate,
          endDate: newEndDate,
          assignee: schedule.assignee,
          attendees: schedule.attendees,
          stationIds: schedule.stationIds,
          status: schedule.status,
          description: schedule.description
        });

        if (res.success) {
          if (window.app) {
            window.app.showToast(`📅 '${schedule.title}' 일정이 [${newStartDate}${newStartDate !== newEndDate ? ` ~ ${newEndDate}` : ""}]로 변경되었습니다.`, "success");
          }
        } else {
          // Rollback on failure
          schedule.startDate = oldStartStr;
          schedule.endDate = oldEndStr;
          this.renderCurrentView();
          alert(res.error || "일정 날짜 변경에 실패했습니다.");
        }
      }
    } catch (err) {
      console.error("Failed to update schedule date via drag & drop:", err);
      schedule.startDate = oldStartStr;
      schedule.endDate = oldEndStr;
      this.renderCurrentView();
      alert("일정 날짜 변경 중 서버 오류가 발생했습니다.");
    }
  }


  renderList() {
    const tbody = document.getElementById("sched-list-tbody");
    const countEl = document.getElementById("sched-list-count");
    if (!tbody) return;

    const filtered = this.getFilteredSchedules();
    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2.5rem; color:#94a3b8;">조건에 해당하는 업무·점검 일정이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s, idx) => {
      let typeBadge = `<span class="badge badge-blue">🚗 현장점검</span>`;
      if (s.scheduleType === "maint") typeBadge = `<span class="badge badge-amber">🛠️ 유지관리</span>`;
      else if (s.scheduleType === "calib") typeBadge = `<span class="badge badge-cyan">🎯 유속계검정</span>`;
      else if (s.scheduleType === "meeting") typeBadge = `<span class="badge badge-purple">💻 회의/업무</span>`;
      else if (s.scheduleType === "vacation") typeBadge = `<span class="badge badge-green">🌴 휴가</span>`;
      else if (s.scheduleType === "emergency") typeBadge = `<span class="badge badge-red">🚨 긴급보수</span>`;

      let statusBadge = `<span class="badge badge-gray">⏳ 예정</span>`;
      if (s.status === "in_progress") statusBadge = `<span class="badge badge-blue">🔄 진행중</span>`;
      else if (s.status === "completed") statusBadge = `<span class="badge badge-green">✅ 완료</span>`;
      else if (s.status === "cancelled") statusBadge = `<span class="badge badge-red">🚫 취소</span>`;

      const dateDisplay = s.startDate === s.endDate ? s.startDate : `${s.startDate} ~ ${s.endDate}`;
      
      // Multi station rendering
      let stationDisplay = `<span style="color:#94a3b8;">-</span>`;
      if (s.stationName) {
        const names = s.stationName.split(",").map(n => n.trim());
        if (names.length === 1) {
          stationDisplay = `<span style="color:#1e40af; font-weight:600; cursor:pointer;" onclick="${s.stationId ? `window.modalManager.openDetail(${s.stationId})` : ''}">📍 ${names[0]}</span>`;
        } else {
          stationDisplay = `
            <div>
              <span style="color:#1e40af; font-weight:700;">📍 ${names[0]}</span>
              <span class="badge badge-blue" style="font-size:0.68rem; margin-left:2px;">외 ${names.length - 1}개소</span>
            </div>
          `;
        }
      }

      const canEdit = this.canEditSchedule(s);

      let attendeeDisplay = "";
      if (s.attendees) {
        attendeeDisplay = `<div style="font-size:0.75rem; color:#475569; margin-top:2px;">👥 동행: <b>${s.attendees}</b></div>`;
      }

      return `
        <tr onclick="window.scheduleManager.openEditModal(${s.id})" style="cursor:pointer;">
          <td><b>${idx + 1}</b></td>
          <td><b>${dateDisplay}</b></td>
          <td>${typeBadge}</td>
          <td>
            <div style="font-weight:700; color:#0f172a;">${s.title}</div>
            ${s.description ? `<div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${s.description}</div>` : ""}
          </td>
          <td>${stationDisplay}</td>
          <td>
            <div><b>${s.assignee}</b></div>
            ${attendeeDisplay}
            <div style="font-size:0.7rem; color:#94a3b8; margin-top:2px;">작성: ${s.createdBy || "-"}</div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-sm ${canEdit ? "btn-primary" : "btn-outline"}" 
                    style="padding:3px 8px; font-size:0.75rem;" 
                    onclick="event.stopPropagation(); window.scheduleManager.openEditModal(${s.id})">
              ${canEdit ? "수정" : "조회"}
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  openAddModal(defaultDate = "") {
    this.currentEditingId = null;
    this.selectedStations = [];
    this.stationSearchKeyword = "";

    const titleEl = document.getElementById("schedule-modal-title");
    if (titleEl) titleEl.textContent = "📅 업무·점검·휴가 일정 등록";

    const noticeEl = document.getElementById("sched-readonly-notice");
    if (noticeEl) noticeEl.style.display = "none";

    const deleteBtn = document.getElementById("sched-btn-delete");
    if (deleteBtn) deleteBtn.style.display = "none";

    const saveBtn = document.getElementById("sched-btn-save");
    if (saveBtn) saveBtn.style.display = "inline-block";

    this.setInputStates(true);

    document.getElementById("schedule-form").reset();
    document.getElementById("sched-form-id").value = "";
    document.getElementById("sched-form-attendees").value = "";
    document.getElementById("sched-station-search-input").value = "";

    const todayStr = defaultDate || new Date().toISOString().slice(0, 10);
    document.getElementById("sched-form-start").value = todayStr;
    document.getElementById("sched-form-end").value = todayStr;
    document.getElementById("sched-form-status").value = "scheduled";

    // Default assignee: logged in user
    if (window.apiClient?.user?.name) {
      const userSelect = document.getElementById("sched-form-assignee");
      if (userSelect) {
        for (let opt of userSelect.options) {
          if (opt.value === window.apiClient.user.name) {
            userSelect.value = opt.value;
            break;
          }
        }
      }
    }

    this.renderSelectedStationChips(false);

    const modal = document.getElementById("schedule-modal");
    if (modal) modal.classList.add("active");
  }

  openAddModalWithStation(stId, stName, issueTitle = "", issueDetail = "") {
    if (window.app && window.app.switchTab) {
      window.app.switchTab("schedules");
    }

    this.openAddModal();

    const titleInput = document.getElementById("sched-form-title");
    if (titleInput) {
      titleInput.value = issueTitle ? `[긴급/점검] ${stName} - ${issueTitle}` : `[현장점검] ${stName} 점검 출장`;
    }

    const typeSelect = document.getElementById("sched-form-type");
    if (typeSelect) {
      typeSelect.value = issueTitle ? "emergency" : "check";
    }

    const descInput = document.getElementById("sched-form-desc");
    if (descInput && (issueTitle || issueDetail)) {
      descInput.value = `[실시간 모니터링 이상 감지 연계]\n- 이상 항목: ${issueTitle}\n- 상세 내용: ${issueDetail}`;
    }

    let st = null;
    if (stId) {
      st = window.dataManager.getById(stId) || window.dataManager.getAll().find(s => String(s.code) === String(stId) || s.name === stName);
    } else if (stName) {
      st = window.dataManager.getAll().find(s => s.name === stName);
    }

    if (st) {
      this.selectedStations = [{
        id: st.id,
        name: st.name,
        river: st.river,
        region: st.region
      }];
      this.renderSelectedStationChips(false);
    }
  }

  openEditModal(scheduleId) {
    const s = this.schedules.find(item => item.id === scheduleId);
    if (!s) return;

    this.currentEditingId = scheduleId;
    this.stationSearchKeyword = "";

    const canEdit = this.canEditSchedule(s);

    const titleEl = document.getElementById("schedule-modal-title");
    if (titleEl) {
      titleEl.textContent = canEdit ? `📅 일정 수정 - ${s.title}` : `📅 일정 상세 조회 - ${s.title}`;
    }

    const noticeEl = document.getElementById("sched-readonly-notice");
    if (noticeEl) noticeEl.style.display = canEdit ? "none" : "block";

    const deleteBtn = document.getElementById("sched-btn-delete");
    if (deleteBtn) deleteBtn.style.display = canEdit ? "inline-block" : "none";

    const saveBtn = document.getElementById("sched-btn-save");
    if (saveBtn) saveBtn.style.display = canEdit ? "inline-block" : "none";

    this.setInputStates(canEdit);

    document.getElementById("sched-form-id").value = s.id;
    document.getElementById("sched-form-title").value = s.title;
    document.getElementById("sched-form-type").value = s.scheduleType;
    document.getElementById("sched-form-assignee").value = s.assignee;
    document.getElementById("sched-form-attendees").value = s.attendees || "";
    document.getElementById("sched-form-start").value = s.startDate;
    document.getElementById("sched-form-end").value = s.endDate || s.startDate;
    document.getElementById("sched-form-status").value = s.status || "scheduled";
    document.getElementById("sched-form-desc").value = s.description || "";
    document.getElementById("sched-station-search-input").value = "";

    // Populate selected stations
    this.selectedStations = [];
    if (s.stationIds && s.stationIds.length > 0) {
      s.stationIds.forEach(id => {
        const st = window.dataManager.getById(id);
        if (st) {
          this.selectedStations.push({ id: st.id, name: st.name, river: st.river, region: st.region });
        }
      });
    } else if (s.stationId) {
      const st = window.dataManager.getById(s.stationId);
      if (st) {
        this.selectedStations.push({ id: st.id, name: st.name, river: st.river, region: st.region });
      }
    } else if (s.stationName) {
      const names = s.stationName.split(",").map(n => n.trim());
      names.forEach(name => {
        const found = window.dataManager.getAll().find(st => st.name === name);
        if (found) {
          this.selectedStations.push({ id: found.id, name: found.name, river: found.river, region: found.region });
        }
      });
    }

    this.renderSelectedStationChips(!canEdit);

    const modal = document.getElementById("schedule-modal");
    if (modal) modal.classList.add("active");
  }

  setInputStates(enabled) {
    const inputs = [
      "sched-form-title",
      "sched-form-type",
      "sched-form-assignee",
      "sched-form-attendees",
      "sched-form-start",
      "sched-form-end",
      "sched-form-status",
      "sched-form-desc",
      "sched-station-search-input"
    ];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled;
    });
  }

  closeModal() {
    const modal = document.getElementById("schedule-modal");
    if (modal) modal.classList.remove("active");
    this.hideStationDropdown();
    this.currentEditingId = null;
    this.selectedStations = [];
  }

  async saveSchedule() {
    if (this.currentEditingId) {
      const existing = this.schedules.find(s => s.id === this.currentEditingId);
      if (existing && !this.canEditSchedule(existing)) {
        alert("본인이 등록한 일정 또는 배정된 일정만 수정할 수 있습니다.");
        return;
      }
    }

    const title = document.getElementById("sched-form-title").value.trim();
    if (!title) {
      alert("일정 제목을 입력해주세요.");
      return;
    }

    const type = document.getElementById("sched-form-type").value;
    const assignee = document.getElementById("sched-form-assignee").value;
    const attendees = document.getElementById("sched-form-attendees").value.trim();
    const start = document.getElementById("sched-form-start").value;
    const end = document.getElementById("sched-form-end").value || start;
    const status = document.getElementById("sched-form-status").value;
    const desc = document.getElementById("sched-form-desc").value.trim();

    const stationIds = this.selectedStations.map(s => s.id);
    const stationNames = this.selectedStations.map(s => s.name).join(", ");
    const primaryStationId = stationIds.length > 0 ? stationIds.join(",") : null;

    const payload = {
      title,
      scheduleType: type,
      assignee,
      attendees,
      startDate: start,
      endDate: end,
      stationId: primaryStationId,
      stationName: stationNames,
      status,
      description: desc
    };

    try {
      if (this.currentEditingId) {
        if (window.apiClient) {
          const res = await window.apiClient.updateSchedule(this.currentEditingId, payload);
          if (res && res.success === false) {
            alert(res.message || "일정 수정에 실패하였습니다.");
            return;
          }
        }
        window.app.showToast(`[${title}] 일정이 성공적으로 수정되었습니다.`, "success");
      } else {
        if (window.apiClient) {
          const res = await window.apiClient.createSchedule(payload);
          if (res && res.success === false) {
            alert(res.message || "일정 등록에 실패하였습니다.");
            return;
          }
        }
        window.app.showToast(`[${title}] 신규 일정이 성공적으로 등록되었습니다.`, "success");
      }
    } catch (e) {
      console.error("Save schedule error:", e);
      alert("일정 저장 중 서버 통신 오류가 발생했습니다.");
      return;
    }

    this.closeModal();
    await this.loadSchedules();
  }

  async deleteCurrentSchedule() {
    if (!this.currentEditingId) return;
    const s = this.schedules.find(item => item.id === this.currentEditingId);
    if (!s) return;

    if (!this.canEditSchedule(s)) {
      alert("본인이 등록한 일정 또는 배정된 일정만 삭제할 수 있습니다.");
      return;
    }

    if (!confirm(`정말로 '${s.title}' 일정을 삭제하시겠습니까?`)) {
      return;
    }

    if (window.apiClient) {
      await window.apiClient.deleteSchedule(this.currentEditingId);
    }

    this.closeModal();
    window.app.showToast(`'${s.title}' 일정이 삭제되었습니다.`, "info");
    await this.loadSchedules();
  }
}

window.scheduleManager = new ScheduleManager();
