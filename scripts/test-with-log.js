/**
 * Test Script with Logging
 * Clears test-results.log and runs tests, writing all output to the log file
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'test-results.log');

// Clear the log file
fs.writeFileSync(logFile, '', 'utf8');
console.log('Cleared test-results.log');

// Run tests and capture all output
console.log('Running tests...');

const jestProcess = spawn('npx', ['jest'], {
  cwd: path.join(__dirname, '..'),
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env }
});

let stdout = '';
let stderr = '';

// Capture stdout
jestProcess.stdout.on('data', (data) => {
  const text = data.toString();
  stdout += text;
  process.stdout.write(text); // Also show in console
  fs.appendFileSync(logFile, text, 'utf8'); // Write to log immediately
});

// Capture stderr
jestProcess.stderr.on('data', (data) => {
  const text = data.toString();
  stderr += text;
  process.stderr.write(text); // Also show in console
  fs.appendFileSync(logFile, text, 'utf8'); // Write to log immediately
});

// Handle process completion
jestProcess.on('close', (code) => {
  // Ensure final summary is written
  const summary = `\n\n=== TEST EXECUTION COMPLETE ===\nExit code: ${code}\n`;
  fs.appendFileSync(logFile, summary, 'utf8');
  console.log(`\nTests completed with exit code ${code}. Full log written to ${logFile}`);
  process.exit(code);
});

jestProcess.on('error', (error) => {
  const errorMsg = `\n\n=== ERROR RUNNING TESTS ===\n${error.message}\n${error.stack}\n`;
  fs.appendFileSync(logFile, errorMsg, 'utf8');
  console.error(errorMsg);
  process.exit(1);
});

