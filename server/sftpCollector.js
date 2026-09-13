const Client = require("ssh2-sftp-client");

class SftpCollector {
  constructor() {
    this.config = {
      host: process.env.SFTP_HOST || "211.114.42.234",
      port: parseInt(process.env.SFTP_PORT || "9940", 10),
      username: process.env.SFTP_USER || "hriver",
      password: process.env.SFTP_PASSWORD || "gksrkd12#$",
      readyTimeout: 5000,
      retries: 1,
      retry_factor: 1,
      retry_minTimeout: 2000
    };
    this.advmRemoteRoot = process.env.ADVM_REMOTE_ROOT || "/data/advm";
    this.ewsvRemoteRoot = process.env.EWSV_REMOTE_ROOT || "/data/ewsv";
  }

  /**
   * Calculates latest 10-minute floor targetDT in YYYYMMDDhhmm format.
   * e.g. 2026-09-13 22:34:00 -> "202609132230"
   */
  getLatestTargetDT(customDate = null) {
    const d = customDate ? new Date(customDate) : new Date();
    // 10-minute floor
    const minutes = Math.floor(d.getMinutes() / 10) * 10;
    d.setMinutes(minutes, 0, 0);

    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());

    return `${yyyy}${mm}${dd}${hh}${mi}`;
  }

  /**
   * Fetches all .adv and .esv raw files for a given targetDT from SFTP.
   * Returns in-memory file map without writing to disk.
   */
  async fetchFiles(targetDT) {
    const sftp = new Client("sftp-collector");
    const result = {
      success: false,
      targetDT,
      advmFiles: {}, // code -> { fileName, content }
      ewsvFiles: {}, // code -> { fileName, content }
      error: null
    };

    const yyyy = targetDT.slice(0, 4);
    const mm = targetDT.slice(4, 6);
    const dd = targetDT.slice(6, 8);

    const advmDir = `${this.advmRemoteRoot}/${yyyy}/${mm}/${dd}`;
    const ewsvDir = `${this.ewsvRemoteRoot}/${yyyy}/${mm}/${dd}`;

    try {
      await sftp.connect(this.config);

      // 1. ADVM directory list & read
      try {
        const advmList = await sftp.list(advmDir);
        const advmTargetFiles = advmList.filter(f => f.name.endsWith(`_${targetDT}.adv`));
        for (const file of advmTargetFiles) {
          const code = file.name.split("_")[0];
          const buffer = await sftp.get(`${advmDir}/${file.name}`);
          result.advmFiles[code] = {
            fileName: file.name,
            content: buffer.toString("utf-8")
          };
        }
      } catch (err) {
        console.warn(`[SftpCollector] Warning reading ADVM dir ${advmDir}:`, err.message);
      }

      // 2. EWSV directory list & read
      try {
        const ewsvList = await sftp.list(ewsvDir);
        const ewsvTargetFiles = ewsvList.filter(f => f.name.endsWith(`_${targetDT}.esv`));
        for (const file of ewsvTargetFiles) {
          const code = file.name.split("_")[0];
          const buffer = await sftp.get(`${ewsvDir}/${file.name}`);
          result.ewsvFiles[code] = {
            fileName: file.name,
            content: buffer.toString("utf-8")
          };
        }
      } catch (err) {
        console.warn(`[SftpCollector] Warning reading EWSV dir ${ewsvDir}:`, err.message);
      }

      result.success = true;
      return result;
    } catch (e) {
      result.error = e.message;
      return result;
    } finally {
      try {
        await sftp.end();
      } catch (_) {}
    }
  }
}

module.exports = new SftpCollector();
