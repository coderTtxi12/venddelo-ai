import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasVisibleAgentActivity,
  INITIAL_AGENT_ACTIVITY,
  labelForPlanDecision,
  mapPlanStepsFromPayload,
  STREAMING_AGENT_ACTIVITY,
  updateToolStepResult,
} from './agentActivity';

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
