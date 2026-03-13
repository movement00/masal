/**
 * MASAL Agent Exports
 *
 * 4 agent mimarisi:
 *   - PromptArchitect:  BookData'dan optimal prompt olusturur
 *   - SceneGenerator:   Kie.ai/Google ile gorsel uretir
 *   - QualityValidator: Gemini Vision ile kalite kontrol
 *   - BookOrchestrator: Tum ajanlari koordine eder
 */

const PromptArchitect = require("./prompt-architect");
const SceneGenerator = require("./scene-generator");
const QualityValidator = require("./quality-validator");
const BookOrchestrator = require("./book-orchestrator");

module.exports = {
  PromptArchitect,
  SceneGenerator,
  QualityValidator,
  BookOrchestrator,
};
