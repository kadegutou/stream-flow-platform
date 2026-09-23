import type { Edge, Node } from '@xyflow/react';
import type { ComponentCategory, ParamSchema } from '../types';

/**
 * 画布 DAG 的纯逻辑：必填判断、分层布局、保存前校验。
 *
 * 这些函数不依赖 React 与 React Flow 运行时（只用到类型），因此从 JobEditor 抽出来
 * 单独成模块：既给 861 行的编辑器瘦身，也让它们能被单元测试直接覆盖。
 */

/** 画布节点上的控件数据 */
export interface ComponentNodeData extends Record<string, unknown> {
  componentCode: string;
  name: string;
  category: ComponentCategory;
  params: Record<string, unknown>;
  schema?: ParamSchema;
}

export type ComponentFlowNode = Node<ComponentNodeData, 'component'>;

/** 判断节点必填参数是否已配置完整 */
export function isNodeConfigured(data: ComponentNodeData): boolean {
  const required = data.schema?.required ?? [];
  if (required.length === 0) return true;
  return required.every((key) => {
    const v = data.params[key];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

/** 列出节点缺失的必填参数（用于校验提示的逐条文案） */
export function missingRequiredParams(data: ComponentNodeData): string[] {
  return (data.schema?.required ?? []).filter((key) => {
    const v = data.params[key];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
}

/** 简单从左到右分层布局 */
export function layeredLayout(nodes: ComponentFlowNode[], edges: Edge[]): ComponentFlowNode[] {
  const layerOf = new Map<string, number>();
  nodes.forEach((n) => layerOf.set(n.id, 0));
  // 迭代松弛计算层级（DAG 场景足够）
  for (let i = 0; i < nodes.length; i++) {
    edges.forEach((e) => {
      const fromLayer = layerOf.get(e.source) ?? 0;
      const toLayer = layerOf.get(e.target) ?? 0;
      if (fromLayer + 1 > toLayer) layerOf.set(e.target, fromLayer + 1);
    });
  }
  const layerIndex = new Map<number, number>();
  return nodes.map((n) => {
    const layer = layerOf.get(n.id) ?? 0;
    const idx = layerIndex.get(layer) ?? 0;
    layerIndex.set(layer, idx + 1);
    return { ...n, position: { x: layer * 260 + 40, y: idx * 120 + 40 } };
  });
}

/**
 * 保存前本地预检：结构 + 必填参数，问题逐条列出。
 * 与后端 DagValidator 的规则保持一致，但目的是「保存前就能给用户指出问题」。
 */
export function validateDag(nodes: ComponentFlowNode[], edges: Edge[]): string[] {
  const problems: string[] = [];
  if (nodes.length === 0) {
    problems.push('画布为空：请至少拖入一个输入控件和一个输出控件');
    return problems;
  }
  const sources = nodes.filter((n) => n.data.category === 'SOURCE');
  const sinks = nodes.filter((n) => n.data.category === 'SINK');
  if (sources.length === 0) problems.push('缺少输入控件（SOURCE）');
  if (sinks.length === 0) problems.push('缺少输出控件（SINK）');

  // 孤立节点（无任何连线）
  const connected = new Set<string>();
  edges.forEach((e) => {
    connected.add(e.source);
    connected.add(e.target);
  });
  nodes.forEach((n) => {
    if (!connected.has(n.id) && nodes.length > 1) {
      problems.push(`「${n.data.name}」未连线`);
    }
  });

  // 输入控件不应有入边、输出控件不应有出边
  edges.forEach((e) => {
    const from = nodes.find((n) => n.id === e.source);
    const to = nodes.find((n) => n.id === e.target);
    if (from?.data.category === 'SINK') problems.push(`输出控件「${from.data.name}」不能再连出`);
    if (to?.data.category === 'SOURCE') problems.push(`输入控件「${to.data.name}」不能有输入连线`);
  });

  // 必填参数缺失
  nodes.forEach((n) => {
    if (!isNodeConfigured(n.data)) {
      problems.push(`「${n.data.name}」缺少必填参数：${missingRequiredParams(n.data).join('、')}`);
    }
  });
  return [...new Set(problems)];
}
