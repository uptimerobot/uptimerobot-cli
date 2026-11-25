/**
 * The tag every monitor an agent setup creates carries.
 *
 * `init` promises it in the handoff it prints, and `verify` filters on it to
 * check that promise against the API. The API matches tag names exactly and
 * case-sensitively, so a second spelling anywhere would not fail loudly — it
 * would quietly return nothing and read as an agent that created nothing.
 * One constant, imported by both commands, is what keeps that from happening.
 */
export const AGENT_SETUP_TAG = 'agent-setup';
