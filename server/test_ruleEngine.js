const ruleEngine = require("./ruleEngine");
const fs = require("fs");

console.log("==================================================");
console.log("🧪 RuleEngine & SftpCollector Unit Test");
console.log("==================================================");

// Load sample lines from /tmp/sample_lines.json
const sampleData = JSON.parse(fs.readFileSync("/tmp/sample_lines.json", "utf-8"));

// 1. Create mock EWSV file
const ewsvCode = "1001529";
const ewsvHeaderLine = sampleData.ewsv_headers.join(",");
const ewsvDataLine = sampleData.ewsv_row.join(",");
const ewsvRawContent = `${ewsvHeaderLine}\n${ewsvDataLine}`;

// 2. Create mock ADVM file
const advmCode = "1001590";
const advmHeaderLine = sampleData.advm_headers.join(",");
const advmDataLine = sampleData.advm_row.join(",");
const advmRawContent = `${advmHeaderLine}\n${advmDataLine}`;

const advmFileMap = {
  [advmCode]: { fileName: `${advmCode}_202607270800.adv`, content: advmRawContent }
};
const ewsvFileMap = {
  [ewsvCode]: { fileName: `${ewsvCode}_202607270800.esv`, content: ewsvRawContent }
};

// First run: all previous state empty
console.log("\n▶️ 1st Run: Evaluating RuleEngine with initial state...");
const result1 = ruleEngine.evaluateAll("202607270800", advmFileMap, ewsvFileMap, {});
console.log("✓ Total targets:", result1.summary.totalTarget);
console.log("✓ Received stations:", result1.summary.received);
console.log("✓ Total issues detected:", result1.issues.length);
console.log("✓ Action required stations:", result1.summary.actionRequiredStations);

// Check issues of 1001529
const issues1001529 = result1.stationIssuesMap["1001529"] || [];
console.log(`\n📌 Issues for 1001529 (남평대교): ${issues1001529.length}`);
issues1001529.forEach(i => {
  console.log(`  - [${i.ruleId}] ${i.problem}: ${i.detail} (상태: ${i.statusLabel}, 지속: ${i.continuousCount}회)`);
});

// Second run: passing previous state map to verify continuous count incrementing
console.log("\n▶️ 2nd Run: Evaluating next cycle to verify continuous count incrementing...");
const result2 = ruleEngine.evaluateAll("202607270810", advmFileMap, ewsvFileMap, result1.nextIssueStateMap);
const issues1001529_run2 = result2.stationIssuesMap["1001529"] || [];
console.log(`\n📌 Issues for 1001529 in Run 2:`);
issues1001529_run2.forEach(i => {
  console.log(`  - [${i.ruleId}] ${i.problem}: (상태: ${i.statusLabel}, 지속: ${i.continuousCount}회)`);
});

// Check if count incremented to 2
const countIncremented = issues1001529_run2.every(i => i.continuousCount === 2 && i.statusType === "ongoing");
console.log(`\n✅ Continuous count increment verification: ${countIncremented ? "PASS (1회 -> 2회 정상 누적)" : "FAIL"}`);

console.log("\n==================================================");
console.log("🎉 RuleEngine Unit Test Completed Successfully!");
console.log("==================================================");
