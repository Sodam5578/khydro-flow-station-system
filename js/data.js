/**
 * DataManager (2nd Phase Server-Integrated Edition)
 * Handles station dataset with Server SQLite DB sync and Local fallback.
 */
class DataManager {
  constructor() {
    this.STORAGE_KEY = "khydro_flow_stations_v6_server_cache";
    this.stations = [];
    this.listeners = [];
    this.isServerConnected = false;
  }

  async init() {
    // 1. Try loading from Server SQLite REST API
    try {
      if (window.apiClient && window.apiClient.token) {
        const res = await window.apiClient.getStations();
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          this.stations = res.data;
          this.isServerConnected = true;
          this.saveToStorage();
          this.notifyListeners();
          console.log(`Loaded ${this.stations.length} stations from Server SQLite DB.`);
          return;
        }
      }
    } catch(e) {
      console.warn("Server API not available, falling back to local dataset:", e);
    }

    // 2. Fallback to LocalStorage or Initial JS file
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.stations = parsed;
          return;
        }
      } catch (e) {}
    }

    this.loadInitial();
  }

  loadInitial() {
    if (window.INITIAL_STATIONS_DATA && Array.isArray(window.INITIAL_STATIONS_DATA)) {
      this.stations = JSON.parse(JSON.stringify(window.INITIAL_STATIONS_DATA));
      this.saveToStorage();
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.stations));
      this.notifyListeners();
    } catch (e) {
      console.error("Failed to save to local storage:", e);
    }
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try { cb(this.stations); } catch (e) { console.error(e); }
    });
  }

  getAll() {
    return [...this.stations];
  }

  getById(id) {
    return this.stations.find(s => String(s.id) === String(id));
  }

  async add(stationData) {
    const nextId = this.stations.length > 0 ? Math.max(...this.stations.map(s => Number(s.id) || 0)) + 1 : 1;
    const nextSeq = this.stations.length > 0 ? Math.max(...this.stations.map(s => Number(s.seq) || 0)) + 1 : 1;
    
    const newStation = {
      ...stationData,
      id: nextId,
      seq: stationData.seq || nextSeq,
    };

    if (this.isServerConnected && window.apiClient) {
      try {
        await window.apiClient.addStation(newStation);
      } catch(e) {
        console.error("Server add station failed:", e);
      }
    }
    
    this.stations.unshift(newStation);
    this.saveToStorage();
    return newStation;
  }

  async update(id, updatedData) {
    const idx = this.stations.findIndex(s => String(s.id) === String(id));
    if (idx !== -1) {
      this.stations[idx] = {
        ...this.stations[idx],
        ...updatedData,
        id: this.stations[idx].id
      };

      if (this.isServerConnected && window.apiClient) {
        try {
          await window.apiClient.updateStation(id, this.stations[idx]);
        } catch(e) {
          console.error("Server update station failed:", e);
        }
      }

      this.saveToStorage();
      return this.stations[idx];
    }
    return null;
  }

  async delete(id) {
    const idx = this.stations.findIndex(s => String(s.id) === String(id));
    if (idx !== -1) {
      const removed = this.stations.splice(idx, 1);

      if (this.isServerConnected && window.apiClient) {
        try {
          await window.apiClient.deleteStation(id);
        } catch(e) {
          console.error("Server delete station failed:", e);
        }
      }

      this.saveToStorage();
      return removed[0];
    }
    return null;
  }

  async toggleTaskCompletion(stationId, taskKey, isDone, note = "") {
    const st = this.getById(stationId);
    if (!st || !st.maintenance) return;

    if (!st.maintenance.completedTasks) {
      st.maintenance.completedTasks = {};
    }

    const today = new Date().toISOString().slice(0, 10);
    if (isDone) {
      st.maintenance.completedTasks[taskKey] = {
        completed: true,
        completedDate: today,
        user: window.apiClient?.user?.name || "관리자",
        note: note
      };
    } else {
      delete st.maintenance.completedTasks[taskKey];
    }

    // Sync with Server SQLite DB
    if (this.isServerConnected && window.apiClient) {
      try {
        await window.apiClient.toggleMaintenanceTask(stationId, taskKey, isDone, note);
      } catch(e) {
        console.error("Server toggle maintenance task failed:", e);
      }
    }

    this.saveToStorage();
    return st;
  }

  async updateCalibration(stationId, status, date = "", certNo = "") {
    const st = this.getById(stationId);
    if (!st) return;

    st.calibrationStatus = status;
    st.calibrationDate = date;
    st.calibrationCertNo = certNo;

    // Sync with Server SQLite DB
    if (this.isServerConnected && window.apiClient) {
      try {
        await window.apiClient.updateCalibration(stationId, status, date, certNo);
      } catch(e) {
        console.error("Server update calibration failed:", e);
      }
    }

    this.saveToStorage();
    return st;
  }

  resetToInitial() {
    if (window.INITIAL_STATIONS_DATA) {
      this.stations = JSON.parse(JSON.stringify(window.INITIAL_STATIONS_DATA));
      this.saveToStorage();
      return true;
    }
    return false;
  }
}

window.dataManager = new DataManager();
