import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { ComponentCategory } from '../types';
import {
  isNodeConfigured,
  layeredLayout,
  missingRequiredParams,
  validateDag,
  type ComponentFlowNode,
} from './dag';

function node(
  id: string,
  category: ComponentCategory,
  params: Record<string, unknown> = {},
  required: string[] = [],
): ComponentFlowNode {
  return {
    id,
    type: 'component',
    position: { x: 0, y: 0 },
    data: {
      componentCode: `code-${id}`,
      name: `控件-${id}`,
      category,
      params,
      schema: required.length > 0 ? { required, properties: {} } : undefined,
    },
  };
}

const edge = (from: string, to: string): Edge => ({ id: `e-${from}-${to}`, source: from, target: to });

describe('isNodeConfigured', () => {
  it('无 schema 或无需必填参数时视为已配置', () => {
    expect(isNodeConfigured(node('n1', 'PROCESS').data)).toBe(true);
    expect(isNodeConfigured(node('n2', 'PROCESS', {}, []).data)).toBe(true);
  });

  it('缺失必填参数视为未配置', () => {
    expect(isNodeConfigured(node('n1', 'SOURCE', {}, ['path']).data)).toBe(false);
    expect(isNodeConfigured(node('n1', 'SOURCE', { path: '' }, ['path']).data)).toBe(false);
    expect(isNodeConfigured(node('n1', 'SOURCE', { path: [] }, ['path']).data)).toBe(false);
  });

  it('必填参数填写后视为已配置', () => {
    expect(isNodeConfigured(node('n1', 'SOURCE', { path: '/data/in.csv' }, ['path']).data)).toBe(true);
    expect(isNodeConfigured(node('n1', 'SOURCE', { cols: ['a', 'b'] }, ['cols']).data)).toBe(true);
    expect(isNodeConfigured(node('n1', 'SOURCE', { head: false }, ['head']).data)).toBe(true);
  });
});

describe('missingRequiredParams', () => {
  it('列出缺失的必填键', () => {
    const data = node('n1', 'SINK', { url: 'jdbc:x', user: '' }, ['url', 'user', 'password']).data;
    expect(missingRequiredParams(data)).toEqual(['user', 'password']);
  });
});

describe('validateDag', () => {
  it('空画布直接返回一条提示', () => {
    const problems = validateDag([], []);
    expect(problems).toEqual(['画布为空：请至少拖入一个输入控件和一个输出控件']);
  });

  it('缺少 SOURCE / SINK 时分别提示', () => {
    expect(validateDag([node('n1', 'SOURCE')], [])).toContain('缺少输出控件（SINK）');
    expect(validateDag([node('n1', 'SINK')], [])).toContain('缺少输入控件（SOURCE）');
  });

  it('指出未连线的孤立节点', () => {
    const nodes = [node('n1', 'SOURCE'), node('n2', 'SINK')];
    const problems = validateDag(nodes, []);
    expect(problems).toContain('「控件-n1」未连线');
    expect(problems).toContain('「控件-n2」未连线');
  });

  it('禁止 SINK 连出、SOURCE 连入', () => {
    const bad = [node('s1', 'SOURCE'), node('k1', 'SINK'), node('p1', 'PROCESS')];
    const problems = validateDag(bad, [edge('s1', 'k1'), edge('k1', 'p1'), edge('p1', 's1')]);
    expect(problems).toContain('输出控件「控件-k1」不能再连出');
    expect(problems).toContain('输入控件「控件-s1」不能有输入连线');
  });

  it('列出缺失的必填参数', () => {
    const nodes = [node('n1', 'SOURCE', {}, ['path']), node('n2', 'SINK')];
    const problems = validateDag(nodes, [edge('n1', 'n2')]);
    expect(problems).toContain('「控件-n1」缺少必填参数：path');
  });

  it('合法 DAG 无任何问题', () => {
    const nodes = [
      node('n1', 'SOURCE', { path: '/data/in.csv' }, ['path']),
      node('n2', 'PROCESS'),
      node('n3', 'SINK'),
    ];
    expect(validateDag(nodes, [edge('n1', 'n2'), edge('n2', 'n3')])).toEqual([]);
  });

  it('同类问题只报一次', () => {
    // 两条边分别从 p1/p2 指回 SOURCE，会各报一次同类问题，去重后只应剩一条
    const nodes = [node('s1', 'SOURCE'), node('p1', 'PROCESS'), node('p2', 'PROCESS')];
    const problems = validateDag(nodes, [edge('p1', 's1'), edge('p2', 's1')]);
    expect(problems.filter((p) => p.includes('不能有输入连线'))).toHaveLength(1);
  });
});

describe('layeredLayout', () => {
  it('按层级从左到右排列，同层纵向错开', () => {
    const nodes = [node('n1', 'SOURCE'), node('n2', 'PROCESS'), node('n3', 'SINK')];
    const laid = layeredLayout(nodes, [edge('n1', 'n2'), edge('n2', 'n3')]);
    expect(laid.map((n) => n.position.x)).toEqual([40, 300, 560]);
    expect(laid.map((n) => n.position.y)).toEqual([40, 40, 40]);
  });

  it('同一层的多个节点不会重叠', () => {
    const nodes = [node('n1', 'SOURCE'), node('n2', 'SOURCE')];
    const laid = layeredLayout(nodes, []);
    expect(laid.map((n) => n.position.x)).toEqual([40, 40]);
    expect(laid.map((n) => n.position.y)).toEqual([40, 160]);
  });

  it('不修改传入的节点对象', () => {
    const nodes = [node('n1', 'SOURCE')];
    layeredLayout(nodes, []);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});
