import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAgentThought,
  applyToolResult,
  applyToolStart,
  applyWorkflowPhaseToActivity,
  clearAgentActivityForResponse,
  extractReasoningFieldText,
  hasVisibleAgentActivity,
  INITIAL_AGENT_ACTIVITY,
  labelForPlanDecision,
  mapPlanStepsFromPayload,
  STREAMING_AGENT_ACTIVITY,
  updateToolStepResult,
} from './agentActivity';

test('applyAgentThought streams router reason deltas', () => {
  const first = applyAgentThought(INITIAL_AGENT_ACTIVITY, {
    delta: 'El usuario',
    source: 'router',
  });
  const second = applyAgentThought(first, {
    delta: ' pregunta por categorías.',
    source: 'router',
  });
  assert.equal(second.planReason, 'El usuario pregunta por categorías.');
});

test('applyAgentThought only accepts router source', () => {
  assert.deepEqual(
    applyAgentThought(INITIAL_AGENT_ACTIVITY, {
      delta: 'ignorado',
      source: 'reasoning',
    }),
    INITIAL_AGENT_ACTIVITY,
  );
});

test('applyAgentThought sets final router reason text', () => {
  const withReason = applyAgentThought(INITIAL_AGENT_ACTIVITY, {
    text: 'El usuario pregunta por categorías del menú live.',
    source: 'router',
  });
  assert.equal(
    withReason.planReason,
    'El usuario pregunta por categorías del menú live.',
  );
});

test('applyWorkflowPhaseToActivity maps workflow phases', () => {
  const next = applyWorkflowPhaseToActivity(INITIAL_AGENT_ACTIVITY, 'executing');
  assert.equal(next.phase, 'execute');
  assert.equal(next.status, 'processing');
});

test('applyToolStart appends a running tool step', () => {
  const next = applyToolStart(INITIAL_AGENT_ACTIVITY, {
    tool: 'list_categories',
    call_id: 'call-1',
    effect: 'read',
  });
  assert.equal(next.tools.length, 1);
  assert.equal(next.tools[0]?.status, 'running');
  assert.equal(next.tools[0]?.tool, 'list_categories');
});

test('clearAgentActivityForResponse resets activity', () => {
  const active = applyToolStart(STREAMING_AGENT_ACTIVITY, { tool: 'search_products' });
  assert.deepEqual(clearAgentActivityForResponse(active), INITIAL_AGENT_ACTIVITY);
});

test('applyToolResult marks matching tool done', () => {
  const started = applyToolStart(INITIAL_AGENT_ACTIVITY, {
    tool: 'search_products',
    call_id: 'call-1',
  });
  const next = applyToolResult(started, {
    tool: 'search_products',
    call_id: 'call-1',
    ok: true,
    summary: '3 productos',
  });
  assert.equal(next.tools[0]?.status, 'done');
  assert.equal(next.tools[0]?.summary, '3 productos');
});

test('extractReasoningFieldText keeps only envelope reasoning', () => {
  assert.equal(
    extractReasoningFieldText(
      '{"reasoning":"Revisé el menú.","content":"Hola **Mark**."}',
    ),
    'Revisé el menú.',
  );
  assert.equal(extractReasoningFieldText('Voy a buscar productos.'), 'Voy a buscar productos.');
  assert.equal(extractReasoningFieldText('{"content":"solo content"}'), '');
});

test('mapPlanStepsFromPayload maps valid plan steps', () => {
  const steps = mapPlanStepsFromPayload([
    { id: 1, goal: 'List products', tool_hint: 'menu_read.list_products', status: 'pending' },
    { id: 2, goal: 'Answer', status: 'done' },
  ]);
  assert.deepEqual(steps, [
    {
      id: 1,
      goal: 'List products',
      toolHint: 'menu_read.list_products',
      status: 'pending',
    },
    { id: 2, goal: 'Answer', toolHint: undefined, status: 'done' },
  ]);
});

test('mapPlanStepsFromPayload ignores invalid rows', () => {
  assert.deepEqual(mapPlanStepsFromPayload(null), []);
  assert.deepEqual(mapPlanStepsFromPayload([{ goal: 'missing id' }]), []);
});

test('STREAMING_AGENT_ACTIVITY shows analyzing immediately', () => {
  assert.equal(hasVisibleAgentActivity(STREAMING_AGENT_ACTIVITY), true);
  assert.equal(STREAMING_AGENT_ACTIVITY.phase, 'analyzing');
});

test('hasVisibleAgentActivity detects plan, reflection and thoughts', () => {
  assert.equal(hasVisibleAgentActivity(INITIAL_AGENT_ACTIVITY), false);
  assert.equal(
    hasVisibleAgentActivity({
      ...INITIAL_AGENT_ACTIVITY,
      planSteps: [{ id: 1, goal: 'x', status: 'pending' }],
    }),
    true,
  );
  assert.equal(
    hasVisibleAgentActivity({
      ...INITIAL_AGENT_ACTIVITY,
      thoughts: [{ id: 't1', text: 'Voy a revisar tus promociones.' }],
    }),
    true,
  );
});

test('labelForPlanDecision returns Spanish labels', () => {
  assert.equal(labelForPlanDecision('replan'), 'Ajustando el plan');
});

test('updateToolStepResult matches by call_id', () => {
  const tools = [
    {
      id: 'a',
      callId: 'call-1',
      tool: 'search_products',
      status: 'running' as const,
    },
    {
      id: 'b',
      callId: 'call-2',
      tool: 'search_products',
      status: 'running' as const,
    },
  ];
  const updated = updateToolStepResult(tools, {
    call_id: 'call-2',
    tool: 'search_products',
    ok: true,
    summary: 'Found 3 products',
  });
  assert.equal(updated[0]?.status, 'running');
  assert.equal(updated[1]?.status, 'done');
  assert.equal(updated[1]?.summary, 'Found 3 products');
});
