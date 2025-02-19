const core = require("@actions/core");
const { execSync } = require("child_process");

const env = {
  PATH: process.env.PATH,
  FORCE_COLOR: "true",
  DOTNET_CLI_HOME: "/tmp",
  DOTNET_NOLOGO: "true",
  HOME: process.env.HOME,
};

function btoa(str) {
  return Buffer.from(str).toString("base64");
}

function generateResult(
  status,
  testName,
  command,
  message,
  duration,
  maxScore
) {
  return {
    version: 1,
    status,
    max_score: maxScore,
    tests: [
      {
        name: testName,
        status,
        score: status === "pass" ? maxScore : 0,
        message,
        test_code: command,
        filename: "",
        line_no: 0,
        duration,
      },
    ],
  };
}

async function reportToSkillPies(testResult) {
  // @ts-check
  const core = require("@actions/core");
  const github = require("@actions/github");

  try {
    const courseId = core.getInput("courseId");
    const sectionId = core.getInput("sectionId");

    if (courseId === "" || sectionId === "") {
      console.info("🚫 Skipping reporting to SkillPies");
    }

    console.log("Reporting test results to 🧪🍰 SkillPies ");

    const payload = {
      body: testResult,
      source: "github-classroom",
      courseId,
      sectionId,
      userId: github.context.actor,
      repository: github.context.repo,
      sha: github.context.sha,
    };

    console.log(JSON.stringify(payload, null, 2));

    const request = await fetch("https://www.skillpies.com/api/test-report", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await request.json();

    if (request.status !== 201) {
      console.error("❌ Error in Reporting");
      console.error(data);
    } else {
      console.log("🏁 Test Reported");
    }
  } catch (error) {
    console.error("❌ " + error.message);
  }
}

function getErrorMessageAndStatus(error, command) {
  if (error.message.includes("ETIMEDOUT")) {
    return { status: "error", errorMessage: "Command timed out" };
  }
  if (error.message.includes("command not found")) {
    return {
      status: "error",
      errorMessage: `Unable to locate executable file: ${command}`,
    };
  }
  if (error.message.includes("Command failed")) {
    return { status: "fail", errorMessage: "failed with exit code 1" };
  }
  return { status: "error", errorMessage: error.message };
}

async function run() {
  const testName = core.getInput("test-name", { required: true });
  const setupCommand = core.getInput("setup-command");
  const command = core.getInput("command", { required: true });
  const timeout = parseFloat(core.getInput("timeout") || 10) * 60000; // Convert to minutes
  const maxScore = parseInt(core.getInput("max-score") || 0);
  const workingDirectory = core.getInput("working-directory") || ".";

  const processEnv = {
    ...process.env,
    ...env,
  };

  let output = "";
  let startTime;
  let endTime;
  let result;

  try {
    if (setupCommand) {
      execSync(setupCommand, {
        timeout,
        cwd: workingDirectory,
        env: processEnv,
        stdio: "inherit",
      });
    }

    startTime = new Date();
    output = execSync(command, {
      cwd: workingDirectory,
      timeout,
      env: processEnv,
      stdio: "inherit",
    })?.toString();
    endTime = new Date();

    result = generateResult(
      "pass",
      testName,
      command,
      output,
      endTime - startTime,
      maxScore
    );
  } catch (error) {
    endTime = new Date();
    const { status, errorMessage } = getErrorMessageAndStatus(error, command);
    result = generateResult(
      status,
      testName,
      command,
      errorMessage,
      endTime - startTime,
      maxScore
    );
  }

  core.setOutput("result", btoa(JSON.stringify(result)));

  // report to skillpies
  console.log("Maybe reporting to SkillPies");
  await reportToSkillPies(result);
}

run();
