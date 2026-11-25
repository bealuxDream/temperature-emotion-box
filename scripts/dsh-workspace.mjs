import Schema from '@deepseek-ai/schemastery';
export const name = 'temperature-box-workspace';
export const inject = ['workspaceRegistry'];
export const Config = Schema.object({ directory: Schema.string().required() });
export async function apply(ctx, config) {
  // Use the official registry API: do not rewrite an active DSH storage file.
  await ctx.workspaceRegistry.create(config.directory, '温度表情箱');
  console.log('[temperature-emotion-box] project workspace registered');
}
