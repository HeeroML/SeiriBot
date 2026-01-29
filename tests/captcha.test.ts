import assert from "node:assert/strict";
import { generatePatternCaptcha, ROW_COUNT, ROW_LENGTH } from "../src/captcha/pattern";

function isRepeatingPattern(row: string[]): boolean {
  for (let patternLength = 2; patternLength <= 4; patternLength += 1) {
    let matches = true;
    for (let i = 0; i < row.length; i += 1) {
      if (row[i] !== row[i % patternLength]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

for (let i = 0; i < 100; i += 1) {
  const captcha = generatePatternCaptcha();

  assert.equal(captcha.rows.length, ROW_COUNT, "Row count should be 4");
  captcha.rows.forEach((row) => assert.equal(row.length, ROW_LENGTH));

  const nonRepeatingIndices = captcha.rows
    .map((row, index) => ({ index, repeating: isRepeatingPattern(row) }))
    .filter(({ repeating }) => !repeating)
    .map(({ index }) => index + 1);

  assert.equal(nonRepeatingIndices.length, 1, "Exactly one row should be broken");
  assert.equal(nonRepeatingIndices[0], captcha.brokenRow, "brokenRow should point to the broken row");

  const lines = captcha.text.split("\n");
  assert.equal(lines.length, ROW_COUNT, "Text should contain 4 lines");
  lines.forEach((line, index) => {
    const expectedLine = `${index + 1}) ${captcha.rows[index].join(" ")}`;
    assert.equal(line, expectedLine, "Text formatting should match rows");
  });
}

console.log("captcha tests passed");
