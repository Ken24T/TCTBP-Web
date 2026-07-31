const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const {
  WORKFLOW_IDS,
  createStatusErrorDocument
} = require("../scripts/tctbp-status-model");

const projectRoot = path.resolve(__dirname, "..");
const schema = JSON.parse(
  fs.readFileSync(
    path.join(
      projectRoot,
      "schemas",
      "tctbp-adviser-inspection-v1.schema.json"
    ),
    "utf8"
  )
);
const policy = JSON.parse(
  fs.readFileSync(path.join(projectRoot, ".github", "TCTBP.json"), "utf8")
);
const validate = new Ajv2020({
  strict: true,
  allowUnionTypes: true
}).compile(schema);
const fixtureDirectory = path.join(
  projectRoot,
  "contracts",
  "adviser-v1",
  "fixtures"
);

for (const fixtureName of [
  "simple-clean.json",
  "staged-dirty.json",
  "long-lived-diverged.json"
]) {
  test(`${fixtureName} satisfies Adviser contract v1`, () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDirectory, fixtureName), "utf8")
    );

    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  });
}

test("contract v1 allows unknown additive fields", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixtureDirectory, "simple-clean.json"), "utf8")
  );
  fixture.futureTopLevelField = { enabled: true };
  fixture.observation.futureObservationField = "ignored by v1 readers";

  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
});

test("fixtures use only declared stable reason and guardrail codes", () => {
  const reasonCodes = new Set(policy.adviserVocabulary.reasonCodes);
  const guardrailIds = new Set(policy.adviserVocabulary.guardrailIds);

  for (const fixtureName of fs.readdirSync(fixtureDirectory).sort()) {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDirectory, fixtureName), "utf8")
    );

    for (const code of fixture.observation.statusAdvice.reasonCodes) {
      assert.equal(reasonCodes.has(code), true, `${fixtureName}: ${code}`);
    }

    for (const guardrail of fixture.observation.activeGuardrails) {
      assert.equal(
        guardrailIds.has(guardrail.id),
        true,
        `${fixtureName}: ${guardrail.id}`
      );
      assert.equal(
        reasonCodes.has(guardrail.reasonCode),
        true,
        `${fixtureName}: ${guardrail.reasonCode}`
      );
    }
  }
});

test("policy advertises contract v1 capabilities and schema", () => {
  assert.equal(policy.schemaVersion, 11);
  assert.deepEqual(policy.adviserContract, {
    major: 1,
    minor: 0,
    capabilities: [
      "inspection.local-v1",
      "workflow-catalogue.core-v1",
      "reason-codes.core-v1"
    ],
    schema: "schemas/tctbp-adviser-inspection-v1.schema.json",
    compatibility:
      "Readers reject unsupported major versions, ignore unknown additive fields, and degrade by missing capability."
  });
  assert.deepEqual(policy.adviserVocabulary.workflowIds, WORKFLOW_IDS);
});

test("failure envelopes remain valid when policy contract metadata is invalid", () => {
  const document = createStatusErrorDocument(
    { adviserContract: { major: "invalid" } },
    new Error("Contract metadata failed.")
  );

  assert.equal(validate(document), true, JSON.stringify(validate.errors));
  assert.equal(document.observation, null);
  assert.equal(document.errors[0].code, "status-inspection-failed");
});
