const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Timeout for code execution (5 seconds)
const EXECUTION_TIMEOUT = 5000;

/**
 * Execute Python code
 */
async function executePython(code) {
    return new Promise((resolve) => {
        const tempDir = os.tmpdir();
        const fileName = `temp_${Date.now()}.py`;
        const filePath = path.join(tempDir, fileName);

        try {
            fs.writeFileSync(filePath, code);

            // Get Python version first
            exec('python3 --version', (versionErr, versionOut) => {
                const pythonVersion = versionErr ? 'Python 3' : versionOut.trim();

                exec(
                    `python3 "${filePath}"`,
                    { timeout: EXECUTION_TIMEOUT, maxBuffer: 1024 * 1024 },
                    (error, stdout, stderr) => {
                        // Clean up temp file
                        try {
                            fs.unlinkSync(filePath);
                        } catch (e) {
                            console.error('Failed to delete temp file:', e);
                        }

                        if (error) {
                            if (error.killed) {
                                resolve({
                                    success: false,
                                    output: `⏱️ Execution timed out (${EXECUTION_TIMEOUT}ms limit)`,
                                    version: pythonVersion
                                });
                            } else {
                                resolve({
                                    success: false,
                                    output: stderr || error.message,
                                    version: pythonVersion
                                });
                            }
                            return;
                        }

                        resolve({
                            success: true,
                            output: stdout || '(No output)',
                            version: pythonVersion
                        });
                    }
                );
            });
        } catch (err) {
            // Clean up on error
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {}

            resolve({
                success: false,
                output: `File system error: ${err.message}`,
                version: 'Python 3'
            });
        }
    });
}

/**
 * Execute Java code
 */
async function executeJava(code) {
    return new Promise((resolve) => {
        const tempDir = os.tmpdir();

        // Extract class name from code
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';

        // If no public class found, wrap in Main class
        let finalCode = code;
        if (!classMatch) {
            finalCode = `public class Main {\n    public static void main(String[] args) {\n${code.split('\n').map(line => '        ' + line).join('\n')}\n    }\n}`;
        }

        const fileName = `${className}.java`;
        const filePath = path.join(tempDir, fileName);

        // Get Java version first
        exec('java -version 2>&1', (versionErr, versionOut, versionStderr) => {
            const javaVersionMatch = (versionStderr || versionOut || '').match(/version "([^"]+)"/);
            const javaVersion = javaVersionMatch ? `Java ${javaVersionMatch[1]}` : 'Java';

            try {
                fs.writeFileSync(filePath, finalCode);

                // Compile Java code
                exec(
                    `javac "${filePath}"`,
                    { timeout: EXECUTION_TIMEOUT, maxBuffer: 1024 * 1024 },
                    (compileError, compileStdout, compileStderr) => {
                        if (compileError) {
                            // Clean up
                            try {
                                fs.unlinkSync(filePath);
                            } catch (e) {}

                            resolve({
                                success: false,
                                output: `Compilation Error:\n${compileStderr || compileError.message}`,
                                version: javaVersion
                            });
                            return;
                        }

                        // Run compiled Java code
                        exec(
                            `cd "${tempDir}" && java ${className}`,
                            { timeout: EXECUTION_TIMEOUT, maxBuffer: 1024 * 1024 },
                            (runError, runStdout, runStderr) => {
                                // Clean up files
                                try {
                                    fs.unlinkSync(filePath);
                                    fs.unlinkSync(path.join(tempDir, `${className}.class`));
                                } catch (e) {}

                                if (runError) {
                                    if (runError.killed) {
                                        resolve({
                                            success: false,
                                            output: `⏱️ Execution timed out (${EXECUTION_TIMEOUT}ms limit)`,
                                            version: javaVersion
                                        });
                                    } else {
                                        resolve({
                                            success: false,
                                            output: `Runtime Error:\n${runStderr || runError.message}`,
                                            version: javaVersion
                                        });
                                    }
                                    return;
                                }

                                resolve({
                                    success: true,
                                    output: runStdout || '(No output)',
                                    version: javaVersion
                                });
                            }
                        );
                    }
                );
            } catch (err) {
                // Clean up on error
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) {}

                resolve({
                    success: false,
                    output: `File system error: ${err.message}`,
                    version: javaVersion
                });
            }
        });
    });
}

async function runCode(language, code) {
    if (language === 'python') {
        return executePython(code);
    }
    if (language === 'java') {
        return executeJava(code);
    }
    return {
        success: false,
        output: `Language ${language} is not supported.`,
        version: language
    };
}

module.exports = {
    EXECUTION_TIMEOUT,
    runCode,
};
