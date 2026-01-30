import assert from "node:assert/strict";
import { generatePatternCaptcha } from "../src/captcha/pattern";

for (let i = 0; i < 100; i += 1) {
  const captcha = generatePatternCaptcha();

  assert.ok(captcha.question.length > 0, "Question should not be empty");
  assert.equal(captcha.options.length, 4, "Captcha should have 4 options");
  assert.ok(captcha.correctIndex >= 1 && captcha.correctIndex <= 4, "Correct index should be in range");

  const optionKeys = captcha.options.map((option) => `${option.emoji ?? ""}|${option.text}`);
  const uniqueOptions = new Set(optionKeys);
  assert.equal(uniqueOptions.size, captcha.options.length, "Options should be unique");

  captcha.options.forEach((option) => {
    assert.ok(option.text.length > 0, "Option text should not be empty");
  });
}

console.log("captcha tests passed");
