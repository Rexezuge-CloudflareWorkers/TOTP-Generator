/**
 * Minimal `cloudflare:workers` stand-in for the Node unit pool.
 *
 * The kit's `@rexezuge/runtime` barrel re-exports its Durable Object and
 * Workflow bases, so importing the runtime — even only for
 * `AbstractEntrypointWorker` — evaluates modules that extend these platform
 * classes and must import them from a module that exists. Nothing here is
 * exercised; it stores `ctx`/`env` rather than stubbing methods, so a suite that
 * drives a base directly still has the real fields to work with.
 */
class DurableObject<TEnv = unknown> {
  protected ctx: DurableObjectState;
  protected env: TEnv;

  constructor(ctx: DurableObjectState, env: TEnv) {
    this.ctx = ctx;
    this.env = env;
  }
}

class WorkflowEntrypoint<TEnv = unknown> {
  protected ctx: ExecutionContext;
  protected env: TEnv;

  constructor(ctx: ExecutionContext, env: TEnv) {
    this.ctx = ctx;
    this.env = env;
  }
}

export { DurableObject, WorkflowEntrypoint };
