/**
 * Configurable prompt templates.
 *
 * Each template defines two prompts:
 *   - **systemPrompt**: sent per subtask to a worker for analysis
 *   - **synthesisPrompt**: used after all subtasks complete to aggregate
 *     individual reports into one integrated report
 *
 * Built-in templates are seeded on first load and cannot be deleted.
 * Users can clone/override built-in templates or create custom ones.
 */

import type { PromptTemplate, TaskType } from "@/types"

const ID_PREFIX = "pt_"
const BUILTIN_ID_PREFIX = "builtin_"

let _counter = Date.now()
function uid(): string {
  return ID_PREFIX + (++_counter).toString(36)
}

// ── Built-in defaults ───────────────────────────────────────────────────────

const DEFAULT_CODE_CHECK_SYSTEM_PROMPT = `请检查目标路径 \`{{target}}\` 的代码质量。

任务：{{taskName}}
目标路径：{{target}}

请执行以下检查：
1. 代码风格与规范 — 是否符合项目惯例、有无格式问题
2. 潜在 Bug — 空指针、边界条件、资源泄漏、并发问题
3. 安全漏洞 — SQL 注入、XSS、敏感信息泄露、权限绕过
4. 性能问题 — 不必要的循环、内存分配、N+1 查询
5. 错误处理 — 缺少 try/catch、错误被吞没、不恰当的异常类型

对每个问题请标注：
- 严重级别（严重 / 中等 / 建议）
- 所在文件与行号（如果能确定）
- 修复建议

重要要求：
- 直接输出完整的检查报告，一次性给出所有发现
- 不要询问"是否需要进一步分析"或"是否需要修复"
- 不要输出"听起来不错"、"还有其他问题吗"等对话性内容
- 报告输出完毕后即可结束

请用中文输出检查报告。`

const DEFAULT_CODE_ANALYSIS_SYSTEM_PROMPT = `请分析目标路径 \`{{target}}\` 的代码。

任务：{{taskName}}
目标路径：{{target}}

请执行以下分析：
1. 架构分析 — 目录结构、模块划分、分层是否清晰
2. 依赖关系 — 模块间的耦合度、循环依赖、外部依赖是否合理
3. 复杂度分析 — 圈复杂度、函数长度、嵌套深度
4. 设计模式 — 使用了哪些设计模式、是否恰当
5. 可维护性 — 命名规范、注释质量、测试覆盖度
6. 改进建议 — 重构优先级、可提取的公共模块

重要要求：
- 直接输出完整的分析报告，一次性给出所有发现
- 不要询问"是否需要进一步分析"或"是否需要修改"
- 不要输出"听起来不错"、"还有其他问题吗"等对话性内容
- 报告输出完毕后即可结束

请用中文输出分析报告。`

const DEFAULT_CODE_GENERATION_SYSTEM_PROMPT = `请根据以下需求生成代码。

任务：{{taskName}}
需求描述：{{target}}

请严格按照以下要求生成代码：

1. **完整实现** — 提供可直接运行的完整代码，不要省略任何部分（包括 import、类型定义、工具函数等）
2. **最佳实践** — 遵循对应语言/框架的官方最佳实践和设计模式
3. **注释完善** — 关键逻辑处添加中文注释，包括函数说明、参数含义、返回值说明
4. **错误处理** — 包含适当的错误处理和边界检查，不要假设输入总是合法的
5. **类型安全** — 使用 TypeScript 类型（如果是 JS/TS 项目），避免 any
6. **性能考虑** — 注意算法复杂度、内存使用、避免不必要的重复计算

输出格式：
- 每个文件使用代码块标注语言类型和文件名
- 如果生成多个文件，说明文件之间的依赖关系
- 提供简要的使用说明或示例

请直接输出完整代码，不要询问是否需要修改或补充。`

const DEFAULT_SYNTHESIS_PROMPT = `你是一个代码报告整合专家。以下是一次代码检查任务中多个目标的检查报告，每个目标由不同的 AI 独立完成。

请将这些报告整合为一份统一的综合报告。

要求：
1. **执行摘要** — 概括本次检查的整体发现、严重问题数量和总体质量评估
2. **跨目标问题汇总** — 按严重级别（严重 / 中等 / 建议）对所有目标中发现的问题进行归类汇总
3. **重复问题去重** — 如果多个目标存在相似问题，合并为一条并标注影响范围
4. **分目标详情** — 每个目标的独立发现列表（保持原文的关键信息）
5. **统计概览** — 总检查文件数、问题总数、各级别分布

格式要求：
- 使用 Markdown 格式
- 标题层级清晰
- 关键数据使用表格

以下是各目标报告内容：

{{reports}}

请直接输出整合后的综合报告，不要输出对话性内容。`

