import { runWeeklyLearningTriage } from "../server/weeklyLearningTriage";

async function main() {
  const result = await runWeeklyLearningTriage();
  console.log(JSON.stringify({ job: "weekly-learning-triage", ...result }));
}

main().catch((error) => {
  console.error("weekly-learning-triage failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
