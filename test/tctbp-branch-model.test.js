const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveBranchModel } = require("../scripts/tctbp-branch-model");

test("resolves the nested simple template strategy", () => {
  const result = resolveBranchModel({
    project: { defaultBranch: "main" },
    branchModel: {
      strategy: "simple",
      strategies: {
        simple: { productionBranch: "main" }
      }
    }
  });

  assert.deepEqual(result.significantBranches, ["main"]);
  assert.equal(result.productionBranch, "main");
  assert.equal(result.workingBranch, null);
});

test("resolves a flattened staged profile with a custom working branch", () => {
  const result = resolveBranchModel({
    branchModel: {
      strategy: "staged",
      workingBranch: "develop",
      stagingBranch: "staging",
      productionBranch: "main"
    }
  });

  assert.equal(result.workingBranch, "develop");
  assert.equal(result.preProductionBranch, "staging");
  assert.deepEqual(result.significantBranches, ["develop", "staging", "main"]);
});

test("resolves a nested staged strategy", () => {
  const result = resolveBranchModel({
    branchModel: {
      strategy: "staged",
      strategies: {
        staged: {
          workingBranch: "development",
          stagingBranch: "uat",
          productionBranch: "production"
        }
      }
    }
  });

  assert.deepEqual(result.significantBranches, [
    "development",
    "uat",
    "production"
  ]);
});

test("resolves long-lived review branches", () => {
  const result = resolveBranchModel({
    branchModel: {
      strategy: "long-lived-environment-branches",
      workingBranch: "development",
      reviewBranch: "review",
      productionBranch: "main"
    }
  });

  assert.equal(result.preProductionBranch, "review");
  assert.deepEqual(result.significantBranches, [
    "development",
    "review",
    "main"
  ]);
});