/**
 * Template variables:
 *   {{target}}     — the subtask target (file path / shell command)
 *   {{taskName}}   — the parent task name
 *   {{reports}}    — (synthesis only) concatenated per-target report blocks
 */

/** Default synthesis prompt used by built-in templates. */
export { DEFAULT_SYNTHESIS_PROMPT }

// ── Built-in template factory ───────────────────────────────────────────────

function builtinTemplate(
  idSuffix: string,
  name: string,
  taskType: TaskType,
  systemPrompt: string,
  synthesisPrompt: string = DEFAULT_SYNTHESIS_PROMPT,
): PromptTemplate {
  const now = Date.now()
  return {
    id: BUILTIN_ID_PREFIX + idSuffix,
    name,
    taskType,
    systemPrompt,
    synthesisPrompt,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  }
}

/** Get the full set of built-in templates. */
export function getBuiltinTemplates(): PromptTemplate[] {
  return [
    builtinTemplate(
      "code_check",
      "Code Check (default)",
      "code-check",
      DEFAULT_CODE_CHECK_SYSTEM_PROMPT,
    ),
    builtinTemplate(
      "code_analysis",
      "Code Analysis (default)",
      "code-analysis",
      DEFAULT_CODE_ANALYSIS_SYSTEM_PROMPT,
    ),
    builtinTemplate(
      "code_generation",
      "Code Generation (default)",
      "code-generation",
      DEFAULT_CODE_GENERATION_SYSTEM_PROMPT,
    ),
    builtinTemplate(
      "custom",
      "Custom (shell)",
      "custom",
      "{{target}}",
    ),
  ]
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve a template by id from the given list.
 * Falls back to the built-in matching the task type if the id is unknown
 * or missing, and finally to an inline default.
 */
export function resolvePromptTemplate(
  templateId: string | undefined,
  taskType: TaskType,
  customTemplates: PromptTemplate[],
): PromptTemplate {
  // 1. Try user's custom templates
  if (templateId) {
    const found = customTemplates.find(t => t.id === templateId)
    if (found) return found
  }
  // 2. Fall back to built-in for the task type
  const builtins = getBuiltinTemplates()
  const fallback = builtins.find(t => t.taskType === taskType)
  if (fallback) return fallback
  // 3. Inline emergency fallback
  return builtins[0]
}

/** Get the suggested built-in id for a task type. */
export function getBuiltinIdForTaskType(taskType: TaskType): string {
  switch (taskType) {
    case "code-check":      return BUILTIN_ID_PREFIX + "code_check"
    case "code-analysis":   return BUILTIN_ID_PREFIX + "code_analysis"
    case "code-generation": return BUILTIN_ID_PREFIX + "code_generation"
    case "custom":          return BUILTIN_ID_PREFIX + "custom"
  }
}

/** Check whether an id refers to a built-in template. */
export function isBuiltinId(id: string): boolean {
  return id.startsWith(BUILTIN_ID_PREFIX)
}

// ── Variable interpolation ──────────────────────────────────────────────────

/**
 * Replace {{variables}} in a prompt string with actual values.
 */
export function interpolatePrompt(
  template: string,
  vars: { target?: string; taskName?: string; reports?: string },
): string {
  let result = template
  if (vars.target != null)       result = result.replace(/\{\{target\}\}/g, vars.target)
  if (vars.taskName != null)     result = result.replace(/\{\{taskName\}\}/g, vars.taskName)
  if (vars.reports != null)      result = result.replace(/\{\{reports\}\}/g, vars.reports)
  return result
}

// ── User template CRUD (no mutation, returns a new array) ───────────────────

/** Create a new user template (never duplicates built-in IDs). */
export function createPromptTemplate(
  name: string,
  taskType: TaskType,
  systemPrompt: string,
  synthesisPrompt: string = DEFAULT_SYNTHESIS_PROMPT,
): PromptTemplate {
  const now = Date.now()
  return {
    id: uid(),
    name,
    taskType,
    systemPrompt,
    synthesisPrompt,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** Update a template in the list (returns new array, no mutation). */
export function updatePromptTemplateInList(
  list: PromptTemplate[],
  updated: PromptTemplate,
): PromptTemplate[] {
  return list.map(t => t.id === updated.id ? { ...updated, updatedAt: Date.now() } : t)
}

/** Remove a non-builtin template from the list. */
export function removePromptTemplateFromList(
  list: PromptTemplate[],
  id: string,
): PromptTemplate[] {
  return list.filter(t => t.id !== id)
}
