#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_equipment.py
Parses '(관리용)자동유량측정시설(176개소) 물품관리대장 총괄표_261103.xlsx'
and ingests equipment_master, equipment_work, equipment_action, equipment_repair
into local SQLite database (data/khydro.db).
"""

import os
import sys
import sqlite3
import json
import re
import openpyxl

EXCEL_PATH = '/Users/sechan/Documents/06_AI_Agent/02-자동유량측정시설_현황정리/(관리용)자동유량측정시설(176개소) 물품관리대장 총괄표_261103.xlsx'
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../data/khydro.db')
STATIONS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../data/stations_initial.json')

def clean_val(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()

def norm_name(n):
    if not n: return ''
    m = re.search(r'\((.*?)\)', str(n))
    return m.group(1).strip() if m else str(n).strip()

def main():
    print("==================================================")
    print("🚀 [Equipment Migration] Starting data ingestion...")
    print(f"📁 Excel: {EXCEL_PATH}")
    print(f"🗄️ SQLite: {DB_PATH}")
    print("==================================================")

    if not os.path.exists(EXCEL_PATH):
        print(f"❌ Excel file not found: {EXCEL_PATH}")
        sys.exit(1)

    # 1. Load Station Master
    with open(STATIONS_JSON, 'r', encoding='utf-8') as f:
        st_data = json.load(f)
    sys_stations = st_data if isinstance(st_data, list) else st_data.get('stations', [])
    print(f"✓ Loaded {len(sys_stations)} stations from system master.")

    station_name_map = {}
    station_code_map = {}
    for s in sys_stations:
        station_name_map[s['name']] = s
        station_name_map[norm_name(s['name'])] = s
        if s.get('code'):
            station_code_map[str(s['code'])] = s

    def find_station(raw_name):
        if not raw_name:
            return None
        s_str = str(raw_name).strip()
        if s_str in ['-', '보관', '예비품', '26년 자산반납', '당진양수장', '리버앤씨', '화성공장', '기술원']:
            return None
        if s_str in station_name_map:
            return station_name_map[s_str]
        norm = norm_name(s_str)
        if norm in station_name_map:
            return station_name_map[norm]
        for s in sys_stations:
            if norm and (norm in s['name'] or s['name'] in norm):
                return s
        return None

    # 2. Connect SQLite & Create Tables
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS equipment_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT UNIQUE NOT NULL,
        station_id INTEGER,
        station_name TEXT,
        station_code TEXT,
        category TEXT NOT NULL,
        category_name TEXT NOT NULL,
        item_name TEXT,
        manage_no TEXT,
        model_name TEXT,
        spec TEXT,
        serial_no TEXT,
        asset_no TEXT,
        asset_no_temp TEXT,
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'OPERATING',
        status_label TEXT DEFAULT '운영중',
        location TEXT,
        acquisition_date TEXT,
        acquisition_cost INTEGER DEFAULT 0,
        lifespan_years INTEGER DEFAULT 0,
        lifespan_end_year TEXT,
        is_lifespan_over INTEGER DEFAULT 0,
        calib_status TEXT DEFAULT 'pending',
        recent_calib_date TEXT,
        calib_cert_no TEXT,
        calib_expire_date TEXT,
        version INTEGER DEFAULT 1,
        memo TEXT,
        source_sheet TEXT,
        source_row INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS equipment_work (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_no TEXT UNIQUE NOT NULL,
        station_id INTEGER,
        station_name TEXT,
        station_code TEXT,
        work_date TEXT NOT NULL,
        work_type TEXT NOT NULL,
        workers TEXT,
        summary TEXT NOT NULL,
        detail_raw TEXT,
        source_ref TEXT,
        created_by TEXT DEFAULT '관리자',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS equipment_action (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id INTEGER NOT NULL,
        equipment_id TEXT,
        action_category TEXT,
        action_code TEXT NOT NULL,
        action_name TEXT NOT NULL,
        before_model TEXT,
        before_sn TEXT,
        after_model TEXT,
        after_sn TEXT,
        part_name TEXT,
        part_qty INTEGER DEFAULT 1,
        param_change TEXT,
        detail_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_id) REFERENCES equipment_work(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS equipment_repair (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repair_no TEXT UNIQUE NOT NULL,
        equipment_id TEXT NOT NULL,
        equipment_name TEXT,
        station_id INTEGER,
        station_name TEXT,
        stage TEXT DEFAULT '접수',
        vendor TEXT,
        issue_desc TEXT,
        received_date TEXT NOT NULL,
        target_date TEXT,
        completed_date TEXT,
        cost INTEGER DEFAULT 0,
        action_memo TEXT,
        created_by TEXT DEFAULT '관리자',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS equipment_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        before_value TEXT,
        after_value TEXT,
        changed_by TEXT NOT NULL,
        reason TEXT,
        source TEXT DEFAULT 'UI',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS equipment_upload_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        total_rows INTEGER DEFAULT 0,
        changed_rows INTEGER DEFAULT 0,
        unchanged_rows INTEGER DEFAULT 0,
        error_rows INTEGER DEFAULT 0,
        conflict_rows INTEGER DEFAULT 0,
        status TEXT DEFAULT 'VALIDATED',
        summary_json TEXT,
        applied_by TEXT,
        applied_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_eq_station ON equipment_master (station_id);
    CREATE INDEX IF NOT EXISTS idx_eq_category ON equipment_master (category);
    CREATE INDEX IF NOT EXISTS idx_eq_sn ON equipment_master (serial_no);
    CREATE INDEX IF NOT EXISTS idx_eq_status ON equipment_master (status);
    CREATE INDEX IF NOT EXISTS idx_eq_work_st ON equipment_work (station_id);
    CREATE INDEX IF NOT EXISTS idx_eq_action_work ON equipment_action (work_id);
    """);

    # Clear existing equipment tables for clean idempotent load
    cur.execute("DELETE FROM equipment_master")
    cur.execute("DELETE FROM equipment_calibration_history")
    cur.execute("DELETE FROM equipment_work")
    cur.execute("DELETE FROM equipment_action")
    cur.execute("DELETE FROM equipment_repair")
    cur.execute("DELETE FROM equipment_audit_log")
    cur.execute("DELETE FROM equipment_upload_batch")

    # 3. Read Excel Workbook
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    eq_counter = 1
    total_inserted_eq = 0

    # Map of 30 calibration stations from existing stations table
    calib_map = {}
    cur.execute("SELECT id, name, code, calib_2026, calib_status, calib_date, maintenance_json FROM stations WHERE calib_2026 = 1")
    for row in cur.fetchall():
        s_id, s_name, s_code, c_2026, c_status, c_date, m_json = row
        cert_no = ""
        if m_json:
            try:
                m_obj = json.loads(m_json)
                cert_no = m_obj.get("calibrationCertNo", "") or m_obj.get("calibCertNo", "")
            except:
                pass
        calib_map[s_id] = {
            "calib_status": c_status or "pending",
            "recent_calib_date": c_date or "",
            "calib_cert_no": cert_no
        }
    print(f"✓ Found {len(calib_map)} periodic calibration stations to link with flowmeters.")

    # 3.5 Pre-scan 0_지점별내역 & replacement history for missing acq_date / install dates
    station_acq_map = {}
    if '0_지점별내역' in wb.sheetnames:
        ws0 = wb['0_지점별내역']
        cur_st0 = ""
        for r in list(ws0.iter_rows(values_only=True))[7:]:
            c0 = clean_val(r[0]) if len(r) > 0 else ""
            c2 = clean_val(r[2]) if len(r) > 2 else ""
            c7 = clean_val(r[7]) if len(r) > 7 else ""
            if c2 and c0.isdigit():
                cur_st0 = c2
            elif c0 and not c0.isdigit():
                cur_st0 = c0
            if cur_st0 and c2 and c7 and c7.isdigit() and len(c7) == 4:
                station_acq_map[(norm_name(cur_st0), c2)] = c7
                if c2 in ['센서지지대', '제어시스템', '유속계'] and (norm_name(cur_st0), 'PRIMARY') not in station_acq_map:
                    station_acq_map[(norm_name(cur_st0), 'PRIMARY')] = c7

    sn_install_date_map = {}
    for h_sname, d_col, desc_col in [('1-1. 유속계 이력', 3, 8), ('2-1.수위계 이력', 2, 7)]:
        if h_sname in wb.sheetnames:
            for r in list(wb[h_sname].iter_rows(values_only=True))[1:]:
                dt_raw = clean_val(r[d_col]) if len(r) > d_col else ""
                if dt_raw.endswith("00:00:00"):
                    dt_raw = dt_raw.split(" ")[0]
                desc_raw = clean_val(r[desc_col]) if len(r) > desc_col else ""
                if dt_raw and len(dt_raw) >= 10 and desc_raw:
                    for tok in re.findall(r'\b\d{5,8}\b', desc_raw):
                        sn_install_date_map[tok] = dt_raw[:10]

    def add_years_minus_one_day(date_str, years):
        import datetime
        try:
            dt = datetime.datetime.strptime(date_str[:10], "%Y-%m-%d").date()
            try:
                target = dt.replace(year=dt.year + years)
            except ValueError:
                target = dt.replace(year=dt.year + years, day=28)
            target = target - datetime.timedelta(days=1)
            return target.strftime("%Y-%m-%d")
        except Exception:
            return ""

    def format_excel_date(val):
        import datetime
        if isinstance(val, (datetime.datetime, datetime.date)):
            return val.strftime("%Y-%m-%d")
        s = clean_val(val)
        if not s or s in ['-', 'None', '무', '미제출']:
            return ""
        if s.endswith("00:00:00"):
            s = s.split(" ")[0]
        m = re.match(r'^(\d{4})[-./](\d{1,2})[-./](\d{1,2})', s)
        if m:
            return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        return ""

    # 4. Ingest Equipment Sheets (1 to 9)
    # Official 조달청 고시 제2024-30호 내용연수 기준:
    # 1.유속계(13년), 2.수위계(10년), 3.센서지지대(12년), 4.제어시스템(8년),
    # 5.관측국사(8년), 6.수중센서보호장치(7년), 7.낙뢰보호장치(7년), 8.영상정보처리기기(9년), 9.부대시설(10년)
    sheet_meta = [
        ('1. 유속계', 'FLOWMETER', '유속계', 6, 13),
        ('2. 수위계', 'WATER_LEVEL', '수위계', 6, 10),
        ('3. 센서지지대', 'MOUNT', '센서지지대', 2, 12),
        ('4. 제어시스템', 'CONTROL', '제어시스템', 2, 8),
        ('5. 관측국사', 'SHELTER', '관측국사', 2, 8),
        ('6. 수중센서보호장치', 'UNDERWATER', '수중센서보호장치', 2, 7),
        ('7. 낙뢰보호장치', 'LIGHTNING', '낙뢰보호장치', 2, 7),
        ('8. 영상정보처리기기', 'CCTV', '영상정보처리기기', 2, 9),
        ('9. 부대시설 설치', 'ANCILLARY', '부대시설', 2, 10)
    ]

    TODAY_STR = "2026-11-03"

    for sname, cat, cat_name, h_row_idx, def_lifespan in sheet_meta:
        if sname not in wb.sheetnames:
            continue
        ws = wb[sname]
        all_rows = list(ws.iter_rows(values_only=True))
        if len(all_rows) <= h_row_idx + 2:
            continue

        current_station_str = ""
        sheet_count = 0

        # Start at h_row_idx + 2 to skip both main header and sub-header row (년도 / 초과유무 / 카메라·녹화기)
        for r_idx, r in enumerate(all_rows[h_row_idx + 2:], start=h_row_idx + 3):
            # Check station propagation
            val_col1 = clean_val(r[1]) if len(r) > 1 else ""
            val_col2 = clean_val(r[2]) if len(r) > 2 else ""

            if val_col1 and val_col1 not in ['-', '소계', '합계', '총계']:
                current_station_str = val_col1
            elif val_col2 and any(x in val_col2 for x in ['교', '보', '리', '대', '천', '문', '댐']):
                current_station_str = val_col2

            manage_no = clean_val(r[2]) if len(r) > 2 else ""
            asset_no_temp = clean_val(r[3]) if len(r) > 3 else ""

            if cat == 'CCTV':
                # Sheet 8 has 2 columns for model: Col 4 (카메라) and Col 5 (녹화기)
                cam_model = clean_val(r[4]) if len(r) > 4 else ""
                nvr_model = clean_val(r[5]) if len(r) > 5 else ""
                if cam_model and cam_model != '-' and nvr_model and nvr_model != '-':
                    model_name = f"{cam_model} / {nvr_model}"
                elif cam_model and cam_model != '-':
                    model_name = cam_model
                elif nvr_model and nvr_model != '-':
                    model_name = nvr_model
                else:
                    model_name = "-"
                qty_raw = clean_val(r[6]) if len(r) > 6 else ""
                sn = clean_val(r[7]) if len(r) > 7 else ""
                acq_date = clean_val(r[8]) if len(r) > 8 else ""
                lifespan_end = clean_val(r[9]) if len(r) > 9 else ""
                is_over_str = clean_val(r[10]) if len(r) > 10 else ""
                asset_no = clean_val(r[12]) if len(r) > 12 else ""
                acq_cost_raw = clean_val(r[13]) if len(r) > 13 else "0"
            else:
                model_name = clean_val(r[4]) if len(r) > 4 else ""
                qty_raw = clean_val(r[5]) if len(r) > 5 else ""
                sn = clean_val(r[6]) if len(r) > 6 else ""
                acq_date = clean_val(r[7]) if len(r) > 7 else ""
                lifespan_end = clean_val(r[8]) if len(r) > 8 else ""
                is_over_str = clean_val(r[9]) if len(r) > 9 else ""
                asset_no = clean_val(r[11]) if len(r) > 11 else ""
                acq_cost_raw = clean_val(r[12]) if len(r) > 12 else "0"

            # Check if this is an empty or summary row
            if not model_name and not sn and not manage_no:
                continue
            if model_name in ['합계', '총계', '소계', '총괄내역', '카메라', '종류']:
                continue
            if cat in ['FLOWMETER', 'WATER_LEVEL'] and model_name in ['', '-']:
                continue

            # For sheets 1~8, skip placeholder '-' rows where the station has no such equipment installed
            if cat != 'ANCILLARY':
                if model_name in ['', '-'] and sn in ['', '-'] and (manage_no in ['', '-'] or not qty_raw):
                    continue
            else:
                # For 9. 부대시설 설치, if qty is 1, give it a clear standard model name
                if not qty_raw or qty_raw in ['-', '0']:
                    continue
                if model_name in ['', '-']:
                    model_name = "계측·전원·통신 부대시설 일식"

            try:
                qty = int(float(qty_raw)) if qty_raw else 1
            except:
                qty = 1

            try:
                acq_cost = int(float(acq_cost_raw))
            except:
                acq_cost = 0

            # Normalize acquisition year (4-digit year)
            acq_year_str = ""
            m_yr = re.search(r'(19\d{2}|20\d{2})', str(acq_date))
            if m_yr:
                acq_year_str = m_yr.group(1)
            if not acq_year_str and asset_no_temp:
                m_tmp = re.match(r'^(20\d{2})-', asset_no_temp)
                if m_tmp:
                    acq_year_str = m_tmp.group(1)
            if not acq_year_str and current_station_str:
                norm_st = norm_name(current_station_str)
                acq_year_str = (
                    station_acq_map.get((norm_st, cat_name))
                    or station_acq_map.get((norm_st, 'PRIMARY'))
                    or ""
                )
            if not acq_year_str and lifespan_end.isdigit() and len(lifespan_end) == 4:
                acq_year_str = str(int(lifespan_end) - def_lifespan)
            if not acq_year_str:
                acq_year_str = "2020"

            acq_date = acq_year_str

            # Compute lifespan_end_year & is_lifespan_over (Current reference year: 2026)
            if lifespan_end.isdigit() and len(lifespan_end) == 4:
                lifespan_end_year = lifespan_end
            else:
                lifespan_end_year = str(int(acq_year_str) + def_lifespan)

            end_yr_int = int(lifespan_end_year)
            # If lifespan_end_year < 2026 (or marked 초과 in Excel and <= 2026), mark as lifespan over
            if end_yr_int < 2026 or ('초과' in is_over_str and end_yr_int <= 2026):
                is_over = 1
            else:
                is_over = 0

            # Status & Return detection
            status = 'OPERATING'
            status_label = '운영중'
            location = '현장설치'
            is_returned = False
            return_group = ""

            # Check if this row is a returned item (반납 장비 별도 분리 관리)
            if cat == 'FLOWMETER' and (r_idx >= 623 and r_idx <= 654):
                is_returned = True
                status = 'RETURNED'
                station_id = None
                station_code = ""
                manage_no = "자산반납"
                if r_idx <= 628:
                    return_group = "26년 자산반납"
                    status_label = '자산반납'
                    station_name = '기술원(자산반납)'
                    location = '리버앤씨(반납폐기대기)'
                elif r_idx <= 641:
                    return_group = "26년 반납완료"
                    status_label = '반납완료'
                    station_name = '기술원(자산반납)'
                    location = clean_val(r[25]) or '리버앤씨 화성공장(반납완료)'
                else:
                    return_group = "25년 한강홍수통제소 반납완료"
                    status_label = '반납완료'
                    station_name = '한강홍수통제소(반납)'
                    location = '한강홍수통제소 반납완료'
            elif cat == 'WATER_LEVEL' and (manage_no == '자산반납' or '수자원기획실-2760' in str(r[1]) or (r_idx >= 231 and r_idx <= 243)):
                is_returned = True
                status = 'RETURNED'
                status_label = '자산반납'
                station_id = None
                station_code = ""
                station_name = '기술원(자산반납)'
                location = '기술원(자산반납)'
                manage_no = "자산반납"
                return_group = "수자원기획실-2760 자산반납"

            if not is_returned:
                # Inspect status cols (15=운영중, 16=예비품, 17=수리중, 18=폐품)
                if len(r) > 18 and cat in ['FLOWMETER', 'WATER_LEVEL']:
                    col15 = clean_val(r[15]).upper()
                    col16 = clean_val(r[16]).upper()
                    col17 = clean_val(r[17]).upper()
                    col18 = clean_val(r[18]).upper()
                    if 'O' in col18 or '○' in col18 or '폐' in col18:
                        status = 'DISPOSAL'
                        status_label = '폐품'
                        location = '불용/폐기'
                    elif 'O' in col17 or '○' in col17 or '수리' in col17:
                        status = 'REPAIRING'
                        status_label = '수리중'
                        location = '수리업체(리버앤씨)'
                    elif 'O' in col16 or '○' in col16 or '예비' in col16:
                        status = 'SPARE'
                        status_label = '예비품'
                        location = '기술원보관'
                    elif 'O' in col15 or '○' in col15:
                        status = 'OPERATING'
                        status_label = '운영중'
                        location = '현장설치'

                # Location from Col 25 if exists
                if len(r) > 25 and clean_val(r[25]):
                    location = clean_val(r[25])

                # Find matching station
                st_obj = find_station(current_station_str)
                station_id = st_obj['id'] if st_obj else None
                station_name = st_obj['name'] if st_obj else current_station_str
                station_code = st_obj['code'] if st_obj else ""

                # If station not found or in storage
                if not station_id:
                    if status == 'OPERATING':
                        status = 'SPARE'
                        status_label = '예비품'
                    if not location or location == '현장설치':
                        location = current_station_str or '기술원'

            # Calibration info for FLOWMETER (2-year cycle) and WATER_LEVEL (3-year cycle)
            calib_status = ''
            recent_calib_date = ''
            calib_cert_no = ''
            calib_expire = ''
            memo_str = ''

            if is_returned:
                # 반납 완료 장비는 현장 운영 설비가 아니므로 법정 검정 대상에서 완전 제외
                calib_status = 'none'
                recent_calib_date = ''
                calib_cert_no = ''
                calib_expire = ''
            elif cat in ['FLOWMETER', 'WATER_LEVEL']:
                calib_cycle = 2 if cat == 'FLOWMETER' else 3
                excel_recent = format_excel_date(r[13]) if len(r) > 13 else ""
                excel_expire = format_excel_date(r[14]) if len(r) > 14 else ""

                if excel_recent and excel_expire:
                    recent_calib_date = excel_recent
                    calib_expire = excel_expire
                    calib_cert_no = '검정성적서 보유'
                elif excel_recent and not excel_expire:
                    recent_calib_date = excel_recent
                    calib_expire = add_years_minus_one_day(excel_recent, calib_cycle)
                    calib_cert_no = '검정성적서 보유'
                elif not excel_recent and excel_expire:
                    calib_expire = excel_expire
                    recent_calib_date = add_years_minus_one_day(excel_expire, -calib_cycle)
                    calib_cert_no = '검정성적서 보유'
                else:
                    # 검정일 정보가 없는 장비는 임의 생성하지 않고 공란 처리
                    recent_calib_date = ""
                    calib_expire = ""
                    calib_cert_no = ""
                    calib_status = "none"

                if calib_expire:
                    if calib_expire < TODAY_STR:
                        calib_status = 'overdue'   # 검정만료 (기한경과)
                    elif calib_expire <= '2026-12-31':
                        calib_status = 'due_soon'  # 당해연도 검정도래 (임박)
                    else:
                        calib_status = 'valid'     # 검정유효 (정상)
                else:
                    calib_status = 'none'

            # Integrate remarks/notes from Excel
            excel_memo = ""
            if cat in ['FLOWMETER', 'WATER_LEVEL']:
                m_extra = clean_val(r[26]) if len(r) > 26 else ""
                m_bigo = clean_val(r[27]) if len(r) > 27 else ""
                parts = [p for p in [m_extra, m_bigo] if p and p != '-']
                excel_memo = " | ".join(parts)
                if is_returned:
                    orig_st = current_station_str if current_station_str and not any(k in current_station_str for k in ['반납', '수자원기획실']) else ""
                    prefix = f"[{return_group}]" + (f" (과거 설치 지점: {orig_st})" if orig_st else "")
                    excel_memo = f"{prefix} | {excel_memo}".strip(" |")
            elif cat == 'CCTV':
                m_bigo = clean_val(r[16]) if len(r) > 16 else ""
                if m_bigo and m_bigo != '-':
                    excel_memo = m_bigo
            else:
                m_bigo = clean_val(r[15]) if len(r) > 15 else ""
                if m_bigo and m_bigo != '-':
                    excel_memo = m_bigo

            if excel_memo:
                if memo_str:
                    memo_str = f"{memo_str} ({excel_memo})"
                else:
                    memo_str = excel_memo

            eq_id_str = f"EQ-{eq_counter:05d}"
            eq_counter += 1

            cur.execute("""
                INSERT INTO equipment_master (
                    equipment_id, station_id, station_name, station_code,
                    category, category_name, item_name, manage_no,
                    model_name, spec, serial_no, asset_no, asset_no_temp,
                    quantity, status, status_label, location,
                    acquisition_date, acquisition_cost, lifespan_years,
                    lifespan_end_year, is_lifespan_over,
                    calib_status, recent_calib_date, calib_cert_no, calib_expire_date,
                    memo, source_sheet, source_row
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                eq_id_str, station_id, station_name, station_code,
                cat, cat_name, cat_name, manage_no,
                model_name, "", sn, asset_no, asset_no_temp,
                qty, status, status_label, location,
                acq_date, acq_cost, def_lifespan,
                lifespan_end_year, is_over,
                calib_status, recent_calib_date, calib_cert_no, calib_expire,
                memo_str, sname, r_idx
            ))

            sheet_count += 1
            total_inserted_eq += 1

        print(f"  ✓ [{cat_name} (내용연수 {def_lifespan}년)] {sheet_count} items ingested.")

    # 4.5 Seed Calibration History records for all FLOWMETER and WATER_LEVEL
    print("\n📜 [Calibration History] Ingesting initial calibration records for flowmeters and water level gauges...")
    cur.execute("""
      INSERT INTO equipment_calibration_history 
        (equipment_id, station_id, station_name, category, model_name, serial_no, calib_date, cycle_years, expire_date, agency, cert_no, result_status, memo, created_by)
      SELECT 
        equipment_id, station_id, station_name, category, model_name, serial_no, recent_calib_date, 
        CASE WHEN category = 'FLOWMETER' THEN 2 ELSE 3 END,
        calib_expire_date, '한국수자원조사기술원', calib_cert_no, '합격', 
        CASE WHEN calib_cert_no LIKE '%취득%' THEN '취득년도 기준 초기 산정 이력' ELSE '물품관리대장(261103) 기재 검정 이력' END,
        '시스템초기화'
      FROM equipment_master
      WHERE category IN ('FLOWMETER', 'WATER_LEVEL')
        AND status != 'RETURNED'
        AND recent_calib_date IS NOT NULL AND recent_calib_date != '' AND recent_calib_date != '-'
    """)
    cur.execute("SELECT count(*) FROM equipment_calibration_history")
    calib_hist_count = cur.fetchone()[0]
    print(f"  ✓ Ingested {calib_hist_count} initial calibration records into equipment_calibration_history.")

    # 5. Ingest Historical Actions (1-1. 유속계 이력 & 2-1. 수위계 이력)
    print("\n🔨 [Historical Actions Migration] Parsing action history with granular clause tokenizer...")

    TOP_KEYWORDS = ['수위계', '유속계', 'CCTV', '수중센서', '통신서지', '통신', '센서지지대', '센서 케이블', '센서커넥터', '센서', '리모트', '인터넷', '배터리', '전원', '제어반', '차단기', '지점', '상반기', '하반기', '대기압', '유선', '좌안', '우안', '도어락', '광점퍼코드', '태양광', '시리얼분배기', '관측소', '무선', '견인']
    ACTION_VERBS = ['교체', '설치', '신설', '재설치', '추가', '회수', '수거', '점검', '확인', '보정', '변경', '진행', '필요', '반납', '분출', '제거', '복구', '접수', '이상']

    def split_clauses(text):
        if not text:
            return []
        t = re.sub(r'[\r\n]+', ', ', str(text))
        t = re.sub(r'\s{3,}', ', ', t)
        raw_clauses = []
        curr = []
        depth = 0
        
        i = 0
        while i < len(t):
            ch = t[i]
            if ch in '([{':
                depth += 1
                curr.append(ch)
            elif ch in ')]}':
                depth = max(0, depth - 1)
                curr.append(ch)
            elif ch in [',', ';']:
                remainder = t[i+1:].lstrip()
                is_new_clause = (depth == 0) or any(remainder.startswith(kw) for kw in TOP_KEYWORDS)
                if is_new_clause:
                    depth = 0  # recover from unclosed parenthesis typos in field notes
                    c_str = ''.join(curr).strip()
                    if c_str:
                        raw_clauses.append(c_str)
                    curr = []
                else:
                    curr.append(ch)
            else:
                curr.append(ch)
            i += 1
        if curr:
            c_str = ''.join(curr).strip()
            if c_str:
                raw_clauses.append(c_str)

        # Pass 1: trailing notes merge into previous clause
        merged = []
        for c in raw_clauses:
            if merged and any(c.strip().startswith(prefix) for prefix in ['추후', '기준', '교체후', '설치후', '교체 후', '설치 후', '자동유량', '금강홍수']):
                merged[-1] = f'{merged[-1]} ({c})'
            else:
                merged.append(c)

        # Pass 2: merge sentence list items lacking verbs (e.g., '통신서지보호기 내부 유속계1', '유속계2')
        final_clauses = []
        buffer = []
        for c in merged:
            has_verb = any(v in c for v in ACTION_VERBS)
            if not has_verb and re.match(r'^\(?[A-Z0-9_\-\s/]+\)?$', c.strip()) and any(k in c for k in ['CM', 'LT', 'RQ', 'RG', 'SL', 'ADP']):
                if buffer:
                    buffer.append(c)
                    final_clauses.append(', '.join(buffer))
                    buffer = []
                else:
                    final_clauses.append(f'유속계 설치 {c}')
            elif not has_verb:
                buffer.append(c)
            else:
                if buffer:
                    buffer.append(c)
                    final_clauses.append(', '.join(buffer))
                    buffer = []
                else:
                    final_clauses.append(c)
        if buffer:
            final_clauses.append(', '.join(buffer))
        return final_clauses

    def parse_arrow(text):
        parts = re.split(r'→|->|-', text) if ('→' in text or '->' in text) else [text]
        if len(parts) >= 2:
            left_tokens = re.findall(r'[A-Za-z0-9\-]+', parts[0])
            right_tokens = re.findall(r'[A-Za-z0-9\-]+', parts[1])
            def find_sn_model(tokens):
                sn, model = '', ''
                for t in reversed(tokens):
                    if re.match(r'^\d{4,8}$', t) and not sn:
                        sn = t
                    elif re.match(r'^(CM|LT|RQ|RG|AG|ADP|SL|DC|AT)\w*$', t, re.I) and not model:
                        model = t
                return model, sn
            bm, bsn = find_sn_model(left_tokens)
            am, asn = find_sn_model(right_tokens)
            return bm, bsn, am, asn
        else:
            tokens = re.findall(r'[A-Za-z0-9\-]+', text)
            sn, model = '', ''
            for t in reversed(tokens):
                if re.match(r'^\d{4,8}$', t) and not sn:
                    sn = t
                elif re.match(r'^(CM|LT|RQ|RG|AG|ADP|SL|DC|AT)\w*$', t, re.I) and not model:
                    model = t
            return '', '', model, sn

    def classify_clause(clause, default_is_flow=True):
        c = clause.strip()
        
        # 0. Check cleaning/offset FIRST to avoid misidentifying '유속계 주변 부유물 제거' as flowmeter replacement
        if any(k in c for k in ['옵셋', 'off set', 'offset', '영점', '이물질', '부유물', '세척']):
            return 'SENSOR_CALIB', '센서보정·세척', '센서 영점/옵셋 보정 및 세척', '', '', '', '', '센서 보정 및 세척', 1, c

        # 1. Flowmeter replacement or install
        if ('유속계' in c or 'RQ-30' in c or 'RG-30' in c or 'Airmar' in c or 'ADP' in c or 'CM' in c) and not any(k in c for k in ['컨버터', '리피터', '케이블', '커넥터', '전원', '지지대', '구조물']):
            bm, bsn, am, asn = parse_arrow(c)
            if '교체' in c or '→' in c or '->' in c:
                return 'REPLACE_FLOW', '유속계 본체', '유속계 본체 교체', bm, bsn, am, asn, '유속계 본체', 1, ''
            elif any(k in c for k in ['설치', '신설', '재설치', '추가']):
                return 'INSTALL_FLOW', '유속계 본체', '유속계 신규/재설치', bm, bsn, am, asn, '유속계 본체', 1, ''
            elif '회수' in c or '수거' in c:
                return 'REPLACE_FLOW', '유속계 본체', '유속계 철거/수거', bm, bsn, am, asn, '유속계 본체', 1, ''
            else:
                return 'REPLACE_FLOW', '유속계 본체', '유속계 점검 및 정비', bm, bsn, am, asn, '유속계 본체', 1, ''

        # 2. Water level gauge replacement or install
        if ('수위계' in c or 'LT400' in c or 'LT500' in c or 'AT200' in c or '대기압' in c) and not any(k in c for k in ['컨버터', '리피터', '케이블', '커넥터', '옵셋', 'offset', '파이프', '기준']):
            bm, bsn, am, asn = parse_arrow(c)
            if '교체' in c or '→' in c or '->' in c:
                return 'REPLACE_WATER', '수위계 본체', '수위계 본체 교체', bm, bsn, am, asn, '수위계 본체', 1, ''
            elif any(k in c for k in ['설치', '신설', '재설치', '추가']):
                return 'INSTALL_WATER', '수위계 본체', '수위계 신규/재설치', bm, bsn, am, asn, '수위계 본체', 1, ''
            elif '회수' in c or '수거' in c:
                return 'REPLACE_WATER', '수위계 본체', '수위계 철거/수거', bm, bsn, am, asn, '수위계 본체', 1, ''
            else:
                return 'REPLACE_WATER', '수위계 본체', '수위계 점검 및 정비', bm, bsn, am, asn, '수위계 본체', 1, ''

        # 3. Sensor Cable / Connector
        if any(k in c for k in ['케이블', '커넥터', '배선', '광점퍼코드']):
            qty_m = re.search(r'(\d+)\s*(?:M|m|미터)', c)
            qty_str = f'{qty_m.group(1)}M' if qty_m else '1EA'
            pname = '광점퍼코드' if '광점퍼' in c else f'센서 케이블({qty_str})'
            m_qty = re.search(r'(\d+)\s*(?:EA|개)', c)
            qty = int(m_qty.group(1)) if m_qty else 1
            return 'CABLE_WIRING', '케이블·배선', '센서 케이블 및 커넥터 교체', '', '', '', '', pname, qty, ''

        # 4. Underwater Protection / Repeater
        if any(k in c for k in ['리피터', '수중센서보호', '수중보호', '견인 파이프', '견인파이프']):
            pname = '수중센서보호장치' if '수중센서보호' in c and '리피터' not in c else '센서 리피터'
            m = re.search(r'(\d+)\s*(?:EA|개|SET|식)', c, re.I)
            qty = int(m.group(1)) if m else 1
            return 'UNDERWATER_PARTS', '수중보호·리피터', '수중보호장치 및 리피터 정비', '', '', '', '', pname, qty, ''

        # 5. Comm / Network / Converter / Modem / Router / Surge SPD (exclude 센서지지대)
        has_surge = ('서지' in c and '센서' not in c) or any(k in c for k in ['서지보호기', '통신서지', '전원서지', 'SPD'])
        if any(k in c for k in ['컨버터', '공유기', '라우터', '모뎀', '인터넷', '중계기', '시리얼분배기', '시리얼 분배기']) or has_surge:
            pname = '통신/신호 컨버터'
            if '공유기' in c or '라우터' in c:
                pname = '인터넷 유무선 공유기'
            elif '모뎀' in c:
                pname = '통신 모뎀(LTE)'
            elif '시리얼' in c:
                pname = '시리얼 분배기'
            elif has_surge and '컨버터' not in c:
                pname = '통신/전원 서지보호기'
            m = re.search(r'(\d+)\s*(?:EA|개)', c)
            qty = int(m.group(1)) if m else 1
            return 'COMM_PARTS', '통신·네트워크', '통신 컨버터 및 네트워크 장비 정비', '', '', '', '', pname, qty, ''

        # 6. Power / Battery / Charger / DC Power
        if any(k in c for k in ['배터리', '충전기', '전원', '차단기', '정전원', '태양광', '판넬']):
            pname = '백업 배터리'
            if '충전기' in c:
                pname = '자동충전기'
            elif '전원공급' in c or '전원 공급' in c or '정전원' in c or 'DC' in c:
                pname = 'DC 전원공급장치'
            elif '차단기' in c:
                pname = '자동복구누전차단기'
            elif '전원제어' in c or '전원 제어' in c:
                pname = '원격전원제어기'
            elif '태양광' in c:
                pname = '태양광 충전 판넬'
            m = re.search(r'(\d+)\s*(?:EA|개)', c)
            qty = int(m.group(1)) if m else 1
            return 'POWER_BATTERY', '전원·배터리', '전원공급장치 및 배터리 정비', '', '', '', '', pname, qty, ''

        # 7. Control System / PC / Logger / Sender / Remote View Box / Mouse
        if any(k in c for k in ['시스템컨트롤러', '컨트롤러', 'Sender', 'Logger', '리모트 뷰 박스', '리모트뷰박스', '제어반 마우스', '마우스']):
            pname = '시스템 컨트롤러'
            if '리모트' in c:
                pname = '리모트 뷰 박스'
            elif '마우스' in c:
                pname = '제어반 마우스'
            m = re.search(r'(\d+)\s*(?:EA|개)', c)
            qty = int(m.group(1)) if m else 1
            return 'CONTROL_SYSTEM', '제어시스템', '시스템 컨트롤러 및 부속 제어반 정비', '', '', '', '', pname, qty, ''

        # 8. CCTV / Video / Monitor
        if any(k in c for k in ['CCTV', '카메라', '모니터', '영상', '녹화기', 'NVR']):
            pname = 'CCTV 카메라'
            if '모니터' in c:
                pname = 'CCTV 모니터'
            return 'CCTV_SURVEIL', '영상·CCTV', '영상 감시장비 및 모니터 정비', '', '', '', '', pname, 1, ''

        # 9. Structures / Shelters / Mounts / Signboards
        if any(k in c for k in ['현황판', '현황 판', '지지대', '구조물', '국사', '표식', '도어락']):
            pname = '지점 현황판' if '현황' in c else ('도어락' if '도어락' in c else '센서 지지대/구조물')
            return 'STRUCT_MAINT', '구조물·국사', '관측국사 및 지지대 보수', '', '', '', '', pname, 1, ''

        # 10. General Inspection / Check
        return 'NORMAL_CHECK', '단순점검', '종합 점검 및 현장 확인', '', '', '', '', '', 1, ''

    work_counter = 1
    total_actions = 0

    # History sheets config: (sheet_name, is_flowmeter, st_col, date_col, gubun_col, worker_col, major_col, sub_col, desc_col, max_row)
    hist_sheets = [
        ('1-1. 유속계 이력', True, 2, 3, 4, 5, 6, 7, 8, 75),
        ('2-1.수위계 이력', False, 1, 2, 3, 4, 5, 6, 7, 38)
    ]

    for sname, is_flow, col_st, col_date, col_gubun, col_worker, col_major, col_sub, col_desc, max_row in hist_sheets:
        if sname not in wb.sheetnames:
            continue
        ws = wb[sname]
        all_hist_rows = list(ws.iter_rows(values_only=True))[1:max_row]

        for r in all_hist_rows:
            raw_st = clean_val(r[col_st]) if len(r) > col_st and r[col_st] else ""
            raw_date = clean_val(r[col_date]) if len(r) > col_date else ""
            raw_gubun = clean_val(r[col_gubun]) if len(r) > col_gubun else "수시"
            raw_worker = clean_val(r[col_worker]) if len(r) > col_worker else "최기철 외 2인"
            raw_major = clean_val(r[col_major]) if len(r) > col_major else ""
            raw_sub = clean_val(r[col_sub]) if len(r) > col_sub else ""
            raw_desc = clean_val(r[col_desc]) if len(r) > col_desc else ""

            if not raw_desc and not raw_sub:
                continue

            if raw_date.endswith("00:00:00"):
                raw_date = raw_date.split(" ")[0]
            if not raw_date:
                raw_date = "2024-01-01"

            st_obj = find_station(raw_st)
            st_id = st_obj['id'] if st_obj else None
            st_name = st_obj['name'] if st_obj else (raw_st or "기술원/리버앤씨")
            st_code = st_obj['code'] if st_obj else ""

            work_type = raw_gubun if raw_gubun in ['정기', '수시', '보수', '수중', '신설', '순회'] else '수시점검'
            if '정기' in work_type: work_type = '정기점검'
            elif '수중' in work_type: work_type = '수중점검'
            elif '신설' in work_type: work_type = '신설설치'
            else: work_type = '수시점검'

            work_no = f"WRK-2026-{work_counter:04d}"
            work_counter += 1

            # Split raw_desc into atomic clauses
            clauses = split_clauses(raw_desc)
            if not clauses and raw_sub:
                clauses = [raw_sub]

            summary = f"[{work_type}] {clauses[0][:32]}" if clauses else f"[{work_type}] 현장 점검"
            if len(clauses) > 1:
                summary += f" 외 {len(clauses)-1}건"

            cur.execute("""
                INSERT INTO equipment_work (
                    work_no, station_id, station_name, station_code,
                    work_date, work_type, workers, summary, detail_raw, source_ref
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                work_no, st_id, st_name, st_code,
                raw_date, work_type, raw_worker, summary, raw_desc, f"{sname}"
            ))
            work_db_id = cur.lastrowid

            # Parse and insert each atomic action
            for c in clauses:
                code, cat, name, bm, bsn, am, asn, pn, pq, pc = classify_clause(c, is_flow)

                # Link equipment_id from equipment_master by matching serial_no
                eq_target_id = None
                for target_sn in [asn, bsn]:
                    if target_sn:
                        cur.execute("SELECT equipment_id FROM equipment_master WHERE serial_no LIKE ?", (f"%{target_sn}%",))
                        m_row = cur.fetchone()
                        if m_row:
                            eq_target_id = m_row[0]
                            break

                cur.execute("""
                    INSERT INTO equipment_action (
                        work_id, equipment_id, action_category, action_code, action_name,
                        before_model, before_sn, after_model, after_sn,
                        part_name, part_qty, param_change, detail_text
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    work_db_id, eq_target_id, cat, code, name,
                    bm, bsn, am, asn,
                    pn, pq, pc, c
                ))
                total_actions += 1

    print(f"✓ Ingested {work_counter - 1} field work records and {total_actions} structured actions.")

    # 6. Seed Sample Active Repairs for Equipment with Status 'REPAIRING'
    cur.execute("SELECT equipment_id, model_name, serial_no, station_id, station_name, location FROM equipment_master WHERE status = 'REPAIRING'")
    rep_counter = 1
    for r in cur.fetchall():
        eq_id, m_name, sn, s_id, s_name, loc = r
        rep_no = f"REP-2026-{rep_counter:04d}"
        rep_counter += 1
        cur.execute("""
            INSERT INTO equipment_repair (
                repair_no, equipment_id, equipment_name, station_id, station_name,
                stage, vendor, issue_desc, received_date, target_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rep_no, eq_id, f"{m_name} (S/N: {sn})", s_id, s_name,
            '수리중', loc or '리버앤씨', '현장 점검 시 통신 두절 및 센서 보드 이상 발생', '2026-09-20', '2026-11-15'
        ))
    print(f"✓ Seeded {rep_counter - 1} ongoing repair cases for equipment under repair.")

    conn.commit()
    conn.close()

    print("==================================================")
    print("🎉 [Equipment Migration] COMPLETE!")
    print(f"📊 Total Equipment Master: {total_inserted_eq} items")
    print(f"📋 Total Field Works: {work_counter - 1} records")
    print(f"⚡ Total Structured Actions: {total_actions} actions")
    print(f"🛠️ Active Repairs: {rep_counter - 1} cases")
    print("==================================================")

if __name__ == '__main__':
    main()
