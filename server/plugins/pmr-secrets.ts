import { registerRequiredSecret } from "@agent-native/core/secrets";
registerRequiredSecret({
  key: "PMR_OPENAI_API_KEY",
  label: "PMR OpenAI vision key",
  description:
    "Optional: sends uploaded PMR images to OpenAI for equipment recognition, OCR and visible defect analysis. Without it, evidence stays pending for manual review.",
  docsUrl: "https://platform.openai.com/api-keys",
  scope: "user",
  kind: "api-key",
  required: false,
});
export default () => {};
