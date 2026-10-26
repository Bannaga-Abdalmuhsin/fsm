// Production action transport. The standalone Pages preview aliases this module
// at build time; no demo switch or authentication bypass exists in the live app.
export {
  useActionQuery,
  useActionMutation,
  signOut,
} from "@agent-native/core/client/hooks";
