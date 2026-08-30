/**
 * ExcelManager
 * Handles Excel (.xlsx) and JSON Import/Export using SheetJS.
 */
class ExcelManager {
  exportToExcel(onlyFiltered = false) {
    const dataList = onlyFiltered ? window.tableManager.filteredData : window.dataManager.getAll();

    if (!dataList || dataList.length === 0) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    // Prepare rows identical to the original structure
    const excelRows = dataList.map(st => ({
      "연번": st.seq || "",
      "관할명": st.region || "",
      "하천명": st.river || "",
      "지점명": st.name || "",
      "위치": st.address || "",
      "경도": st.coords?.lonDMS || "",
      "위도": st.coords?.latDMS || "",
      "지점코드": st.code || "",
      "설치년도": st.installYear || "",
      "관측개시년도": st.obsStartYear || "",
      "2026년 운영": st.isOperating2026 ? "○" : "-",
      "설치방향": st.installDirection || "",
      "홍수특보": st.floodAlert ? "○" : "",
      "갈수예보": st.droughtAlert ? "○" : "",
      "배수": st.drainage ? "○" : "",
      "조위": st.tide ? "○" : "",
      "오염총량": st.pollutionTotal ? "○" : "",
      "형식(유속계)": st.gaugeType || "",
      "ADVM (대)": st.advmCount || "-",
      "EWSV (대)": st.ewsvCount || "-",
      "26년 유속계 검정지점": st.calib2026 ? "○" : "",
      "26년 검정대상 유속계(대)": st.calibCount2026 || "",
      "태양광 설치 지점": st.solarInstall ? "○" : "",
      "기준수위": st.refWaterLevel || "",
      "수위계 방식": st.waterLevelType || "",
      "비고": st.memo || ""
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `자동유량관측시설현황_${today}.xlsx`;
    XLSX.writeFile(wb, fileName);

    window.app.showToast(`[${fileName}] 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  importExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonRows || jsonRows.length === 0) {
          alert("엑셀 파일에 데이터가 없습니다.");
          return;
        }

        const parseDMS = (dms) => {
          if (!dms) return null;
          try {
            const p = String(dms).trim().split("-").map(Number);
            if (p.length === 3) return Number((p[0] + p[1]/60 + p[2]/3600).toFixed(6));
            if (p.length === 2) return Number((p[0] + p[1]/60).toFixed(6));
            if (p.length === 1) return Number(p[0]);
          } catch(e){}
          return null;
        };

        const newStations = jsonRows.map((r, idx) => {
          const lonDMS = String(r["경도"] || "").trim();
          const latDMS = String(r["위도"] || "").trim();
          return {
            id: idx + 1,
            seq: parseInt(r["연번"], 10) || (idx + 1),
            region: String(r["관할명"] || "").trim(),
            river: String(r["하천명"] || "").trim(),
            name: String(r["지점명"] || "").trim(),
            address: String(r["위치"] || "").trim(),
            code: String(r["지점코드"] || "").trim(),
            installYear: String(r["설치년도"] || "").trim(),
            obsStartYear: String(r["관측개시년도"] || "").trim(),
            isOperating2026: ["○", "O", "o", "1", "Y", "y", "운영"].includes(String(r["2026년 운영"] || "").trim()),
            installDirection: String(r["설치방향"] || "").trim(),
            floodAlert: ["○", "O", "o", "1", "Y", "y"].includes(String(r["홍수특보"] || "").trim()),
            droughtAlert: ["○", "O", "o", "1", "Y", "y"].includes(String(r["갈수예보"] || "").trim()),
            drainage: ["○", "O", "o", "1", "Y", "y"].includes(String(r["배수"] || "").trim()),
            tide: ["○", "O", "o", "1", "Y", "y"].includes(String(r["조위"] || "").trim()),
            pollutionTotal: ["○", "O", "o", "1", "Y", "y"].includes(String(r["오염총량"] || "").trim()),
            gaugeType: String(r["형식(유속계)"] || "").trim(),
            advmCount: String(r["ADVM (대)"] || "").trim(),
            ewsvCount: String(r["EWSV (대)"] || "").trim(),
            calib2026: ["○", "O", "o", "1", "Y", "y"].includes(String(r["26년 유속계 검정지점"] || "").trim()),
            calibCount2026: String(r["26년 검정대상 유속계(대)"] || "").trim(),
            solarInstall: ["○", "O", "o", "1", "Y", "y"].includes(String(r["태양광 설치 지점"] || "").trim()),
            refWaterLevel: String(r["기준수위"] || "").trim(),
            waterLevelType: String(r["수위계 방식"] || "").trim(),
            memo: String(r["비고"] || "").trim(),
            coords: {
              lonDMS: lonDMS,
              latDMS: latDMS,
              lon: parseDMS(lonDMS),
              lat: parseDMS(latDMS)
            },
            maintenance: { history: [] }
          };
        });

        if (confirm(`엑셀 파일에서 ${newStations.length}개의 지점 데이터를 읽어왔습니다. 시스템 데이터로 일괄 적용하시겠습니까?`)) {
          window.dataManager.importAll(newStations);
          window.app.refreshAll();
          window.app.showToast(`${newStations.length}개 지점이 성공적으로 동기화되었습니다.`, "success");
        }
      } catch (err) {
        console.error("Excel import failed:", err);
        alert("엑셀 파일 파싱 중 오류가 발생했습니다. 원본 양식을 확인해주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  exportBackupJSON() {
    const stations = window.dataManager.getAll();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stations, null, 2));
    const dlAnchorElem = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `khydro_flow_stations_backup_${today}.json`);
    dlAnchorElem.click();
    window.app.showToast("JSON 백업 파일이 다운로드되었습니다.", "success");
  }

  importBackupJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (confirm(`JSON 파일에서 ${parsed.length}개의 지점 데이터를 복원하시겠습니까?`)) {
            window.dataManager.importAll(parsed);
            window.app.refreshAll();
            window.app.showToast(`${parsed.length}개 지점이 복원되었습니다.`, "success");
          }
        } else {
          alert("올바르지 않은 JSON 백업 파일 형식입니다.");
        }
      } catch (err) {
        alert("JSON 파싱 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
  }
}

window.excelManager = new ExcelManager();
